// @ts-check
// ============================================================
// Piezo Buzzer — the horn moment. A short double-beep with real
// piezo character: 2.7kHz square wave (the resonant band of a
// THT piezo element) with a fast attack/decay envelope, so it
// reads as a buzzer, not a synth. The AudioContext is created
// lazily on the first click — browsers require a user gesture.
// ============================================================

/** @type {AudioContext | null} */
let audioCtx = null;

/** Get (or create) the shared AudioContext. */
function getCtx() {
    if (audioCtx) return audioCtx;
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    return audioCtx;
}

/** Fire the buzzer — two short 90ms beeps, 60ms apart (horn cadence).
 *  No-op on failure (no WebAudio, autoplay policy) — the visual pulse
 *  in components.js still plays, so the moment never silently dies. */
export function beepBuzzer() {
    try {
        const ctx = getCtx();
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;
        const freq = 2700;
        const peak = 0.1;
        // [start offset, duration] per beep
        const beeps = [
            [0, 0.09],
            [0.15, 0.09]
        ];
        for (const [offset, dur] of beeps) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            const start = t0 + /** @type {number} */ (offset);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(peak, start + 0.006);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + /** @type {number} */ (dur));
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + /** @type {number} */ (dur) + 0.02);
        }
    } catch (err) {
        console.warn('Buzzer audio unavailable:', err);
    }
}
