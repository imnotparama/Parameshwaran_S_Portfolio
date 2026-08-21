// @ts-check
// ============================================================
// SIGNAL RUNNER — the PURE simulation (zero THREE, zero DOM).
//
// This module owns the game: every constant, every byte of state, the
// physics, the spawns, the persistence, the achievements/leaderboard, and
// the deterministic snapshot seam. It imports NO three.js and touches NO
// window/document at module scope — it loads in a bare Node context, which
// is exactly what the headless smoke suite relies on (it imports this file
// BEFORE installing its DOM shim).
//
// The split (lcd.js owns the other half):
//   - lcd-sim.js — game logic + state + persistence + snapshot. Pure.
//   - lcd.js     — the THREE mesh build (bezel, screen quad, glow, power
//     LED, hit bounds), the CanvasTexture pipeline, ALL drawing (pixel
//     font, scanlines, ghosting, flicker), the input listeners, and
//     updateLcdScreen's tick glue (stepRunner + redraw-on-dirty).
//
// The seams between them:
//   - simView()    — a live read-only view of the whole state, refreshed
//     once per frame by updateLcdScreen so every draw reads one snapshot.
//   - stepRunner() — the sim step, driven by updateLcdScreen each tick.
//   - markDirty / clearDirty — the redraw flag (the sim raises it whenever
//     the frame must change; the renderer clears it after drawing).
//   - setGlowCurrent / setFpsSmooth — renderer-owned values the snapshot
//     mirrors (the glow opacity and the display-only FPS readout).
//   - powerOnLcd / powerOffLcd — the power lifecycle; lcd.js layers the
//     body.lcd-active keyboard gate on top (DOM).
//   - getBestScore / setBestListener / resetRunCounter / getBoardFx /
//     lcdStateSnapshot — the readouts lcd.js re-exports unchanged.
//
// Determinism is the house doctrine: the fixed LCG (1234567 + runCount)
// seeds every run, stepRunner is a pure function of (delta, state), and
// lcdStateSnapshot fingerprints the observable state so the smoke suite can
// pin exact death distances, layouts, and effect bounds.
// ============================================================
import { motionPrefs } from '../utils/motion-prefs.js';
import { gameBeep, loseBuzz, powerUpBeep, jumpBlip, dashBlip } from '../utils/sound.js';

// ─── LCD geometry — 128×64, one pixel = one screen pixel ────
const CANVAS_W = 128;
const CANVAS_H = 64;

// ─── Runner tuning ──────────────────────────────────────────
const GROUND_Y = 50;            // the copper trace the pulse runs on
const BASE_SPEED = 85;          // world scroll px/s at run start
const MAX_SPEED = 150;          // speed ceiling (ramps with distance)
const SPEED_RAMP = 0.12;        // +px/s per px scrolled
const GRAVITY = 760;            // px/s²
const JUMP_V = 250;             // initial jump velocity (negative vy = up; apex ≈ 41px)
const DOUBLE_V = 215;           // double-jump velocity
const DASH_SEC = 0.28;          // invulnerable dash duration
const DASH_CD = 1.4;            // seconds between dashes
const SLIDE_FAST = 0.5;         // swipe-down slide duration (held keys are held)
const SCORE_PX = 8;             // distance points: 1 SIG per 8px
const SPAWN_BASE = 1.5;         // seconds between obstacles at run start
const SPAWN_MIN = 0.85;         // difficulty floor
const EL_SPAWN = 0.7;           // seconds between electron clusters
const PWR_OVERCLOCK = 5;        // seconds of 2× score
const PWR_TURBO = 4;            // seconds of +50% speed
const PWR_STABILIZER = 5;       // seconds of slower obstacles
const PWR_MAGNET = 6;           // seconds of electron attraction
const MAGNET_PULL = 90;         // px/s attraction strength
const SWIPE_PX = 24;            // drag distance before a touch counts as a swipe

// ─── Power-on, countdown & board-FX timing ─────────────────
const BOOT_SEC = 1.0;           // POST sequence duration — a 1s power-on (a real module boots fast)
const COUNT_SEC = 0.75;         // 3-2-1 auto-start countdown after boot (0.25s per digit)
const COUNT_DIGIT = 0.25;       // seconds per countdown digit
// Board-reactive effects — the LCD tells the board what just happened.
// All are transient timers (seconds remaining) that decay in stepRunner and
// are FORCED to 0 under reduced motion (a chase, a power dip, and a CPU
// status flash are motion — the record itself still persists).
const FX_CELEBRATE_SEC = 2.5;   // NEW RECORD: the D1-D7 array chases twice
const FX_DIP_SEC = 1.2;         // death: the board dips power, radar stutters
const FX_MILESTONE_SEC = 1.1;   // every 1000px: a CPU status line flashes
const MILESTONE_PX = 1000;      // the checkpoint cadence on the trace
const IDLE_BLINK_MS = 15000;    // prompt starts blinking after 15s idle (reduced-motion ready screen)
const BLINK_SEC = 0.8;          // blink period once armed

// ─── Persistent state (localStorage) ────────────────────────
// Best score, a top-5 leaderboard, and an achievement set — all survive
// reloads. Loaded once at createLcd into module values, so the render path
// stays deterministic (no storage reads inside the tick). Only finished
// PLAYER runs write them. Guarded for headless/private modes.
const BEST_KEY = 'parama-signal-runner-best';
// The seed the record was set on — since every run plays a DIFFERENT layout
// (BASE_SEED + runCount), the best is layout-relative: only comparable to
// runs of the SAME seed. 0 = legacy record (set before stamping existed) or
// no record yet. Kept as its own key so every existing BEST_KEY reader
// (HUD record, About/Contact readouts, telemetry) keeps working unchanged.
const BEST_SEED_KEY = 'parama-signal-runner-best-seed';
const BOARD_KEY = 'parama-signal-runner-board';
const ACHV_KEY = 'parama-signal-runner-achv';
/** @type {number} */ let bestScore = 0;
/** @type {number} */ let bestSeed = 0;
/** @type {Array<{ score: number, dist: number, electrons: number, date: number, seed?: number }>} */
let leaderboard = [];
/** @type {Set<string>} */ let achvUnlocked = new Set();
/** @type {Array<string>} */ let achvNewThisRun = [];
/** @type {((best: number) => void) | null} */ let bestListener = null;

/** @returns {Storage | null} */
function getBestStorage() {
    try {
        return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
    } catch {
        return null;
    }
}

function loadBestScore() {
    const s = getBestStorage();
    if (!s) return;
    try {
        const v = parseInt(s.getItem(BEST_KEY) || '0', 10);
        if (Number.isFinite(v) && v > 0) bestScore = v;
        const bs = parseInt(s.getItem(BEST_SEED_KEY) || '0', 10);
        if (Number.isFinite(bs) && bs > 0) bestSeed = bs;
        const board = JSON.parse(s.getItem(BOARD_KEY) || '[]');
        if (Array.isArray(board)) leaderboard = board.filter((e) => e && typeof e.score === 'number').slice(0, 5);
        const achv = JSON.parse(s.getItem(ACHV_KEY) || '[]');
        if (Array.isArray(achv)) achv.forEach((a) => { if (typeof a === 'string') achvUnlocked.add(a); });
    } catch { /* private-mode read failure — start fresh */ }
}

function persistBestScore() {
    const s = getBestStorage();
    if (!s) return;
    try {
        s.setItem(BEST_KEY, String(bestScore));
        s.setItem(BEST_SEED_KEY, String(bestSeed));
    } catch { /* quota/private-mode write failure — session-only best */ }
}

function persistBoard() {
    const s = getBestStorage();
    if (!s) return;
    try {
        s.setItem(BOARD_KEY, JSON.stringify(leaderboard.slice(0, 5)));
    } catch { /* session-only leaderboard */ }
}

function persistAchievements() {
    const s = getBestStorage();
    if (!s) return;
    try {
        s.setItem(ACHV_KEY, JSON.stringify([...achvUnlocked]));
    } catch { /* session-only achievements */ }
}

// ─── Game state ─────────────────────────────────────────────
/** @typedef {'off' | 'boot' | 'ready' | 'count' | 'playing' | 'paused' | 'over'} LcdState */
let state = /** @type {LcdState} */ ('off');
let bootAccum = 0;
let idleAccum = 0;              // seconds on the title screen (blink arming)
let countAccum = 0;             // seconds into the auto-start countdown
let curSpeed = 0;               // current world speed px/s (HUD readout)
let fpsSmooth = 0;              // smoothed FPS (display-only, never feeds determinism)
let runElapsed = 0;             // seconds into the current run
let dist = 0;                   // px scrolled (the "distance" stat)
let score = 0;
let scoreAccum = 0;             // fractional distance points before floor
let comboBonus = 0;             // points accrued from obstacle-pass combos
let electrons = 0;
let combo = 0;                  // consecutive obstacle passes
let maxCombo = 0;
let perfects = 0;               // obstacles cleared while airborne
let overAccum = 0;              // seconds on the result screen (blink clock)
let pauseAccum = 0;             // seconds paused (blink clock)
let newRecord = false;          // this run beat the stored best
let fxCelebrate = 0;            // seconds of LED-chase celebration remaining
let fxDip = 0;                  // seconds of board power-dip remaining
let fxMilestone = 0;            // seconds of CPU status-line flash remaining
let milestoneNext = MILESTONE_PX; // next 1000px checkpoint threshold
let milestonePx = 0;            // last crossed checkpoint (for the flash text)
let playerActive = false;       // LCD focused (keys owned)
let debug = false;              // hidden ~ debug overlay

// Runner kinematics — px/py is the pulse's FEET position.
let px = 22;
let py = GROUND_Y;
let vy = 0;
let onGround = true;
let jumpsUsed = 0;
let sliding = false;
let slideTimer = 0;
let dashing = false;
let dashTimer = 0;
let dashCd = 0;
let invuln = 0;                 // seconds of obstacle pass-through

// Power-up effects (remaining seconds; shield is a one-shot flag).
let shield = false;
let overclock = 0;
let turbo = 0;
let stabilizer = 0;
let magnet = 0;

/** @typedef {{ kind: 'obstacle' | 'powerup', type: string, x: number, y: number, w: number, h: number, baseY: number, phase: number, passed: boolean }} Actor */
/** @type {Actor[]} */ let actors = [];
/** @type {Array<{ x: number, y: number }>} */ let fieldEls = [];
/** @type {Array<{ x: number, y: number, vx: number, vy: number, t: number, life: number, size: number }>} */
let particles = [];
let spawnAccum = 0;
let elSpawnAccum = 0;
let lcgSeed = 1234567;          // base seed — every run advances it (see startRun)
let runCount = 0;               // run index — seed = BASE_SEED + runCount: every
let currentSeed = 0;            // the seed the CURRENT run plays (for the snapshot)
// run is a DIFFERENT but deterministic layout. The difficulty envelope stays
// bounded because the cadence/speed/mix are FIXED constants (SPAWN_BASE/
// SPAWN_MIN, SPEED_RAMP/MAX_SPEED, the spawnActor probability thresholds)
// — the LCG only arranges obstacles within them, so SIG stays comparable
// across layouts. The headless suite pins runCount (resetRunCounter) where
// layout-exactness matters.

let dirty = true;               // redraw needed (the renderer clears it)
// glowCurrent is the smoothed screen-glow opacity — the RENDERER writes it
// (setGlowCurrent) and the snapshot mirrors it; it lives here because both
// sides need it and ES module bindings are read-only across modules.
let glowCurrent = 0;

/** Deterministic LCG — the house discipline: no unseeded randomness
 *  anywhere in obstacle/electron/power-up placement. */
function lcgNext() {
    lcgSeed = (lcgSeed * 1664525 + 1013904223) >>> 0;
    return lcgSeed / 4294967296;
}

// ─── Game logic (pure — no rendering; runs headlessly) ──────

/** Begin a fresh player run (Enter from ready/over, or the auto-start
 *  countdown). Every run advances the seed — BASE_SEED + runCount — so each
 *  run is a DIFFERENT layout, still fully deterministic (same run index +
 *  same inputs = the identical trace, so records stay reproducible and the
 *  headless suite can drive it tick-for-tick). */
function startRun() {
    currentSeed = 1234567 + runCount;
    lcgSeed = currentSeed;
    runCount++;
    state = 'playing';
    playerActive = true;
    newRecord = false;
    // A fresh run restarts the CPU-checkpoint cadence (every 1000px).
    milestoneNext = MILESTONE_PX;
    milestonePx = 0;
    fxMilestone = 0;
    runElapsed = 0;
    dist = 0;
    score = 0;
    scoreAccum = 0;
    comboBonus = 0;
    electrons = 0;
    combo = 0;
    maxCombo = 0;
    perfects = 0;
    px = 22;
    py = GROUND_Y;
    vy = 0;
    onGround = true;
    jumpsUsed = 0;
    sliding = false;
    slideTimer = 0;
    dashing = false;
    dashTimer = 0;
    dashCd = 0;
    invuln = 0;
    shield = false;
    overclock = 0;
    turbo = 0;
    stabilizer = 0;
    magnet = 0;
    actors = [];
    fieldEls = [];
    particles = [];
    spawnAccum = 0;
    elSpawnAccum = 0;
    achvNewThisRun = [];
    curSpeed = 0;
    fpsSmooth = 0;
    dirty = true;
}

/** Skip the countdown (Enter / tap on the count screen) — the run starts
 *  this instant. Player runs re-seed the fixed LCG, so the same trace
 *  layout plays whether the countdown ran or was skipped. */
function skipCountdown() {
    if (state !== 'count') return;
    startRun();
}

/** Freeze the run — P, or a two-finger tap while playing. Everything stops;
 *  resume continues exactly from where it paused. */
function pauseRun() {
    if (state !== 'playing') return;
    state = 'paused';
    pauseAccum = 0;
    dirty = true;
}

/** Resume a paused run. */
function resumeRun() {
    if (state !== 'paused') return;
    state = 'playing';
    dirty = true;
}

/** The pulse's AABB. Standing is a 3×7 column at px; sliding is a flat
 *  5×3 skid (that is what lets the pulse pass under inspection beams). */
function playerBox() {
    return sliding
        ? { x: px - 1, y: py - 3, w: 5, h: 3 }
        : { x: px, y: py - 7, w: 3, h: 7 };
}

/** Obstacle hitbox with a forgiving ~25% shrink (arcade feel).
 *  @param {Actor} a */
function actorBox(a) {
    const sx = a.w * 0.12;
    const sy = a.h * 0.15;
    return { x: a.x + sx, y: a.y + sy, w: Math.max(2, a.w - sx * 2), h: Math.max(2, a.h - sy * 2) };
}

/** @param {{ x: number, y: number, w: number, h: number }} a
 *  @param {{ x: number, y: number, w: number, h: number }} b */
function boxOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Spawn one actor from the LCG stream — a power-up occasionally, otherwise
 *  an obstacle archetype (gap / resistor / capacitor / spike / beam /
 *  relay — every kind the spec lists maps onto one of these). */
function spawnActor() {
    if (lcgNext() < 0.12) {
        const types = ['shield', 'overclock', 'turbo', 'stabilizer', 'magnet'];
        const type = types[Math.floor(lcgNext() * types.length)];
        actors.push({ kind: 'powerup', type, x: CANVAS_W + 8, y: GROUND_Y - 16, w: 8, h: 8, baseY: GROUND_Y - 16, phase: 0, passed: false });
        return;
    }
    const roll = lcgNext();
    let type = 'spike';
    let w = 10;
    let h = 10;
    if (roll < 0.18) {
        type = 'gap';                 // broken trace — a hole in the ground
        w = 14 + Math.floor(lcgNext() * 10);
        h = 0;
    } else if (roll < 0.42) {
        type = lcgNext() < 0.5 ? 'resistor' : 'capacitor'; // burned resistor / capacitor
        w = 8;
        h = type === 'resistor' ? 10 : 26;
    } else if (roll < 0.62) {
        type = 'spike';               // voltage spike
        w = 10;
        h = 10;
    } else if (roll < 0.78) {
        type = 'beam';                // EMI pulse / inspection beam — slide under
        w = 12;
        h = 4;
    } else {
        type = 'relay';               // moving relay — oscillates vertically
        w = 8;
        h = 12 + Math.floor(lcgNext() * 8);
    }
    const baseY = type === 'gap' ? GROUND_Y : GROUND_Y - h;
    actors.push({ kind: 'obstacle', type, x: CANVAS_W + 8, y: baseY, w, h, baseY, phase: lcgNext() * Math.PI * 2, passed: false });
}

/** A small arc of electrons drifting toward the player. */
function spawnElectrons() {
    const x0 = CANVAS_W + 8;
    for (let i = 0; i < 3; i++) {
        fieldEls.push({ x: x0 + i * 6, y: GROUND_Y - 3 - Math.floor(lcgNext() * 10) });
    }
}

/** @param {string} type */
function applyPowerup(type) {
    if (type === 'shield') shield = true;
    else if (type === 'overclock') overclock = PWR_OVERCLOCK;
    else if (type === 'turbo') turbo = PWR_TURBO;
    else if (type === 'stabilizer') stabilizer = PWR_STABILIZER;
    else if (type === 'magnet') magnet = PWR_MAGNET;
    scoreAccum += 20;
    particles.push({ x: px, y: py - 4, vx: 0, vy: -12, t: 0, life: 0.3, size: 1 });
    powerUpBeep();
    dirty = true;
}

/** @param {Actor} a */
function destroyObstacle(a) {
    actors = actors.filter((o) => o !== a);
    for (let k = 0; k < 8; k++) {
        particles.push({ x: a.x + a.w / 2, y: a.y + a.h / 2, vx: (k % 4 - 1.5) * 22, vy: -Math.abs((k % 3) - 1) * 26 - 8, t: 0, life: 0.4, size: 1 });
    }
    scoreAccum += 15;
}

/** End the run — finished runs may set the record + leaderboard + achievements.
 *  @param {string} cause */
function endRun(cause) {
    void cause;
    state = 'over';
    playerActive = false;
    overAccum = 0;
    // Crash glitch — a quick pixel burst where the pulse died.
    for (let k = 0; k < 10; k++) {
        particles.push({ x: px, y: py - 4, vx: (k % 5 - 2) * 20, vy: -Math.abs((k % 3) - 1) * 30, t: 0, life: 0.45, size: 1 });
    }
    // A new record is scored by ANY run that beats the stored best.
    newRecord = score > bestScore;
    if (newRecord) {
        bestScore = score;
        bestSeed = currentSeed; // the record's layout — labeled on the glass
        persistBestScore();
        // The board readouts (About REC row, Contact footer) mirror the
        // machine's record — notify them only when the value actually changes.
        if (bestListener) bestListener(bestScore);
        // NEW RECORD — the board's D1-D7 array celebrates with a chase.
        fxCelebrate = FX_CELEBRATE_SEC;
    }
    // Every death dips the board's power for a moment (LEDs dim, the U1
    // radar sweep stutters) — the machine flinches with the pulse.
    fxDip = FX_DIP_SEC;
    checkAchievements();
    addLeaderboard();
    loseBuzz();
    dirty = true;
}

// ─── Achievements (hidden until earned) ─────────────────────
const ACHIEVEMENTS = [
    { id: 'first-run', label: 'FIRST RUN', test: () => true },
    { id: 'dist-500', label: '500PX', test: () => dist >= 500 },
    { id: 'sig-100', label: 'SIG 100', test: () => score >= 100 },
    { id: 'sig-250', label: 'SIG 250', test: () => score >= 250 },
    { id: 'electrons-50', label: 'E 50', test: () => electrons >= 50 },
    { id: 'perfect-10', label: 'PERFECT 10', test: () => perfects >= 10 },
    { id: 'combo-8', label: 'COMBO 8', test: () => maxCombo >= 8 },
    { id: 'shielded', label: 'SHIELD HIT', test: () => shieldUsed }
];
let shieldUsed = false;         // an obstacle was absorbed by the shield

function checkAchievements() {
    for (const a of ACHIEVEMENTS) {
        if (!achvUnlocked.has(a.id) && a.test()) {
            achvUnlocked.add(a.id);
            achvNewThisRun.push(a.label);
        }
    }
    if (achvNewThisRun.length > 0) persistAchievements();
}

// ─── Leaderboard (top 5, local) ─────────────────────────────
function addLeaderboard() {
    // Entries are stamped with the layout they were run on — the honest way
    // to compare scores across per-run seed variety.
    leaderboard.push({ score, dist: Math.floor(dist), electrons, date: Date.now(), seed: currentSeed });
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 5);
    persistBoard();
}

// ─── Player input (actions only — key listeners in createLcd) ──
function doJump() {
    if (state !== 'playing') return;
    if (onGround) {
        vy = -JUMP_V;
        onGround = false;
        jumpsUsed = 1;
    } else if (jumpsUsed < 2) {
        vy = -DOUBLE_V;
        jumpsUsed = 2;
    } else {
        return;
    }
    jumpBlip();
    dirty = true;
}

function doSlide() {
    if (state !== 'playing' || !onGround) return;
    sliding = true;
    slideTimer = SLIDE_FAST;
    dirty = true;
}

function endSlide() {
    if (sliding) {
        sliding = false;
        dirty = true;
    }
}

function doDash() {
    if (state !== 'playing' || dashCd > 0) return;
    dashing = true;
    dashTimer = DASH_SEC;
    invuln = Math.max(invuln, DASH_SEC);
    dashCd = DASH_CD;
    dashBlip();
    dirty = true;
}

function toggleDebug() {
    debug = !debug;
    dirty = true;
}

/** One simulation step of the run (playing only). Deterministic.
 *  @param {number} delta */
function stepPlay(delta) {
    runElapsed += delta;
    // Timers.
    dashCd = Math.max(0, dashCd - delta);
    invuln = Math.max(0, invuln - delta);
    overclock = Math.max(0, overclock - delta);
    turbo = Math.max(0, turbo - delta);
    stabilizer = Math.max(0, stabilizer - delta);
    magnet = Math.max(0, magnet - delta);
    if (dashing) {
        dashTimer -= delta;
        if (dashTimer <= 0) dashing = false;
    }
    if (sliding) {
        slideTimer -= delta;
        if (slideTimer <= 0) sliding = false;
    }
    // World speed (the pulse auto-runs; the trace scrolls under it).
    const base = Math.min(MAX_SPEED, BASE_SPEED + dist * SPEED_RAMP);
    const speed = base * (turbo > 0 ? 1.5 : 1) * (dashing ? 1.7 : 1);
    curSpeed = Math.round(speed); // HUD readout — display-only, never in the snapshot hash
    const obsSpeed = speed * (stabilizer > 0 ? 0.6 : 1);
    dist += speed * delta;
    // Every 1000px the trace reaches a CPU checkpoint — a status line
    // flashes on the glass (the board could key off it later too).
    if (dist >= milestoneNext) {
        milestonePx = milestoneNext;
        milestoneNext += MILESTONE_PX;
        fxMilestone = FX_MILESTONE_SEC;
        dirty = true;
    }
    scoreAccum += speed * delta / SCORE_PX;
    score = Math.floor(scoreAccum) + electrons * 5 + perfects * 3 + comboBonus;
    // Player physics — gravity (grounded → land).
    if (!onGround) {
        vy += GRAVITY * delta;
        py += vy * delta;
        if (py >= GROUND_Y) {
            py = GROUND_Y;
            vy = 0;
            onGround = true;
            jumpsUsed = 0;
        }
    }
    // Scroll actors; relays oscillate vertically (deterministic sine).
    for (const a of actors) {
        a.x -= obsSpeed * delta;
        if (a.type === 'relay') a.y = a.baseY + Math.sin(runElapsed * 3 + a.phase) * 5;
        if (a.kind === 'powerup') a.x -= (speed - obsSpeed) * delta; // power-ups ride the full speed
    }
    actors = actors.filter((a) => a.x + a.w > -4);
    // Electrons scroll; the magnet pulls them toward the pulse.
    for (const e of fieldEls) {
        e.x -= speed * delta;
        if (magnet > 0) {
            const ddx = px - e.x;
            const ddy = (GROUND_Y - 4) - e.y;
            e.x += Math.sign(ddx) * Math.min(Math.abs(ddx), MAGNET_PULL * delta);
            e.y += Math.sign(ddy) * Math.min(Math.abs(ddy), MAGNET_PULL * delta * 0.5);
        }
    }
    fieldEls = fieldEls.filter((e) => e.x > -4);
    // Particle animation.
    for (const p of particles) {
        p.t += delta;
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.vy += 40 * delta;
    }
    particles = particles.filter((p) => p.t < p.life);
    // Electron collection — overlap with the pulse scores +1 each (the
    // machine's electron count feeds the SIG total).
    const box = playerBox();
    fieldEls = fieldEls.filter((e) => {
        if (box.x < e.x + 2 && box.x + box.w > e.x && box.y < e.y + 2 && box.y + box.h > e.y) {
            electrons++;
            gameBeep();
            return false;
        }
        return true;
    });
    // Collisions — player box vs actors.
    for (const a of actors) {
        if (a.kind === 'powerup') {
            if (boxOverlap(box, actorBox(a))) {
                applyPowerup(a.type);
                actors = actors.filter((o) => o !== a);
            }
            continue;
        }
        if (a.type === 'gap') {
            // A pit: grounded over the gap = the pulse falls in.
            if (onGround && px + 1 >= a.x && px - 1 <= a.x + a.w) {
                endRun('gap');
                return;
            }
        } else if (a.type === 'beam') {
            // Overhead only — a sliding pulse passes underneath.
            if (!sliding && boxOverlap(box, actorBox(a))) {
                if (!absorbHit(a)) return;
            }
        } else if (boxOverlap(box, actorBox(a))) {
            if (!absorbHit(a)) return;
        }
        // Passed the obstacle — combo/perfect credit.
        if (!a.passed && a.x + a.w < px - 2) {
            a.passed = true;
            combo++;
            maxCombo = Math.max(maxCombo, combo);
            comboBonus += combo * 4;
            if (!onGround && !dashing) perfects++;
            dirty = true;
        }
    }
    // Spawns.
    spawnAccum += delta;
    const interval = Math.max(SPAWN_MIN, SPAWN_BASE - runElapsed * 0.03);
    if (spawnAccum >= interval) {
        spawnAccum = 0;
        spawnActor();
    }
    elSpawnAccum += delta;
    if (elSpawnAccum >= EL_SPAWN) {
        elSpawnAccum = 0;
        spawnElectrons();
    }
    dirty = true; // the runner animates every frame
}

/** Absorb a hit (shield) or die. Returns false when the run ended.
 *  @param {Actor} a */
function absorbHit(a) {
    if (invuln > 0 || dashing) return true;      // dash/grace pass-through
    if (shield) {
        shield = false;
        shieldUsed = true;
        destroyObstacle(a);
        return true;
    }
    endRun('hit');
    return false;
}

/** Step the game clock. PURE logic with no rendering: runs even without a
 *  canvas context so the headless smoke test drives the deterministic
 *  simulation through the same seam the browser tick uses.
 *  @param {number} delta */
function stepRunner(delta) {
    // Board-reactive effect timers decay in REAL time (a celebration doesn't
    // resume frozen after a re-power) — but reduced motion silences them
    // entirely: no chase, no power dip, no CPU flash (the record persists;
    // only the motion is cut). Forced to 0 every tick so a stale timer can't
    // survive a transition into reduced mode.
    if (motionPrefs.reduced) {
        fxCelebrate = 0;
        fxDip = 0;
        fxMilestone = 0;
    } else {
        fxCelebrate = Math.max(0, fxCelebrate - delta);
        fxDip = Math.max(0, fxDip - delta);
        fxMilestone = Math.max(0, fxMilestone - delta);
    }
    // Reduced motion: nothing auto-plays at rest; a focused run still steps
    // (the user started it — interaction is allowed).
    if (motionPrefs.reduced && !playerActive) return;
    if (state === 'off') return;   // powered down — fully static
    if (state === 'boot') {
        bootAccum += delta;
        if (bootAccum >= BOOT_SEC) {
            state = 'count';
            countAccum = 0;
            dirty = true;
        }
        return;
    }
    if (state === 'count') {
        // Auto-start: after the POST the run begins on its own — 3, 2, 1,
        // then the pulse launches. Enter/tap skips the countdown (the same
        // fixed LCG re-seed, so skipping never changes the layout).
        countAccum += delta;
        if (countAccum >= COUNT_SEC) startRun();
        return;
    }
    if (state === 'ready') {
        idleAccum += delta;
        return;
    }
    if (state === 'paused') {
        // Frozen: no timer, no world, no physics. Only the pause-screen
        // blink clock advances — and not under reduced motion.
        if (!motionPrefs.reduced) pauseAccum += delta;
        return;
    }
    if (state === 'playing') {
        stepPlay(delta);
        return;
    }
    // state === 'over' — hold the result screen (Enter retries). The clock
    // only advances the blink; reduced motion never gets here.
    if (state === 'over') overAccum += delta;
}

// ─── Public API — the sim's contract with the renderer (lcd.js) ──

/** Power the machine on (focus): boot POST → title. The body class that
 *  gates the keyboard is lcd.js's job (DOM); this is the sim-state side. */
export function powerOnLcd() {
    playerActive = true;
    state = 'boot';
    bootAccum = 0;
    idleAccum = 0;
    dirty = true;
}

/** Power the display back down (exit / re-click / scroll). */
export function powerOffLcd() {
    playerActive = false;
    state = 'off';
    idleAccum = 0;
    dirty = true;
}

/** The current game state — the input listeners' cheap read (a full
 *  simView() allocation per keypress is unnecessary). @returns {LcdState} */
export function getState() {
    return state;
}

/** Live view of the whole sim for the renderer — a fresh object each call
 *  (small; updateLcdScreen refreshes it once per frame so every draw reads
 *  the same snapshot). Read-only by contract — the sim mutates via its
 *  functions, the renderer via the setter seams below. */
export function simView() {
    return {
        state, bootAccum, idleAccum, countAccum, curSpeed, fpsSmooth,
        runElapsed, dist, score, scoreAccum, comboBonus, electrons, combo,
        maxCombo, perfects, overAccum, pauseAccum, newRecord, fxCelebrate,
        fxDip, fxMilestone, milestoneNext, milestonePx, playerActive, debug,
        px, py, vy, onGround, jumpsUsed, sliding, slideTimer, dashing,
        dashTimer, dashCd, invuln, shield, overclock, turbo, stabilizer,
        magnet, actors, fieldEls, particles, spawnAccum, elSpawnAccum,
        lcgSeed, currentSeed, bestScore, bestSeed, leaderboard, achvUnlocked,
        achvNewThisRun, glowCurrent
    };
}

// Dirty / glow / FPS seams — renderer-owned values that live here because
// the sim sets `dirty` and the snapshot reads `glowCurrent`/`fpsSmooth`.
// The renderer reaches them through these functions (ES module bindings are
// read-only across modules).
export function isDirty() { return dirty; }
export function markDirty() { dirty = true; }
export function clearDirty() { dirty = false; }
/** @param {number} v */ export function setGlowCurrent(v) { glowCurrent = v; }
/** @param {number} v */ export function setFpsSmooth(v) { fpsSmooth = v; }

/** The machine's record — the module value (loaded once from storage at
 *  build, updated only when a player run beats it). Board readouts read
 *  this; the tick's render path never touches storage.
 *  @returns {number} */
export function getBestScore() {
    return bestScore;
}

/** Register a callback fired with the new value whenever a player run sets
 *  a record (after it is persisted). main.js mirrors the value into the
 *  About/Contact board readouts. @param {(best: number) => void} fn */
export function setBestListener(fn) {
    bestListener = fn;
}

/** Test seam: pin the next run back to seed 1234567 (runCount = 0). The game
 *  itself never resets the counter — the headless suite uses this where
 *  layout-exactness matters (the identical-run and milestone-policy blocks). */
export function resetRunCounter() {
    runCount = 0;
}

/** The board-reactive effect state — read once per frame by main.js's tick
 *  and fed to updateRadarRing / updateLedArray: a NEW RECORD celebrate chase
 *  (D1-D7 array) and a death power dip. Both normalized to 0→1 fractions so
 *  components.js never needs the LCD's durations. 0 = no effect.
 *  @returns {{ celebrate: number, dip: number, celebrateFrac: number, dipFrac: number }} */
export function getBoardFx() {
    return {
        celebrate: fxCelebrate,
        dip: fxDip,
        celebrateFrac: fxCelebrate > 0 ? fxCelebrate / FX_CELEBRATE_SEC : 0,
        dipFrac: fxDip > 0 ? fxDip / FX_DIP_SEC : 0
    };
}

/** Serialized game state — the pure seam for the headless smoke test (same
 *  pattern as journey.js's stepQueue / idle.js's idleDriftOffset). The game
 *  must be deterministic: the same tick schedule + inputs from the same
 *  state yield the identical snapshot every run.
 *  @returns {{ state: string, score: number, best: number, bestSeed: number, dist: number, electrons: number, combo: number, maxCombo: number, perfects: number, player: { x: number, y: number, vy: number, onGround: boolean, sliding: boolean, dashing: boolean, invuln: number, jumpsUsed: number }, obstacles: Array<{ type: string, x: number, y: number }>, powerups: { shield: boolean, overclock: number, turbo: number, stabilizer: number, magnet: number }, over: boolean, paused: boolean, count: boolean, newRecord: boolean, achvCount: number, boardLen: number, glowOpacity: number, playerActive: boolean, idleAccum: number, debug: boolean, fx: { celebrate: number, dip: number, milestone: number, milestonePx: number }, seed: number, speed: number, fps: number, frameHash: string }} */
export function lcdStateSnapshot() {
    // FNV-1a over the observable state — a compact, deterministic fingerprint
    // of the current simulation (the runner + its world).
    let h = 2166136261;
    const obs = actors.map((a) => `${a.kind}${a.type}${Math.round(a.x)}${Math.round(a.y)}${a.passed ? 1 : 0}`).join(';');
    const els = fieldEls.map((e) => `${Math.round(e.x)},${Math.round(e.y)}`).join(';');
    const str = `${state}|${Math.floor(dist)}|${score}|${electrons}|${combo}|${perfects}|${Math.round(px)}|${Math.round(py)}|${Math.round(vy)}|${onGround ? 1 : 0}|${sliding ? 1 : 0}|${dashing ? 1 : 0}|${Math.round(invuln * 100)}|${shield ? 1 : 0}|${Math.round(overclock * 100)}|${Math.round(turbo * 100)}|${Math.round(stabilizer * 100)}|${Math.round(magnet * 100)}|${obs}|${els}`;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return {
        state,
        score,
        best: bestScore,
        bestSeed,
        dist: Math.floor(dist),
        electrons,
        combo,
        maxCombo,
        perfects,
        player: { x: Math.round(px), y: Math.round(py), vy: Math.round(vy), onGround, sliding, dashing, invuln: Math.round(invuln * 100) / 100, jumpsUsed },
        obstacles: actors.filter((a) => a.kind === 'obstacle').map((a) => ({ type: a.type, x: Math.round(a.x), y: Math.round(a.y) })),
        powerups: { shield, overclock: Math.round(overclock * 100) / 100, turbo: Math.round(turbo * 100) / 100, stabilizer: Math.round(stabilizer * 100) / 100, magnet: Math.round(magnet * 100) / 100 },
        over: state === 'over',
        paused: state === 'paused',
        count: state === 'count',
        newRecord,
        achvCount: achvUnlocked.size,
        boardLen: leaderboard.length,
        glowOpacity: Math.round(glowCurrent * 1000) / 1000,
        playerActive,
        idleAccum,
        debug,
        // Board-reactive effect state — celebrate/dip drive the D1-D7 chase
        // and the power dip via getBoardFx(); milestone drives the CPU
        // status flash on the glass. Mirrored for headless bounds checks;
        // deliberately OUT of the frame hash above (like speed/fps — the
        // effects are display/board telemetry, not simulation state).
        fx: {
            celebrate: Math.round(fxCelebrate * 100) / 100,
            dip: Math.round(fxDip * 100) / 100,
            milestone: Math.round(fxMilestone * 100) / 100,
            milestonePx
        },
        // The seed this run plays (BASE_SEED + runCount) — mirrored for the
        // suite to assert variety; the seed itself is sim state, so it stays
        // OUT of the frame hash like fx/speed/fps.
        seed: currentSeed,
        // Display-only telemetry — mirrored for the headless suite to assert
        // bounds; deliberately NOT in the hash above (FPS is frame-rate
        // dependent, so it must never feed the determinism fingerprint).
        speed: curSpeed,
        fps: Math.round(fpsSmooth),
        frameHash: (h >>> 0).toString(16)
    };
}

// The sim's public surface — the constants and internal actions lcd.js
// needs; the readout functions above are already exported. lcd.js re-exports
// the readout set unchanged so every consumer (main.js, journey.js,
// oscilloscope.js, telemetry.js, the smoke suite) keeps its existing import.
export {
    // Constants the renderer shares.
    ACHIEVEMENTS, BASE_SPEED, BLINK_SEC, CANVAS_H, CANVAS_W, COUNT_DIGIT,
    COUNT_SEC, GROUND_Y, IDLE_BLINK_MS, MAX_SPEED, SPEED_RAMP, SWIPE_PX,
    // Sim actions driven by the input listeners / the tick.
    doDash, doJump, doSlide, endSlide, pauseRun, resumeRun, skipCountdown,
    startRun, stepRunner, toggleDebug,
    // The one-shot storage read at build time.
    loadBestScore
};
