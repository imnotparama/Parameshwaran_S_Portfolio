// @ts-check
// ============================================================
// Per-section ambient signatures — every journey stop is a
// DIFFERENT circuit neighborhood.
//
// The board's ambient layers (D1-D7 LED pulse, copper ripple,
// gold signal pulses, dust motes, gold flecks, the current dot)
// share one global tuning by default. This map gives each section
// its own feel, so scrolling from About to Projects literally
// changes the room:
//
//   sec-hero        power-on presentation — calm, slow breathing
//   sec-about       CPU core (U1) — the heart: bright, mid-tempo
//   sec-projects    prototype zone (U2) — fast pulse, tight fast
//                   ripple, dense active dust (projects in motion)
//   sec-skills      capacitor banks (C1-C4) — stored energy:
//                   slow breathing, long calm waves, sparse dust
//   sec-experience  I/O port (J1) — data flowing out: wide long
//                   waves, lively travel
//   sec-contact     RF transmit (ANT1) — broadcasting: fast travel,
//                   wide waves, LEDs calm, the air clear
//
// ALL values are MULTIPLIERS around 1.0 (the original tuning), so
// the smoke test's invariant bounds hold for every section:
// LED peak stays ≤ 0.7 (ledAmp ≤ 1.0), ripple ≤ base+amp (rippleAmp
// ≤ 1.0), and dust/fleck drift stays inside the box (drift ≤ 1.0).
// ============================================================

/** One section's ambient tuning — every field is a multiplier. */
/** @typedef {{ ledFreq: number, ledAmp: number, rippleSpeed: number, rippleWavelength: number, rippleAmp: number, pulseSpeed: number, dotSpeed: number, dustOpacity: number, dustDrift: number, fleckOpacity: number, fleckDrift: number }} SectionAmbientTuning */
const BASELINE = Object.freeze({
    // D1-D7 status LED pulse: tempo + brightness share the per-LED driver.
    ledFreq: 1.0,
    ledAmp: 1.0,
    // Copper ripple: the power blob flooding every trace from the CPU.
    rippleSpeed: 1.0,
    rippleWavelength: 1.0,
    rippleAmp: 1.0,
    // Ambient signal pulses: one gold dot traveling each main trace route.
    pulseSpeed: 1.0,
    // The active section's current dot (focused signal travel).
    dotSpeed: 1.0,
    // Dust motes: opacity = density (the cloud reads heavier or thinner),
    // drift = how far each mote wanders (never > 1.0 — drift-box bounds).
    dustOpacity: 1.0,
    dustDrift: 1.0,
    // Gold flecks: the sparse suspended-solder debris layer.
    fleckOpacity: 1.0,
    fleckDrift: 1.0
});

/** @type {Record<string, SectionAmbientTuning>} */
export const SECTION_AMBIENT = {
    'sec-hero': {
        ledFreq: 0.7,
        ledAmp: 0.5,
        rippleSpeed: 0.8,
        rippleWavelength: 1.2,
        rippleAmp: 0.8,
        pulseSpeed: 0.85,
        dotSpeed: 0.9,
        dustOpacity: 0.75,
        dustDrift: 0.85,
        fleckOpacity: 0.85,
        fleckDrift: 0.9
    },
    'sec-about': {
        ledFreq: 1.15,
        ledAmp: 0.95,
        rippleSpeed: 1.0,
        rippleWavelength: 1.0,
        rippleAmp: 1.0,
        pulseSpeed: 1.0,
        dotSpeed: 1.0,
        dustOpacity: 1.0,
        dustDrift: 1.0,
        fleckOpacity: 1.0,
        fleckDrift: 1.0
    },
    'sec-projects': {
        ledFreq: 1.35,
        ledAmp: 0.85,
        rippleSpeed: 1.35,
        rippleWavelength: 0.75,
        rippleAmp: 1.0,
        pulseSpeed: 1.4,
        dotSpeed: 1.3,
        dustOpacity: 1.35,
        dustDrift: 0.95,
        fleckOpacity: 1.3,
        fleckDrift: 1.0
    },
    'sec-skills': {
        ledFreq: 0.85,
        ledAmp: 0.7,
        rippleSpeed: 0.65,
        rippleWavelength: 1.35,
        rippleAmp: 0.7,
        pulseSpeed: 0.7,
        dotSpeed: 0.75,
        dustOpacity: 0.8,
        dustDrift: 0.85,
        fleckOpacity: 0.85,
        fleckDrift: 0.9
    },
    'sec-experience': {
        ledFreq: 1.05,
        ledAmp: 0.8,
        rippleSpeed: 1.2,
        rippleWavelength: 1.55,
        rippleAmp: 1.0,
        pulseSpeed: 1.15,
        dotSpeed: 1.15,
        dustOpacity: 1.1,
        dustDrift: 1.0,
        fleckOpacity: 1.05,
        fleckDrift: 1.0
    },
    'sec-contact': {
        ledFreq: 0.55,
        ledAmp: 0.45,
        rippleSpeed: 1.45,
        rippleWavelength: 1.85,
        rippleAmp: 0.9,
        pulseSpeed: 1.3,
        dotSpeed: 1.35,
        dustOpacity: 0.65,
        dustDrift: 0.8,
        fleckOpacity: 0.7,
        fleckDrift: 0.85
    }
};

/** Resolve a section id to its ambient tuning. Unknown ids (boot, lite mode,
 *  or a section without an entry) fall back to the baseline 1.0 tuning — the
 *  original behavior, so an unconfigured stop never changes anything.
 *  @param {string | undefined} sectionId
 *  @returns {SectionAmbientTuning} */
export function getSectionAmbient(sectionId) {
    return SECTION_AMBIENT[sectionId || ''] || BASELINE;
}
