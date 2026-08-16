// @ts-check
// ============================================================
// LCD1 — 2.4" DISPLAY · SIGNAL RUNNER
//
// A real interactive screen on the board, styled like the firmware of an
// old embedded device: a 128×64 monochrome green LCD (pixel font, scan
// lines, ghosting, subtle CRT flicker) running a tiny endless runner.
//
// The story: this motherboard contains a tiny LCD test module, and the
// visitor is running firmware diagnostics. You are an electrical pulse
// travelling down the copper trace, dodging broken traces, burned
// resistors, capacitors, voltage spikes, EMI pulses, moving relays and
// inspection beams while collecting electrons — restoring power to the
// CPU. Survive as long as you can; the score is distance + electrons +
// perfect jumps + combos (the machine's SIGNAL INTEGRITY).
//
//   SIG:NNN  DIST:NNNN        STATUS:ONLINE
//   auto-run — Up/W/Space jump (double jump), Down/S slide,
//   D/Shift dash (invulnerable), P pause, ~ hidden debug, Esc power off
//
// Power lifecycle (the immersion): the display is OFF at rest (a real LCD
// module on a powered bench). Focusing it (click LCD1, or #/lcd) powers it
// on: a boot POST + diagnostics wipe in, then the title screen idles.
// Closing (Esc / scroll / re-click / chip click) powers it back down.
//
// Rendering: the game is drawn on a plain 2D <canvas> (128×64) and pushed
// to the screen quad via THREE.CanvasTexture (needsUpdate whenever the
// frame changed — the runner animates every frame, the idle screens only
// on blink transitions). This is the standard in-scene screen, not a DOM
// overlay. "Only black and green" — every color is a shade of the phosphor
// green on the near-black background.
//
// Interaction contract (mirrors the scope probe's governance):
//   - At rest: powered off (deterministic — nothing auto-plays).
//   - Focus: boot → ready. Enter starts the run. While focused,
//     `body.lcd-active` is set — every other keyboard listener (fly-probe,
//     section keys, arrow stepping, palette, cheat) gates on it, so the
//     game gets EXCLUSIVE keys. Esc / re-click / scroll / chip-click all
//     exit via the registered exit handler (journey.clearFocus), restoring
//     the normal keyboard.
//   - Optional content: never needed for any section or the CTA. It is the
//     third (and capped) "extra" after the fly-probe and the night bench —
//     see the HUD extras hint.
//
// Determinism: every run re-seeds the fixed LCG (1234567), so the SAME
// trace layout plays every time — the skill is in the dodging, and records
// are comparable. The headless smoke suite drives the same tick seam.
//
// Persistence: best score (localStorage), a top-5 leaderboard, and a set
// of achievements — all loaded once at build, written only by finished
// player runs (the machine keeps its record).
// ============================================================
import * as THREE from 'three';
import { disposableResources } from './scene.js';
import { interactiveObjects } from './components.js';
import { motionPrefs } from '../utils/motion-prefs.js';
import { gameBeep, loseBuzz, powerUpBeep, jumpBlip, dashBlip } from '../utils/sound.js';

// ─── Placement ──────────────────────────────────────────────
// Board-local: right of center, below the U1 CPU's lower edge —
// an open area of the substrate (RN1 is below, SW2/SW3 to the
// right, TP2 to the lower-left). Bezel 1.6×1.0 units around a
// 2:1 glass (128×64 LCD proportions).
const LCD_LOCAL = new THREE.Vector3(2.4, -1.2, 0.085 + 0.04);
const BEZEL_W = 1.6;
const BEZEL_H = 1.0;
const SCREEN_W = 1.34;
const SCREEN_H = 0.67;

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

// ─── Screen glow — halo around the bezel ─────────────────────
// A soft radial-gradient disc under the LCD that brightens and pulses
// while a run is live, fading back to nothing at rest. Same deterministic
// sine shape as the LED array (fixed phase, driven off the scene clock);
// reduced motion trades the pulse for a steady glow.
const GLOW_R = 1.2;             // halo radius (bezel is 1.6×1.0)
const GLOW_FREQ = 0.55;         // pulse cycles per second while playing
const GLOW_PHASE = 2.1;         // fixed phase — every pulse is identical
const GLOW_BASE = 0.18;         // playing pulse floor (opacity)
const GLOW_AMP = 0.14;          // playing pulse amplitude (peak 0.32)
const GLOW_STEADY = 0.22;       // reduced-motion playing value (no pulse)
const GLOW_PAUSED = 0.08;       // dimmed steady value while paused
const GLOW_FADE = 3.0;          // opacity fade rate toward the target (/s)
const BOOT_SEC = 2.9;           // POST sequence duration
const IDLE_BLINK_MS = 15000;    // prompt starts blinking after 15s idle
const BLINK_SEC = 0.8;          // blink period once armed

// Monochrome phosphor — black + green only (shades for ghost/scanline).
const C_BG = '#03130a';
const C_BRIGHT = '#3ee6a0';
const C_DIM = '#10794a';
const C_FAINT = '#0a3d22';

// ─── Persistent state (localStorage) ────────────────────────
// Best score, a top-5 leaderboard, and an achievement set — all survive
// reloads. Loaded once at createLcd into module values, so the render path
// stays deterministic (no storage reads inside the tick). Only finished
// PLAYER runs write them. Guarded for headless/private modes.
const BEST_KEY = 'parama-signal-runner-best';
const BOARD_KEY = 'parama-signal-runner-board';
const ACHV_KEY = 'parama-signal-runner-achv';
/** @type {number} */ let bestScore = 0;
/** @type {Array<{ score: number, dist: number, electrons: number, date: number }>} */
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

// ─── Scene objects (created by createLcd) ───────────────────
/** @type {HTMLCanvasElement | null} */ let gameCanvas = null;
/** @type {CanvasRenderingContext2D | null} */ let gctx = null;
/** @type {THREE.CanvasTexture | null} */ let screenTexture = null;
/** @type {THREE.MeshStandardMaterial | null} */ let bezelLedMat = null;
/** @type {THREE.MeshBasicMaterial | null} */ let glowMat = null;
let glowCurrent = 0;            // smoothed glow opacity (fades toward target)
/** @type {HTMLCanvasElement | null} */ let ghostCanvas = null;
/** @type {CanvasRenderingContext2D | null} */ let ghostCtx = null;

// ─── Game state ─────────────────────────────────────────────
/** @typedef {'off' | 'boot' | 'ready' | 'playing' | 'paused' | 'over'} LcdState */
let state = /** @type {LcdState} */ ('off');
let bootAccum = 0;
let idleAccum = 0;              // seconds on the title screen (blink arming)
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
let lastOverBlink = -1;
let pauseAccum = 0;             // seconds paused (blink clock)
let lastPauseBlink = -1;
let newRecord = false;          // this run beat the stored best
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
let lcgSeed = 1234567;          // fixed seed — re-seeded per run: SAME trace every run

/** @type {(() => void) | null} */ let exitHandler = null;
let dirty = true;               // redraw needed
let frameCount = 0;
let lastBlinkVisible = true;
let reducedStaticDrawn = false;

/** Deterministic LCG — the house discipline: no unseeded randomness
 *  anywhere in obstacle/electron/power-up placement. */
function lcgNext() {
    lcgSeed = (lcgSeed * 1664525 + 1013904223) >>> 0;
    return lcgSeed / 4294967296;
}

// ─── 3×5 pixel font (uppercase + digits + a few symbols) ────
// Each glyph is 5 rows of 3 px; '.' = off, '#' = on. The only font on the
// screen — no canvas text calls anywhere in the render path.
/** @type {Record<string, string[]>} */
const FONT = {
    '0': ['###', '#.#', '#.#', '#.#', '###'],
    '1': ['.#.', '##.', '.#.', '.#.', '###'],
    '2': ['###', '..#', '###', '#..', '###'],
    '3': ['###', '..#', '###', '..#', '###'],
    '4': ['#.#', '#.#', '###', '..#', '..#'],
    '5': ['###', '#..', '###', '..#', '###'],
    '6': ['###', '#..', '###', '#.#', '###'],
    '7': ['###', '..#', '..#', '..#', '..#'],
    '8': ['###', '#.#', '###', '#.#', '###'],
    '9': ['###', '#.#', '###', '..#', '###'],
    'A': ['.#.', '#.#', '###', '#.#', '#.#'],
    'B': ['##.', '#.#', '##.', '#.#', '##.'],
    'C': ['.##', '#..', '#..', '#..', '.##'],
    'D': ['##.', '#.#', '#.#', '#.#', '##.'],
    'E': ['###', '#..', '##.', '#..', '###'],
    'F': ['###', '#..', '##.', '#..', '#..'],
    'G': ['.##', '#..', '#.#', '#.#', '.##'],
    'H': ['#.#', '#.#', '###', '#.#', '#.#'],
    'I': ['###', '.#.', '.#.', '.#.', '###'],
    'J': ['..#', '..#', '..#', '#.#', '###'],
    'K': ['#.#', '#.#', '##.', '#.#', '#.#'],
    'L': ['#..', '#..', '#..', '#..', '###'],
    'M': ['#.#', '###', '###', '#.#', '#.#'],
    'N': ['#.#', '###', '###', '###', '#.#'],
    'O': ['###', '#.#', '#.#', '#.#', '###'],
    'P': ['###', '#.#', '###', '#..', '#..'],
    'Q': ['###', '#.#', '#.#', '###', '..#'],
    'R': ['###', '#.#', '##.', '#.#', '#.#'],
    'S': ['###', '#..', '###', '..#', '###'],
    'T': ['###', '.#.', '.#.', '.#.', '.#.'],
    'U': ['#.#', '#.#', '#.#', '#.#', '###'],
    'V': ['#.#', '#.#', '#.#', '#.#', '.#.'],
    'W': ['#.#', '#.#', '###', '###', '#.#'],
    'X': ['#.#', '#.#', '.#.', '#.#', '#.#'],
    'Y': ['#.#', '#.#', '.#.', '.#.', '.#.'],
    'Z': ['###', '..#', '.#.', '#..', '###'],
    ':': ['...', '.#.', '...', '.#.', '...'],
    '.': ['...', '...', '...', '...', '.#.'],
    '-': ['...', '...', '###', '...', '...'],
    '/': ['..#', '..#', '.#.', '#..', '#..'],
    '>': ['##.', '..#', '.#.', '..#', '##.'],
    '!': ['.#.', '.#.', '.#.', '...', '.#.'],
    '?': ['###', '..#', '.#.', '...', '.#.'],
    ',': ['...', '...', '...', '.#.', '#..'],
    'v': ['...', '...', '#.#', '#.#', '.#.'],
    ' ': ['...', '...', '...', '...', '...']
};

/** Width in px of a text string in the 3×5 font (4px advance, 1px gap).
 *  @param {string} text */
function textWidth(text) {
    return text.length * 4 - 1;
}

/** Draw a text string in the 3×5 pixel font.
 *  @param {CanvasRenderingContext2D} c
 *  @param {string} text
 *  @param {number} x
 *  @param {number} y
 *  @param {string} color */
function drawText(c, text, x, y, color) {
    c.fillStyle = color;
    let cx = x;
    for (const ch of text) {
        const g = FONT[ch] || FONT['?'];
        for (let r = 0; r < 5; r++) {
            for (let cc = 0; cc < 3; cc++) {
                if (g[r][cc] === '#') c.fillRect(cx + cc, y + r, 1, 1);
            }
        }
        cx += 4;
    }
}

/** Centered drawText.
 *  @param {CanvasRenderingContext2D} c
 *  @param {string} text
 *  @param {number} y
 *  @param {string} color */
function drawTextCentered(c, text, y, color) {
    drawText(c, text, Math.floor((CANVAS_W - textWidth(text)) / 2), y, color);
}

// ─── Game logic (pure — no rendering; runs headlessly) ──────

/** Begin a fresh player run (Enter from ready/over). Every run re-seeds the
 *  fixed LCG, so the same trace layout plays every time — deterministic,
 *  comparable records, and the headless suite can drive it tick-for-tick. */
function startRun() {
    lcgSeed = 1234567;
    state = 'playing';
    playerActive = true;
    newRecord = false;
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
    dirty = true;
}

/** Freeze the run — P, or a two-finger tap while playing. Everything stops;
 *  resume continues exactly from where it paused. */
function pauseRun() {
    if (state !== 'playing') return;
    state = 'paused';
    pauseAccum = 0;
    lastPauseBlink = -1;
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
    lastOverBlink = -1;
    // Crash glitch — a quick pixel burst where the pulse died.
    for (let k = 0; k < 10; k++) {
        particles.push({ x: px, y: py - 4, vx: (k % 5 - 2) * 20, vy: -Math.abs((k % 3) - 1) * 30, t: 0, life: 0.45, size: 1 });
    }
    // A new record is scored by ANY run that beats the stored best.
    newRecord = score > bestScore;
    if (newRecord) {
        bestScore = score;
        persistBestScore();
        // The board readouts (About REC row, Contact footer) mirror the
        // machine's record — notify them only when the value actually changes.
        if (bestListener) bestListener(bestScore);
    }
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
    leaderboard.push({ score, dist: Math.floor(dist), electrons, date: Date.now() });
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
    const obsSpeed = speed * (stabilizer > 0 ? 0.6 : 1);
    dist += speed * delta;
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
    // Reduced motion: nothing auto-plays at rest; a focused run still steps
    // (the user started it — interaction is allowed).
    if (motionPrefs.reduced && !playerActive) return;
    if (state === 'off') return;   // powered down — fully static
    if (state === 'boot') {
        bootAccum += delta;
        if (bootAccum >= BOOT_SEC) {
            state = 'ready';
            idleAccum = 0;
            dirty = true;
        }
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

// ─── Rendering (skipped headlessly) ─────────────────────────

/** @param {CanvasRenderingContext2D} c */
function drawHud(c) {
    drawText(c, `SIG:${String(score).padStart(3, '0')}`, 2, 1, C_BRIGHT);
    const distStr = `DIST:${String(Math.floor(dist)).padStart(4, '0')}`;
    drawText(c, distStr, CANVAS_W - 2 - textWidth(distStr), 1, C_BRIGHT);
    if (combo > 1) drawText(c, `x${combo}`, 58, 1, C_DIM);
    if (electrons > 0) drawText(c, `E:${electrons}`, 44, 1, C_DIM);
    // Active power-ups — a tiny status row under the HUD.
    let pwr = '';
    if (shield) pwr += 'SH ';
    if (overclock > 0) pwr += 'OC ';
    if (turbo > 0) pwr += 'TB ';
    if (stabilizer > 0) pwr += 'ST ';
    if (magnet > 0) pwr += 'MG ';
    if (pwr) drawText(c, pwr.trim(), 2, 9, C_DIM);
}

/** @param {CanvasRenderingContext2D} c */
function drawGround(c) {
    // The copper trace — a 2-row rail with a dim under-row.
    c.fillStyle = C_BRIGHT;
    c.fillRect(0, GROUND_Y, CANVAS_W, 1);
    c.fillStyle = C_DIM;
    c.fillRect(0, GROUND_Y + 1, CANVAS_W, 1);
    // Broken-trace gaps — the rail is missing there, with frayed ends.
    c.fillStyle = C_BG;
    for (const a of actors) {
        if (a.type !== 'gap') continue;
        c.fillRect(a.x, GROUND_Y, a.w, 2);
        // frayed ends
        c.fillStyle = C_DIM;
        c.fillRect(a.x - 1, GROUND_Y, 1, 1);
        c.fillRect(a.x + a.w, GROUND_Y, 1, 1);
        c.fillStyle = C_BG;
    }
}

/** @param {CanvasRenderingContext2D} c @param {Actor} a */
function drawObstacle(c, a) {
    const { x, y, w, h } = a;
    c.fillStyle = C_BRIGHT;
    if (a.type === 'resistor') {
        // Burned resistor — a striped block.
        c.fillRect(x, y + 2, w, h - 4);
        c.fillStyle = C_DIM;
        c.fillRect(x + 2, y + 3, 1, h - 6);
        c.fillRect(x + 5, y + 4, 1, h - 6);
    } else if (a.type === 'capacitor') {
        // Capacitor — a tall can with plate lines.
        c.fillRect(x, y, w, 2);
        c.fillRect(x, y + h - 2, w, 2);
        c.fillStyle = C_DIM;
        c.fillRect(x + 1, y + 2, 1, h - 4);
        c.fillRect(x + 5, y + 2, 1, h - 4);
    } else if (a.type === 'spike') {
        // Voltage spike — a zigzag.
        for (let i = 0; i < w; i += 2) {
            c.fillRect(x + i, GROUND_Y - 1 - Math.floor(i / 2), 1, Math.floor(i / 2) + 1);
        }
        c.fillRect(x, GROUND_Y - 1, w, 1);
    } else if (a.type === 'beam') {
        // EMI pulse / inspection beam — a glowing overhead bar.
        c.fillRect(x, y, w, 1);
        c.fillRect(x + 1, y + 1, w - 2, 1);
        c.fillStyle = C_DIM;
        c.fillRect(x + 3, y + 2, w - 6, 1);
    } else if (a.type === 'relay') {
        // Moving relay — a box with pin legs below it.
        c.fillRect(x, y, w, h);
        c.fillStyle = C_DIM;
        c.fillRect(x + 1, y + 2, w - 2, 1);
        c.fillRect(x + 2, GROUND_Y, 1, 2);
        c.fillRect(x + w - 3, GROUND_Y, 1, 2);
    }
}

/** @param {CanvasRenderingContext2D} c @param {Actor} a */
function drawPowerup(c, a) {
    const x = a.x;
    const y = a.y;
    c.fillStyle = C_BRIGHT;
    if (a.type === 'shield') {
        // ⊕
        c.fillRect(x + 3, y, 2, 8);
        c.fillRect(x, y + 3, 8, 2);
    } else if (a.type === 'overclock') {
        // ⚡ bolt
        c.fillRect(x + 4, y, 2, 3);
        c.fillRect(x + 2, y + 3, 2, 2);
        c.fillRect(x + 4, y + 5, 2, 3);
        c.fillRect(x + 6, y + 3, 2, 2);
    } else if (a.type === 'turbo') {
        // »»
        c.fillRect(x + 1, y + 2, 3, 4);
        c.fillRect(x + 5, y + 2, 3, 4);
    } else if (a.type === 'stabilizer') {
        // ≈
        c.fillRect(x, y + 2, 8, 1);
        c.fillRect(x + 1, y + 5, 7, 1);
        c.fillRect(x, y + 1, 1, 1);
        c.fillRect(x + 7, y + 4, 1, 1);
    } else if (a.type === 'magnet') {
        // ∩ with legs
        c.fillRect(x + 1, y + 2, 6, 1);
        c.fillRect(x + 1, y + 3, 1, 4);
        c.fillRect(x + 6, y + 3, 1, 4);
        c.fillRect(x + 2, y + 6, 4, 1);
    }
}

/** @param {CanvasRenderingContext2D} c */
function drawRunner(c) {
    if (sliding) {
        // Flat skid — the pulse hugging the trace under a beam.
        c.fillStyle = C_BRIGHT;
        c.fillRect(px - 1, py - 3, 5, 2);
        c.fillRect(px, py - 1, 3, 1);
        return;
    }
    const step = Math.floor(frameCount / 6) % 2;
    c.fillStyle = dashing ? C_BRIGHT : C_DIM;
    // Body — a 3-wide pulse column with a 2-frame run cycle (the "legs"
    // alternate: a charge tick below the body).
    c.fillRect(px + 1, py - 6, 1, 4);
    c.fillStyle = C_BRIGHT;
    c.fillRect(px, py - 5, 3, 3);
    c.fillRect(px + 1, py - 2, 1, 1);
    if (!onGround) {
        // Jump pose — a rising bolt trail.
        c.fillRect(px, py - 8, 1, 1);
        c.fillRect(px - 1, py - 9, 1, 1);
    } else if (step === 1) {
        c.fillRect(px, py - 1, 1, 1);
    } else {
        c.fillRect(px + 2, py - 1, 1, 1);
    }
    // Dash afterglow.
    if (dashing) {
        c.fillStyle = C_DIM;
        c.fillRect(px - 4, py - 4, 3, 2);
        c.fillRect(px - 8, py - 3, 3, 1);
    }
}

/** @param {CanvasRenderingContext2D} c */
function drawField(c) {
    drawGround(c);
    for (const a of actors) {
        if (a.kind === 'powerup') drawPowerup(c, a);
        else if (a.type !== 'gap') drawObstacle(c, a);
    }
    // Electrons — small bright dots.
    c.fillStyle = C_BRIGHT;
    for (const e of fieldEls) {
        c.fillRect(e.x, e.y, 2, 1);
        c.fillRect(e.x, e.y + 1, 1, 1);
    }
    drawRunner(c);
    // Particles — collect/dash/crash bursts.
    for (const p of particles) {
        const fade = 1 - p.t / p.life;
        c.fillStyle = fade > 0.5 ? C_BRIGHT : C_DIM;
        c.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
}

/** @param {CanvasRenderingContext2D} c */
function drawBoot(c) {
    drawTextCentered(c, 'SIGNAL RUNNER', 8, C_BRIGHT);
    drawTextCentered(c, 'FW 2.0.0', 16, C_DIM);
    // POST lines: the label wipes in, then the dot run fills to a fixed
    // column, then OK — every OK lands at the same x (a real POST table).
    /** @type {Array<[string, number, number]>} */
    const lines = [
        ['MEM CHECK', 24, 0.5],
        ['TRACE SCAN', 32, 1.0],
        ['PULSE GEN', 40, 1.5],
        ['CALIBRATE', 48, 2.0]
    ];
    const DOT_COL = 16; // label + dots always fills to 16 chars before OK
    const BLOCK_W = textWidth('TRACE SCAN........OK');
    const x0 = Math.floor((CANVAS_W - BLOCK_W) / 2);
    for (const [label, y, start] of lines) {
        const done = bootAccum - start; // seconds into this line
        if (done <= 0) continue;
        const p = Math.min(1, done / 0.45);
        const need = DOT_COL - label.length;
        const dots = Math.floor(p * need);
        let s = label;
        for (let i = 0; i < Math.min(need, dots); i++) s += '.';
        if (p >= 1) s += 'OK';
        drawText(c, s, x0, y, C_DIM);
    }
}

/** @param {CanvasRenderingContext2D} c */
function drawReady(c) {
    drawTextCentered(c, 'SIGNAL RUNNER', 8, C_BRIGHT);
    drawTextCentered(c, 'RESTORE CPU POWER', 16, C_DIM);
    if (bestScore > 0) drawTextCentered(c, `BEST ${String(bestScore).padStart(3, '0')}`, 24, C_DIM);
    if (leaderboard.length > 0) {
        const top = leaderboard.slice(0, 3).map((e) => String(e.score).padStart(3, '0')).join(' ');
        drawTextCentered(c, `TOP ${top}`, 32, C_FAINT);
    }
    drawTextCentered(c, `ACHV ${achvUnlocked.size}/${ACHIEVEMENTS.length}`, 40, C_FAINT);
    // After 15s idle the prompt starts to blink (idle mode); before that it
    // is steady so a fresh visitor sees it immediately.
    const armed = idleAccum >= IDLE_BLINK_MS / 1000;
    const visible = !armed || (Math.floor(idleAccum / BLINK_SEC) % 2 === 0);
    if (visible) {
        drawTextCentered(c, 'PRESS ENTER TO RUN', 50, C_BRIGHT);
    }
    drawTextCentered(c, 'UP/W JUMP · DOWN/S SLIDE', 59, C_FAINT);
}

/** @param {CanvasRenderingContext2D} c */
function drawPlaying(c) {
    drawHud(c);
    drawField(c);
    drawTextCentered(c, 'STATUS:ONLINE', 58, C_FAINT);
}

/** @param {CanvasRenderingContext2D} c */
function drawPaused(c) {
    drawTextCentered(c, 'PAUSED', 10, C_BRIGHT);
    drawTextCentered(c, `DIST ${String(Math.floor(dist)).padStart(4, '0')} · SIG ${String(score).padStart(3, '0')}`, 22, C_DIM);
    const blink = Math.floor(pauseAccum / BLINK_SEC) % 2 === 0;
    if (blink) drawTextCentered(c, 'P / TAP RESUME', 40, C_BRIGHT);
    drawTextCentered(c, 'ESC / SCROLL QUIT', 52, C_DIM);
}

/** @param {CanvasRenderingContext2D} c */
function drawOver(c) {
    // Dim the run field behind the verdict.
    c.fillStyle = C_BG;
    c.fillRect(0, 8, CANVAS_W, 52);
    drawTextCentered(c, 'SIGNAL LOST', 8, C_BRIGHT);
    drawTextCentered(c, `DIST ${String(Math.floor(dist)).padStart(4, '0')} · SIG ${String(score).padStart(3, '0')}`, 18, C_DIM);
    drawTextCentered(c, `E ${electrons} · COMBO x${maxCombo}`, 26, C_DIM);
    // The blink clock is live (overAccum), so NEW RECORD and the retry prompt
    // actually flash; reduced motion never advances it → steady, no blink.
    const blink = Math.floor(overAccum / BLINK_SEC) % 2 === 0;
    if (newRecord) {
        if (blink) drawTextCentered(c, 'NEW RECORD', 34, C_BRIGHT);
    } else if (bestScore > 0) {
        drawTextCentered(c, `BEST ${String(bestScore).padStart(3, '0')}`, 34, C_DIM);
    }
    if (achvNewThisRun.length > 0 && blink) {
        drawTextCentered(c, `ACHV ${achvNewThisRun.join(' ')}`, 42, C_DIM);
    }
    if (blink) drawTextCentered(c, 'ENTER TO RETRY', 54, C_BRIGHT);
}

/** @param {CanvasRenderingContext2D} c */
function drawOff(c) {
    // Powered down — a blank glass. (No standby text: a real module.)
    c.fillStyle = C_BG;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

/** Hidden ~ debug overlay — firmware diagnostics on top of the frame.
 *  @param {CanvasRenderingContext2D} c */
function drawDebugOverlay(c) {
    if (!debug) return;
    const obs = actors.filter((a) => a.kind === 'obstacle').length;
    const line1 = `ST ${state} · DIST ${Math.floor(dist)}`;
    const line2 = `OBS ${obs} · SEED ${lcgSeed >>> 0}`;
    const line3 = `P ${px},${Math.round(py)} · VY ${Math.round(vy)} · J ${jumpsUsed}`;
    const line4 = `PWR SH ${shield ? 1 : 0} OC ${overclock > 0 ? 1 : 0} TB ${turbo > 0 ? 1 : 0}`;
    c.fillStyle = C_BG;
    c.fillRect(0, 8, CANVAS_W, 50);
    c.fillStyle = C_DIM;
    drawText(c, line1, 2, 10, C_DIM);
    drawText(c, line2, 2, 18, C_DIM);
    drawText(c, line3, 2, 26, C_DIM);
    drawText(c, line4, 2, 34, C_DIM);
}

/** Compose one frame: ghost underlay → scene → scanlines → flicker. The
 *  ghost (previous frame at low alpha) is the LCD's pixel persistence; the
 *  flicker is a seeded per-frame dim so it is deterministic.
 *  @param {number} delta */
function drawFrame(delta) {
    if (!gctx) return;
    const c = gctx;
    c.fillStyle = C_BG;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // LCD ghosting — the previous frame bleeds through faintly where this
    // frame is empty, so a moving object leaves a fading trail (persistence).
    if (ghostCanvas && ghostCtx && !motionPrefs.reduced) {
        c.globalAlpha = 0.16;
        c.drawImage(ghostCanvas, 0, 0);
        c.globalAlpha = 1;
    }

    if (state === 'off') drawOff(c);
    else if (state === 'boot') drawBoot(c);
    else if (state === 'ready') drawReady(c);
    else if (state === 'playing') drawPlaying(c);
    else if (state === 'paused') drawPaused(c);
    else drawOver(c);
    if (state !== 'off' && debug) drawDebugOverlay(c);

    // Scanlines — every other row dimmed (a real 128×64 glass).
    c.fillStyle = 'rgba(0, 0, 0, 0.26)';
    for (let y = 1; y < CANVAS_H; y += 2) c.fillRect(0, y, CANVAS_W, 1);

    // Subtle CRT flicker — deterministic from the frame counter.
    if (!motionPrefs.reduced) {
        const f = (frameCount * 2654435761) >>> 0;
        const fl = 0.012 + ((f & 7) / 7) * 0.028;
        c.fillStyle = `rgba(0, 0, 0, ${fl.toFixed(4)})`;
        c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // Persist this frame as next frame's ghost.
    if (ghostCtx) ghostCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (ghostCtx && gameCanvas && !motionPrefs.reduced) ghostCtx.drawImage(gameCanvas, 0, 0);

    void delta;
}

/** The static frame drawn under reduced motion (no auto-play, no blink): a
 *  blank glass when powered off, the title screen when focused. */
function drawStaticFrame() {
    if (!gctx) return;
    const c = gctx;
    c.fillStyle = C_BG;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (state === 'ready') {
        drawTextCentered(c, 'SIGNAL RUNNER', 20, C_BRIGHT);
        drawTextCentered(c, '2.4IN LCD1', 32, C_DIM);
        drawTextCentered(c, 'PRESS ENTER TO RUN', 44, C_BRIGHT);
        if (bestScore > 0) drawTextCentered(c, `BEST ${String(bestScore).padStart(3, '0')}`, 54, C_DIM);
    }
}

// ─── Public API ─────────────────────────────────────────────

/** Board-local position of the display — journey.js's focus
 *  camera targets this (same space as COMPONENT_WORLD). */
export const LCD_LOCAL_POS = LCD_LOCAL;

/** True while the LCD game owns the keyboard. Read by every other
 *  key listener via the body class (the probe-flying convention —
 *  no module coupling). */
export function isLcdActive() {
    return typeof document !== 'undefined' && document.body.classList.contains('lcd-active');
}

/** Register the callback fired when the LCD focus releases (Esc,
 *  re-click, scroll, or a chip focus). journey.js wires this to its
 *  clearFocus so the camera glides back and the game stops together.
 *  @param {() => void} fn */
export function setLcdExitHandler(fn) {
    exitHandler = fn;
}

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

/** Live runner state for the HUD oscilloscope — the scope shows the pulse's
 *  heartbeat while the game is focused (spikes on jump/dash, flatline when
 *  the run ends). @returns {{ active: boolean, state: string, jumping: boolean, sliding: boolean, dashing: boolean, shielded: boolean, over: boolean, paused: boolean, speed01: number }} */
export function getRunnerScope() {
    const speed = state === 'playing' ? Math.min(MAX_SPEED, BASE_SPEED + dist * SPEED_RAMP) : 0;
    return {
        active: isLcdActive(),
        state,
        jumping: state === 'playing' && !onGround && vy < 0,
        sliding,
        dashing,
        shielded: shield,
        over: state === 'over',
        paused: state === 'paused',
        speed01: Math.min(1, speed / MAX_SPEED)
    };
}

/** Enter the game — called by journey.js when the camera glides to the
 *  display. The machine powers ON: the boot POST + diagnostics play, then
 *  the title screen idles (Enter starts). Under reduced motion the POST
 *  can't auto-advance, so the title shows directly. The keyboard is owned
 *  from the moment of focus.
 *  @param {boolean} [replayBoot] */
export function focusLcd(replayBoot = false) {
    void replayBoot; // power-on always boots now (the deep link and the click
    // both land on the machine powering up — the #/lcd distinction was the
    // old SIGNAL REPAIR's; a real module boots when powered).
    if (typeof document !== 'undefined') document.body.classList.add('lcd-active');
    if (motionPrefs.reduced) {
        state = 'ready';
    } else {
        state = 'boot';
        bootAccum = 0;
    }
    idleAccum = 0;
    reducedStaticDrawn = false;
    dirty = true;
}

/** Leave the game — power the display back down (a real LCD module). */
export function exitLcd() {
    if (typeof document !== 'undefined') document.body.classList.remove('lcd-active');
    playerActive = false;
    state = 'off';
    idleAccum = 0;
    dirty = true;
}

/** Serialized game state — the pure seam for the headless smoke test (same
 *  pattern as journey.js's stepQueue / idle.js's idleDriftOffset). The game
 *  must be deterministic: the same tick schedule + inputs from the same
 *  state yield the identical snapshot every run.
 *  @returns {{ state: string, score: number, best: number, dist: number, electrons: number, combo: number, maxCombo: number, perfects: number, player: { x: number, y: number, vy: number, onGround: boolean, sliding: boolean, dashing: boolean, invuln: number, jumpsUsed: number }, obstacles: Array<{ type: string, x: number, y: number }>, powerups: { shield: boolean, overclock: number, turbo: number, stabilizer: number, magnet: number }, over: boolean, paused: boolean, newRecord: boolean, achvCount: number, boardLen: number, glowOpacity: number, playerActive: boolean, idleAccum: number, debug: boolean, frameHash: string }} */
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
        newRecord,
        achvCount: achvUnlocked.size,
        boardLen: leaderboard.length,
        glowOpacity: Math.round(glowCurrent * 1000) / 1000,
        playerActive,
        idleAccum,
        debug,
        frameHash: (h >>> 0).toString(16)
    };
}

/** Per-frame tick — steps the game, redraws the screen when the frame
 *  changed, and keeps the bezel power LED lit while the game is live. Runs
 *  from main.js's tick pipeline (same registry as the LED array / ripple).
 *  The game LOGIC runs even without a render context (headless smoke test);
 *  only the drawing is skipped.
 *  @param {number} elapsed
 *  @param {number} delta */
export function updateLcdScreen(elapsed, delta) {
    frameCount++;
    // Bezel power LED — the power indicator: bright while a run is live,
    // dimmer while the machine is on, near-off when powered down.
    if (bezelLedMat) {
        bezelLedMat.emissiveIntensity = state === 'playing' ? 1.6
            : state === 'paused' ? 1.0
            : state === 'boot' || state === 'ready' ? 0.9
            : state === 'over' ? 0.6
            : 0.15;
    }
    // Screen glow — the halo brightens and pulses while a run is live, dims
    // to a steady low while paused, and fades back to nothing at rest (the
    // same deterministic sine the LED array uses). Reduced motion snaps
    // straight to the state's value — no animated fade.
    if (glowMat) {
        if (motionPrefs.reduced) {
            glowCurrent = state === 'playing' ? GLOW_STEADY : state === 'paused' ? GLOW_PAUSED : 0;
        } else {
            const target = state === 'playing'
                ? GLOW_BASE + GLOW_AMP * (0.5 + 0.5 * Math.sin(elapsed * GLOW_FREQ * Math.PI * 2 + GLOW_PHASE))
                : state === 'paused' ? GLOW_PAUSED : 0;
            glowCurrent += (target - glowCurrent) * Math.min(1, delta * GLOW_FADE);
        }
        glowMat.opacity = glowCurrent;
    }
    // Game logic first — stepped regardless of the render path.
    stepRunner(delta);
    // Rendering — skipped headlessly (no canvas context, no screen quad).
    if (!screenTexture || !gctx) return;
    // Reduced motion: draw the static frame once (no auto-play at rest).
    if (motionPrefs.reduced && !playerActive) {
        if (!reducedStaticDrawn) {
            drawStaticFrame();
            reducedStaticDrawn = true;
            screenTexture.needsUpdate = true;
        }
        return;
    }
    // The boot POST wipes in progressively — redraw every frame while booting.
    if (state === 'boot') dirty = true;
    // The runner animates every frame while playing.
    if (state === 'playing') dirty = true;
    // The title prompt blinks once armed — redraw on the blink transition.
    if (state === 'ready') {
        const armed = idleAccum >= IDLE_BLINK_MS / 1000;
        const visible = !armed || (Math.floor(idleAccum / BLINK_SEC) % 2 === 0);
        if (visible !== lastBlinkVisible) {
            lastBlinkVisible = visible;
            dirty = true;
        }
    }
    // The result screen blinks (NEW RECORD + retry prompt) — redraw only on
    // the blink-slot transition, not every frame.
    if (state === 'over') {
        const o = Math.floor(overAccum / BLINK_SEC);
        if (o !== lastOverBlink) {
            lastOverBlink = o;
            dirty = true;
        }
    }
    // The pause prompt blinks — same transition-gated redraw.
    if (state === 'paused') {
        const o = Math.floor(pauseAccum / BLINK_SEC);
        if (o !== lastPauseBlink) {
            lastPauseBlink = o;
            dirty = true;
        }
    }
    if (dirty) {
        drawFrame(delta);
        screenTexture.needsUpdate = true;
        dirty = false;
    }
}

/** Build the LCD1 assembly: bezel, hollow trim frame, screen quad
 *  (CanvasTexture), power LED, glow halo, and the interactive hit bounds.
 *  Called from main.js after the other components. The smoke test's
 *  headless scene also builds it: the shim's null 2d context skips the
 *  screen texture, but the meshes join the graph and the game state still
 *  initializes so the deterministic simulation is exercisable.
 *  @param {THREE.Group} boardGroup */
export function createLcd(boardGroup) {
    const surfaceZ = 0.085;
    const zBezel = surfaceZ + 0.04;

    // Bezel — dark plastic frame with a subtle silver trim
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.55, metalness: 0.35 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x8f99a3, roughness: 0.35, metalness: 0.85 });
    const bezelGeo = new THREE.BoxGeometry(BEZEL_W, BEZEL_H, 0.08);
    disposableResources.geometries.add(bezelGeo);
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.position.copy(LCD_LOCAL);
    bezel.position.z = zBezel;
    bezel.castShadow = true;
    boardGroup.add(bezel);

    // Thin ENIG-gold trim FRAME around the bezel top (reads as a frame) —
    // a hollow rectangle (0.015 border wider than the bezel, inner hole =
    // the bezel face). NOT a solid slab: a solid box here would sit in
    // front of the screen quad and occlude the entire display (the
    // blank-LCD bug — the screen was hidden behind the trim's front face).
    const frameShape = new THREE.Shape();
    const fHw = BEZEL_W / 2 + 0.015;
    const fHh = BEZEL_H / 2 + 0.015;
    const holeHw = BEZEL_W / 2;
    const holeHh = BEZEL_H / 2;
    frameShape.moveTo(-fHw, -fHh);
    frameShape.lineTo(fHw, -fHh);
    frameShape.lineTo(fHw, fHh);
    frameShape.lineTo(-fHw, fHh);
    frameShape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-holeHw, -holeHh);
    hole.lineTo(holeHw, -holeHh);
    hole.lineTo(holeHw, holeHh);
    hole.lineTo(-holeHw, holeHh);
    hole.closePath();
    frameShape.holes.push(hole);
    const trimGeo = new THREE.ExtrudeGeometry(frameShape, { depth: 0.012, bevelEnabled: false });
    trimGeo.translate(0, 0, -0.006); // center the 0.012 extrusion on the trim's z
    disposableResources.geometries.add(trimGeo);
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.copy(LCD_LOCAL);
    trim.position.z = zBezel + 0.045;
    boardGroup.add(trim);

    // Power LED — a tiny dome on the bezel that lights while the game runs
    const ledGeo = new THREE.SphereGeometry(0.028, 8, 8);
    disposableResources.geometries.add(ledGeo);
    bezelLedMat = new THREE.MeshStandardMaterial({
        color: 0x3ee6a0,
        emissive: 0x3ee6a0,
        emissiveIntensity: 0.15,
        roughness: 0.3
    });
    const led = new THREE.Mesh(ledGeo, bezelLedMat);
    led.position.set(LCD_LOCAL.x + BEZEL_W / 2 - 0.14, LCD_LOCAL.y + BEZEL_H / 2 - 0.1, zBezel + 0.05);
    boardGroup.add(led);
    disposableResources.materials.add(bezelLedMat);

    // Screen quad — the game canvas. Plane faces +z (toward the camera).
    // The quad joins the graph even headlessly (no map there — never
    // rendered, same posture as the glow) so the smoke suite can raycast
    // that nothing occludes the display; the browser gets the CanvasTexture.
    gameCanvas = document.createElement('canvas');
    gameCanvas.width = CANVAS_W;
    gameCanvas.height = CANVAS_H;
    gctx = /** @type {CanvasRenderingContext2D | null} */ (gameCanvas.getContext('2d'));
    const screenGeo = new THREE.PlaneGeometry(SCREEN_W, SCREEN_H);
    disposableResources.geometries.add(screenGeo);
    const screenMat = new THREE.MeshBasicMaterial();
    if (gctx) {
        screenTexture = new THREE.CanvasTexture(gameCanvas);
        screenTexture.colorSpace = THREE.SRGBColorSpace;
        screenTexture.anisotropy = 4;
        disposableResources.textures.add(screenTexture);
        screenMat.map = screenTexture;
        // Ghost buffer — the previous frame, drawn faintly under the next
        // (LCD pixel persistence). Same 128×64 size, offscreen.
        ghostCanvas = document.createElement('canvas');
        ghostCanvas.width = CANVAS_W;
        ghostCanvas.height = CANVAS_H;
        ghostCtx = /** @type {CanvasRenderingContext2D | null} */ (ghostCanvas.getContext('2d'));
    }
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.copy(LCD_LOCAL);
    screen.position.z = zBezel + 0.05;
    screen.name = 'lcd-screen';
    boardGroup.add(screen);

    // Soft screen glow — a radial-gradient halo around the bezel (driven in
    // updateLcdScreen from the same deterministic sine as the LED array).
    // The mesh joins the graph even headlessly (no texture there — never
    // rendered), so the smoke test can audit the opacity fade/bounds via the
    // snapshot seam; the browser gets the gradient map.
    const glowGeo = new THREE.CircleGeometry(GLOW_R, 32);
    disposableResources.geometries.add(glowGeo);
    glowMat = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(LCD_LOCAL);
    // Above the bezel front (zBezel + 0.04) so the halo is actually visible
    // around the display, below the screen quad (zBezel + 0.05) so the glass
    // draws over its center. (It used to sit at surfaceZ + 0.02 — buried
    // inside the bezel box, so the pulse animated an invisible mesh.)
    glow.position.z = zBezel + 0.043;
    glow.name = 'lcd-glow';
    boardGroup.add(glow);
    disposableResources.materials.add(glowMat);
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    const glowCtx = /** @type {CanvasRenderingContext2D | null} */ (glowCanvas.getContext('2d'));
    if (glowCtx) {
        const grad = glowCtx.createRadialGradient(64, 64, 4, 64, 64, 64);
        grad.addColorStop(0, 'rgba(62, 230, 160, 1)');
        grad.addColorStop(0.45, 'rgba(62, 230, 160, 0.3)');
        grad.addColorStop(1, 'rgba(62, 230, 160, 0)');
        glowCtx.fillStyle = grad;
        glowCtx.fillRect(0, 0, 128, 128);
        const glowTexture = new THREE.CanvasTexture(glowCanvas);
        glowTexture.colorSpace = THREE.SRGBColorSpace;
        disposableResources.textures.add(glowTexture);
        glowMat.map = glowTexture;
        glowMat.needsUpdate = true;
    }

    // Interactive hit bounds — the whole assembly (same pattern as the
    // ANT1 / VR1 bounds: an invisible box the raycast aims at).
    const boundsGeo = new THREE.BoxGeometry(BEZEL_W + 0.1, BEZEL_H + 0.1, 0.22);
    disposableResources.geometries.add(boundsGeo);
    const bounds = new THREE.Mesh(boundsGeo, new THREE.MeshBasicMaterial({ visible: false }));
    bounds.position.copy(LCD_LOCAL);
    bounds.position.z = zBezel;
    bounds.name = 'LCD1';
    bounds.userData = {
        componentName: 'LCD1 — 2.4" Display (Signal Runner)',
        type: 'LCD',
        isInteractive: true
    };
    boardGroup.add(bounds);
    interactiveObjects.push(bounds);

    // Load the persistent state (best / leaderboard / achievements) before
    // the first draw. One read at build time — the tick's render path never
    // touches storage.
    loadBestScore();

    // The display starts POWERED DOWN (state 'off'). Focusing it (click or
    // #/lcd) powers it on: boot POST → title → run.
    state = 'off';
    dirty = true;

    // Exclusive keyboard capture while the game is focused. Registered
    // once; internally gated on isLcdActive() so it never steals keys at
    // rest. The OTHER listeners (probe / journey arrows / section keys /
    // palette / cheat) all gate on body.lcd-active in their own modules.
    window.addEventListener('keydown', (e) => {
        if (!isLcdActive()) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const key = e.key;
        if (key === 'Escape') {
            e.preventDefault();
            exitLcd();
            if (exitHandler) exitHandler();
            return;
        }
        if (key === 'Enter') {
            e.preventDefault();
            if (state === 'paused') {
                resumeRun();
                return;
            }
            if (state === 'ready' || state === 'over') startRun();
            return;
        }
        if (key === 'p' || key === 'P') {
            e.preventDefault();
            if (state === 'playing') pauseRun();
            else if (state === 'paused') resumeRun();
            return;
        }
        if (key === 'Backquote' || key === '`') {
            e.preventDefault();
            toggleDebug();
            return;
        }
        const isJump = key === 'ArrowUp' || key === 'w' || key === 'W' || key === ' ';
        const isSlide = key === 'ArrowDown' || key === 's' || key === 'S';
        const isDash = key === 'd' || key === 'D' || key === 'Shift' || key === 'ShiftLeft' || key === 'ShiftRight';
        if (isJump) {
            e.preventDefault();
            doJump();
            return;
        }
        if (isSlide) {
            e.preventDefault();
            doSlide();
            return;
        }
        if (isDash) {
            e.preventDefault();
            doDash();
            return;
        }
    });

    window.addEventListener('keyup', (e) => {
        if (!isLcdActive()) return;
        const key = e.key;
        if (key === 'ArrowDown' || key === 's' || key === 'S') {
            endSlide();
        }
    });

    // Touch controls — the same exclusive contract as the keyboard: while
    // body.lcd-active the game owns touch (touchmove is canceled so the page
    // never scrolls), a clean tap does the primary action (start on the
    // title/over screen, JUMP while running, resume while paused — the
    // touch Up), a second finger toggles pause (the touch P), and a swipe
    // down slides. While PAUSED the scroll lock relaxes — a drag scrolls the
    // page away, and the journey's scroll-release quits the game (the touch
    // Esc). At rest every handler early-returns — touch keeps doing whatever
    // it does unfocused (scroll, the tap-to-focus raycast).
    let touchStartX = 0, touchStartY = 0, touchSteered = false, twoFinger = false;
    window.addEventListener('touchstart', (e) => {
        if (!isLcdActive()) return;
        const t = e.touches && e.touches[0];
        if (!t) return;
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        touchSteered = false;
        twoFinger = (e.touches.length >= 2);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (!isLcdActive()) return;
        const t = e.touches && e.touches[0];
        if (!t) return;
        // The game owns the scroll while focused — except paused, where a
        // drag scrolls the page away (the scroll-release quits the game).
        if (state !== 'paused' && e.cancelable) e.preventDefault();
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        if (Math.abs(dx) >= SWIPE_PX || Math.abs(dy) >= SWIPE_PX) touchSteered = true;
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
        if (!isLcdActive()) return;
        // Only the last finger up settles the gesture.
        if (e.touches && e.touches.length > 0) return;
        const dy = (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : touchStartY) - touchStartY;
        if (twoFinger) {
            // A second finger = pause (the touch P).
            if (e.cancelable) e.preventDefault();
            if (state === 'playing') pauseRun();
            else if (state === 'paused') resumeRun();
            twoFinger = false;
            touchSteered = false;
            return;
        }
        if (touchSteered) {
            // A swipe must not fire the synthetic click — it would re-click
            // the LCD at the lift point and drop focus mid-run.
            if (e.cancelable) e.preventDefault();
            if (dy < -SWIPE_PX) {
                doJump();          // swipe up = jump
            } else if (dy > SWIPE_PX) {
                doSlide();         // swipe down = slide
            }
            touchSteered = false;
            return;
        }
        if (state === 'ready' || state === 'over') {
            // Tap on the title/result screen = Enter (start / retry).
            if (e.cancelable) e.preventDefault();
            startRun();
        } else if (state === 'playing') {
            // Tap while running = jump (the primary touch action).
            if (e.cancelable) e.preventDefault();
            doJump();
        } else if (state === 'paused') {
            // Tap while paused = resume.
            if (e.cancelable) e.preventDefault();
            resumeRun();
        }
        touchSteered = false;
    }, { passive: false });

    window.addEventListener('touchcancel', () => {
        if (!isLcdActive()) return;
        touchSteered = false;
        twoFinger = false;
    }, { passive: false });
}
