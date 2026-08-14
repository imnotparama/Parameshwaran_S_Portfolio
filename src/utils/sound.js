// @ts-check
// ============================================================
// Master sound gate — hover/click blips AND the buzzer horn, all
// behind one visible SND toggle in the HUD. Default MUTED: the
// site makes no sound until the user opts in. The AudioContext is
// only ever created inside a user gesture (the toggle click is a
// gesture), so autoplay policy is never fought.
//
// Volume stays low by design — these are instrument blips, not
// notifications: a short sine tick on hover, a slightly brighter
// one on a component click. Wall-clock is used ONLY to rate-limit
// hover blips while sweeping the mouse (input throttling, not
// scene state).
// ============================================================

let enabled = false;
/** @type {AudioContext | null} */
let audioCtx = null;
let lastBlipAt = 0;

/** Is master sound currently enabled? (main.js syncs the HUD toggle.) */
export function isSoundEnabled() {
    return enabled;
}

/** Get (or create) the shared AudioContext. */
function getCtx() {
    if (audioCtx) return audioCtx;
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    return audioCtx;
}

/** Flip master sound. Returns the new state. */
export function toggleSound() {
    enabled = !enabled;
    if (enabled) {
        const ctx = getCtx();
        if (ctx && ctx.state === 'suspended') ctx.resume();
    }
    return enabled;
}

/** One short synth blip. No-op when muted or WebAudio is unavailable.
 *  @param {number} freq Hz
 *  @param {number} dur seconds
 *  @param {number} peak peak gain (keep low — these are instrument ticks)
 *  @param {OscillatorType} [type] */
function blip(freq, dur, peak, type = 'sine') {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        // Fast attack, exponential decay — a tick, not a tone.
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.03);
    } catch (err) {
        console.warn('Sound unavailable:', err);
    }
}

/** Hover blip — quiet, rate-limited so sweeping the cursor across the board
 *  doesn't fire a burst of oscillators. */
export function hoverBlip() {
    if (!enabled) return;
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
    if (now - lastBlipAt < 45) return;
    lastBlipAt = now;
    blip(720, 0.045, 0.025);
}

/** Click blip — a touch brighter/higher than hover, the "picked" tick. */
export function clickBlip() {
    blip(980, 0.06, 0.04, 'triangle');
}
