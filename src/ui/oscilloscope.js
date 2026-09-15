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
import { getClockFrequency } from '../three/potentiometer.js';

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
            // CPU clock: high-speed dual-phase interleaved square wave with clock jitter
            const f = 12.0;
            const sq = Math.sin(x * Math.PI * f + t * 8.0) >= 0 ? 0.8 : -0.8;
            const harmonic = Math.sin(x * Math.PI * 24 + t * 16.0) * 0.15;
            return sq + harmonic + noise(t * 12 + x, 0.04);
        }
        case 'U1_LID': {
            // IHS Ground shield — near flatline with high-frequency electromagnetic interference (EMI)
            return Math.sin(x * Math.PI * 28 + t * 14.0) * 0.12 + noise(t * 22 + x * 7, 0.05);
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
        case 'C1': {
            // AI & Computer Vision — Neural spike burst & synaptic action potentials
            const phase = (x * 4 + t * 3.2) % 1;
            const spike = phase < 0.15 ? Math.sin((phase / 0.15) * Math.PI) * 0.85 - 0.25 * Math.sin((phase / 0.15) * Math.PI * 2) : -0.15 * Math.exp(-(phase - 0.15) * 6);
            return spike + noise(t * 15 + x * 4, 0.04);
        }
        case 'C2': {
            // Backend & Cloud Architecture — Asynchronous packet trains & multi-thread clock pulses
            const clk1 = Math.sin(x * 16 + t * 7) > 0 ? 0.45 : -0.45;
            const clk2 = Math.sin(x * 32 - t * 11) > 0.2 ? 0.3 : -0.3;
            const envelope = Math.sin(x * 3.5 + t * 1.5) * 0.5 + 0.5;
            return (clk1 * 0.6 + clk2 * 0.4) * envelope + noise(t * 12, 0.03);
        }
        case 'C3': {
            // WebGL 3D & Graphics Core — Harmonic sine superposition & geometric vertex waves
            const harm1 = Math.sin(x * Math.PI * 6 + t * 4.2) * 0.45;
            const harm2 = Math.sin(x * Math.PI * 12 - t * 2.8) * 0.25;
            const harm3 = Math.sin(x * Math.PI * 18 + t * 6.0) * 0.15;
            return harm1 + harm2 + harm3 + noise(t * 8 + x * 2, 0.03);
        }
        case 'C4': {
            // Embedded & Edge Hardware — Stepped PWM duty cycle with inductive ringing transients
            const duty = 0.3 + 0.35 * (Math.sin(t * 1.5) * 0.5 + 0.5);
            const cycle = (x * 5 + t * 2.0) % 1;
            const square = cycle < duty ? 0.6 : -0.6;
            const ringing = Math.exp(-(cycle % 0.5) * 12) * Math.sin(cycle * 48) * 0.25;
            return square + ringing + noise(t * 20, 0.03);
        }
        case 'RF1': {
            // Power Substation RF1 — Dual-phase interleaved resonant power ripple with inductive flyback
            const saw1 = ((x * 8 + t * 5) % 1) * 0.7 - 0.35;
            const saw2 = ((x * 8 + t * 5 + 0.5) % 1) * 0.7 - 0.35;
            const flyback = Math.sin(x * 32 + t * 20) * 0.15;
            return (saw1 + saw2) * 0.5 + flyback + noise(t * 25, 0.04);
        }
        case 'U3': {
            // SPI Flash ROM — High-speed burst synchronous serial data stream & clock packets
            const sck = Math.sin(x * 64 + t * 24) > 0 ? 0.35 : -0.35;
            const dataBit = Math.sin(x * 16 + t * 6) > 0.1 ? 0.45 : -0.45;
            const burstGate = Math.sin(x * 4 + t * 2) > -0.2 ? 1 : 0.1;
            return (sck * 0.4 + dataBit * 0.6) * burstGate + noise(t * 18, 0.03);
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

const COLOR_CH2    = '#f59e0b';
const COLOR_CH2_GLOW = 'rgba(245, 158, 11, 0.35)';

// Logic analyzer packet stream state
let lastLogicUpdate = 0;
let logicPacketIndex = 0;

/** @type {Record<string, string[]>} */
const LOGIC_PACKETS = {
    'U1': ['[0x02 U1-FETCH 0x8F 0x00 OK]', '[0x04 ALU-EXEC CARRY=0 ACK]', '[0x06 DMA-REQ CH1 GRANTED]'],
    'U1_LID': ['[IHS-SHIELD: EMI GROUND 0.0V]', '[THERMAL-JUNCTION: 41.2C]', '[HEAT-FLUX: NOMINAL]'],
    'U2': ['[0x10 VRAM-BURST 0xFF CRC-OK]', '[0x12 SHADER-DISPATCH 64T]', '[0x14 TEXTURE-CACHE HIT]'],
    'Y1': ['[PLL-LOCK: 27.000MHz ±2ppm]', '[CLK-JITTER: 1.2ps RMS]', '[REF-CLK-SYNC: LOCKED]'],
    'ANT1': ['[RF: 2.4GHz RSSI -42dBm ACK]', '[PACKET: 32-BYTE AIR-FRAME]', '[CRC16: 0x8F21 VERIFIED]'],
    'TP1': ['[RAIL: +5.02V DC RMS 7.4mV]', '[VOLT-MON: REGULATED OK]', '[RIPPLE: 0.15% NOMINAL]'],
    'TP2': ['[GND: 0.00V IMPEDANCE 0.02Ω]', '[CONTINUITY: PIEZO TONE]', '[EARTH-RETURN: STABLE]'],
    'J1': ['[USB-DP/DM 480Mbps SOF-OK]', '[ENDPOINT: EP1-IN ACK]', '[PACKET-TOKEN: DATA0 OK]'],
    'LCD1': ['[LCD: FRAME-SYNC 60Hz RUNNER]', '[V-BLANK: 16.6ms STABLE]', '[PIXEL-CLOCK: 12.5MHz]'],
    'CP1': ['[I2C: ADDR 0x3C DATA 0x9A ACK]', '[RTSP: H.264 NAL-UNIT SYNC]', '[AI-ACCEL: BATCH=1 OK]'],
    'DL1': ['[I2S: 48kHz 24-BIT PCM OK]', '[VAD: VOICE-ACTIVE 88%]', '[DMA-BUFFER: CIRCULAR 512B]'],
    'SP1': ['[CAN: ID 0x140 DATA 0x04 ACK]', '[BARRIER-SERVO: PWM 1500us]', '[SLOT-ALLOC: BAY4 RED]'],
    'BT1': ['[NMEA: $GPGGA 1304.22 N OK]', '[UART: 115200 8N1 RX-PKT]', '[GPS-FIX: 3D DGPS 8-SATS]'],
    'AQD1': ['[ADC: CH0 3.28V TEMP 24.1C]', '[MODBUS: REG 4001=0x0182]', '[SOLAR-MPPT: 18.2V 2.1A]'],
    'PX1': ['[PWM: CH1 1500us CH2 1800us]', '[TELEMETRY: BATT 98% OK]', '[CARDIAC: 72-BPM PULSE]'],
    'EM1': ['[NPU: TENSOR 128x128 INFER]', '[CYCLE-COUNT: 14.2k FLOPS]', '[MODEL: INT8 QUANT-OK]'],
    'ML1': ['[SIMD: AVX2 256-BIT STREAM]', '[CACHE-L1: 32KB HIT 99%]', '[VECTOR-MATH: FMA-LOCKED]']
};

/**
 * Waveform for Channel B reference clock carrier.
 * @param {number} t Time
 * @param {number} x Normalized X [0,1]
 * @param {number} freqMhz Master clock frequency
 */
function ch2ClockWaveform(t, x, freqMhz) {
    const f = (freqMhz || 27.0) / 5.0;
    const clk = Math.sin(x * Math.PI * f + t * 12.0);
    return (clk >= 0 ? 0.4 : -0.4) + noise(t * 8 + x * 15, 0.04);
}

/**
 * Update the logic analyzer packet sniffer readout.
 * @param {string} ref
 * @param {number} elapsed
 */
function updateLogicSniffer(ref, elapsed) {
    const logicEl = document.getElementById('hud-scope-logic-data');
    if (!logicEl) return;
    if (elapsed - lastLogicUpdate > 0.35) {
        lastLogicUpdate = elapsed;
        logicPacketIndex++;
    }
    const list = LOGIC_PACKETS[ref] || ['[BUS: 0xAA 0x55 READY CRC-OK]', '[SERIAL: 115200 8N1 ACK]', '[CRC-CHECK: PASS 0x00]'];
    const pkt = list[logicPacketIndex % list.length];
    logicEl.textContent = pkt;
}

/** Initialize the oscilloscope canvas. Call once after DOM ready. */
export function initOscilloscope() {
    oscCanvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('hud-osc'));
    if (!oscCanvas) return;
    ctx = oscCanvas.getContext('2d');
    // Set actual pixel dimensions (CSS handles display size)
    oscCanvas.width = 140;
    oscCanvas.height = 42;
}

/**
 * Render one frame of the dual-channel oscilloscope waveform.
 * Called per-tick from main.js.
 * @param {number} elapsed  Scene elapsed time (seconds)
 * @param {string | undefined} hoverRef  Current hover ref from body.dataset.hoverRef
 */
export function updateOscilloscope(elapsed, hoverRef) {
    if (!oscCanvas || !ctx) return;

    const W = oscCanvas.width;
    const H = oscCanvas.height;
    const midY = H / 2;
    const ampY = (H / 2) * 0.78; // max amplitude in pixels

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
    for (let i = 0.2; i < 1; i += 0.2) {
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
        if (refEl) refEl.textContent = 'LCD1';
        if (valEl) valEl.textContent = 'SIGNAL RUNNER';
        document.body.classList.add('hud-scope-live');
    } else if (lastScopeActive) {
        const refEl = document.getElementById('hud-scope-ref');
        const valEl = document.getElementById('hud-scope-val');
        if (refEl) refEl.textContent = 'PROBE';
        if (valEl) valEl.textContent = 'AWAIT PROBE';
        document.body.classList.remove('hud-scope-live');
    }
    lastScopeActive = lcdScope.active;

    const freqMhz = getClockFrequency();

    // Update Channel 2 clock readout
    const ch2ValEl = document.getElementById('hud-scope-ch2-val');
    if (ch2ValEl) ch2ValEl.textContent = `CLK ${freqMhz.toFixed(0)}M`;

    // Update Logic Sniffer Stream
    updateLogicSniffer(ref, elapsed);

    // ─── CHANNEL 2: Bus Reference Clock (Amber) ────────────────
    ctx.beginPath();
    ctx.strokeStyle = COLOR_CH2;
    ctx.lineWidth = 1.0;
    ctx.shadowColor = COLOR_CH2_GLOW;
    ctx.shadowBlur = 4;

    const steps = W;
    for (let px = 0; px <= steps; px++) {
        const x = px / steps;
        const y2 = ch2ClockWaveform(elapsed, x, freqMhz);
        // Slightly offset down for visual channel separation
        const canvasY = (midY + 4) - y2 * (ampY * 0.65);
        if (px === 0) {
            ctx.moveTo(px, canvasY);
        } else {
            ctx.lineTo(px, canvasY);
        }
    }
    ctx.stroke();

    // ─── CHANNEL 1: Probed Component Signal (Phosphor Green) ───
    ctx.beginPath();
    ctx.strokeStyle = COLOR_TRACE;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = COLOR_GLOW;
    ctx.shadowBlur = 5;

    for (let px = 0; px <= steps; px++) {
        const x = px / steps;  // 0..1
        const y = waveform(ref, elapsed, x);
        // Slightly offset up for channel separation
        const canvasY = (midY - 4) - y * (ampY * 0.8);
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
    ctx.lineWidth = 3.5;
    ctx.shadowBlur = 9;
    for (let px = 0; px <= steps; px++) {
        const x = px / steps;
        const y = waveform(ref, elapsed, x);
        const canvasY = (midY - 4) - y * (ampY * 0.8);
        if (px === 0) {
            ctx.moveTo(px, canvasY);
        } else {
            ctx.lineTo(px, canvasY);
        }
    }
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Trigger markers: CH1 top-left, CH2 bottom-left
    ctx.fillStyle = COLOR_TRACE;
    ctx.fillRect(0, 0, 3, 4);
    ctx.fillStyle = COLOR_CH2;
    ctx.fillRect(0, H - 4, 3, 4);

    // CRT scanlines — drawn IN the canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    for (let y = 0; y < H; y += 2) {
        ctx.fillRect(0, y, W, 1);
    }
}
