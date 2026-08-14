// @ts-check
// ============================================================
// Idle ambient motion — the board's "alive at rest" layer.
//
// After ~3 seconds with no scroll or interaction the camera
// starts a slow micro-drift (a few pixels of sinusoidal motion,
// NOT a pan) so the viewport reads as handheld/levitating rather
// than a locked render. Any scroll, pointer move, keypress, or
// touch resets the idle clock and eases the drift back out.
//
// The drift composes ON TOP of the scroll journey's camera writes
// (delta-apply pattern): it never owns the camera pose, so the
// scroll-to-zoom / camera-tween interactions are untouched — the
// next scrub simply overwrites the base and the drift re-eases in
// from there.
//
// Wall-clock is appropriate here: "3s since the last input" is an
// input-gating concern, not scene state (same precedent as the
// hybrid-touch suppression window in hover.js). All motion values
// themselves are deterministic functions of elapsed time.
// ============================================================
import { camera } from './scene.js';
import { motionPrefs } from '../utils/motion-prefs.js';
import { isFocusMode } from '../scroll/journey.js';

// ─── Tuning ──────────────────────────────────────────────────
const IDLE_DELAY_MS = 3000;   // seconds of stillness before the drift engages
// Drift amplitude scales with camera distance so the on-screen movement is
// a few pixels at EVERY framing (hero z≈23 → ~0.05 world u; component stops
// z≈4.2 → ~0.009 — both ~2-3px on a 720px canvas). A fixed world-space amp
// would be a 10px slide at close framing, which stops reading as micro.
const DRIFT_AMP_PER_Z = 0.0022;
const DRIFT_PERIOD_X = 11.0;  // seconds per full sine — slow, imperceptible
const DRIFT_PERIOD_Y = 8.5;
const DRIFT_Y_RATIO = 0.75;   // vertical axis moves less than horizontal
// Delta-scaled lerp (same convention as board.js / hover.js): the drift
// engage/disengage rate is identical at any frame rate.
/** @param {number} k @param {number} [delta] */
function lerpFactor(k, delta) {
    return 1 - Math.pow(1 - k, (delta || 1 / 60) * 60);
}

/** Wall-clock — input gating only, never scene state. */
const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();

let lastInteractionAt = nowMs();
// Smoothed drift state — the applied offset, so the delta-apply never jumps.
let driftX = 0;
let driftY = 0;

/** Mark an interaction (scroll, wheel, pointer, key, touch). Called from
 *  main.js's passive listeners. */
export function noteInteraction() {
    lastInteractionAt = nowMs();
}

/** Has the page been still long enough for the idle loop? */
export function isIdle() {
    return nowMs() - lastInteractionAt >= IDLE_DELAY_MS;
}

/** The pure drift offset for an elapsed time — deterministic, no wall-clock.
 *  Exported so the smoke test can assert its bounds directly.
 *  @param {number} elapsed
 *  @param {number} [amp] world-space amplitude (defaults to the hero framing) */
export function idleDriftOffset(elapsed, amp = DRIFT_AMP_PER_Z * 23) {
    return {
        x: Math.sin(elapsed * (Math.PI * 2 / DRIFT_PERIOD_X)) * amp,
        y: Math.cos(elapsed * (Math.PI * 2 / DRIFT_PERIOD_Y)) * amp * DRIFT_Y_RATIO
    };
}

/** Per-frame idle drift. Apply LAST in the tick (after the journey writes the
 *  camera) so the drift is the final writer while idle — and delta-applied so
 *  a scrub overwrite of the base never fights it. Skips entirely under
 *  reduced motion, in lite mode (no journey), and while a chip is focused
 *  (the focused composition is deliberately steadied).
 *  @param {number} elapsed
 *  @param {number} [delta] */
export function updateIdleDrift(elapsed, delta = 1 / 60) {
    if (!camera || motionPrefs.reduced) return;
    if (!document.body.classList.contains('full-journey')) return;
    if (isFocusMode()) return;
    const active = isIdle();
    // When not idle the target is zero, so the drift eases back out instead
    // of snapping off (the user just interacted — no jump).
    const off = active ? idleDriftOffset(elapsed, DRIFT_AMP_PER_Z * camera.position.z) : { x: 0, y: 0 };
    const k = lerpFactor(active ? 0.05 : 0.04, delta);
    const nx = driftX + (off.x - driftX) * k;
    const ny = driftY + (off.y - driftY) * k;
    camera.position.x += nx - driftX;
    camera.position.y += ny - driftY;
    driftX = nx;
    driftY = ny;
}
