// @ts-check
// Central config — public profile links come from Vite env vars.
// These are public URLs, not secrets: env keeps them in one place.
// import.meta.env is always defined under Vite — the guard exists so the
// module graph also loads in bare Node (tests/smoke-tick.mjs drives the real
// motion modules headlessly; portfolio.js → project-chips.js pull this file).
export const LINKEDIN_URL =
    (import.meta.env && import.meta.env.VITE_LINKEDIN_URL) ||
    'https://www.linkedin.com/in/parameshwaran-s-datascientist';

export const GITHUB_URL =
    (import.meta.env && import.meta.env.VITE_GITHUB_URL) || 'https://github.com/imnotparama';

// LinkedIn CTA click tracking (analytics.js) — both providers OFF by default:
// no script loads and nothing is sent unless one of these env vars is set.
// PLAUSIBLE_DOMAIN enables the Plausible script + a named 'LinkedIn CTA Click'
// goal; CTA_TRACKING_ENDPOINT enables a raw beacon POST to a self-hosted
// counter. Pageviews (Plausible's implicit count) and the CTA goal stay
// separate metrics on purpose.
export const PLAUSIBLE_DOMAIN =
    (import.meta.env && import.meta.env.VITE_PLAUSIBLE_DOMAIN) || '';

export const CTA_TRACKING_ENDPOINT =
    (import.meta.env && import.meta.env.VITE_CTA_TRACKING_ENDPOINT) || '';

// Lite mode: reduced motion preference OR small viewport → skip
// scroll-jacked camera flight and serve a simpler experience.
export function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isSmallViewport() {
    return window.innerWidth < 768;
}

export function isLiteMode() {
    return prefersReducedMotion() || isSmallViewport();
}
