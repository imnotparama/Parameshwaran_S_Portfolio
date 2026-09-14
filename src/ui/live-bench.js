// @ts-check
// ============================================================
// Live Hardware Simulation Lab & Subsystem Test Bench Controller
// Drives the interactive test vectors, clock tuning, and telemetry
// simulation inside #panel-project-detail.
// ============================================================
import { clickBlip } from '../utils/sound.js';
import { emitUartLog, emitSystemEvent } from './telemetry.js';

/**
 * @typedef {{
 *   ref: string,
 *   title: string,
 *   latencyBase: number,
 *   throughputBase: number,
 *   throughputUnit: string,
 *   tempBase: number,
 *   integrityBase: string,
 *   busClock: string
 * }} SubsystemBenchProfile
 */

/** @type {Record<string, SubsystemBenchProfile>} */
const BENCH_PROFILES = {
    'CP1': {
        ref: 'CP1',
        title: 'CrowdPulse VPU',
        latencyBase: 14.2,
        throughputBase: 60,
        throughputUnit: 'fps',
        tempBase: 41.5,
        integrityBase: '99.8% OK',
        busClock: '27.0 MHz SYNCHRONOUS'
    },
    'DL1': {
        ref: 'DL1',
        title: 'Dialora Voice DSP',
        latencyBase: 18.5,
        throughputBase: 100,
        throughputUnit: '% offline',
        tempBase: 38.2,
        integrityBase: '100% OK',
        busClock: '16.0 MHz DMA LOOPBACK'
    },
    'SP1': {
        ref: 'SP1',
        title: 'Smart Parking Controller',
        latencyBase: 2.1,
        throughputBase: 480,
        throughputUnit: 'req/s',
        tempBase: 36.4,
        integrityBase: '100% OK',
        busClock: '48.0 MHz SPI BUS'
    },
    'BT1': {
        ref: 'BT1',
        title: 'BusIT GPS Engine',
        latencyBase: 8.4,
        throughputBase: 128,
        throughputUnit: 'pkt/s',
        tempBase: 37.1,
        integrityBase: '100% OK',
        busClock: '115.2k BAUD UART'
    },
    'AQD1': {
        ref: 'AQD1',
        title: 'Blue Ground IoT',
        latencyBase: 12.0,
        throughputBase: 32,
        throughputUnit: 'pings/s',
        tempBase: 35.8,
        integrityBase: '100% OK',
        busClock: '12.0 MHz ADC BUS'
    },
    'PX1': {
        ref: 'PX1',
        title: 'PawPal Pet Companion',
        latencyBase: 4.5,
        throughputBase: 250,
        throughputUnit: 'pkt/s',
        tempBase: 39.1,
        integrityBase: '99.9% OK',
        busClock: '24.0 MHz PWM CORE'
    },
    'EM1': {
        ref: 'EM1',
        title: 'EcoMentor AI Engine',
        latencyBase: 16.0,
        throughputBase: 50,
        throughputUnit: 'inf/s',
        tempBase: 37.5,
        integrityBase: '100% OK',
        busClock: '33.3 MHz NPU BUS'
    },
    'ML1': {
        ref: 'ML1',
        title: 'ML & Systems Reps',
        latencyBase: 1.8,
        throughputBase: 1024,
        throughputUnit: 'FLOPS',
        tempBase: 43.0,
        integrityBase: '100% OK',
        busClock: '54.0 MHz SIMD BUS'
    }
};

let activeRef = 'CP1';
let currentMult = 1;
let isBenchmarking = false;

/**
 * Initialize DOM listeners for the Live Simulation Bench.
 * Safe to call once during boot.
 */
export function initLiveBench() {
    const runBtn = document.getElementById('pdetail-bench-run');
    if (runBtn) {
        runBtn.addEventListener('click', () => {
            runSubsystemBenchmark();
        });
    }

    const clkButtons = document.querySelectorAll('.ds-bench-clk-btn');
    clkButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = /** @type {HTMLElement} */ (e.currentTarget);
            const mult = parseInt(target.dataset.mult || '1', 10);
            setBenchClockMultiplier(mult);
        });
    });
}

/**
 * Sync the Live Simulation Bench to a newly focused project module.
 * @param {string} ref e.g. 'CP1', 'DL1'
 */
export function syncLiveBenchToProject(ref) {
    activeRef = ref.toUpperCase();
    currentMult = 1;

    // Reset clock buttons
    document.querySelectorAll('.ds-bench-clk-btn').forEach(btn => {
        const b = /** @type {HTMLElement} */ (btn);
        if (b.dataset.mult === '1') {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    updateBenchMeters(false);

    const term1 = document.getElementById('bench-term-line1');
    const term2 = document.getElementById('bench-term-line2');
    const profile = BENCH_PROFILES[activeRef] || BENCH_PROFILES['CP1'];
    if (term1) term1.textContent = `> STANDBY: MODULE [${profile.ref}] READY FOR VECTOR INJECTION`;
    if (term2) term2.textContent = `> BUS CLOCK: ${profile.busClock}`;
}

/**
 * Set the simulation clock multiplier (1x, 2x, 4x).
 * @param {number} mult
 */
export function setBenchClockMultiplier(mult) {
    currentMult = mult;
    clickBlip();

    document.querySelectorAll('.ds-bench-clk-btn').forEach(btn => {
        const b = /** @type {HTMLElement} */ (btn);
        if (parseInt(b.dataset.mult || '1', 10) === mult) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    const profile = BENCH_PROFILES[activeRef] || BENCH_PROFILES['CP1'];
    emitUartLog('CLK', `Bench Multiplier Set to ${mult}X for Subsystem ${activeRef}`);
    emitSystemEvent('BENCH CLOCK MULTIPLIER', `Clock scaled to ${mult}X for ${profile.title}`);

    updateBenchMeters(false);

    const term1 = document.getElementById('bench-term-line1');
    if (term1) term1.textContent = `> CLOCK MULTIPLIER ADJUSTED: ${mult}X ACTIVE`;
}

/**
 * Update the meter readouts with realistic dynamic figures.
 * @param {boolean} duringLoad Whether a test run is in flight
 */
function updateBenchMeters(duringLoad = false) {
    const profile = BENCH_PROFILES[activeRef] || BENCH_PROFILES['CP1'];

    const latencyEl = document.getElementById('bench-val-latency');
    const throughputEl = document.getElementById('bench-val-throughput');
    const tempEl = document.getElementById('bench-val-temp');
    const integrityEl = document.getElementById('bench-val-integrity');

    const jitter = (Math.random() * 0.4 - 0.2);
    const effLatency = Math.max(0.5, (profile.latencyBase / currentMult) + (duringLoad ? 1.5 : 0) + jitter).toFixed(1);
    const effThroughput = Math.round(profile.throughputBase * currentMult * (duringLoad ? 1.25 : 1.0));
    const effTemp = (profile.tempBase + (currentMult - 1) * 3.2 + (duringLoad ? 2.8 : 0) + jitter).toFixed(1);

    if (latencyEl) latencyEl.textContent = `${effLatency} ms`;
    if (throughputEl) throughputEl.textContent = `${effThroughput} ${profile.throughputUnit}`;
    if (tempEl) tempEl.textContent = `${effTemp} °C`;
    if (integrityEl) integrityEl.textContent = profile.integrityBase;
}

/**
 * Trigger an interactive benchmark test suite run.
 */
export function runSubsystemBenchmark() {
    if (isBenchmarking) return;
    isBenchmarking = true;
    clickBlip();

    const profile = BENCH_PROFILES[activeRef] || BENCH_PROFILES['CP1'];
    emitUartLog('TEST', `Injecting 64-byte pseudo-random test vectors into ${profile.ref}...`);
    emitSystemEvent('SUBSYSTEM BENCHMARK', `Executing hardware test vectors for ${profile.title}`);

    const runBtn = document.getElementById('pdetail-bench-run');
    if (runBtn) {
        runBtn.textContent = 'EXECUTING VECTORS...';
        runBtn.style.pointerEvents = 'none';
        runBtn.style.opacity = '0.7';
    }

    const term1 = document.getElementById('bench-term-line1');
    const term2 = document.getElementById('bench-term-line2');
    if (term1) term1.textContent = `> INJECTING 64-BYTE VECTORS TO ${profile.ref}... [PROGRESS 45%]`;
    if (term2) term2.textContent = `> BUS TIMING MARGINS: NOMINAL · CHECKSUM VERIFYING...`;

    updateBenchMeters(true);

    setTimeout(() => {
        if (term1) term1.textContent = `> TEST VECTOR STREAM COMPLETE: 1024 FRAMES ACKNOWLEDGED`;
        if (term2) term2.textContent = `> STATUS 0x00 PASS · INTEGRITY: ${profile.integrityBase} · CRC MATCHED`;

        updateBenchMeters(false);

        if (runBtn) {
            runBtn.textContent = '⚡ RUN SUBSYSTEM BENCHMARK';
            runBtn.style.pointerEvents = 'auto';
            runBtn.style.opacity = '1.0';
        }
        isBenchmarking = false;
        clickBlip();
        emitUartLog('PASS', `${profile.ref} Benchmark Complete: 0 ERRORS DETECTED`);
    }, 650);
}
