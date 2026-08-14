// @ts-check
// ============================================================
// LinkedIn CTA click tracking — answers ONE question: how many
// visitors who land on the site click "Connect on LinkedIn".
//
// Deliberately separate from pageviews: Plausible counts pageviews
// implicitly when its script loads (total visits), while this module
// fires a NAMED goal on the CTA click — two distinct metrics, never
// conflated. In the Plausible dashboard, create the "LinkedIn CTA
// Click" goal and read its count against the pageview total.
//
// Both providers are OPTIONAL and OFF by default — no third-party
// script loads and nothing is sent unless configured:
//   1. Plausible — set VITE_PLAUSIBLE_DOMAIN to the site domain
//      (e.g. imnotparama.github.io). The script is injected only
//      when set; each CTA click fires a 'LinkedIn CTA Click' goal.
//   2. Minimal self-hosted counter — set VITE_CTA_TRACKING_ENDPOINT
//      to any endpoint accepting POSTs. Each click beacons a tiny
//      JSON body { type: 'linkedin-cta-click' } via sendBeacon
//      (falling back to a keepalive fetch, then a 1px image GET).
//
// Event delegation on document means dynamically re-rendered CTAs
// (sections.js re-writes .js-linkedin hrefs) are covered without
// re-wiring, and a click on any CTA fires exactly once.
// ============================================================
import { PLAUSIBLE_DOMAIN, CTA_TRACKING_ENDPOINT } from '../config.js';

// The LinkedIn CTAs — same selectors main.js/sections.js already wire.
const CTA_SELECTOR = 'a.js-linkedin, #cta-linkedin-hud';

/** Inject the Plausible script once (deferred, data-domain from config).
 *  No-op when the script tag already exists (HMR re-entry). */
function loadPlausible() {
    if (!PLAUSIBLE_DOMAIN) return;
    if (document.querySelector('script[data-domain][src*="plausible"]')) return;
    const s = document.createElement('script');
    s.defer = true;
    s.setAttribute('data-domain', PLAUSIBLE_DOMAIN);
    s.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(s);
}

/** Fire the named goal through Plausible if the script has loaded. */
function firePlausibleGoal() {
    try {
        const fn = /** @type {any} */ (window).plausible;
        if (typeof fn === 'function') {
            fn('LinkedIn CTA Click');
        }
    } catch (err) {
        console.warn('Analytics unavailable:', err);
    }
}

/** Beacon the click to the optional self-hosted counter endpoint. */
function fireBeacon() {
    if (!CTA_TRACKING_ENDPOINT) return;
    const body = JSON.stringify({ type: 'linkedin-cta-click', t: Date.now() });
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            navigator.sendBeacon(CTA_TRACKING_ENDPOINT, body);
            return;
        }
        // Fallbacks: keepalive fetch, then a 1px image GET (same-origin
        // counter only — a cross-origin Image GET would leak query params).
        if (typeof fetch === 'function') {
            fetch(CTA_TRACKING_ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
            return;
        }
        const img = new Image();
        img.src = `${CTA_TRACKING_ENDPOINT}?type=linkedin-cta-click`;
    } catch (err) {
        console.warn('Analytics beacon failed:', err);
    }
}

/** Wire LinkedIn CTA click tracking. Call once after DOM ready. */
export function initLinkedInTracking() {
    loadPlausible();
    document.addEventListener('click', (e) => {
        const target = /** @type {Element | null} */ (e.target);
        if (!target || !(target instanceof Element)) return;
        const cta = target.closest(CTA_SELECTOR);
        if (!cta) return;
        firePlausibleGoal();
        fireBeacon();
    });
}
