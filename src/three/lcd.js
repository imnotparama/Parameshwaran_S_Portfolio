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
// The game logic itself lives in lcd-sim.js — the pure, zero-THREE/DOM
// simulation this module renders (see that file's header for the seam
// contract between the sim and this renderer).
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
// The pure SIGNAL RUNNER simulation — zero THREE/DOM (lcd-sim.js). The sim
// owns the game state, physics, persistence, and the snapshot seam; this
// module owns the meshes, the canvas texture, and the drawing.
import {
    ACHIEVEMENTS, BASE_SPEED, BLINK_SEC, CANVAS_H, CANVAS_W, COUNT_DIGIT,
    COUNT_SEC, GROUND_Y, IDLE_BLINK_MS, MAX_SPEED, SPEED_RAMP, SWIPE_PX,
    clearDirty, doDash, doJump, doSlide, endSlide, getState, isDirty,
    loadBestScore, markDirty, pauseRun, powerOffLcd, powerOnLcd, resumeRun,
    setFpsSmooth, setGlowCurrent, simView, skipCountdown, startRun, stepRunner,
    toggleDebug
} from './lcd-sim.js';

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

// Monochrome phosphor — black + green only (shades for ghost/scanline).
const C_BG = '#03130a';
const C_BRIGHT = '#3ee6a0';
const C_DIM = '#10794a';
const C_FAINT = '#0a3d22';

// ─── Scene objects (created by createLcd) ───────────────────
/** @type {HTMLCanvasElement | null} */ let gameCanvas = null;
/** @type {CanvasRenderingContext2D | null} */ let gctx = null;
/** @type {THREE.CanvasTexture | null} */ let screenTexture = null;
/** @type {THREE.MeshStandardMaterial | null} */ let bezelLedMat = null;
/** @type {THREE.MeshBasicMaterial | null} */ let glowMat = null;
/** @type {HTMLCanvasElement | null} */ let ghostCanvas = null;
/** @type {CanvasRenderingContext2D | null} */ let ghostCtx = null;

// ─── Render bookkeeping (owned here — the sim knows nothing of frames) ──
// exitHandler is the journey-side focus release (Esc / re-click / scroll);
// frameCount drives the runner's run-cycle and the deterministic flicker;
// the blink flags gate the transition-gated redraws; reducedStaticDrawn is
// the reduced-motion one-shot. S is the live sim view, refreshed once per
// frame by updateLcdScreen so every draw reads one consistent snapshot.
/** @type {(() => void) | null} */ let exitHandler = null;
let frameCount = 0;
let lastBlinkVisible = true;
let lastOverBlink = -1;
let lastPauseBlink = -1;
let reducedStaticDrawn = false;
/** @type {string | null} */ let lastState = null; // previous sim state (blink-tracker resets)
let S = simView();

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


// ─── Rendering (skipped headlessly) ─────────────────────────

/** @param {CanvasRenderingContext2D} c */
function drawHud(c) {
    drawText(c, `SIG:${String(S.score).padStart(3, '0')}`, 2, 1, C_BRIGHT);
    const distStr = `DIST:${String(Math.floor(S.dist)).padStart(4, '0')}`;
    drawText(c, distStr, CANVAS_W - 2 - textWidth(distStr), 1, C_BRIGHT);
    if (S.combo > 1) drawText(c, `x${S.combo}`, 56, 1, C_DIM);
    if (S.electrons > 0) drawText(c, `E:${S.electrons}`, 42, 1, C_DIM);
    // Active power-ups — a tiny status row under the HUD.
    let pwr = '';
    if (S.shield) pwr += 'SH ';
    if (S.overclock > 0) pwr += 'OC ';
    if (S.turbo > 0) pwr += 'TB ';
    if (S.stabilizer > 0) pwr += 'ST ';
    if (S.magnet > 0) pwr += 'MG ';
    if (pwr) drawText(c, pwr.trim(), 2, 9, C_DIM);
    // Live telemetry — current trace speed and frame rate (display-only
    // readouts; fpsSmooth never feeds the deterministic simulation).
    drawText(c, `SPD:${String(S.curSpeed).padStart(3, '0')}`, 2, 58, C_DIM);
    drawText(c, `FPS:${String(Math.min(999, Math.max(0, Math.round(S.fpsSmooth)))).padStart(3, '0')}`, CANVAS_W - 2 - textWidth('FPS:999'), 58, C_DIM);
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
    for (const a of S.actors) {
        if (a.type !== 'gap') continue;
        c.fillRect(a.x, GROUND_Y, a.w, 2);
        // frayed ends
        c.fillStyle = C_DIM;
        c.fillRect(a.x - 1, GROUND_Y, 1, 1);
        c.fillRect(a.x + a.w, GROUND_Y, 1, 1);
        c.fillStyle = C_BG;
    }
}

/** The actor typedef is canonical in lcd-sim.js — duplicated here only for
 *  JSDoc (JS modules can't re-export types). */
/** @typedef {{ kind: 'obstacle' | 'powerup', type: string, x: number, y: number, w: number, h: number, baseY: number, phase: number, passed: boolean }} Actor */
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
    if (S.sliding) {
        // Flat skid — the pulse hugging the trace under a beam.
        c.fillStyle = C_BRIGHT;
        c.fillRect(S.px - 1, S.py - 3, 5, 2);
        c.fillRect(S.px, S.py - 1, 3, 1);
        return;
    }
    const step = Math.floor(frameCount / 6) % 2;
    c.fillStyle = S.dashing ? C_BRIGHT : C_DIM;
    // Body — a 3-wide pulse column with a 2-frame run cycle (the "legs"
    // alternate: a charge tick below the body).
    c.fillRect(S.px + 1, S.py - 6, 1, 4);
    c.fillStyle = C_BRIGHT;
    c.fillRect(S.px, S.py - 5, 3, 3);
    c.fillRect(S.px + 1, S.py - 2, 1, 1);
    if (!S.onGround) {
        // Jump pose — a rising bolt trail.
        c.fillRect(S.px, S.py - 8, 1, 1);
        c.fillRect(S.px - 1, S.py - 9, 1, 1);
    } else if (step === 1) {
        c.fillRect(S.px, S.py - 1, 1, 1);
    } else {
        c.fillRect(S.px + 2, S.py - 1, 1, 1);
    }
    // Dash afterglow.
    if (S.dashing) {
        c.fillStyle = C_DIM;
        c.fillRect(S.px - 4, S.py - 4, 3, 2);
        c.fillRect(S.px - 8, S.py - 3, 3, 1);
    }
}

/** @param {CanvasRenderingContext2D} c */
function drawField(c) {
    drawGround(c);
    for (const a of S.actors) {
        if (a.kind === 'powerup') drawPowerup(c, a);
        else if (a.type !== 'gap') drawObstacle(c, a);
    }
    // Electrons — small bright dots.
    c.fillStyle = C_BRIGHT;
    for (const e of S.fieldEls) {
        c.fillRect(e.x, e.y, 2, 1);
        c.fillRect(e.x, e.y + 1, 1, 1);
    }
    drawRunner(c);
    // Particles — collect/dash/crash bursts.
    for (const p of S.particles) {
        const fade = 1 - p.t / p.life;
        c.fillStyle = fade > 0.5 ? C_BRIGHT : C_DIM;
        c.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
}

/** @param {CanvasRenderingContext2D} c */
function drawBoot(c) {
    drawTextCentered(c, 'SIGNAL RUNNER', 8, C_BRIGHT);
    drawTextCentered(c, 'FW 2.0.0', 16, C_DIM);
    // POST lines: the label TYPES OUT character by character (~80 chars/s),
    // then dots fill to a fixed column, then OK — every OK lands at the
    // same x (a real POST table).  The two-phase split keeps the total
    // time per line unchanged (0.18s) while adding the typing feel.
    /** @type {Array<[string, number, number]>} */
    const lines = [
        ['MEM CHECK', 24, 0.12],
        ['TRACE SCAN', 32, 0.32],
        ['PULSE GEN', 40, 0.52],
        ['CALIBRATE', 48, 0.72]
    ];
    const DOT_COL = 16; // label + dots always fills to 16 chars before OK
    const BLOCK_W = textWidth('TRACE SCAN........OK');
    const x0 = Math.floor((CANVAS_W - BLOCK_W) / 2);
    // 60% of the 0.18s window for typing, 40% for dots + OK.
    const TYPE_FRAC = 0.6;
    for (const [label, y, start] of lines) {
        const done = S.bootAccum - start; // seconds into this line
        if (done <= 0) continue;
        const p = Math.min(1, done / 0.18);
        if (p < TYPE_FRAC) {
            // Typing phase: label appears character by character.
            // At ~80 chars/s a 9-char label types in ~0.11s (within the
            // 0.108s typing window).  Each char pops in on its own frame.
            const typeP = p / TYPE_FRAC;
            const charsVisible = Math.min(label.length, Math.floor(typeP * label.length) + 1);
            drawText(c, label.substring(0, charsVisible), x0, y, C_DIM);
        } else {
            // Dots + OK phase: label is fully typed, now fill dots.
            const dotP = (p - TYPE_FRAC) / (1 - TYPE_FRAC);
            const need = DOT_COL - label.length;
            const dots = Math.floor(dotP * need);
            let s = label;
            for (let i = 0; i < Math.min(need, dots); i++) s += '.';
            if (dotP >= 1) s += 'OK';
            drawText(c, s, x0, y, C_DIM);
        }
    }
}

/** @param {CanvasRenderingContext2D} c */
function drawReady(c) {
    drawTextCentered(c, 'SIGNAL RUNNER', 8, C_BRIGHT);
    drawTextCentered(c, 'RESTORE CPU POWER', 16, C_DIM);
    if (S.bestScore > 0) {
        // The record is labeled with the seed it was set on — layout-relative.
        const bestLabel = S.bestSeed > 0
            ? `BEST ${String(S.bestScore).padStart(3, '0')} · S${S.bestSeed}`
            : `BEST ${String(S.bestScore).padStart(3, '0')}`;
        drawTextCentered(c, bestLabel, 24, C_DIM);
    }
    if (S.leaderboard.length > 0) {
        const top = S.leaderboard.slice(0, 3).map((e) => String(e.score).padStart(3, '0')).join(' ');
        drawTextCentered(c, `TOP ${top}`, 32, C_FAINT);
    }
    drawTextCentered(c, `ACHV ${S.achvUnlocked.size}/${ACHIEVEMENTS.length}`, 40, C_FAINT);
    // After 15s idle the prompt starts to blink (idle mode); before that it
    // is steady so a fresh visitor sees it immediately.
    const armed = S.idleAccum >= IDLE_BLINK_MS / 1000;
    const visible = !armed || (Math.floor(S.idleAccum / BLINK_SEC) % 2 === 0);
    if (visible) {
        drawTextCentered(c, 'AUTO-START: RUN', 50, C_BRIGHT);
    }
    drawTextCentered(c, 'UP/W JUMP · DOWN/S SLIDE', 59, C_FAINT);
}

/** The auto-start countdown — 3, 2, 1 on the trace, then the pulse launches.
 *  Enter/tap skips it (the run starts this instant — the LCG re-seed makes
 *  a skipped countdown play the identical layout). @param {CanvasRenderingContext2D} c */
function drawCount(c) {
    const digit = Math.max(1, Math.ceil((COUNT_SEC - S.countAccum) / COUNT_DIGIT));
    const frac = (S.countAccum % COUNT_DIGIT) / COUNT_DIGIT; // 0→1 within the digit
    // A big centered digit with a faint echo — the number "wipes down" into
    // the trace like a firmware boot tick.
    const big = String(digit);
    const bw = textWidth(big) * 2;
    drawText(c, big, Math.floor((CANVAS_W - bw) / 2), 20, C_FAINT);
    drawText(c, big, Math.floor((CANVAS_W - bw) / 2), 20 + Math.round(frac * 6), C_BRIGHT);
    drawTextCentered(c, 'GET READY', 36, C_DIM);
    drawTextCentered(c, 'ENTER / TAP SKIP', 50, C_FAINT);
    // The copper trace with the pulse standing at the start line.
    drawGround(c);
    drawRunner(c);
}

/** @param {CanvasRenderingContext2D} c */
function drawPlaying(c) {
    drawHud(c);
    drawField(c);
    // A CPU checkpoint flash every 1000px — the trace reached the next
    // processor stage ("CPU 1000 OK"). Blinks ~4Hz for the flash duration.
    if (S.fxMilestone > 0 && Math.floor(S.fxMilestone * 4) % 2 === 0) {
        drawTextCentered(c, `CPU ${String(S.milestonePx).padStart(4, '0')} OK`, 50, C_BRIGHT);
    }
    // SND status — a tiny indicator so the player knows if audio is live.
    const sndLabel = (typeof document !== 'undefined' && document.body.classList.contains('sound-on')) ? 'SND:ON' : 'SND:OFF';
    drawText(c, sndLabel, CANVAS_W - 2 - textWidth(sndLabel), 58, C_FAINT);
    drawTextCentered(c, 'STATUS:ONLINE', 58, C_FAINT);
}

/** @param {CanvasRenderingContext2D} c */
function drawPaused(c) {
    drawTextCentered(c, 'PAUSED', 10, C_BRIGHT);
    drawTextCentered(c, `DIST ${String(Math.floor(S.dist)).padStart(4, '0')} · SIG ${String(S.score).padStart(3, '0')}`, 22, C_DIM);
    const blink = Math.floor(S.pauseAccum / BLINK_SEC) % 2 === 0;
    if (blink) drawTextCentered(c, 'P / TAP RESUME', 40, C_BRIGHT);
    drawTextCentered(c, 'ESC / SCROLL QUIT', 52, C_DIM);
}

/** @param {CanvasRenderingContext2D} c */
function drawOver(c) {
    // Dim the run field behind the verdict.
    c.fillStyle = C_BG;
    c.fillRect(0, 8, CANVAS_W, 52);
    drawTextCentered(c, 'SIGNAL LOST', 8, C_BRIGHT);
    drawTextCentered(c, `DIST ${String(Math.floor(S.dist)).padStart(4, '0')} · SIG ${String(S.score).padStart(3, '0')}`, 18, C_DIM);
    drawTextCentered(c, `E ${S.electrons} · COMBO x${S.maxCombo}`, 26, C_DIM);
    // The blink clock is live (overAccum), so NEW RECORD and the retry prompt
    // actually flash; reduced motion never advances it → steady, no blink.
    const blink = Math.floor(S.overAccum / BLINK_SEC) % 2 === 0;
    if (S.newRecord) {
        if (blink) drawTextCentered(c, 'NEW RECORD', 34, C_BRIGHT);
    } else if (S.bestScore > 0) {
        // The record is labeled with the seed it was set on: since every run
        // plays a different layout, the best is only truly comparable to runs
        // of the SAME seed — layout-relative, not absolute.
        const bestLabel = S.bestSeed > 0
            ? `BEST ${String(S.bestScore).padStart(3, '0')} · S${S.bestSeed}`
            : `BEST ${String(S.bestScore).padStart(3, '0')}`;
        drawTextCentered(c, bestLabel, 34, C_DIM);
    }
    if (S.achvNewThisRun.length > 0 && blink) {
        drawTextCentered(c, `ACHV ${S.achvNewThisRun.join(' ')}`, 42, C_DIM);
    } else if (S.bestSeed > 0 && S.bestSeed !== S.currentSeed) {
        // The run you just played used a DIFFERENT layout than the record —
        // the honest comparison note (identical re-runs omit it).
        drawTextCentered(c, `YOUR S${S.currentSeed}`, 42, C_DIM);
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
    if (!S.debug) return;
    const obs = S.actors.filter((a) => a.kind === 'obstacle').length;
    const line1 = `ST ${S.state} · DIST ${Math.floor(S.dist)}`;
    const line2 = `OBS ${obs} · SEED ${S.lcgSeed >>> 0}`;
    const line3 = `P ${S.px},${Math.round(S.py)} · VY ${Math.round(S.vy)} · J ${S.jumpsUsed}`;
    const line4 = `PWR SH ${S.shield ? 1 : 0} OC ${S.overclock > 0 ? 1 : 0} TB ${S.turbo > 0 ? 1 : 0}`;
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

    if (S.state === 'off') drawOff(c);
    else if (S.state === 'boot') drawBoot(c);
    else if (S.state === 'ready') drawReady(c);
    else if (S.state === 'count') drawCount(c);
    else if (S.state === 'playing') drawPlaying(c);
    else if (S.state === 'paused') drawPaused(c);
    else drawOver(c);
    if (S.state !== 'off' && S.debug) drawDebugOverlay(c);

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

/** The static frame drawn under reduced motion when NOT actively focused
 *  (no auto-play at rest, no blink): blank glass when powered off, the
 *  result/pause screens drawn once so a reduced-motion player is never left
 *  staring at nothing after a run ends. */
function drawStaticFrame() {
    if (!gctx) return;
    const c = gctx;
    c.fillStyle = C_BG;
    c.fillRect(0, 0, CANVAS_W, CANVAS_H);
    if (S.state === 'over') {
        drawTextCentered(c, 'SIGNAL LOST', 8, C_BRIGHT);
        drawTextCentered(c, `DIST ${String(Math.floor(S.dist)).padStart(4, '0')} · SIG ${String(S.score).padStart(3, '0')}`, 18, C_DIM);
        drawTextCentered(c, `E ${S.electrons} · COMBO x${S.maxCombo}`, 26, C_DIM);
        if (S.newRecord) drawTextCentered(c, 'NEW RECORD', 34, C_BRIGHT);
        else if (S.bestScore > 0) {
            const bestLabel = S.bestSeed > 0
                ? `BEST ${String(S.bestScore).padStart(3, '0')} · S${S.bestSeed}`
                : `BEST ${String(S.bestScore).padStart(3, '0')}`;
            drawTextCentered(c, bestLabel, 34, C_DIM);
        }
        drawTextCentered(c, 'ENTER TO RETRY', 44, C_BRIGHT);
    } else if (S.state === 'paused') {
        drawTextCentered(c, 'PAUSED', 10, C_BRIGHT);
        drawTextCentered(c, `DIST ${String(Math.floor(S.dist)).padStart(4, '0')} · SIG ${String(S.score).padStart(3, '0')}`, 22, C_DIM);
        drawTextCentered(c, 'P / TAP RESUME', 40, C_BRIGHT);
    } else if (S.state === 'ready') {
        drawTextCentered(c, 'SIGNAL RUNNER', 20, C_BRIGHT);
        drawTextCentered(c, '2.4IN LCD1', 32, C_DIM);
        drawTextCentered(c, 'ENTER TO RUN', 44, C_BRIGHT);
        if (S.bestScore > 0) {
            const bestLabel = S.bestSeed > 0
                ? `BEST ${String(S.bestScore).padStart(3, '0')} · S${S.bestSeed}`
                : `BEST ${String(S.bestScore).padStart(3, '0')}`;
            drawTextCentered(c, bestLabel, 54, C_DIM);
        }
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

// The sim owns the readouts below (persistence, the test seam, the
// board-reactive FX, and the deterministic snapshot). They are re-exported
// unchanged so every consumer — main.js / journey.js / oscilloscope.js /
// telemetry.js / the smoke suite — keeps its existing import.
export { getBestScore, setBestListener, resetRunCounter, getBoardFx, lcdStateSnapshot } from './lcd-sim.js';

/** Live runner state for the HUD oscilloscope — the scope shows the pulse's
 *  heartbeat while the game is focused (spikes on jump/dash, flatline when
 *  the run ends). @returns {{ active: boolean, state: string, jumping: boolean, sliding: boolean, dashing: boolean, shielded: boolean, over: boolean, paused: boolean, speed01: number }} */
export function getRunnerScope() {
    const S = simView();
    const speed = S.state === 'playing' || S.state === 'count' ? Math.min(MAX_SPEED, BASE_SPEED + S.dist * SPEED_RAMP) : 0;
    return {
        active: isLcdActive(),
        state: S.state,
        jumping: S.state === 'playing' && !S.onGround && S.vy < 0,
        sliding: S.sliding,
        dashing: S.dashing,
        shielded: S.shield,
        over: S.state === 'over',
        paused: S.state === 'paused',
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
    if (typeof document !== 'undefined') {
        document.body.classList.add('lcd-active');
        // Hide sidebar content during gameplay — the game IS the content.
        // A small minimized LinkedIn CTA stays visible (css: .lcd-game-minicta).
        document.body.classList.add('lcd-game-focus');
    }
    // Focus is an EXPLICIT user action, so the machine powers on and the run
    // auto-starts even under prefers-reduced-motion — reduced motion only
    // silences the ambient chrome (glow pulse, ghosting, CRT flicker, blink),
    // never the game the user asked to play. (Parking here on a frozen title
    // was the "only shows SIGNAL RUNNER" bug — a reduced-motion visitor saw
    // the boot title forever.) The state transition itself is the sim's
    // (powerOnLcd); this module layers the DOM keyboard gate on top.
    powerOnLcd();
    reducedStaticDrawn = false;
}

/** Leave the game — power the display back down (a real LCD module). */
export function exitLcd() {
    if (typeof document !== 'undefined') {
        document.body.classList.remove('lcd-active');
        // Restore the full sidebar on exit.
        document.body.classList.remove('lcd-game-focus');
    }
    powerOffLcd();
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
    // Live sim view — the pre-step snapshot (FPS smoothing reads the previous
    // smoothed value; the bezel/glow read the state before this frame's step).
    S = simView();
    // FPS smoothing for the HUD readout — a first-order low-pass over the
    // per-frame rate. DISPLAY-ONLY: never feeds the simulation or the
    // snapshot hash, so determinism is untouched.
    if (delta > 0) {
        const inst = 1 / delta;
        setFpsSmooth(S.fpsSmooth > 0 ? S.fpsSmooth + (inst - S.fpsSmooth) * Math.min(1, delta * 3) : inst);
    }
    // Bezel power LED — the power indicator: bright while a run is live,
    // dimmer while the machine is on, near-off when powered down.
    if (bezelLedMat) {
        bezelLedMat.emissiveIntensity = S.state === 'playing' || S.state === 'count' ? 1.6
            : S.state === 'paused' ? 1.0
            : S.state === 'boot' || S.state === 'ready' ? 0.9
            : S.state === 'over' ? 0.6
            : 0.15;
    }
    // Screen glow — the halo brightens and pulses while a run is live, dims
    // to a steady low while paused, and fades back to nothing at rest (the
    // same deterministic sine the LED array uses). Reduced motion snaps
    // straight to the state's value — no animated fade.
    if (glowMat) {
        let next;
        if (motionPrefs.reduced) {
            next = S.state === 'playing' ? GLOW_STEADY : S.state === 'paused' ? GLOW_PAUSED : 0;
        } else {
            const target = S.state === 'playing' || S.state === 'count'
                ? GLOW_BASE + GLOW_AMP * (0.5 + 0.5 * Math.sin(elapsed * GLOW_FREQ * Math.PI * 2 + GLOW_PHASE))
                : S.state === 'paused' ? GLOW_PAUSED : 0;
            next = S.glowCurrent + (target - S.glowCurrent) * Math.min(1, delta * GLOW_FADE);
        }
        setGlowCurrent(next);
        glowMat.opacity = next;
    }
    // Game logic first — stepped regardless of the render path.
    stepRunner(delta);
    // Post-step sim view — refreshed after the step so every draw shows the
    // frame that just played, not the state from before it.
    S = simView();
    // Blink trackers reset on ANY state change — entering 'over'/'paused'
    // must redraw the result/pause screen immediately even if the previous
    // visit ended on the same blink slot (the sim owns the clocks but not
    // the renderer's blink bookkeeping).
    if (S.state !== lastState) {
        lastState = S.state;
        lastOverBlink = -1;
        lastPauseBlink = -1;
    }
    // Rendering — skipped headlessly (no canvas context, no screen quad).
    if (!screenTexture || !gctx) return;
    // Reduced motion: draw the static frame once (no auto-play at rest).
    if (motionPrefs.reduced && !S.playerActive) {
        if (!reducedStaticDrawn) {
            drawStaticFrame();
            reducedStaticDrawn = true;
            screenTexture.needsUpdate = true;
        }
        return;
    }
    // The boot POST wipes in progressively — redraw every frame while booting.
    if (S.state === 'boot') markDirty();
    // The runner animates every frame while playing; the countdown digit
    // slides down each second, so it redraws every frame too.
    if (S.state === 'playing' || S.state === 'count') markDirty();
    // The title prompt blinks once armed — redraw on the blink transition.
    if (S.state === 'ready') {
        const armed = S.idleAccum >= IDLE_BLINK_MS / 1000;
        const visible = !armed || (Math.floor(S.idleAccum / BLINK_SEC) % 2 === 0);
        if (visible !== lastBlinkVisible) {
            lastBlinkVisible = visible;
            markDirty();
        }
    }
    // The result screen blinks (NEW RECORD + retry prompt) — redraw only on
    // the blink-slot transition, not every frame.
    if (S.state === 'over') {
        const o = Math.floor(S.overAccum / BLINK_SEC);
        if (o !== lastOverBlink) {
            lastOverBlink = o;
            markDirty();
        }
    }
    // The pause prompt blinks — same transition-gated redraw.
    if (S.state === 'paused') {
        const o = Math.floor(S.pauseAccum / BLINK_SEC);
        if (o !== lastPauseBlink) {
            lastPauseBlink = o;
            markDirty();
        }
    }
    if (isDirty()) {
        drawFrame(delta);
        screenTexture.needsUpdate = true;
        clearDirty();
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
    powerOffLcd();

    // Exclusive keyboard capture while the game is focused. Registered
    // once; internally gated on isLcdActive() so it never steals keys at
    // rest. The OTHER listeners (probe / journey arrows / section keys /
    // palette / cheat) all gate on body.lcd-active in their own modules.
    window.addEventListener('keydown', (e) => {
        if (!isLcdActive()) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const key = e.key;
        const st = getState();
        if (key === 'Escape') {
            e.preventDefault();
            exitLcd();
            if (exitHandler) exitHandler();
            return;
        }
        if (key === 'Enter') {
            e.preventDefault();
            if (st === 'paused') {
                resumeRun();
                return;
            }
            if (st === 'count') {
                skipCountdown();
                return;
            }
            if (st === 'ready' || st === 'over') startRun();
            return;
        }
        if (key === 'p' || key === 'P') {
            e.preventDefault();
            if (st === 'playing' || st === 'count') pauseRun();
            else if (st === 'paused') resumeRun();
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
        if (getState() !== 'paused' && e.cancelable) e.preventDefault();
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        if (Math.abs(dx) >= SWIPE_PX || Math.abs(dy) >= SWIPE_PX) touchSteered = true;
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
        if (!isLcdActive()) return;
        // Only the last finger up settles the gesture.
        if (e.touches && e.touches.length > 0) return;
        const st = getState();
        const dy = (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : touchStartY) - touchStartY;
        if (twoFinger) {
            // A second finger = pause (the touch P).
            if (e.cancelable) e.preventDefault();
            if (st === 'playing' || st === 'count') pauseRun();
            else if (st === 'paused') resumeRun();
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
        if (st === 'count') {
            // Tap on the countdown = skip it — the run starts this instant.
            if (e.cancelable) e.preventDefault();
            skipCountdown();
        } else if (st === 'ready' || st === 'over') {
            // Tap on the title/result screen = Enter (start / retry).
            if (e.cancelable) e.preventDefault();
            startRun();
        } else if (st === 'playing') {
            // Tap while running = jump (the primary touch action).
            if (e.cancelable) e.preventDefault();
            doJump();
        } else if (st === 'paused') {
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
