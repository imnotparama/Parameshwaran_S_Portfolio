// @ts-check
// ============================================================
// TICK SCHEDULER — priority-based frame-budget execution.
//
// Replaces the flat `tickCallbacks` array with three priority tiers
// so low-priority ambient work can be skipped when the frame budget
// is tight. Works alongside the existing GPU quality ladder
// (scene.js QUALITY_LEVELS) — that ladder governs GPU fill/shadow
// cost; this governs JS tick cost.
//
// Three tiers:
//   CRITICAL  — physics, camera, interactivity, the LCD game, LED array,
//               radar, parallax, probe, hover.  Runs EVERY frame, no
//               exceptions — if these fall behind the user sees lag or
//               broken interaction.
//   STANDARD  — trace current, ripple, sweep, ambient dust/flecks,
//               oscilloscope, project-chips, idle drift, self-test.
//               Cosmetic.  Skipped when the frame already ate >8ms
//               of the 16.6ms budget (the quality ladder steps down GPU
//               work at ~22ms; we step down JS work earlier).
//   DEFERRED  — telemetry readouts (hidden unless the palette is open),
//               journey panel positioning.  Skipped when >5ms spent.
//
// Convention: callbacks in CRITICAL can read shared state that a
// deferred callback might have written last frame; no STANDARD/
// DEFERRED callback's output is treated as authoritative for this
// frame's CRITICAL logic.  This keeps the skip model safe: a skipped
// callback simply means "use the value from the last frame it ran."
//
// Usage:
//   import { CRITICAL, STANDARD, DEFERRED, onTick } from './tick-scheduler.js';
//   onTick(CRITICAL, (elapsed, delta) => { ... });
//   onTick(STANDARD,  (elapsed, delta) => { ... });
//   onTick(DEFERRED,  (elapsed, delta) => { ... });
//
//   // Called by stepFrame — do not call directly:
//   tickPrioritized(elapsed, delta, frameBudgetMs);
// ============================================================

/** Priority constants — lower number = runs first = harder to skip. */
export const CRITICAL = 0;
export const STANDARD = 1;
export const DEFERRED = 2;

/**
 * @typedef {(elapsed: number, delta: number) => void} TickCallback
 * @typedef {0 | 1 | 2} Priority
 */

/** @type {Map<Priority, TickCallback[]>} */
const buckets = new Map([
    [CRITICAL, /** @type {TickCallback[]} */ ([])],
    [STANDARD, /** @type {TickCallback[]} */ ([])],
    [DEFERRED, /** @type {TickCallback[]} */ ([])],
]);

/**
 * Register a tick callback at a given priority.
 * CRITICAL callbacks always run first; DEFERRED runs last and is the
 * first to be skipped under budget pressure.
 *
 * @param {Priority} priority
 * @param {TickCallback} fn
 */
export function onTick(priority, fn) {
    const arr = buckets.get(priority);
    if (arr) arr.push(fn);
}

/**
 * Expose a bucket for direct push (backward-compat with the old
 * tickCallbacks pattern — main.js / smoke tests push callbacks here).
 *
 * @param {Priority} priority
 * @returns {TickCallback[]}
 */
export function getTickBucket(priority) {
    return /** @type {TickCallback[]} */ (buckets.get(priority));
}

/** Reset all buckets — for smoke tests only. */
export function resetBuckets() {
    for (const arr of buckets.values()) arr.length = 0;
}

/** State for the budget-gate — module-level, reset per frame. */
let skippedStandard = 0;
let skippedDeferred = 0;

/**
 * Returns the number of STANDARD and DEFERRED callbacks skipped on
 * the last frame.  For diagnostics / the smoke suite.
 */
export function getSkipCounts() {
    return { standard: skippedStandard, deferred: skippedDeferred };
}

/**
 * Execute all registered callbacks in priority order, skipping
 * STANDARD/DEFERRED when the frame is already behind budget.
 *
 * Called by stepFrame (scene.js) after updating the clock.
 *
 * @param {number} elapsed  seconds since the loop started
 * @param {number} delta    clamped seconds since last frame
 * @param {number} frameBudgetMs  per-frame ms budget (default 8ms = half of 16.6ms)
 * @returns {number} total ms spent executing callbacks
 */
export function tickPrioritized(elapsed, delta, frameBudgetMs = 8) {
    skippedStandard = 0;
    skippedDeferred = 0;
    const frameStart = performance.now();

    // CRITICAL — always runs.
    const criticals = buckets.get(CRITICAL) || [];
    for (let i = 0; i < criticals.length; i++) {
        criticals[i](elapsed, delta);
    }

    const spentMs = performance.now() - frameStart;

    // STANDARD — skipped when the critical pass already ate > half the budget.
    if (spentMs < frameBudgetMs) {
        const standards = buckets.get(STANDARD) || [];
        for (let i = 0; i < standards.length; i++) {
            standards[i](elapsed, delta);
        }
    } else {
        skippedStandard = (buckets.get(STANDARD) || []).length;
    }

    const spentMs2 = performance.now() - frameStart;

    // DEFERRED — skipped when > 5ms spent (lower bar — these are cosmetic).
    if (spentMs2 < 5) {
        const deferreds = buckets.get(DEFERRED) || [];
        for (let i = 0; i < deferreds.length; i++) {
            deferreds[i](elapsed, delta);
        }
    } else {
        skippedDeferred = (buckets.get(DEFERRED) || []).length;
    }

    return performance.now() - frameStart;
}
