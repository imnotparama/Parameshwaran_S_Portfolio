# 011 — Ramp the board levitation in after journey start (no settle-pop)

- **Status**: DONE (executed 2026-08, commit `aaf61de`)
- **Commit**: `eaff1f2`
- **Severity**: MEDIUM
- **Category**: Physicality & origin / Interruptibility
- **Estimated scope**: 1 file, ~10 lines

## Problem

The board levitation (`src/three/board.js:480-488`) writes absolute values the
first frame the journey goes live. `journeyLive` flips true in `main.js:246-248`
inside the boot `onComplete` callback — on a full boot that is ~6.85s in, at
the exact moment the boot overlay finishes fading. The boot arrival tween has
just settled the board at `y:0, z:0`, so the float's first write is
`Math.sin(elapsed * 0.55) * 0.16` with `elapsed ≈ 6.85+` — up to ±0.16 world
units, roughly 8–12px at hero framing. The board visibly **jumps** at the
settle, the most-watched moment of the page.

```js
// src/three/board.js:480-488 — as executed (plan 013 landed first, so the
// gate reads motionPrefs.reduced rather than the old BOARD_REDUCED_MOTION)
if (journeyLive && !motionPrefs.reduced) {
    boardGroup.position.y = Math.sin(elapsed * 0.55) * FLOAT_AMP_Y;
    boardGroup.position.z = Math.cos(elapsed * 0.37) * FLOAT_AMP_Z;
    boardGroup.rotation.z = Math.sin(elapsed * 0.31) * FLOAT_AMP_ROLL;
}
```

On the return-visit fast path (skipBoot) elapsed is near 0 so the first write
is tiny — the pop is a full-boot-only defect, but it is also the opening
moment, so it is worth fixing properly. The levitation should **wake up**:
amplitude ramps from 0 to full over ~2s, so the hover emerges from stillness
instead of starting mid-sine.

## Target

Amplitude multipliers: a `floatWake` that ramps 0 → 1 over a 2s window after
`journeyLive` first flips, using a smoothstep (the standard "imperceptible"
ease — no visible acceleration change). The sine phases themselves stay
untouched; only the envelope is ramped.

```js
// src/three/board.js — target
// Wake-in: the float starts from stillness and ramps to full over 2s after
// journeyLive first flips — the boot settle lands at y:0 with no pop.
const FLOAT_WAKE_SECONDS = 2;
/** @type {number} */
let floatWakeStart = -1; // elapsed snapshot of the first live tick

// inside the journeyLive block:
if (floatWakeStart < 0) floatWakeStart = elapsed;
const wakeT = Math.min(1, Math.max(0, (elapsed - floatWakeStart) / FLOAT_WAKE_SECONDS));
const wake = wakeT * wakeT * (3 - 2 * wakeT); // smoothstep
boardGroup.position.y = Math.sin(elapsed * 0.55) * FLOAT_AMP_Y * wake;
boardGroup.position.z = Math.cos(elapsed * 0.37) * FLOAT_AMP_Z * wake;
boardGroup.rotation.z = Math.sin(elapsed * 0.31) * FLOAT_AMP_ROLL * wake;
```

## Repo conventions to follow

- Ambient board motion lives in `updateBoardParallax` (`src/three/board.js:436`), deterministic from `elapsed` — keep it that way; no new state beyond the single `floatWakeStart` snapshot.
- Reduced-motion gating is the single `motionPrefs.reduced` source (plan 013; the old `BOARD_REDUCED_MOTION` const at `board.js:415` was deleted).
- `elapsed` is monotonic (THREE.Timer from `src/three/scene.js`), so a snapshot-then-`(elapsed - start)` ramp is safe; no wall-clock.

## Steps

1. In `src/three/board.js`, above `updateBoardParallax`, add the two constants/state:
   ```js
   const FLOAT_WAKE_SECONDS = 2;
   /** @type {number} */
   let floatWakeStart = -1;
   ```
2. In the `if (journeyLive && !motionPrefs.reduced)` block (`board.js:480-488`), replace the three writes with the wake-ramped versions above (capture `floatWakeStart` on the first live tick, compute `wake` via smoothstep, multiply all three amplitudes).
3. Do not change the sine frequencies, amplitudes, or the tilt lerps above the block.

## Boundaries

- Do NOT touch `main.js` (the `journeyLive` flag and its timing are correct as-is).
- Do NOT touch the legacy (non-journey) branch of `updateBoardParallax` (`board.js:442-446`).
- Do NOT change any values other than wrapping the amplitude in `wake`.
- If `floatWakeStart`/the block no longer matches (drift since `eaff1f2`), STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` and `npm run build` both pass.
- **Feel check**: full reload (fresh tab — the boot must run, not skip). Watch the board through the overlay fade: the board settles at rest and the hover emerges over ~2s with no y-jump. Compare against a return-visit load (near-instant, still smooth). Slow-motion (devtools 0.25×) at the overlay fade: position.y must not step; it should accelerate gently from 0. Reduced-motion users: board stays planted, unchanged.
