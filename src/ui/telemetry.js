// @ts-check
// ============================================================
// System Telemetry — hidden engineering readout (easter egg).
//
// Two overlays, both hidden until a curious visitor finds them
// through the BIOS command palette (Ctrl+K → SYSTEM TELEMETRY /
// DEBUG OVERLAY): a live telemetry chip (board serial, rail
// voltage, die temperature, uptime, firmware) and a debug overlay
// (FPS + frame counter). The values drift deterministically from
// the scene clock — elapsed-driven sine wobbles, no Math.random,
// no wall-clock — so the readout is a pure function of time like
// the rest of the board. Updated per-frame ONLY while visible.
// ============================================================

import { portfolioData } from '../data/portfolio.js';

/** @type {HTMLElement | null} */
let sysinfoEl = null;
/** @type {HTMLElement | null} */
let debugEl = null;
/** @type {HTMLElement | null} */
let devNotesEl = null;
let frameCount = 0;
let devNotesTimer = 0;

/** Cache the overlay elements. Call once after DOM ready. */
export function initTelemetry() {
    sysinfoEl = document.getElementById('sys-telemetry');
    debugEl = document.getElementById('debug-overlay');
}

/** Toggle the telemetry chip. @returns {boolean} true when now visible */
export function toggleSysinfo() {
    if (!sysinfoEl) return false;
    // `hidden` is boolean | "until-found" in the DOM lib — coerce to boolean.
    const on = !sysinfoEl.hidden;
    sysinfoEl.hidden = !on;
    document.body.classList.toggle('sysinfo-on', on);
    return on;
}

/** Reveal the operator-notes chip (secret developer notes easter egg) — a
 *  one-shot reward for typing the hidden 'parama' sequence. Shows the chip,
 *  then auto-hides after a beat so it reads as a fleeting signal (a hidden
 *  channel answering), not a permanent panel. */
export function showDevNotes() {
    if (!devNotesEl) devNotesEl = document.getElementById('dev-notes');
    if (!devNotesEl) return;
    devNotesEl.hidden = false;
    clearTimeout(devNotesTimer);
    devNotesTimer = setTimeout(() => {
        if (devNotesEl) devNotesEl.hidden = true;
    }, 9000);
}

/** Toggle the debug overlay. @returns {boolean} true when now visible */
export function toggleDebug() {
    if (!debugEl) return false;
    const on = !debugEl.hidden;
    debugEl.hidden = !on;
    document.body.classList.toggle('debug-on', on);
    return on;
}

/** Format seconds as HH:MM:SS (session uptime). @param {number} s */
function fmtUptime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
    return `${p(h)}:${p(m)}:${p(sec)}`;
}

/** Per-frame telemetry write — only touches the DOM while an overlay is
 *  visible. Deterministic: all wobble derives from the elapsed clock.
 *  @param {number} elapsed @param {number} delta */
export function updateTelemetry(elapsed, delta) {
    if (!sysinfoEl && !debugEl) return;
    const serial = portfolioData.personalInfo.boardSerial || 'PARAMA-2007-0401';
    const fw = portfolioData.personalInfo.firmwareVersion || 'FW 2007.0401';
    const up = fmtUptime(elapsed);
    if (sysinfoEl && !sysinfoEl.hidden) {
        // Rail voltage + die temp wobble slowly around nominal — alive but stable.
        const v = 3.30 + Math.sin(elapsed * 0.13) * 0.015 + Math.sin(elapsed * 0.031) * 0.01;
        const temp = 43.5 + Math.sin(elapsed * 0.05) * 2.2 + Math.sin(elapsed * 0.011) * 1.1;
        sysinfoEl.textContent = `${serial} · ${fw}\nRAIL ${v.toFixed(2)}V · DIE ${temp.toFixed(1)}°C · UP ${up}`;
    }
    if (debugEl && !debugEl.hidden) {
        frameCount++;
        const fps = delta > 0 ? 1 / delta : 0;
        debugEl.textContent = `FPS ${fps.toFixed(1)} · FRAME ${frameCount} · T+${up}`;
    }
}
