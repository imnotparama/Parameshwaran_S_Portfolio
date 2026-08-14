// @ts-check
// ============================================================
// The site's single reduced-motion policy source.
//
// Every motion module reads `motionPrefs.reduced` at CALL time — no
// per-module matchMedia copies. Previously the same query was evaluated
// at module load in seven places (traces, components, board ×2, particles,
// power, project-chips), which fragmented the policy (hide vs stay-but-still
// vs gate), froze it at load (an OS change mid-session was ignored until
// reload), and let modules ship without the gate at all (the connector
// dashes once did). A live `change` listener keeps the flag current.
// ============================================================

/** @type {{ reduced: boolean }} */
export const motionPrefs = { reduced: false };

if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    /** @param {MediaQueryListEvent | MediaQueryList} e */
    const apply = (e) => { motionPrefs.reduced = !!e.matches; };
    apply(mq);
    // Older engines use addListener; both are fine — guard the modern one.
    if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', apply);
    } else if (typeof mq.addListener === 'function') {
        /** @param {MediaQueryListEvent} e */ // legacy signature is the same shape
        mq.addListener(apply);
    }
}
