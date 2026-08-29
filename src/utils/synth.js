// @ts-check
// ============================================================
// PCB Chiptune Synthesizer & Audio-Reactive Driver
//
// 1. Pentatonic Chiptune Synthesizer:
//    - Plays pitched, snappy chiptune tones when components are interacted with.
//    - Capacitors (C1–C5), Crystals (Y1), and LEDs (D1–D7) act as synthesizer keys.
//    - Pentatonic scale: [C4, D4, E4, G4, A4, C5, D5, E5].
//
// 2. Audio-Reactive Peak Tracker:
//    - Tracks live synthesized note amplitudes (0..1).
//    - Drives the 7-LED array (D1–D7) as an audio VU meter.
//    - Synchronizes live CRT oscilloscope waveform flutter.
//
// Gated on isSoundEnabled() from sound.js.
// ============================================================

import { isSoundEnabled } from './sound.js';

// Pentatonic scale frequencies (Hz)
export const PENTATONIC_SCALE = [
    261.63, // C4
    293.66, // D4
    329.63, // E4
    392.00, // G4
    440.00, // A4
    523.25, // C5
    587.33, // D5
    659.25  // E5
];

// Mapping component designators to musical scale indices
const COMPONENT_NOTE_MAP = {
    'C1': 0,
    'C2': 1,
    'C3': 2,
    'C4': 3,
    'C5': 4,
    'Y1': 5,
    'ANT1': 6,
    'U1': 7,
    'led_diode_1': 0,
    'led_diode_2': 1,
    'led_diode_3': 2,
    'led_diode_4': 3,
    'led_diode_5': 4,
    'led_diode_6': 5,
    'led_diode_7': 6
};

/** @type {AudioContext | null} */
let audioCtx = null;
let currentAudioPeak = 0.0;
let lastNoteTime = 0;

/**
 * Get or initialize shared AudioContext.
 * @returns {AudioContext | null}
 */
function getAudioContext() {
    if (audioCtx) return audioCtx;
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    return audioCtx;
}

/**
 * Play a chiptune synthesizer note with square/triangle wave and lowpass envelope.
 * @param {number} freq Frequency in Hz
 * @param {number} [duration=0.18] Duration in seconds
 * @param {number} [gainPeak=0.08] Peak volume
 */
export function playSynthNote(freq, duration = 0.18, gainPeak = 0.08) {
    if (!isSoundEnabled()) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;

        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        // 8-bit square/triangle blend
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t0);

        // Resonant lowpass filter sweep
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 4, t0);
        filter.frequency.exponentialRampToValueAtTime(freq * 0.8, t0 + duration);
        filter.Q.value = 3.0;

        // Snappy envelope (fast attack, exponential decay)
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t0);
        osc.stop(t0 + duration + 0.05);

        // Update live peak for VU-meter visualizer
        currentAudioPeak = Math.min(1.0, currentAudioPeak + 0.8);
        lastNoteTime = performance.now();
    } catch (e) {
        console.warn('Synth playback failed:', e);
    }
}

/**
 * Play the musical note mapped to a PCB component.
 * @param {string} componentName
 */
export function playComponentTone(componentName) {
    if (!componentName) return;
    // Rate limit per-component tone triggers
    const now = performance.now();
    if (now - lastNoteTime < 50) return;

    /** @type {Record<string, number>} */
    const noteMap = COMPONENT_NOTE_MAP;
    if (noteMap[componentName] !== undefined) {
        const noteIdx = noteMap[componentName];
        const freq = PENTATONIC_SCALE[noteIdx % PENTATONIC_SCALE.length];
        playSynthNote(freq, 0.22, 0.09);
    }
}

/**
 * Get current live audio peak amplitude (0..1) decaying over time.
 * @param {number} delta Frame delta in seconds
 * @returns {number}
 */
export function updateAudioPeak(delta) {
    if (currentAudioPeak > 0) {
        // Fast decay
        currentAudioPeak = Math.max(0, currentAudioPeak - delta * 4.0);
    }
    return currentAudioPeak;
}
