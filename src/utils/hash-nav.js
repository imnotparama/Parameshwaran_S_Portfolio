// @ts-check
// ============================================================
// Shareable deep links — the single source of truth for the
// hash → section mapping used by main.js's hash routing.
//
// Every section has a linkable URL (#/about, #/projects,
// #/skills, #/experience, #/contact; the hero is the bare root).
// '#/lcd' is reserved for the LCD game deep link (handled by
// main.js's applyHashNavigation before section resolution).
//
// Pure by design (no DOM): the smoke suite imports this module
// directly and asserts the mapping, so the links can't drift
// from the section ids they must resolve to.
// ============================================================

/** Section id → shareable hash slug ('' = the hero / bare root). */
export const SECTION_HASHES = {
    'sec-hero': '',
    'sec-about': 'about',
    'sec-projects': 'projects',
    'sec-skills': 'skills',
    'sec-experience': 'experience',
    'sec-contact': 'contact'
};

/**
 * Resolve a (possibly raw) location hash to a section id.
 * Accepts '#/about', '#about', '/about', or 'about' — the leading
 * '#/' is optional and matching is case-insensitive, so hand-typed
 * and pasted links both land. Returns 'sec-hero' for an empty
 * hash, the section id for a known slug, or null for anything
 * unknown ('lcd' included — it belongs to the game, not a section).
 * @param {string} hash - window.location.hash as-is.
 * @returns {string | null}
 */
export function hashToSectionId(hash) {
    const raw = String(hash || '').replace(/^#\/?/, '').trim().toLowerCase();
    if (!raw) return 'sec-hero';
    for (const [secId, slug] of Object.entries(SECTION_HASHES)) {
        if (slug && slug === raw) return secId;
    }
    return null;
}
