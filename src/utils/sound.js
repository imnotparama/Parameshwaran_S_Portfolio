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

// ─── Tactile relay + switch sounds ──────────────────────────────
// Mechanical feedback for physical actions (night-bench relay, membrane
// switch section jumps). Same master gate as every blip — silent unless the
// SND toggle is on. Two-stage transients: an attack click then a release
// click (the relay armature seating, then the contacts closing) — built from
// short noise/sine bursts so they read as MECHANISM, not synth tones.

/** One transient click — a short burst of filtered noise with a fast
 *  attack/decay envelope (the "tick" of a mechanical contact).
 *  @param {number} freq center Hz of the bandpassed click
 *  @param {number} dur seconds
 *  @param {number} peak peak gain (low — instrument feedback)
 *  @param {number} [delay] seconds from now to start */
function click(freq, dur, peak, delay = 0) {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime + delay;
        // Bandpassed noise burst — reads as a mechanical tick, not a tone.
        const durSec = Math.max(0.005, dur);
        const buffer = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * durSec)), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        // Deterministic-ish decaying noise (seeded by nothing — pure decay
        // envelope on random samples; the tick is one-shot, not scene state).
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = freq;
        bp.Q.value = 1.2;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
        src.connect(bp);
        bp.connect(gain);
        gain.connect(ctx.destination);
        src.start(t0);
        src.stop(t0 + durSec + 0.03);
    } catch (err) {
        console.warn('Click audio unavailable:', err);
    }
}

/** The night-bench relay — a two-stage mechanical throw: a crisp attack
 *  transient (armature striking) ~20ms later followed by the release click
 *  (contacts seating). The audible "thunk" of the PWR switch. */
export function relayClick() {
    click(2400, 0.02, 0.05);          // attack — armature strike
    click(1800, 0.018, 0.04, 0.022);  // release — contacts close
}

/** Membrane switch "clack" — a shorter, higher-frequency sibling of the
 *  relay (rubber dome, not an armature). Used for section jumps (1–6 / ←→). */
export function switchClack() {
    click(3600, 0.012, 0.035);
    click(2800, 0.01, 0.025, 0.014);
}

// ─── Electrical hum — scroll-velocity drone ───────────────────
// A low mains-frequency drone that swells with scroll speed (the board's
// power rail audibly energizes as you fly along the traces). Starts and
// stops WITHOUT cutting: the gain ramps instead of popping, and the node
// persists once created so repeated scroll bursts never re-allocate.
// Gated on the master toggle like everything else.
/** @type {OscillatorNode | null} */
let humOsc = null;
/** @type {GainNode | null} */
let humGain = null;
/** @type {BiquadFilterNode | null} */
let humFilter = null;

/** Scale the drone with scroll velocity. speed is px per frame-ish — clamp
 *  the gain so fast scrubs never distort; a slow scroll whispers, a fast
 *  flick hums audibly. Muted (the default): silent NO-OP — the AudioContext
 *  must never be created outside a user gesture (the SND toggle click is
 *  the only legal builder), so an enabled check comes BEFORE getCtx(). If a
 *  hum node already exists (sound was on, then toggled off mid-scroll), the
 *  gain ramps to silence instead of cutting — no pop either way.
 *  @param {number} speed 0..~40 (scroll velocity in px per frame at 60fps) */
export function electricalHum(speed) {
    if (!enabled) {
        // Toggled off mid-drone: hush the existing node (never create one).
        const ctx = getCtx();
        if (humGain && ctx) humGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        return;
    }
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!humOsc || !humGain || !humFilter) {
        humOsc = ctx.createOscillator();
        humOsc.type = 'sine';
        humOsc.frequency.value = 55; // mains-ish hum, low and warm
        humFilter = ctx.createBiquadFilter();
        humFilter.type = 'lowpass';
        humFilter.frequency.value = 160;
        humGain = ctx.createGain();
        humGain.gain.value = 0;
        humOsc.connect(humFilter);
        humFilter.connect(humGain);
        humGain.connect(ctx.destination);
        humOsc.start();
    }
    const target = Math.min(0.05, Math.max(0, speed / 40) * 0.05);
    // setTargetAtTime ramps smoothly — no clicks on start/stop/change.
    humGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
}

/** Hush the drone immediately (e.g. on SND toggle-off) without a pop. */
export function stopElectricalHum() {
    if (!humGain) return;
    const ctx = getCtx();
    if (ctx) humGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
}
