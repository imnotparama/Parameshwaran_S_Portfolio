// @ts-check
// ============================================================
// Web Haptics Engine — Tactical vibration feedback for mobile/touch
// Uses the standard Navigator Vibration API with device safety checks.
// ============================================================
import { motionPrefs } from './motion-prefs.js';

/**
 * Check if the current browser environment supports the Vibration API.
 * @returns {boolean}
 */
export function isHapticsSupported() {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Trigger a tactile micro-vibration pattern.
 * Silently ignored on unsupported devices or if reduced motion is preferred.
 * @param {number | number[]} pattern Duration in ms or pattern array
 */
export function triggerHaptic(pattern) {
    if (motionPrefs.reduced || !isHapticsSupported()) return;
    try {
        navigator.vibrate(pattern);
    } catch {
        // Safe fallback for environments with strict user activation policies
    }
}

/**
 * Subtle 8ms tactile click tick (used for component hover / keypress).
 */
export function hapticTick() {
    triggerHaptic(8);
}

/**
 * Dual-stage 12ms tactile feedback (used for switches and buttons).
 */
export function hapticClick() {
    triggerHaptic([12, 25, 12]);
}

/**
 * Confirmation haptic sequence (used for benchmark completion, record scores).
 */
export function hapticSuccess() {
    triggerHaptic([15, 35, 20]);
}

/**
 * Warning or collision haptic pulse (used for boundaries / errors).
 */
export function hapticAlert() {
    triggerHaptic([30, 40, 40]);
}
