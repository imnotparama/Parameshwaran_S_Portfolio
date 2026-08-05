// @ts-check
// Central config — public profile links come from Vite env vars.
// These are public URLs, not secrets: env keeps them in one place.
export const LINKEDIN_URL =
    import.meta.env.VITE_LINKEDIN_URL ||
    'https://www.linkedin.com/in/parameshwaran-s-datascientist';

export const GITHUB_URL =
    import.meta.env.VITE_GITHUB_URL || 'https://github.com/imnotparama';

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
