// @ts-check
import gsap from 'gsap';
import { emitUartLog } from './telemetry.js';
import { motionPrefs } from '../utils/motion-prefs.js';

export const NATIVE_NAME = 'ஸ்ரீ. பரமேஷ்வரன்';

/**
 * Deterministic progressive typing stages for the Tamil ligature & orthography.
 * Simulates firmware decoding localized identity registers glyph-by-glyph.
 */
export const NATIVE_TYPING_STEPS = [
    'ஸ',
    'ஸ்',
    'ஸ்ரீ',
    'ஸ்ரீ.',
    'ஸ்ரீ. ',
    'ஸ்ரீ. ப',
    'ஸ்ரீ. பர',
    'ஸ்ரீ. பரம',
    'ஸ்ரீ. பரமே',
    'ஸ்ரீ. பரமேஷ',
    'ஸ்ரீ. பரமேஷ்',
    'ஸ்ரீ. பரமேஷ்வ',
    'ஸ்ரீ. பரமேஷ்வர',
    'ஸ்ரீ. பரமேஷ்வரன',
    'ஸ்ரீ. பரமேஷ்வரன்'
];

let hasRevealedInSession = false;
let isAnimating = false;

/**
 * Initialize or reveal the Native Identity (Tamil script) in the Hero panel.
 * Designed to feel like hardware firmware loading localized identity metadata.
 *
 * Rules:
 * - Plays only once per session (sessionStorage cached)
 * - Zero layout shift (space reserved in CSS)
 * - Respects prefers-reduced-motion
 * - Emits hardware UART diagnostics
 *
 * @param {boolean} [immediate=false] If true, skip delay and reveal immediately
 */
export function initNativeIdentity(immediate = false) {
    if (typeof document === 'undefined') return;

    const textEl = document.getElementById('native-id-text');
    const cursorEl = document.getElementById('native-id-cursor');
    if (!textEl || !cursorEl) return;

    // Check session storage
    try {
        if (sessionStorage.getItem('prm-native-revealed') === '1') {
            hasRevealedInSession = true;
        }
    } catch {}

    // If already revealed in this session, render directly without re-animation
    if (hasRevealedInSession) {
        textEl.textContent = NATIVE_NAME;
        cursorEl.classList.add('fade-out');
        return;
    }

    if (isAnimating) return;

    // Check prefers-reduced-motion
    if (motionPrefs.reduced) {
        hasRevealedInSession = true;
        try { sessionStorage.setItem('prm-native-revealed', '1'); } catch {}
        textEl.textContent = NATIVE_NAME;
        textEl.style.opacity = '0';
        cursorEl.classList.add('fade-out');
        emitUartLog('SYS', 'Identity Module Initialized');
        emitUartLog('SYS', `Native Identifier Loaded: ${NATIVE_NAME}`);
        gsap.to(textEl, { opacity: 1, duration: 0.4, ease: 'power1.out' });
        return;
    }

    isAnimating = true;

    // Step 1: Wait approximately 400ms after hero/English name finishes
    const delaySec = immediate ? 0.05 : 0.4;

    gsap.delayedCall(delaySec, () => {
        emitUartLog('SYS', 'Identity Module Initialized');
        emitUartLog('SYS', 'Locale Detected: ta-IN');

        cursorEl.classList.remove('fade-out');
        cursorEl.classList.add('typing');

        const proxy = { step: 0 };
        const totalDuration = NATIVE_TYPING_STEPS.length * 0.075; // ~75ms per typing increment

        gsap.to(proxy, {
            step: NATIVE_TYPING_STEPS.length - 1,
            duration: totalDuration,
            ease: 'none',
            onUpdate: () => {
                const idx = Math.min(Math.round(proxy.step), NATIVE_TYPING_STEPS.length - 1);
                if (textEl) {
                    textEl.textContent = NATIVE_TYPING_STEPS[idx] || '';
                }
            },
            onComplete: () => {
                if (textEl) textEl.textContent = NATIVE_NAME;
                hasRevealedInSession = true;
                isAnimating = false;

                try {
                    sessionStorage.setItem('prm-native-revealed', '1');
                } catch {}

                emitUartLog('SYS', `Native Identifier Loaded: ${NATIVE_NAME}`);

                // Cursor blinks twice (0.5s * 2 = 1.0s), then fades away
                if (cursorEl) {
                    cursorEl.classList.remove('typing');
                    cursorEl.classList.add('blinking');

                    gsap.delayedCall(1.0, () => {
                        cursorEl.classList.remove('blinking');
                        cursorEl.classList.add('fade-out');
                    });
                }
            }
        });
    });
}
