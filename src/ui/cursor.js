// @ts-check
// ============================================================
// Scope-Probe Cursor — the pointer becomes the board's test probe.
import { getShortMeasurement } from '../utils/hover.js';
// A precision graticule crosshair with a per-section signal
// readout chip, in the instrument's own voice. States:
//   • default — signal-green crosshair + live readout chip
//   • probe   — hovering a raycast board component (hover.js sets
//               body.probe-target): arms pull IN toward the tip
//               (measuring), readout → MEASURE
//   • link    — hovering DOM interactives (a/button/pills/cards):
//               gold accent, arms extend (click affordance), the
//               readout fades — the element self-describes
// Transform-only writes (translate3d on a fixed, pointer-events:none
// container) so it never blocks canvas raycasts or DOM clicks and never
// triggers layout. Skipped in lite mode (reduced motion / touch) — the
// native cursor stays for those users.
// ============================================================

// Per-section signal readout — the instrument's voice. Read the active
// panel from the DOM (no module coupling to journey.js).
/** @type {Record<string, string>} */
const SIGNAL_MAP = {
    'panel-hero': 'PWR · IDLE',
    'panel-about': 'VCC 3.3V',
    'panel-projects': 'BUS 5V',
    'panel-skills': 'CLK 16MHz',
    'panel-experience': 'REV 1.0',
    'panel-contact': 'TX/RX',
    'panel-project-detail': 'MEASURE'
};
const DEFAULT_SIGNAL = 'CH1';

// DOM interactives the probe reads as clickable.
const LINK_SELECTOR = 'a, button, [role="button"], .skill-pill, .project-card, .nav-btn, .secondary-link';

/** @type {HTMLElement | null} */
let probe = null;
/** @type {HTMLElement | null} */
let readoutText = null;
/** @type {HTMLElement | null} */
let halo = null;
/** @type {HTMLElement | null} */
let lockEl = null;
/** @type {EventTarget | null} */
let hoverEl = null;
let tx = 0;
let ty = 0;
let hx = 0;
let hy = 0;
let rafId = 0;
let lastTime = 0;
let lastSignal = '';
let lastState = '';

/** Park the probe at the viewport center until the first mousemove. */
function parkAtCenter() {
    tx = window.innerWidth / 2;
    ty = window.innerHeight / 2;
    hx = tx;
    hy = ty;
}

function tick(/** @type {number} */ now) {
    rafId = requestAnimationFrame(tick);
    if (!probe) return;
    const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 1 / 60;
    lastTime = now;

    // Trail halo eases toward the tip — frame-rate independent lerp, the
    // same pattern as hover.js parallax smoothing.
    const trail = 1 - Math.pow(0.82, delta * 60);
    hx += (tx - hx) * trail;
    hy += (ty - hy) * trail;

    probe.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`;
    if (halo) halo.style.transform = `translate3d(${hx.toFixed(2)}px, ${hy.toFixed(2)}px, 0)`;

    // State: probe (raycast component under pointer) > link > default.
    const isProbe = document.body.classList.contains('probe-target');
    const isLink = !isProbe && hoverEl instanceof Element && !!hoverEl.closest(LINK_SELECTOR);
    const state = isProbe ? 'probe' : (isLink ? 'link' : 'default');
    if (state !== lastState) {
        lastState = state;
        document.body.classList.toggle('cursor-probe', state === 'probe');
        document.body.classList.toggle('cursor-link', state === 'link');
        // Lock pulse: entering the probe state (a component under the pointer)
        // fires a one-shot gold contact ring at the tip — the instrument's
        // "locked on" tick. Restart by re-triggering the class (a reflow read
        // only on state CHANGE, never in the hot path). Reduced-motion users
        // never get here (lite mode skips initCursor entirely; belt below).
        if (state === 'probe' && lockEl) {
            lockEl.classList.remove('lock-ping');
            void lockEl.offsetWidth;
            lockEl.classList.add('lock-ping');
        }
    }

    // Readout: the probe's identity while over a component — BEEP over the
    // buzzer (the horn), MEASURE over a project chip (opens a datasheet),
    // else the component's ref (U1, C1, … — identifying, not clickable).
    // Else the active panel's signal. Faded by CSS on link state (the
    // hovered element self-describes there).
    if (readoutText && state !== 'link') {
        let signal;
        if (isProbe) {
            const hoverType = document.body.dataset.hoverType;
            const ref = document.body.dataset.hoverRef || '';
            if (hoverType === 'BUZZER') {
                signal = 'BEEP';
            } else if (hoverType === 'PROJECT') {
                signal = 'MEASURE';
            } else {
                // Tier-2 readout near the cursor: the component's ref + its
                // short measurement ("J1 5V · 480Mbps") — every minor part
                // answers the probe with its instrument value, not just its
                // designator.
                const short = getShortMeasurement(ref);
                signal = short ? `${ref} ${short}` : (ref || 'MEASURE');
            }
        } else {
            const active = document.querySelector('.ds-panel.panel-active');
            signal = active ? (SIGNAL_MAP[active.id] || DEFAULT_SIGNAL) : DEFAULT_SIGNAL;
        }
        if (signal !== lastSignal) {
            lastSignal = signal;
            readoutText.textContent = signal;
        }
    }
}

/** Build the probe cursor. No-op on touch (CSS hides it anyway) and when
 *  the DOM is missing. Idempotent — a re-init can never stack a second
 *  cursor (HMR re-entry, double module graph in dev). */
export function initCursor() {
    if (probe) return;
    probe = document.getElementById('cursor-probe');
    readoutText = document.getElementById('probe-readout-text');
    halo = document.querySelector('.probe-halo');
    lockEl = probe ? probe.querySelector('.probe-lock') : null;
    if (!probe || !readoutText) return;

    document.body.classList.add('custom-cursor');
    parkAtCenter();

    window.addEventListener('mousemove', (e) => {
        tx = e.clientX;
        ty = e.clientY;
        hoverEl = e.target;
    }, { passive: true });

    lastTime = 0;
    if (rafId === 0) rafId = requestAnimationFrame(tick);
}
