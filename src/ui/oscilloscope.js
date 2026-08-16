// @ts-check
// ============================================================
// Live Oscilloscope CRT Waveform HUD
// Renders a per-component waveform on a canvas inside #hud-scope.
// Each component type produces a distinct waveform:
//   Y1     → 27MHz sine with jitter (crystal oscillator)
//   ANT1   → RF packet bursts (periodic spike trains)
//   TP1    → 5V DC flat rail (with noise)
//   TP2    → GND flat rail (zero + noise)
//   U1     → square wave (digital clock pulses)
//   U2     → faster square wave (GPU clock)
//   LCD1   → the SIGNAL RUNNER's live pulse (reacts to gameplay)
//   default→ slow ECG-style sine for any other component
//
// While the LCD game is focused the scope locks onto LCD1 and traces the
// runner's heartbeat: spikes on jump/dash, a flatline when the run ends.
//
// Canvas is 120×40 retro phosphor green; scanlines added via CSS.
// Called per frame from main.js tick loop; no-ops when scope canvas missing.
// ============================================================
import { getRunnerScope } from '../three/lcd.js';

/** @type {HTMLCanvasElement | null} */
let oscCanvas = null;
/** @type {CanvasRenderingContext2D | null} */
let ctx = null;

// The runner's live state, refreshed every frame while the game is focused.
/** @type {ReturnType<typeof getRunnerScope> | null} */
let lcdScope = null;
let lastScopeActive = false;

// Phosphor green palette
const COLOR_TRACE = '#00ff88';
const COLOR_DIM   = 'rgba(0, 255, 136, 0.15)';
const COLOR_GLOW  = 'rgba(0, 255, 136, 0.35)';
const COLOR_BG    = '#020f06';

// Noise helper — deterministic from time so it doesn't snap on each frame
/** @param {number} t @param {number} amp */
function noise(t, amp) {
    return (Math.sin(t * 127.3) + Math.sin(t * 31.7) * 0.4) * amp;
}

/**
 * Waveform generators — each returns a Y offset in [−1, 1] for a given phase t.
 * @param {string} ref Component ref designator
 * @param {number} t   Time (seconds), used as phase
 * @param {number} x   Normalized x position in [0, 1] across the canvas
 * @returns {number}   Y value in [-1, 1]
 */
function waveform(ref, t, x) {
    switch (ref) {
        case 'Y1': {
            // Crystal oscillator: 27MHz sine, high frequency represented at scope scale
            // with subtle ±2px jitter (thermal noise)
            const base = Math.sin(x * Math.PI * 14 + t * 6.0) * 0.7;
            return base + noise(t + x * 17, 0.08);
        }
        case 'ANT1': {
            // RF packet bursts — idle flatline, then 3-peak bursts every ~0.8s
            const cycle = (t % 0.8) / 0.8;
            if (cycle < 0.3) {
                // packet burst: 3 fast oscillation peaks
                const burstPhase = cycle / 0.3;
                return Math.sin(burstPhase * Math.PI * 6) * Math.sin(burstPhase * Math.PI) * 0.9
                    + noise(t * 43, 0.04);
            }
            // idle: near-zero + noise
            return noise(t + x * 5, 0.06);
        }
        case 'TP1': {
            // 5V DC rail — flat line at 0.7 with tiny ripple noise
            return 0.7 + noise(t * 3.1 + x * 2.7, 0.04);
        }
        case 'TP2': {
            // GND — flat zero with noise
            return noise(t * 2.9 + x * 3.1, 0.04);
        }
        case 'U1': {
            // CPU clock: square wave, 50% duty cycle, fast
            const sq = Math.sin(x * Math.PI * 10 + t * 5.0) >= 0 ? 0.75 : -0.75;
            return sq + noise(t * 8 + x, 0.05);
        }
        case 'U2': {
            // GPU: slightly different square wave frequency
            const sq = Math.sin(x * Math.PI * 8 + t * 4.0) >= 0 ? 0.65 : -0.65;
            return sq + noise(t * 7 + x * 2, 0.05);
        }
        case 'J1': {
            // USB — data line: mid-frequency differential signal
            return Math.sin(x * Math.PI * 7 + t * 3.5) * 0.6 * Math.sign(Math.sin(x * 4 + t)) + noise(t, 0.04);
        }
        case 'VR1': {
            // Voltage regulator: smooth ramp + ripple
            return 0.5 + Math.sin(x * Math.PI * 2 + t * 0.8) * 0.2 + noise(t * 60 + x * 3, 0.06);
        }
        case 'LCD1': {
            // SIGNAL RUNNER — the scope traces the pulse's live heartbeat:
            // a running sine that speeds with the world, a sharp spike on a
            // jump, a bright burst on a dash, a flatline when the run ends,
            // and a calm low line while paused.
            const l = lcdScope || { over: false, paused: false, jumping: false, dashing: false, shielded: false, speed01: 0 };
            if (l.over) return noise(t + x * 5, 0.03) * 0.12;
            if (l.paused) return Math.sin(x * Math.PI * 3 + t * 0.8) * 0.14 + noise(t * 2 + x, 0.02);
            let base = Math.sin(x * Math.PI * 6 + t * (5 + l.speed01 * 3)) * (0.32 + l.speed01 * 0.28);
            if (l.jumping) {
                base += Math.sin(x * Math.PI * 16 - t * 12) * 0.45 * Math.max(0, Math.sin(x * Math.PI));
            }
            if (l.dashing) {
                base += Math.max(0, Math.sin(x * Math.PI * 2 - t * 18)) * 0.75;
            }
            if (l.shielded) base = base * 0.75 + 0.15 * Math.sin(x * Math.PI * 8 + t * 3);
            return base + noise(t * 6 + x * 4, 0.03);
        }
        case 'C1': case 'C2': case 'C3': case 'C4': {
            // Decoupling cap: small RC discharge/charge cycles
            const rc = (x + t * 0.3) % 1;
            return (1 - Math.exp(-rc * 5)) * 0.6 - 0.3 + noise(t * 4 + x, 0.05);
        }
        // ── Expansion modules — each subsystem has its OWN waveform, the
        // probe sees the module's actual signal. (Same phosphor green — the
        // shape is the identity.)
        case 'FR1': {
            // Ranking core — the rank ladder climbing: stepped staircase
            return Math.floor(x * 8) / 8 * 0.8 - 0.3 + noise(t * 5 + x * 2, 0.05);
        }
        case 'CP1': {
            // Sensor grid — radar ping sweeping across the sweep line
            const ping = (x * 2 + t * 0.9) % 1;
            return Math.sin(ping * Math.PI) * 0.75 + noise(t * 30 + x * 6, 0.05);
        }
        case 'DL1': {
            // Voice processing — dense audio waveform (speech band)
            return Math.sin(x * 26 + t * 11) * 0.4 + Math.sin(x * 41 + t * 17) * 0.3 + noise(t * 22, 0.06);
        }
        case 'EM1': {
            // Eco analytics — slow leaf-like breath
            return Math.sin(x * 5 + t * 1.4) * 0.5 + Math.sin(x * 9 - t * 2) * 0.2 + noise(t * 2 + x, 0.05);
        }
        case 'PX1': {
            // Media streaming — flowing packet square train
            const flow = Math.sin(x * 18 - t * 9) >= 0 ? 0.62 : -0.62;
            return flow * Math.min(1, Math.max(0, Math.sin(x * 3.2 - t * 1.6) * 2)) + noise(t * 9, 0.04);
        }
        case 'SP1': {
            // Navigation controller — discrete occupancy levels (parking LEDs)
            return Math.round(Math.sin(x * 6 + t * 2) * 2) / 2 * 0.5 + noise(t * 4, 0.04);
        }
        case 'BT1': {
            // GPS receiver — moving signal packets (spike train)
            const pkt = (x * 6 + t * 2.4) % 1;
            return pkt < 0.14 ? Math.sin((pkt / 0.14) * Math.PI) * 0.7 : noise(t * 40 + x * 8, 0.04);
        }
        case 'AQD1': {
            // Water monitoring — slow current with surface ripple
            return Math.sin(x * 4 + t * 1.1) * 0.55 + Math.sin(x * 22 + t * 3.3) * 0.12 + noise(t + x * 4, 0.04);
        }
        case 'ML1': {
            // Training regimen — progress steps (practice reps)
            const step = Math.floor((x * 10 + t * 1.8) % 10);
            return step % 3 === 0 ? 0.7 : step % 3 === 1 ? 0.35 : 0.0 + noise(t * 6, 0.05);
        }
        default: {
            // Generic slow ECG-style sine
            return Math.sin(x * Math.PI * 4 + t * 2.0) * 0.6 + noise(t + x * 3, 0.06);
        }
    }
}

/** Initialize the oscilloscope canvas. Call once after DOM ready. */
export function initOscilloscope() {
    oscCanvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('hud-osc'));
    if (!oscCanvas) return;
    ctx = oscCanvas.getContext('2d');
    // Set actual pixel dimensions (CSS handles display size)
    oscCanvas.width = 120;
    oscCanvas.height = 40;
}

/**
 * Render one frame of the oscilloscope waveform.
 * Called per-tick from main.js. No-ops if osc canvas is missing or
 * no component is currently hovered (idle state).
 * @param {number} elapsed  Scene elapsed time (seconds)
 * @param {string | undefined} hoverRef  Current hover ref from body.dataset.hoverRef
 */
export function updateOscilloscope(elapsed, hoverRef) {
    if (!oscCanvas || !ctx) return;

    const W = oscCanvas.width;
    const H = oscCanvas.height;
    const midY = H / 2;
    const ampY = (H / 2) * 0.82; // max amplitude in pixels

    // Background fill
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, W, H);

    // Grid lines (faint graticule)
    ctx.strokeStyle = COLOR_DIM;
    ctx.lineWidth = 0.5;
    // Horizontal grid lines
    for (let i = 0.25; i < 1; i += 0.25) {
        ctx.beginPath();
        ctx.moveTo(0, i * H);
        ctx.lineTo(W, i * H);
        ctx.stroke();
    }
    // Vertical grid lines
    for (let i = 0.25; i < 1; i += 0.25) {
        ctx.beginPath();
        ctx.moveTo(i * W, 0);
        ctx.lineTo(i * W, H);
        ctx.stroke();
    }

    // While the LCD game is focused the scope locks onto LCD1 (the runner's
    // pulse) and labels the chip accordingly; otherwise it follows the hover.
    lcdScope = getRunnerScope();
    const ref = lcdScope.active ? 'LCD1' : (hoverRef || '');
    if (lcdScope.active) {
        const refEl = document.getElementById('hud-scope-ref');
        const valEl = document.getElementById('hud-scope-val');
        if (refEl) refEl.textContent = 'SCOPE';
        if (valEl) valEl.textContent = 'SIGNAL RUNNER';
        document.body.classList.add('hud-scope-live');
    } else if (lastScopeActive) {
        const refEl = document.getElementById('hud-scope-ref');
        const valEl = document.getElementById('hud-scope-val');
        if (refEl) refEl.textContent = 'SCOPE';
        if (valEl) valEl.textContent = 'AWAIT PROBE';
        document.body.classList.remove('hud-scope-live');
    }
    lastScopeActive = lcdScope.active;

    // Draw the trace
    ctx.beginPath();
    ctx.strokeStyle = COLOR_TRACE;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = COLOR_GLOW;
    ctx.shadowBlur = 4;

    const steps = W;
    for (let px = 0; px <= steps; px++) {
        const x = px / steps;  // 0..1
        const y = waveform(ref, elapsed, x);
        const canvasY = midY - y * ampY;
        if (px === 0) {
            ctx.moveTo(px, canvasY);
        } else {
            ctx.lineTo(px, canvasY);
        }
    }
    ctx.stroke();

    // Phosphor glow: second pass with lower alpha + bigger blur for halo
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,255,136,0.12)';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 10;
    for (let px = 0; px <= steps; px++) {
        const x = px / steps;
        const y = waveform(ref, elapsed, x);
        const canvasY = midY - y * ampY;
        if (px === 0) {
            ctx.moveTo(px, canvasY);
        } else {
            ctx.lineTo(px, canvasY);
        }
    }
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Trigger marker: left edge tick
    ctx.strokeStyle = 'rgba(0,255,136,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 5);
    ctx.stroke();

    // CRT scanlines — drawn IN the canvas: pseudo-elements (::before) can't
    // render on a replaced element like <canvas>, so the overlay that the
    // CSS intended lives here as every-other-pixel darkening instead.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    for (let y = 0; y < H; y += 2) {
        ctx.fillRect(0, y, W, 1);
    }
}
