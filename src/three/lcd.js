// @ts-check
// ============================================================
// LCD1 — 2.4" DISPLAY · SIGNAL REPAIR
//
// A real interactive screen on the board, styled like the firmware of an
// old embedded device: a 128×64 monochrome green LCD (pixel font, scan
// lines, ghosting, subtle CRT flicker) running a tiny game. The board has
// lost its communication signal — broken signal packets drift across the
// screen; the player walks a square cursor one grid cell at a time and
// collects every packet before the 30s timer expires.
//
//   SIG:08  TIME:24           STATUS:ONLINE
//   collect TARGET 12 packets → MISSION COMPLETE
//   timer out with packets left → SIGNAL LOST
//   idle (no play for 15s) → "PRESS ENTER / TO REPAIR SIGNAL" blinks
//
// Boot: a scripted POST sequence (MEM CHECK / RX ACQUIRED / LINK STABLE /
// CALIBRATE all OK) plays once on power-up, then the ready screen idles.
//
// Rendering: the game is drawn on a plain 2D <canvas> (128×64) and pushed
// to the screen quad via THREE.CanvasTexture (needsUpdate only when the
// frame actually changed — no per-frame GPU upload). This is the standard
// in-scene screen, not a DOM overlay. "Only black and green" — every color
// is a shade of the phosphor green on the near-black background.
//
// Interaction contract (mirrors the scope probe's governance):
//   - At rest: the ready/idle screen (deterministic — no Math.random, a
//     fixed-seed LCG places packets), so the board reads as powered on.
//     Under reduced motion: a static title, no auto-play, no flicker.
//   - Click LCD1 (Tier-1 raycast → camera glide, journey.js): the game
//     becomes player-controlled. WASD/arrows move one cell per press (a
//     held key auto-walks at a fixed rate), Enter starts/retries, Esc exits.
//   - While focused, `body.lcd-active` is set — every other keyboard
//     listener (fly-probe, section keys, arrow stepping, palette, cheat)
//     gates on it, so the game gets EXCLUSIVE keys. Esc / re-click / scroll
//     / chip-click all exit via the registered exit handler
//     (journey.clearFocus), restoring the normal keyboard.
//   - Optional content: never needed for any section or the CTA. It is the
//     third (and capped) "extra" after the fly-probe and the night bench —
//     see the HUD extras hint.
//
// Persistence: the best SIG count survives across sessions via
// localStorage (loaded once at build, written only by a finished player
// run — the machine keeps its record).
// ============================================================
import * as THREE from 'three';
import { disposableResources } from './scene.js';
import { interactiveObjects } from './components.js';
import { motionPrefs } from '../utils/motion-prefs.js';
import { gameBeep, loseBuzz, powerUpBeep } from '../utils/sound.js';

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
const CELL = 8;                 // px per grid cell
const GRID_COLS = 16;           // 128 / 8
const GRID_ROWS = 6;            // playfield 8..56 px (STATUS row below)
const GRID_Y = 8;               // top of the playfield (HUD sits above)

// ─── Game tuning ────────────────────────────────────────────
const TARGET = 12;              // collect every packet → MISSION COMPLETE
const TIME_LIMIT = 30;          // seconds per run
const SPAWN_INIT = 3;           // packets on the board at start
const SPAWN_START = 3.0;        // seconds between spawns at run start
const SPAWN_MIN = 1.2;          // difficulty floor (more packets at once)
const MAX_ON_SCREEN = 6;        // spawn cap per wave
const MOVE_REPEAT = 0.14;       // held-key auto-walk cadence (seconds)
const BOOT_SEC = 2.9;           // POST sequence duration
const IDLE_BLINK_MS = 15000;    // prompt starts blinking after 15s idle
const BLINK_SEC = 0.8;          // blink period once armed
const EXPLOSION_SEC = 0.35;     // packet-collect pixel burst lifetime

// Monochrome phosphor — black + green only (shades for ghost/scanline).
const C_BG = '#03130a';
const C_BRIGHT = '#3ee6a0';
const C_DIM = '#10794a';
const C_FAINT = '#0a3d22';

// ─── Persistent high score ───────────────────────────────────
// Best SIG count across sessions, kept in localStorage so the best run
// survives a reload (the machine keeps its record). Only finished PLAYER
// runs write it; it loads once at createLcd into a module value, so the
// render path stays deterministic (no storage reads inside the tick).
// Guarded for headless/private modes where localStorage may be missing.
const BEST_KEY = 'parama-signal-repair-best';
/** @type {number} */
let bestScore = 0;
/** @type {((best: number) => void) | null} */
let bestListener = null;

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
    } catch { /* private-mode read failure — start fresh */ }
}

function persistBestScore() {
    const s = getBestStorage();
    if (!s) return;
    try {
        s.setItem(BEST_KEY, String(bestScore));
    } catch { /* quota/private-mode write failure — session-only best */ }
}

// ─── Scene objects (created by createLcd) ───────────────────
/** @type {HTMLCanvasElement | null} */ let gameCanvas = null;
/** @type {CanvasRenderingContext2D | null} */ let gctx = null;
/** @type {THREE.CanvasTexture | null} */ let screenTexture = null;
/** @type {THREE.MeshStandardMaterial | null} */ let bezelLedMat = null;
/** @type {HTMLCanvasElement | null} */ let ghostCanvas = null;
/** @type {CanvasRenderingContext2D | null} */ let ghostCtx = null;

// ─── Game state ─────────────────────────────────────────────
/** @typedef {'boot' | 'ready' | 'playing' | 'over'} LcdState */
let state = /** @type {LcdState} */ ('boot');
let bootAccum = 0;
let idleAccum = 0;              // seconds spent on the ready screen
let runElapsed = 0;             // seconds into the current run
let timeLeft = TIME_LIMIT;
let spawnAccum = 0;
let spawned = 0;
let score = 0;
let overWin = false;
let overAccum = 0;              // seconds on the result screen (blink clock)
let lastOverBlink = -1;         // last blink slot drawn on the result screen
let newRecord = false;          // this run beat the stored best
let playerActive = false;       // LCD focused (keys owned)
let cursor = [7, 3];            // grid cell — center of the 16×6 field
/** @type {Array<[number, number]>} */ let packets = [];
/** @type {Array<{ x: number, y: number, t: number }>} */ let explosions = [];
/** @type {Set<string>} */ let heldKeys = new Set();
/** @type {[number, number] | null} */ let heldDir = null;
let holdAccum = 0;
let lcgSeed = 1234567;          // fixed seed — identical layouts per stream
/** @type {(() => void) | null} */ let exitHandler = null;
let dirty = true;               // redraw needed
let frameCount = 0;
let lastBlinkVisible = true;
let lastSecShown = -1;
let reducedStaticDrawn = false;

/** Deterministic LCG — the house discipline: no unseeded randomness
 *  anywhere in packet placement. */
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

/** Begin a fresh player run (Enter from ready/over, or clicking the LCD). */
function startRun() {
    state = 'playing';
    playerActive = true;
    newRecord = false;
    score = 0;
    runElapsed = 0;
    timeLeft = TIME_LIMIT;
    spawnAccum = 0;
    spawned = 0;
    cursor = [7, 3];
    packets = [];
    explosions = [];
    heldDir = null;
    holdAccum = 0;
    // Initial packet wave — deterministic LCG placements, never on the cursor.
    for (let i = 0; i < SPAWN_INIT; i++) spawnPacket();
    lastSecShown = TIME_LIMIT;
    dirty = true;
}

/** Place one packet at a free cell (not on the cursor, not already used). */
function spawnPacket() {
    if (spawned >= TARGET || packets.length >= MAX_ON_SCREEN) return;
    for (let tries = 0; tries < 200; tries++) {
        const px = Math.floor(lcgNext() * GRID_COLS);
        const py = Math.floor(lcgNext() * GRID_ROWS);
        if (px === cursor[0] && py === cursor[1]) continue;
        if (packets.some(([x, y]) => x === px && y === py)) continue;
        packets.push([px, py]);
        spawned++;
        dirty = true;
        return;
    }
}

/** End the run — finished runs may set the record (persisted).
 *  @param {boolean} win */
function endRun(win) {
    state = 'over';
    overWin = win;
    playerActive = false;
    heldDir = null;
    overAccum = 0;
    lastOverBlink = -1;
    // A new record is scored by ANY run that beats the stored best — a
    // signal-lost run with a partial haul still counts.
    newRecord = score > bestScore;
    if (newRecord) {
        bestScore = score;
        persistBestScore();
        // The board readouts (About REC row, Contact footer) mirror the
        // machine's record — notify them only when the value actually changes.
        if (bestListener) bestListener(bestScore);
    }
    if (win) powerUpBeep();
    else loseBuzz();
    dirty = true;
}

/** Move the cursor one cell (or clamp at the edge). Collects on arrival.
 *  @param {[number, number]} dir */
function moveCursor(dir) {
    const nx = cursor[0] + dir[0];
    const ny = cursor[1] + dir[1];
    if (nx < 0 || nx >= GRID_COLS || ny < 0 || ny >= GRID_ROWS) return;
    cursor = [nx, ny];
    dirty = true;
    const idx = packets.findIndex(([px, py]) => px === nx && py === ny);
    if (idx >= 0) {
        packets.splice(idx, 1);
        score++;
        explosions.push({ x: nx, y: ny, t: 0 });
        gameBeep();
        dirty = true;
        if (score >= TARGET) endRun(true);
    }
}

/** Step the game clock. PURE logic with no rendering: runs even without a
 *  canvas context so the headless smoke test drives the deterministic
 *  simulation through the same seam the browser tick uses.
 *  @param {number} delta */
function stepLcdGame(delta) {
    // Reduced motion: no auto-play. The game itself is input-driven, so a
    // focused run still steps (the user started it — interaction is allowed).
    if (motionPrefs.reduced && !playerActive) return;

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

    if (state === 'playing') {
        runElapsed += delta;
        timeLeft -= delta;
        // Held-key auto-walk at a fixed cadence (one cell per MOVE_REPEAT).
        if (heldDir) {
            holdAccum += delta;
            if (holdAccum >= MOVE_REPEAT) {
                holdAccum = 0;
                moveCursor(heldDir);
            }
        }
        // Difficulty: spawns come faster as the run goes on.
        spawnAccum += delta;
        const interval = Math.max(SPAWN_MIN, SPAWN_START - runElapsed / 15);
        if (spawnAccum >= interval) {
            spawnAccum = 0;
            spawnPacket();
        }
        // The timer display only needs a redraw on the second boundary.
        const sec = Math.max(0, Math.ceil(timeLeft));
        if (sec !== lastSecShown) {
            lastSecShown = sec;
            dirty = true;
        }
        if (timeLeft <= 0) {
            timeLeft = 0;
            endRun(false);
        }
        return;
    }

    // state === 'over' — hold the result screen (Enter retries). The clock
    // only advances the blink (NEW RECORD + retry prompt); reduced motion
    // never gets here (the early return above keeps it fully static).
    if (state === 'over') overAccum += delta;
}

// ─── Rendering (skipped headlessly) ─────────────────────────

/** Advance explosion timers; true while any burst is still animating.
 *  @param {number} delta */
function stepExplosions(delta) {
    let alive = false;
    for (const e of explosions) {
        e.t += delta;
        if (e.t < EXPLOSION_SEC) alive = true;
    }
    if (!alive) explosions = [];
    return alive;
}

/** @param {CanvasRenderingContext2D} c */
function drawHud(c) {
    drawText(c, `SIG:${String(score).padStart(2, '0')}`, 2, 1, C_BRIGHT);
    const timeStr = `TIME:${String(Math.max(0, Math.ceil(timeLeft))).padStart(2, '0')}`;
    drawText(c, timeStr, CANVAS_W - 2 - textWidth(timeStr), 1, C_BRIGHT);
    drawTextCentered(c, 'STATUS:ONLINE', 58, C_DIM);
}

/** @param {CanvasRenderingContext2D} c */
function drawPlayfield(c) {
    // Faint cell grid
    c.fillStyle = C_FAINT;
    for (let gx = 0; gx < GRID_COLS; gx++) c.fillRect(gx * CELL, GRID_Y + GRID_ROWS * CELL, 1, 1);
    for (let gy = 0; gy < GRID_ROWS; gy++) c.fillRect(0, GRID_Y + gy * CELL, GRID_COLS * CELL, 1);

    // Packets — bright diamond pulses
    for (const [px, py] of packets) {
        const ox = px * CELL, oy = GRID_Y + py * CELL;
        c.fillStyle = C_BRIGHT;
        c.fillRect(ox + 3, oy, 2, 2);
        c.fillRect(ox + 1, oy + 2, 6, 2);
        c.fillRect(ox + 3, oy + 4, 2, 2);
    }

    // Cursor — a filled square with a hollow center (reads as the probe)
    const [cx, cy] = cursor;
    const ox = cx * CELL, oy = GRID_Y + cy * CELL;
    c.fillStyle = C_BRIGHT;
    c.fillRect(ox, oy, CELL, 1);
    c.fillRect(ox, oy + CELL - 1, CELL, 1);
    c.fillRect(ox, oy, 1, CELL);
    c.fillRect(ox + CELL - 1, oy, 1, CELL);

    // Explosions — expanding pixel bursts (deterministic)
    for (const e of explosions) {
        const p = e.t / EXPLOSION_SEC;
        const ex = e.x * CELL + CELL / 2;
        const ey = GRID_Y + e.y * CELL + CELL / 2;
        const r = 1 + Math.floor(p * 3.5);
        c.fillStyle = p < 0.5 ? C_BRIGHT : C_DIM;
        for (let k = 0; k < 6; k++) {
            const a = (e.x * 13.7 + e.y * 7.3 + k * 2.1);
            const dx = Math.round(Math.cos(a) * r);
            const dy = Math.round(Math.sin(a) * r);
            c.fillRect(ex + dx, ey + dy, 1, 1);
        }
    }
}

/** @param {CanvasRenderingContext2D} c */
function drawBoot(c) {
    drawTextCentered(c, 'SIGNAL REPAIR', 8, C_BRIGHT);
    drawTextCentered(c, 'FW 1.0.0', 16, C_DIM);
    // POST lines: the label wipes in, then the dot run fills to a fixed
    // column, then OK — every OK lands at the same x (a real POST table).
    /** @type {Array<[string, number, number]>} */
    const lines = [
        ['MEM CHECK', 24, 0.5],
        ['RX ACQUIRED', 32, 1.0],
        ['LINK STABLE', 40, 1.5],
        ['CALIBRATE', 48, 2.0]
    ];
    const DOT_COL = 18; // label + dots always fills to 18 chars before OK
    const BLOCK_W = textWidth('MEM CHECK.........OK');
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
    drawTextCentered(c, 'SIGNAL REPAIR', 10, C_BRIGHT);
    drawTextCentered(c, 'TARGET 12 PACKETS', 20, C_DIM);
    if (bestScore > 0) drawTextCentered(c, `BEST ${String(bestScore).padStart(2, '0')}`, 28, C_DIM);
    // After 15s idle the prompt starts to blink (idle mode); before that it
    // is steady so a fresh visitor sees it immediately.
    const armed = idleAccum >= IDLE_BLINK_MS / 1000;
    const visible = !armed || (Math.floor(idleAccum / BLINK_SEC) % 2 === 0);
    if (visible) {
        drawTextCentered(c, 'PRESS ENTER', 42, C_BRIGHT);
        drawTextCentered(c, 'TO REPAIR SIGNAL', 52, C_BRIGHT);
    }
}

/** @param {CanvasRenderingContext2D} c */
function drawPlaying(c) {
    drawHud(c);
    drawPlayfield(c);
}

/** @param {CanvasRenderingContext2D} c */
function drawOver(c) {
    // Dim the playfield behind the verdict
    c.fillStyle = C_BG;
    c.fillRect(0, GRID_Y, CANVAS_W, GRID_ROWS * CELL);
    drawTextCentered(c, overWin ? 'MISSION COMPLETE' : 'SIGNAL LOST', 12, C_BRIGHT);
    drawTextCentered(c, `SIG ${String(score).padStart(2, '0')}`, 24, C_DIM);
    // The blink clock is live (overAccum), so NEW RECORD and the retry prompt
    // actually flash; reduced motion never advances it → steady, no blink.
    const blink = Math.floor(overAccum / BLINK_SEC) % 2 === 0;
    // A run that beat the record flashes NEW RECORD in the BEST line; a
    // regular result keeps the steady best underneath.
    if (newRecord) {
        if (blink) drawTextCentered(c, 'NEW RECORD', 32, C_BRIGHT);
    } else if (bestScore > 0) {
        drawTextCentered(c, `BEST ${String(bestScore).padStart(2, '0')}`, 32, C_DIM);
    }
    if (blink) drawTextCentered(c, 'ENTER TO RETRY', 52, C_BRIGHT);
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

    if (state === 'boot') drawBoot(c);
    else if (state === 'ready') drawReady(c);
    else if (state === 'playing') drawPlaying(c);
    else drawOver(c);

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

/** Static title screen — shown instead of the boot/ready under reduced
 *  motion (decorative auto-play is motion; a title is not). */
function drawStaticTitle() {
    if (!gctx) return;
    const c = gctx;
    c.fillStyle = C_BG;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    drawTextCentered(c, 'SIGNAL REPAIR', 20, C_BRIGHT);
    drawTextCentered(c, '2.4IN LCD1', 34, C_DIM);
    drawTextCentered(c, 'CLICK TO PLAY', 46, C_BRIGHT);
    if (bestScore > 0) drawTextCentered(c, `BEST ${String(bestScore).padStart(2, '0')}`, 56, C_DIM);
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

/** Enter the game — called by journey.js when the camera glides to the
 *  display. Focus shows the ready/idle screen (with the prompt); Enter
 *  starts the run. The keyboard is owned from the moment of focus. */
export function focusLcd() {
    if (typeof document !== 'undefined') document.body.classList.add('lcd-active');
    state = 'ready';
    idleAccum = 0;
    dirty = true;
}

/** Leave the game — restore the ready screen (the idle state). */
export function exitLcd() {
    if (typeof document !== 'undefined') document.body.classList.remove('lcd-active');
    playerActive = false;
    heldDir = null;
    state = 'ready';
    idleAccum = 0;
    dirty = true;
}

/** Serialized game state — the pure seam for the headless smoke test (same
 *  pattern as journey.js's stepQueue / idle.js's idleDriftOffset). The game
 *  must be deterministic: the same tick schedule + inputs from the same
 *  state yield the identical snapshot every run.
 *  @returns {{ state: string, score: number, best: number, timeLeft: number, cursor: number[], packets: number, packetPos: number[][], spawned: number, over: boolean, win: boolean, newRecord: boolean, playerActive: boolean, idleAccum: number, frameHash: string }} */
export function lcdStateSnapshot() {
    // FNV-1a over the observable state — a compact, deterministic fingerprint
    // of the current screen contents.
    let h = 2166136261;
    const str = `${state}|${score}|${cursor[0]},${cursor[1]}|${packets.map((p) => p.join(',')).join(';')}|${overWin ? 1 : 0}`;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return {
        state,
        score,
        best: bestScore,
        timeLeft: Math.max(0, Math.ceil(timeLeft)),
        cursor: [cursor[0], cursor[1]],
        packets: packets.length,
        packetPos: packets.map((p) => [p[0], p[1]]),
        spawned,
        over: state === 'over',
        win: state === 'over' && overWin,
        newRecord,
        playerActive,
        idleAccum,
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
    void elapsed;
    frameCount++;
    // Bezel power LED — bright while the game is live, calm at rest.
    if (bezelLedMat) {
        bezelLedMat.emissiveIntensity = state === 'playing' ? 1.6 : 0.35;
    }
    // Game logic first — stepped regardless of the render path.
    stepLcdGame(delta);
    // Rendering — skipped headlessly (no canvas context, no screen quad).
    if (!screenTexture || !gctx) return;
    // Reduced motion: the static title is drawn once (no auto-play).
    if (motionPrefs.reduced && !playerActive) {
        if (!reducedStaticDrawn) {
            drawStaticTitle();
            reducedStaticDrawn = true;
            screenTexture.needsUpdate = true;
        }
        return;
    }
    // The boot POST wipes in progressively — redraw every frame while booting.
    if (state === 'boot') dirty = true;
    // Explosions animate while alive (a dirty frame per tick during the burst).
    if (state === 'playing' && stepExplosions(delta)) dirty = true;
    // The ready prompt blinks once armed — redraw on the blink transition.
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
    if (dirty) {
        drawFrame(delta);
        screenTexture.needsUpdate = true;
        dirty = false;
    }
}

/** Build the LCD1 assembly: bezel, screen quad (CanvasTexture),
 *  power LED, and the interactive hit bounds. Called from main.js
 *  after the other components. The smoke test's headless scene also
 *  builds it: the shim's null 2d context skips the screen quad, but
 *  the meshes join the graph and the game state still initializes so
 *  the deterministic simulation is exercisable.
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

    // Thin ENIG-gold trim ring around the bezel top (reads as a frame)
    const trimGeo = new THREE.BoxGeometry(BEZEL_W + 0.03, BEZEL_H + 0.03, 0.012);
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
        emissiveIntensity: 0.35,
        roughness: 0.3
    });
    const led = new THREE.Mesh(ledGeo, bezelLedMat);
    led.position.set(LCD_LOCAL.x + BEZEL_W / 2 - 0.14, LCD_LOCAL.y + BEZEL_H / 2 - 0.1, zBezel + 0.05);
    boardGroup.add(led);
    disposableResources.materials.add(bezelLedMat);

    // Screen quad — the game canvas. Plane faces +z (toward the camera).
    // The quad is skipped when there's no 2d context (headless shim), but
    // the game state below still initializes — the tick's render path
    // no-ops without the texture, while the simulation stays exercisable.
    gameCanvas = document.createElement('canvas');
    gameCanvas.width = CANVAS_W;
    gameCanvas.height = CANVAS_H;
    gctx = /** @type {CanvasRenderingContext2D | null} */ (gameCanvas.getContext('2d'));
    if (gctx) {
        screenTexture = new THREE.CanvasTexture(gameCanvas);
        screenTexture.colorSpace = THREE.SRGBColorSpace;
        screenTexture.anisotropy = 4;
        disposableResources.textures.add(screenTexture);
        const screenGeo = new THREE.PlaneGeometry(SCREEN_W, SCREEN_H);
        disposableResources.geometries.add(screenGeo);
        const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture });
        const screen = new THREE.Mesh(screenGeo, screenMat);
        screen.position.copy(LCD_LOCAL);
        screen.position.z = zBezel + 0.05;
        boardGroup.add(screen);
        // Ghost buffer — the previous frame, drawn faintly under the next
        // (LCD pixel persistence). Same 128×64 size, offscreen.
        ghostCanvas = document.createElement('canvas');
        ghostCanvas.width = CANVAS_W;
        ghostCanvas.height = CANVAS_H;
        ghostCtx = /** @type {CanvasRenderingContext2D | null} */ (ghostCanvas.getContext('2d'));
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
        componentName: 'LCD1 — 2.4" Display (Signal Repair)',
        type: 'LCD',
        isInteractive: true
    };
    boardGroup.add(bounds);
    interactiveObjects.push(bounds);

    // Load the persistent best run (localStorage) before the first draw so
    // the boot screen shows the machine's record. One read at build time —
    // the tick's render path never touches storage.
    loadBestScore();

    // Start the boot POST (or the static title under reduced motion).
    state = 'boot';
    bootAccum = 0;
    dirty = true;
    if (motionPrefs.reduced) {
        state = 'ready';
        reducedStaticDrawn = false;
    }

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
            if (state === 'ready' || state === 'over') startRun();
            return;
        }
        const d = key === 'ArrowUp' || key === 'w' || key === 'W' ? [0, -1]
            : key === 'ArrowDown' || key === 's' || key === 'S' ? [0, 1]
            : key === 'ArrowLeft' || key === 'a' || key === 'A' ? [-1, 0]
            : key === 'ArrowRight' || key === 'd' || key === 'D' ? [1, 0]
            : null;
        if (!d) return;
        e.preventDefault();
        if (state !== 'playing') return;
        heldKeys.add(key);
        heldDir = /** @type {[number, number]} */ (d);
        holdAccum = 0;
        moveCursor(/** @type {[number, number]} */ (d));
    });

    window.addEventListener('keyup', (e) => {
        if (!isLcdActive()) return;
        const key = e.key;
        const isMove = key === 'ArrowUp' || key === 'w' || key === 'W' || key === 'ArrowDown' || key === 's' || key === 'S'
            || key === 'ArrowLeft' || key === 'a' || key === 'A' || key === 'ArrowRight' || key === 'd' || key === 'D';
        if (!isMove) return;
        heldKeys.delete(key);
        // Re-derive the held direction from whatever movement key remains.
        const last = [...heldKeys].pop();
        heldDir = last
            ? (last === 'ArrowUp' || last === 'w' || last === 'W' ? [0, -1]
                : last === 'ArrowDown' || last === 's' || last === 'S' ? [0, 1]
                : last === 'ArrowLeft' || last === 'a' || last === 'A' ? [-1, 0]
                : [1, 0])
            : null;
        holdAccum = 0;
    });
}
