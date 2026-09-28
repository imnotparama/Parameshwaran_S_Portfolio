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

let lastClickBlipAt = 0;

/** Click blip — a touch brighter/higher than hover, the "picked" tick.
 *  Rate-limited to 35ms to eliminate double-triggering on bubbled event handlers. */
export function clickBlip() {
    if (!enabled) return;
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
    if (now - lastClickBlipAt < 35) return;
    lastClickBlipAt = now;
    blip(980, 0.06, 0.04, 'triangle');
}

// ─── LCD1 Signal Repair blips ─────────────────────────────────
// Retro embedded-firmware tones for the LCD game: a sharp square-wave tick
// on packet collect and a low square buzz on signal loss. Same master gate
// (SND OFF by default) and same gesture discipline — the game only plays
// these after the user has already pressed a key (a legal gesture).

/** Packet-collect tick — the machine's "packet received" chirp: a sharp
 *  square two-tone (same pattern as powerUpBeep — one bright blip, one
 *  echo). */
export function gameBeep() {
    blip(1320, 0.045, 0.04, 'square');
    blip(1760, 0.04, 0.03, 'square');
}

/** Signal-lost buzz — low, flat, unpleasant (the diagnostic failed). */
export function loseBuzz() {
    blip(196, 0.4, 0.05, 'square');
}

/** Runner jump tick — a short rising square chirp (the pulse leaving the
 *  trace). Two quick ascending notes, same gesture discipline as the rest. */
export function jumpBlip() {
    blip(520, 0.05, 0.03, 'square');
    blip(780, 0.05, 0.025, 'square');
}

/** Runner dash sweep — a fast descending pair (the invulnerable lunge). */
export function dashBlip() {
    blip(1400, 0.06, 0.03, 'square');
    blip(860, 0.07, 0.02, 'square');
}

/** Runner slide whoosh — descending square-wave friction chirp under obstacles */
export function slideBlip() {
    blip(380, 0.05, 0.025, 'triangle');
    blip(260, 0.07, 0.02, 'triangle');
}

/** 8-bit celebratory high-score fanfare arpeggio */
export function playRecordFanfare() {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;
        const notes = [587.33, 739.99, 880.00, 1174.66]; // D5, F#5, A5, D6
        notes.forEach((freq, idx) => {
            if (!ctx) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, t0 + idx * 0.08);
            gain.gain.setValueAtTime(0.001, t0 + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.04, t0 + idx * 0.08 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + idx * 0.08 + 0.16);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0 + idx * 0.08);
            osc.stop(t0 + idx * 0.08 + 0.18);
        });
    } catch {
        // Safe under AudioContext autoplay policies
    }
}

/**
 * Synthesize a turbine cooling fan spool whine + forced air rush for Overclock mode.
 * @param {number} [duration]
 */
export function playOverclockTurbineSound(duration = 5.0) {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;

        // 1. Spooling Turbine Whine (Dual Oscillator: sawtooth + triangle)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const oscGain = ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'triangle';

        // Accelerate pitch from 180Hz up to 1250Hz, hold for event, ramp down near end
        osc1.frequency.setValueAtTime(180, t0);
        osc1.frequency.exponentialRampToValueAtTime(1250, t0 + 2.0);
        osc1.frequency.setValueAtTime(1250, t0 + 4.0);
        osc1.frequency.exponentialRampToValueAtTime(260, t0 + duration);

        osc2.frequency.setValueAtTime(360, t0);
        osc2.frequency.exponentialRampToValueAtTime(2500, t0 + 2.0);
        osc2.frequency.setValueAtTime(2500, t0 + 4.0);
        osc2.frequency.exponentialRampToValueAtTime(520, t0 + duration);

        oscGain.gain.setValueAtTime(0.0001, t0);
        oscGain.gain.exponentialRampToValueAtTime(0.035, t0 + 0.6);
        oscGain.gain.setValueAtTime(0.035, t0 + 4.0);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

        osc1.connect(oscGain);
        osc2.connect(oscGain);
        oscGain.connect(ctx.destination);

        osc1.start(t0);
        osc2.start(t0);
        osc1.stop(t0 + duration + 0.1);
        osc2.stop(t0 + duration + 0.1);

        // 2. High-RPM Airflow Noise (BufferSource with Bandpass filter)
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(600, t0);
        filter.frequency.exponentialRampToValueAtTime(2600, t0 + 2.0);
        filter.Q.value = 1.8;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.0001, t0);
        noiseGain.gain.exponentialRampToValueAtTime(0.025, t0 + 0.5);
        noiseGain.gain.setValueAtTime(0.025, t0 + 4.0);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

        whiteNoise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);

        whiteNoise.start(t0);
        whiteNoise.stop(t0 + duration + 0.1);
    } catch {
        // Safe under AudioContext autoplay restrictions
    }
}

/**
 * High-tech portal warp sound for entering the full-screen Diagnostic Simulation.
 * Synthesizes an ionization static pop, upward frequency warp, sub-bass pulse, and confirm pip.
 */
export function playDiagnosticEnterSound() {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;

        // 1. Upward warp sweep
        const warpOsc = ctx.createOscillator();
        const warpGain = ctx.createGain();
        warpOsc.type = 'sine';
        warpOsc.frequency.setValueAtTime(140, t0);
        warpOsc.frequency.exponentialRampToValueAtTime(1180, t0 + 0.38);

        warpGain.gain.setValueAtTime(0.0001, t0);
        warpGain.gain.exponentialRampToValueAtTime(0.045, t0 + 0.08);
        warpGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);

        warpOsc.connect(warpGain);
        warpGain.connect(ctx.destination);
        warpOsc.start(t0);
        warpOsc.stop(t0 + 0.45);

        // 2. Sub-bass power thump
        const subOsc = ctx.createOscillator();
        const subGain = ctx.createGain();
        subOsc.type = 'triangle';
        subOsc.frequency.setValueAtTime(80, t0);
        subOsc.frequency.exponentialRampToValueAtTime(36, t0 + 0.3);

        subGain.gain.setValueAtTime(0.06, t0);
        subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);

        subOsc.connect(subGain);
        subGain.connect(ctx.destination);
        subOsc.start(t0);
        subOsc.stop(t0 + 0.38);

        // 3. Dual high-tech confirmation pips at t0 + 0.28 and t0 + 0.36
        [0.28, 0.36].forEach((delay, idx) => {
            const pip = ctx.createOscillator();
            const pipGain = ctx.createGain();
            pip.type = 'sine';
            pip.frequency.value = idx === 0 ? 1560 : 2080;
            pipGain.gain.setValueAtTime(0.0001, t0 + delay);
            pipGain.gain.exponentialRampToValueAtTime(0.03, t0 + delay + 0.015);
            pipGain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.08);
            pip.connect(pipGain);
            pipGain.connect(ctx.destination);
            pip.start(t0 + delay);
            pip.stop(t0 + delay + 0.09);
        });
    } catch {
        // Safe under AudioContext restrictions
    }
}

/**
 * Sci-fi diagnostic simulation exit / disconnect sound effect.
 */
export function playDiagnosticExitSound() {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t0);
        osc.frequency.exponentialRampToValueAtTime(140, t0 + 0.28);

        gain.gain.setValueAtTime(0.04, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.32);
    } catch {
        // Safe under AudioContext restrictions
    }
}

/**
 * Capacitive ground slam sound: low-frequency damped sub-thump + resonant discharge chirp.
 */
export function capacitiveSlamBlip() {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;

        // Sub-harmonic impact thump
        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'triangle';
        sub.frequency.setValueAtTime(160, t0);
        sub.frequency.exponentialRampToValueAtTime(38, t0 + 0.14);

        subGain.gain.setValueAtTime(0.06, t0);
        subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);

        sub.connect(subGain);
        subGain.connect(ctx.destination);
        sub.start(t0);
        sub.stop(t0 + 0.18);

        // Capacitive ring
        blip(880, 0.06, 0.02, 'sine');
    } catch {
        // Safe under AudioContext policies
    }
}

/**
 * Resonant LC Tank Combo Chime: pitch scales with consecutive packet combo chains.
 * @param {number} comboLevel
 */
export function resonantComboChime(comboLevel = 1) {
    if (!enabled) return;
    const notes = [880, 987.77, 1174.66, 1318.51, 1567.98, 1760, 2093];
    const freq = notes[Math.min(notes.length - 1, Math.max(0, comboLevel - 1))];
    blip(freq, 0.09, 0.035, 'triangle');
    blip(freq * 1.5, 0.06, 0.015, 'sine');
}

/**
 * Cleanroom emergency warning siren tone for 1000m overclock events.
 */
export function cleanroomSirenAlert() {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(640, t0);
        osc.frequency.linearRampToValueAtTime(880, t0 + 0.15);
        osc.frequency.linearRampToValueAtTime(640, t0 + 0.3);

        gain.gain.setValueAtTime(0.02, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.38);
    } catch {
        // Safe under AudioContext policies
    }
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

/** Power-up beep — the board's POST chime: two quick ascending notes (the
 *  rail comes up, then the system chirps ready). Fired when sound is first
 *  enabled — the SND toggle click is the user gesture that legally builds
 *  the AudioContext, so this is where the board powers on audibly. Subtle
 *  by design: short notes, low peaks, same master gate as every blip. */
export function powerUpBeep() {
    blip(523, 0.08, 0.03);             // C5 — power rail up
    blip(784, 0.1, 0.035, 'triangle'); // G5 — ready, a touch brighter
}

/**
 * Multimeter continuity tone — 850Hz piezo tone when touching ground (TP2)
 * or completing circuit test points. High-pitch diagnostic tone.
 */
export function playContinuityBeep() {
    if (!enabled) return;
    blip(850, 0.12, 0.045, 'square');
}

/**
 * Inductor coil whine / DC-DC flyback resonance.
 * A high-frequency switching harmonic (3.1kHz) simulating magnetic saturation.
 * @param {number} [dur]
 * @param {number} [peak]
 */
export function playInductorWhine(dur = 0.18, peak = 0.035) {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(3120, t0);
        osc.frequency.linearRampToValueAtTime(3380, t0 + dur * 0.5);
        osc.frequency.linearRampToValueAtTime(3120, t0 + dur);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    } catch {}
}

/**
 * High-tactile mechanical switch click with dual spring-latch resonance.
 */
export function playMechanicalClick() {
    if (!enabled) return;
    click(4200, 0.015, 0.05);
    click(2400, 0.018, 0.04, 0.012);
    click(1200, 0.022, 0.03, 0.02);
}

/**
 * Demodulated RF packet transmission chatter (2.4GHz IEEE 802.15.4 frame).
 * Quick frequency-shift-keyed (FSK) data burst.
 */
export function playRfChirp() {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;
        const freqs = [2400, 3600, 2100, 4200, 2800];
        freqs.forEach((f, idx) => {
            if (!ctx) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(f, t0 + idx * 0.025);
            gain.gain.setValueAtTime(0.0001, t0 + idx * 0.025);
            gain.gain.exponentialRampToValueAtTime(0.025, t0 + idx * 0.025 + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + idx * 0.025 + 0.024);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0 + idx * 0.025);
            osc.stop(t0 + idx * 0.025 + 0.025);
        });
    } catch {}
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

/** Multimeter continuity / probe tone — a high, clean 2.1kHz chirp. */
export function probeTone() {
    blip(2100, 0.05, 0.04, 'sine');
}

let lastSurgeToneAt = 0;

/** Current surge flight tone — subtle rising inductive pitch while charge is traveling.
 *  Rate-limited to 65ms so rapid scroll updates never saturate audio context with oscillators.
 *  @param {number} progress 0..1 along leg */
export function currentSurgeTone(progress) {
    if (!enabled) return;
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
    if (now - lastSurgeToneAt < 65) return;
    lastSurgeToneAt = now;
    const freq = Math.round(520 + Math.min(Math.max(progress, 0), 1) * 680);
    blip(freq, 0.028, 0.014, 'sine');
}

/** Module arrival touchdown sound — relay seat click + rich dual harmonic power rail chime (C6 + E6). */
export function moduleTouchdown() {
    if (!enabled) return;
    switchClack();
    blip(1046, 0.09, 0.038, 'triangle'); // C6 rail pitch
    setTimeout(() => {
        blip(1318, 0.11, 0.032, 'triangle'); // E6 major harmonic
    }, 45);
}

/** Play high-tech multi-tone ascending arpeggio when CPU benchmark initiates. */
export function playCpuTurboChime() {
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
        if (ctx.state === 'suspended') ctx.resume();
        const t0 = ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
            if (!ctx) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t0 + idx * 0.07);
            gain.gain.setValueAtTime(0.001, t0 + idx * 0.07);
            gain.gain.exponentialRampToValueAtTime(0.045, t0 + idx * 0.07 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + idx * 0.07 + 0.14);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0 + idx * 0.07);
            osc.stop(t0 + idx * 0.07 + 0.15);
        });
    } catch {
        // Safe under AudioContext autoplay policies
    }
}

// ─── 3D Rover Brushless Electric Motor Synthesizer ────────────
/** @type {OscillatorNode | null} */
let roverMotorOsc = null;
/** @type {GainNode | null} */
let roverMotorGain = null;
/** @type {BiquadFilterNode | null} */
let roverMotorFilter = null;

/**
 * Dynamic brushless EV motor sound for the 3D PCB Nano-Rover.
 * Tracks rover velocity with smooth frequency modulation and low-pass filtering.
 * @param {number} speed Rover speed magnitude
 * @param {boolean} [isBoosting]
 * @param {boolean} [isBraking]
 */
export function updateRoverMotorSound(speed, isBoosting = false, isBraking = false) {
    if (!enabled) {
        if (roverMotorGain && audioCtx) {
            roverMotorGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
        }
        return;
    }
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    if (!roverMotorOsc || !roverMotorGain || !roverMotorFilter) {
        roverMotorOsc = ctx.createOscillator();
        roverMotorOsc.type = 'sawtooth';
        roverMotorOsc.frequency.value = 75; // Idle electric hum

        roverMotorFilter = ctx.createBiquadFilter();
        roverMotorFilter.type = 'lowpass';
        roverMotorFilter.frequency.value = 280;

        roverMotorGain = ctx.createGain();
        roverMotorGain.gain.value = 0;

        roverMotorOsc.connect(roverMotorFilter);
        roverMotorFilter.connect(roverMotorGain);
        roverMotorGain.connect(ctx.destination);
        roverMotorOsc.start();
    }

    const absSpeed = Math.abs(speed);
    // Base frequency tracks velocity: 75Hz at rest up to 360Hz at high speed
    const targetFreq = 75 + absSpeed * 45 + (isBoosting ? 65 : 0) + (isBraking ? -20 : 0);
    roverMotorOsc.frequency.setTargetAtTime(Math.max(50, targetFreq), ctx.currentTime, 0.08);

    // Filter cut-off opens up as motor spins faster
    const targetFilter = 240 + absSpeed * 120 + (isBoosting ? 200 : 0);
    roverMotorFilter.frequency.setTargetAtTime(targetFilter, ctx.currentTime, 0.08);

    // Gain scales smoothly with velocity (subtle instrument purr, never overpowering)
    const targetGain = Math.min(0.045, Math.max(0.008, absSpeed * 0.012 + (isBoosting ? 0.015 : 0)));
    roverMotorGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.06);
}

/**
 * Stop rover motor sound immediately when exiting rover drive mode.
 */
export function stopRoverMotorSound() {
    if (!roverMotorGain || !audioCtx) return;
    try {
        roverMotorGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
    } catch {}
}


