// @ts-check
// ============================================================
// LCD1 — 2.4" DISPLAY · SIGNAL SNAKE
//
// A real interactive screen on the board: the snake is a copper
// trace, it eats small gold signal-packet pulses, and touching a
// red noise block ends the run ("SIGNAL INTEGRITY: N").
//
// Rendering: the game is drawn on a plain 2D <canvas> and pushed
// to the screen quad via THREE.CanvasTexture (needsUpdate only
// when the frame actually changed — no per-frame GPU upload).
// This is the standard in-scene screen, not a DOM overlay.
//
// Interaction contract (mirrors the scope probe's governance):
//   - At rest: an attract-mode demo snake plays the game itself
//     (seeded LCG, deterministic) so the board reads as powered
//     on; hidden entirely under reduced motion (static title).
//   - Click LCD1 (Tier-1 raycast → camera glide, journey.js):
//     the game becomes player-controlled via arrows/WASD.
//   - While focused, `body.lcd-active` is set — every other
//     keyboard listener (fly-probe, section keys, arrow stepping,
//     palette, cheat) gates on it, so the snake gets EXCLUSIVE
//     keys. Esc / re-click / scroll / chip-click all exit via the
//     registered exit handler (journey.clearFocus), restoring the
//     normal keyboard.
//   - Optional content: never needed for any section or the CTA.
//     It is the third (and capped) "extra" after the fly-probe
//     and the night bench — see the HUD extras hint.
//
// Determinism: the demo uses a fixed-seed LCG (no Math.random),
// so the attract screen is identical on every load, matching the
// board's house discipline (animejs seek-safe doctrine).
// ============================================================
import * as THREE from 'three';
import { disposableResources } from './scene.js';
import { interactiveObjects } from './components.js';
import { motionPrefs } from '../utils/motion-prefs.js';

// ─── Placement ──────────────────────────────────────────────
// Board-local: right of center, below the U1 CPU's lower edge —
// an open area of the substrate (RN1 is below, SW2/SW3 to the
// right, TP2 to the lower-left). Bezel 1.6×1.2 units.
const LCD_LOCAL = new THREE.Vector3(2.4, -1.2, 0.085 + 0.04);
const BEZEL_W = 1.6;
const BEZEL_H = 1.2;
const SCREEN_W = 1.34;
const SCREEN_H = 1.02;

// ─── Game geometry ──────────────────────────────────────────
const CELLS_X = 24;
const CELLS_Y = 18;
const STEP_SEC = 0.15;        // snake advances every 150ms
const START_LEN = 4;
const NOISE_EVERY = 3;        // a noise block joins after every N packets
const MAX_NOISE = 9;

// Canvas backing the screen quad — 320×240 at cell 11px.
const CANVAS_W = 320;
const CANVAS_H = 240;
const CELL = 11;
const GRID_PX_W = CELLS_X * CELL;
const GRID_PX_H = CELLS_Y * CELL;
const OFFSET_X = Math.floor((CANVAS_W - GRID_PX_W) / 2);
const OFFSET_Y = 30; // room for the score bar

// Screen palette — the board's own voice (dark phosphor, signal
// green trace, ENIG-gold packets, red noise).
const C_BG = '#040a06';
const C_GRID = 'rgba(62, 230, 160, 0.06)';
const C_HEAD = '#3ee6a0';
const C_BODY = '#128a4f';
const C_PACKET = '#c9a24b';
const C_NOISE = '#ef4444';
const C_TEXT = '#3ee6a0';
const C_MUTED = '#9db4a3';

// ─── Persistent high score ───────────────────────────────────
// Best SIGNAL INTEGRITY across sessions, kept in localStorage so the best
// run survives a reload ("remembered" — the machine keeps its record, like
// the demo re-seeding for identical attract runs). Only PLAYER runs write
// it (the demo's greedy AI must not set the record); it loads once at
// createLcd into a module value, so the render path stays deterministic
// (no storage reads inside the tick). Guarded for headless/private modes
// where localStorage may be missing or throw.
const BEST_KEY = 'parama-signal-snake-best';
/** @type {number} */
let bestScore = 0;

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
const C_RED = '#f87171';

// ─── Scene objects (created by createLcd) ───────────────────
/** @type {HTMLCanvasElement | null} */
let gameCanvas = null;
/** @type {CanvasRenderingContext2D | null} */
let gctx = null;
/** @type {THREE.CanvasTexture | null} */
let screenTexture = null;
/** @type {THREE.MeshStandardMaterial | null} */
let bezelLedMat = null;

// ─── Game state ─────────────────────────────────────────────
/** @type {Uint8Array} */ let grid = new Uint8Array(CELLS_X * CELLS_Y);
/** @type {Array<[number, number]>} */ let snake = [];
/** @type {[number, number]} */ let dir = [1, 0];
/** @type {Array<[number, number]>} */ let dirQueue = [];
/** @type {Array<[number, number]>} */ let packets = [];
/** @type {Array<[number, number]>} */ let noise = [];
let score = 0;
let eaten = 0;
let dead = false;
let demo = true;          // true = attract-mode demo, false = player
let playerActive = false; // LCD focused and the player is in a run
let stepAccum = 0;
let deathRestartAccum = 0;
let lcgSeed = 1234567;    // fixed seed — identical demo every load
/** @type {(() => void) | null} */ let exitHandler = null;
let dirty = true;         // redraw needed
let reducedStaticDrawn = false;

/** Deterministic LCG — the animejs discipline: no unseeded
 *  randomness anywhere in the demo or obstacle placement. */
function lcgNext() {
    lcgSeed = (lcgSeed * 1664525 + 1013904223) >>> 0;
    return lcgSeed / 4294967296;
}

/** @param {number} x @param {number} y */
function inBounds(x, y) {
    return x >= 0 && x < CELLS_X && y >= 0 && y < CELLS_Y;
}

/** Place a packet at a free, non-adjacent cell. */
function spawnPacket() {
    for (let tries = 0; tries < 200; tries++) {
        const px = Math.floor(lcgNext() * CELLS_X);
        const py = Math.floor(lcgNext() * CELLS_Y);
        if (grid[py * CELLS_X + px] !== 0) continue;
        // Keep it away from the head (no instant eat on spawn)
        const head = snake[0];
        if (head && Math.abs(px - head[0]) + Math.abs(py - head[1]) < 5) continue;
        packets.push([px, py]);
        grid[py * CELLS_X + px] = 2;
        return;
    }
}

/** Place a noise block at a free cell, away from the snake's head. */
function spawnNoise() {
    if (noise.length >= MAX_NOISE) return;
    for (let tries = 0; tries < 200; tries++) {
        const nx = Math.floor(lcgNext() * CELLS_X);
        const ny = Math.floor(lcgNext() * CELLS_Y);
        if (grid[ny * CELLS_X + nx] !== 0) continue;
        const head = snake[0];
        if (head && Math.abs(nx - head[0]) + Math.abs(ny - head[1]) < 4) continue;
        noise.push([nx, ny]);
        grid[ny * CELLS_X + nx] = 3;
        return;
    }
}

/** @param {boolean} playAsPlayer */
function resetGame(playAsPlayer) {
    // Demo runs are FULLY deterministic: the LCG re-seeds on every demo
    // reset, so every attract run (including post-death reboots) is
    // identical on every load — the house discipline, asserted by the
    // smoke test. Player runs don't re-seed: they continue from wherever
    // the stream is, so repeated plays don't see the same packet layout.
    if (!playAsPlayer) lcgSeed = 1234567;
    grid.fill(0);
    packets.length = 0;
    noise.length = 0;
    dirQueue.length = 0;
    dir = [1, 0];
    score = 0;
    eaten = 0;
    dead = false;
    stepAccum = 0;
    deathRestartAccum = 0;
    demo = !playAsPlayer;
    playerActive = playAsPlayer;
    snake = [];
    const cy = Math.floor(CELLS_Y / 2);
    for (let i = 0; i < START_LEN; i++) {
        const cx = Math.floor(CELLS_X / 2) - i;
        snake.push([cx, cy]);
        grid[cy * CELLS_X + cx] = 1;
    }
    spawnPacket();
    spawnNoise();
    spawnNoise();
    dirty = true;
}

/** @param {[number, number]} d */
function queueDir(d) {
    if (dirQueue.length >= 2) return;
    const last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
    // No 180° reversal into the current (or queued) direction
    if (d[0] === -last[0] && d[1] === -last[1]) return;
    dirQueue.push(d);
    dirty = true;
}

function die() {
    dead = true;
    deathRestartAccum = 0;
    // A finished PLAYER run may set the record (the demo AI doesn't count —
    // it plays itself, so its score would be the machine's, not yours).
    if (!demo && score > bestScore) {
        bestScore = score;
        persistBestScore();
    }
    dirty = true;
}

/** Advance the snake one cell. Returns true when a step happened. */
function stepSnake() {
    if (dirQueue.length) {
        const d = dirQueue.shift();
        if (d) dir = d;
    }
    const head = snake[0];
    const nx = head[0] + dir[0];
    const ny = head[1] + dir[1];
    const cell = inBounds(nx, ny) ? grid[ny * CELLS_X + nx] : 1; // wall = collision
    if (cell === 1 || cell === 3) {
        die();
        return;
    }
    snake.unshift([nx, ny]);
    grid[ny * CELLS_X + nx] = 1;
    if (cell === 2) {
        // Ate the packet — +10 integrity, grow, resupply
        const idx = packets.findIndex((p) => p[0] === nx && p[1] === ny);
        if (idx >= 0) packets.splice(idx, 1);
        grid[ny * CELLS_X + nx] = 1;
        score += 10;
        eaten++;
        if (eaten % NOISE_EVERY === 0) spawnNoise();
        spawnPacket();
        dirty = true;
        return;
    }
    // No packet — tail advances (no growth)
    const tail = snake.pop();
    if (tail) grid[tail[1] * CELLS_X + tail[0]] = 0;
    dirty = true;
}

/** Greedy attract AI: head toward the packet, prefer the move that
 *  minimizes Manhattan distance, never reverse or hit walls/self/noise. */
function attractStep() {
    const head = snake[0];
    const target = packets[0];
    if (!target) {
        die();
        return;
    }
    /** @type {Array<[number, number]>} */
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    /** @type {[number, number] | null} */
    let best = null;
    let bestD = Infinity;
    for (const [dx, dy] of dirs) {
        if (dx === -dir[0] && dy === -dir[1]) continue; // no reversal
        const nx = head[0] + dx;
        const ny = head[1] + dy;
        if (!inBounds(nx, ny)) continue;
        const c = grid[ny * CELLS_X + nx];
        if (c === 1 || c === 3) continue;
        const d = Math.abs(nx - target[0]) + Math.abs(ny - target[1]);
        if (d < bestD) {
            bestD = d;
            best = [dx, dy];
        }
    }
    if (!best) {
        die();
        return;
    }
    queueDir(best);
    stepSnake();
}

// ─── Drawing ────────────────────────────────────────────────
function drawScreen() {
    if (!gctx) return;
    const c = gctx;
    c.fillStyle = C_BG;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Score bar
    c.font = '13px monospace';
    c.textBaseline = 'top';
    c.fillStyle = C_TEXT;
    c.fillText(`SIGNAL INTEGRITY: ${String(score).padStart(3, '0')}`, 10, 8);
    c.fillStyle = C_MUTED;
    c.textAlign = 'right';
    c.fillText(demo ? 'DEMO' : 'LIVE', CANVAS_W - 10, 8);
    c.textAlign = 'left';
    // Best run — the machine's record, on screen whenever the game is. Only
    // after a record exists: a bare "BEST 000" before the first run would
    // read as a broken score, not an empty one.
    if (bestScore > 0) {
        c.font = '10px monospace';
        c.fillStyle = C_MUTED;
        c.fillText(`BEST ${String(bestScore).padStart(3, '0')}`, 10, 22);
    }

    // Faint grid
    c.strokeStyle = C_GRID;
    c.lineWidth = 1;
    for (let gx = 0; gx <= CELLS_X; gx++) {
        c.beginPath();
        c.moveTo(OFFSET_X + gx * CELL, OFFSET_Y);
        c.lineTo(OFFSET_X + gx * CELL, OFFSET_Y + GRID_PX_H);
        c.stroke();
    }
    for (let gy = 0; gy <= CELLS_Y; gy++) {
        c.beginPath();
        c.moveTo(OFFSET_X, OFFSET_Y + gy * CELL);
        c.lineTo(OFFSET_X + GRID_PX_W, OFFSET_Y + gy * CELL);
        c.stroke();
    }

    // Noise blocks — red obstacles
    for (const [nx, ny] of noise) {
        c.fillStyle = C_NOISE;
        c.fillRect(OFFSET_X + nx * CELL + 2, OFFSET_Y + ny * CELL + 2, CELL - 4, CELL - 4);
    }

    // Packets — gold signal pulses (diamond)
    c.fillStyle = C_PACKET;
    for (const [px, py] of packets) {
        const cx = OFFSET_X + px * CELL + CELL / 2;
        const cy = OFFSET_Y + py * CELL + CELL / 2;
        const r = CELL / 2 - 1;
        c.beginPath();
        c.moveTo(cx, cy - r);
        c.lineTo(cx + r, cy);
        c.lineTo(cx, cy + r);
        c.lineTo(cx - r, cy);
        c.closePath();
        c.fill();
    }

    // Snake — the copper trace (head brightest)
    snake.forEach(([sx, sy], i) => {
        c.fillStyle = i === 0 ? C_HEAD : C_BODY;
        const pad = i === 0 ? 0 : 1;
        c.fillRect(OFFSET_X + sx * CELL + pad, OFFSET_Y + sy * CELL + pad, CELL - pad * 2, CELL - pad * 2);
    });

    // Status overlays
    if (dead) {
        c.fillStyle = 'rgba(4, 10, 6, 0.72)';
        c.fillRect(OFFSET_X, OFFSET_Y, GRID_PX_W, GRID_PX_H);
        c.fillStyle = C_RED;
        c.font = 'bold 22px monospace';
        c.textAlign = 'center';
        c.fillText('SIGNAL LOST', CANVAS_W / 2, OFFSET_Y + GRID_PX_H / 2 - 20);
        c.font = '13px monospace';
        c.fillStyle = C_TEXT;
        c.fillText(`INTEGRITY ${score}`, CANVAS_W / 2, OFFSET_Y + GRID_PX_H / 2 + 8);
        c.fillStyle = C_MUTED;
        c.fillText(demo ? 'REBOOTING…' : 'ENTER TO REBOOT', CANVAS_W / 2, OFFSET_Y + GRID_PX_H / 2 + 30);
        c.textAlign = 'left';
    } else if (playerActive) {
        c.fillStyle = C_MUTED;
        c.font = '10px monospace';
        c.textAlign = 'center';
        c.fillText('ESC EXIT', CANVAS_W / 2, CANVAS_H - 13);
        c.textAlign = 'left';
    }
}

/** Static title screen — shown instead of the demo under reduced
 *  motion (decorative auto-play is motion; a title is not). */
function drawStaticTitle() {
    if (!gctx) return;
    const c = gctx;
    c.fillStyle = C_BG;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    c.textAlign = 'center';
    c.fillStyle = C_TEXT;
    c.font = 'bold 20px monospace';
    c.fillText('SIGNAL SNAKE', CANVAS_W / 2, 70);
    c.font = '13px monospace';
    c.fillStyle = C_MUTED;
    c.fillText('2.4in DISPLAY · LCD1', CANVAS_W / 2, 100);
    c.fillText('CLICK TO PLAY', CANVAS_W / 2, 140);
    if (bestScore > 0) {
        c.fillStyle = C_TEXT;
        c.fillText(`BEST ${String(bestScore).padStart(3, '0')}`, CANVAS_W / 2, 172);
    }
    c.textAlign = 'left';
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

/** Enter player mode — called by journey.js when the camera glides
 *  to the display. Begins a fresh player run. */
export function focusLcd() {
    if (typeof document !== 'undefined') document.body.classList.add('lcd-active');
    resetGame(true);
}

/** Leave player mode — restore the attract demo (or, under reduced
 *  motion, the static title). */
export function exitLcd() {
    if (typeof document !== 'undefined') document.body.classList.remove('lcd-active');
    playerActive = false;
    if (!motionPrefs.reduced) {
        resetGame(false); // back to the demo
    } else {
        reducedStaticDrawn = false; // redraw the title once
        dirty = true;
    }
}

/** Step the game clock — the demo (attract) or the player run. PURE game
 *  logic with no rendering: runs even without a canvas context so the
 *  headless smoke test drives the deterministic simulation through the
 *  same seam the browser tick uses.
 *  @param {number} delta */
function stepLcdGame(delta) {
    // Reduced motion: no auto-play. Static title unless the player is
    // actively playing (input-driven interaction is allowed).
    if (motionPrefs.reduced && !playerActive) return;
    if (dead) {
        // Freeze frame, then restart (demo auto-reboots after ~2.2s)
        deathRestartAccum += delta;
        if (demo && deathRestartAccum > 2.2) resetGame(false);
        return;
    }
    stepAccum += delta;
    if (stepAccum >= STEP_SEC) {
        stepAccum = 0;
        if (demo) attractStep();
        else stepSnake();
    }
}

/** Serialized game state — the pure seam for the headless smoke test (same
 *  pattern as journey.js's stepQueue / idle.js's idleDriftOffset). The demo
 *  must be deterministic: the same tick schedule from a fresh reset yields
 *  the identical snapshot every run. Player mode adds the input turns.
 *  @returns {{ score: number, best: number, snakeLen: number, head: number[], dir: number[], packets: number, packetPos: number[][], noise: number, noisePos: number[][], dead: boolean, demo: boolean, playerActive: boolean, gridHash: string }} */
export function lcdStateSnapshot() {
    // FNV-1a over the grid — a compact, deterministic fingerprint.
    let hash = 2166136261;
    for (let i = 0; i < grid.length; i++) {
        hash ^= grid[i];
        hash = Math.imul(hash, 16777619);
    }
    return {
        score,
        best: bestScore,
        snakeLen: snake.length,
        head: [snake[0][0], snake[0][1]],
        dir: [dir[0], dir[1]],
        packets: packets.length,
        packetPos: packets.map((p) => [p[0], p[1]]),
        noise: noise.length,
        noisePos: noise.map((p) => [p[0], p[1]]),
        dead,
        demo,
        playerActive,
        gridHash: (hash >>> 0).toString(16)
    };
}

/** Per-frame tick — steps the demo (attract) or the player run, redraws
 *  the screen when the frame changed, and keeps the bezel power LED lit
 *  while the game is live. Runs from main.js's tick pipeline (same
 *  registry as the LED array / ripple). The game LOGIC runs even without
 *  a render context (headless smoke test); only the drawing is skipped.
 *  @param {number} elapsed
 *  @param {number} delta */
export function updateLcdScreen(elapsed, delta) {
    void elapsed;
    // Bezel power LED — bright while the game is live, calm at rest.
    if (bezelLedMat) {
        bezelLedMat.emissiveIntensity = playerActive ? 1.6 : 0.35;
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
    if (dirty) {
        drawScreen();
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
        componentName: 'LCD1 — 2.4" Display (Signal Snake)',
        type: 'LCD',
        isInteractive: true
    };
    boardGroup.add(bounds);
    interactiveObjects.push(bounds);

    // Load the persistent best run (localStorage) before the first draw so
    // the boot screen shows the machine's record. One read at build time —
    // the tick's render path never touches storage.
    loadBestScore();

    // Start the attract demo (or the static title under reduced motion)
    if (motionPrefs.reduced) {
        reducedStaticDrawn = false;
        dirty = true;
    } else {
        resetGame(false);
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
            if (dead || playerActive) resetGame(true);
            return;
        }
        const d = key === 'ArrowUp' || key === 'w' || key === 'W' ? [0, -1]
            : key === 'ArrowDown' || key === 's' || key === 'S' ? [0, 1]
            : key === 'ArrowLeft' || key === 'a' || key === 'A' ? [-1, 0]
            : key === 'ArrowRight' || key === 'd' || key === 'D' ? [1, 0]
            : null;
        if (!d) return;
        e.preventDefault();
        if (dead) resetGame(true);
        else queueDir(/** @type {[number, number]} */ (d));
    });
}
