// @ts-check
// ============================================================
// PARAMA-DEV-BOARD Hardware Operating System: Telemetry, State Machine & UART
//
// Manages:
//   1. Formal Hardware State Machine (OFF -> BOOTING -> IDLE -> INSPECTING -> ACTIVE -> OVERCLOCK -> SLEEP -> SHUTDOWN)
//   2. Live UART Serial Console Ribbon with microsecond timestamps & aligned subsystem tags
//   3. Persistent EEPROM Session Memory in localStorage
//   4. Real-time CPU Die Temperature & Voltage Rail Telemetry
//   5. System Diagnostic Event Toasts
// ============================================================

import { portfolioData } from '../data/portfolio.js';
import { getBestScore } from '../three/lcd.js';
import { motionPrefs } from '../utils/motion-prefs.js';
import gsap from 'gsap';

/** @typedef {'OFF' | 'BOOTING' | 'IDLE' | 'INSPECTING' | 'ACTIVE' | 'SLEEP' | 'SHUTDOWN'} BoardState */

/** @type {BoardState} */
let currentBoardState = 'BOOTING';

/** @type {HTMLElement | null} */
let uartStreamEl = null;
/** @type {HTMLElement | null} */
let sysinfoEl = null;
/** @type {HTMLElement | null} */
let debugEl = null;
/** @type {HTMLElement | null} */
let devNotesEl = null;
/** @type {HTMLElement | null} */
let toastContainerEl = null;

let frameCount = 0;
let devNotesTimer = 0;
let voltageFaultTimer = 0;
let isVoltageFault = false;

// ─── Persistent EEPROM Memory ──────────────────────────────
const EEPROM_KEY = 'prm-eeprom-verified-chips';
/** @type {Set<string>} */
let verifiedChips = new Set();

export function loadEepromMemory() {
    try {
        const raw = localStorage.getItem(EEPROM_KEY);
        if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
                verifiedChips = new Set(list);
            }
        }
    } catch {
        // Safe fallback for restricted storage environments
    }
}

/** @param {string} chipRef */
export function markChipVerified(chipRef) {
    if (!chipRef) return;
    const isNew = !verifiedChips.has(chipRef);
    verifiedChips.add(chipRef);
    try {
        localStorage.setItem(EEPROM_KEY, JSON.stringify([...verifiedChips]));
    } catch {}

    if (isNew) {
        emitSystemEvent(`✓ ${chipRef} Verified`, `Module signature recorded to EEPROM`);
        emitUartLog('MEM', `Module ${chipRef} signature committed to EEPROM`);
    }

    // Apply visual verified pilot light on DOM
    const card = document.querySelector(`[data-ref="${chipRef}"]`);
    if (card) card.classList.add('chip-verified');
}

/** @param {string} chipRef */
export function isChipVerified(chipRef) {
    return verifiedChips.has(chipRef);
}

// ─── Hardware State Machine ────────────────────────────────

export function getBoardState() {
    return currentBoardState;
}

/** @param {BoardState} nextState */
export function setBoardState(nextState) {
    if (currentBoardState === nextState) return;
    const prev = currentBoardState;
    currentBoardState = nextState;
    document.body.dataset.boardState = nextState;
    emitUartLog('SYS', `State change: ${prev} -> ${nextState}`);
}

// ─── Live UART Serial Console Streamer ─────────────────────

/** Format time as HH:MM:SS.mmm */
function formatTimestamp() {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
}

/**
 * Emit an authentic hardware log line to the live UART console.
 * @param {string} subsystem e.g. 'BOOT', 'CLK', 'MEM', 'BUS', 'SYS', 'INSPECT', 'PWR'
 * @param {string} message
 */
export function emitUartLog(subsystem, message) {
    const padSub = (subsystem || 'SYS').padEnd(7, ' ');
    const lineText = `[${formatTimestamp()}] ${padSub} ${message}`;

    if (!uartStreamEl) {
        uartStreamEl = document.getElementById('uart-log-text');
    }

    if (uartStreamEl) {
        uartStreamEl.textContent = lineText;
        // Subtle phosphor flicker on new log
        uartStreamEl.classList.remove('uart-flicker');
        void uartStreamEl.offsetWidth; // trigger reflow
        uartStreamEl.classList.add('uart-flicker');
    }
}

/** Trigger temporary voltage fault reaction (e.g. game collision) */
export function triggerVoltageFault() {
    isVoltageFault = true;
    emitUartLog('PWR', 'ALERT: 3.30V Bus Voltage Dip Detected!');
    clearTimeout(voltageFaultTimer);
    voltageFaultTimer = setTimeout(() => {
        isVoltageFault = false;
        emitUartLog('PWR', '3.30V Rail Voltage Nominal · Regulators Stable');
    }, 1400);
}

// ─── System Diagnostic Event Toasts ────────────────────────

/**
 * Emit an authentic top-right hardware event toast.
 * @param {string} title
 * @param {string} detail
 */
export function emitSystemEvent(title, detail = '') {
    if (!toastContainerEl) {
        toastContainerEl = document.getElementById('system-events-container');
    }
    if (!toastContainerEl) return;

    const toast = document.createElement('div');
    toast.className = 'sys-event-toast';
    toast.innerHTML = `
        <div class="toast-head">
            <span class="toast-tag">[SYSTEM EVENT]</span>
            <span class="toast-title">${title}</span>
        </div>
        ${detail ? `<div class="toast-body">${detail}</div>` : ''}
    `;

    toastContainerEl.appendChild(toast);

    if (!motionPrefs.reduced) {
        gsap.fromTo(toast, 
            { opacity: 0, x: 40, scale: 0.95 },
            { opacity: 1, x: 0, scale: 1, duration: 0.35, ease: 'back.out(2)' }
        );
        gsap.to(toast, {
            opacity: 0,
            x: 20,
            duration: 0.4,
            delay: 4.0,
            ease: 'power2.in',
            onComplete: () => toast.remove()
        });
    } else {
        setTimeout(() => toast.remove(), 4000);
    }
}

// ─── Initialization & Per-Frame Telemetry ──────────────────

export function initTelemetry() {
    sysinfoEl = document.getElementById('sys-telemetry');
    debugEl = document.getElementById('debug-overlay');
    uartStreamEl = document.getElementById('uart-log-text');
    toastContainerEl = document.getElementById('system-events-container');

    loadEepromMemory();

    // Initial hardware boot log cascade
    setTimeout(() => emitUartLog('BOOT', 'Initializing PARAMA-DEV-BOARD v2.0'), 100);
    setTimeout(() => emitUartLog('CLK', 'Crystal Oscillator Locked @ 16.00 MHz'), 400);
    setTimeout(() => emitUartLog('MEM', `SRAM Verified · ${portfolioData.projects.length} Expansion Modules Registered`), 800);
    setTimeout(() => emitUartLog('BUS', 'I²C / SPI Peripheral Bus Scan Complete (OK)'), 1200);
    setTimeout(() => {
        if (verifiedChips.size > 0) {
            emitUartLog('MEM', `EEPROM: ${verifiedChips.size} verified module signatures loaded`);
        }
        setBoardState('IDLE');
        emitUartLog('SYS', 'System Ready · 3.30V Rail Stable');
    }, 1600);
}

export function toggleSysinfo() {
    if (!sysinfoEl) return false;
    const on = !sysinfoEl.hidden;
    sysinfoEl.hidden = !on;
    document.body.classList.toggle('sysinfo-on', on);
    return on;
}

export function showDevNotes() {
    if (!devNotesEl) devNotesEl = document.getElementById('dev-notes');
    if (!devNotesEl) return;
    devNotesEl.hidden = false;
    clearTimeout(devNotesTimer);
    devNotesTimer = setTimeout(() => {
        if (devNotesEl) devNotesEl.hidden = true;
    }, 9000);
    emitUartLog('AUTH', 'DEVELOPER OPERATOR NOTES UNSEALED');
}

export function toggleDebug() {
    if (!debugEl) return false;
    const on = !debugEl.hidden;
    debugEl.hidden = !on;
    document.body.classList.toggle('debug-on', on);
    return on;
}

/** @param {number} s */
function fmtUptime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
    return `${p(h)}:${p(m)}:${p(sec)}`;
}

/**
 * Per-frame live hardware telemetry write.
 * @param {number} elapsed
 * @param {number} delta
 */
export function updateTelemetry(elapsed, delta) {
    const up = fmtUptime(elapsed);

    // Live Temperature calculation (Nominal 41.2°C ambient)
    const baseTemp = 41.2;
    const tempWobble = Math.sin(elapsed * 0.05) * 1.2 + Math.sin(elapsed * 0.011) * 0.5;
    const currentTemp = (baseTemp + tempWobble).toFixed(1);

    // Live Voltage Rails calculation
    let v33 = 3.30 + Math.sin(elapsed * 0.13) * 0.012;
    let v33Text = `${v33.toFixed(2)}V STABLE`;
    if (isVoltageFault) {
        v33 = 2.85 + Math.sin(elapsed * 40) * 0.2;
        v33Text = `${v33.toFixed(2)}V FAULT`;
    }

    // Update Top-Right HUD Hardware Monitor if present
    const tempEl = document.getElementById('hud-temp-val');
    if (tempEl) tempEl.textContent = `${currentTemp}°C`;

    const railEl = document.getElementById('hud-rail-val');
    if (railEl) {
        railEl.textContent = v33Text;
        railEl.classList.toggle('rail-fault', isVoltageFault);
    }

    if (sysinfoEl && !sysinfoEl.hidden) {
        const serial = portfolioData.personalInfo.boardSerial || 'PRM-2026-DEV-001';
        const fw = portfolioData.personalInfo.firmwareVersion || 'v2.3.1';
        const rec = getBestScore();
        sysinfoEl.textContent = `${serial} · ${fw}\nRAIL ${v33.toFixed(2)}V · DIE ${currentTemp}°C · UP ${up}`
            + (rec > 0 ? ` · REC ${String(rec).padStart(2, '0')}` : '');
    }

    if (debugEl && !debugEl.hidden) {
        frameCount++;
        const fps = delta > 0 ? 1 / delta : 0;
        debugEl.textContent = `FPS ${fps.toFixed(1)} · FRAME ${frameCount} · T+${up}`;
    }
}
