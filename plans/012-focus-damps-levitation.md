# 012 — Damp the levitation while a chip is focused (probe touchdown)

- **Status**: DONE (executed 2026-08, commit `aaf61de`)
- **Commit**: `eaff1f2`
- **Severity**: MEDIUM
- **Category**: Cohesion / Physicality & origin
- **Estimated scope**: 3 files, ~25 lines

## Problem

When a project chip is clicked, `focusProject` (`src/scroll/journey.js:408-430`)
glides the camera to a **captured** static position and look point:

```js
// src/scroll/journey.js:421-426 — current
const look = chip.pos.clone().add(new THREE.Vector3(0, 0.05, 0));
const pos = chip.pos.clone().add(CHIP_FOCUS_OFFSET);
glideCameraTo(pos, look, 1.2);
```

`chip.pos` was baked at build time. Meanwhile the levitation
(`src/three/board.js:480-488`) keeps running unmodulated — the focused chip
drifts ±0.16 world units (up to ~20px at focus distance) under a camera that
arrived at a fixed coordinate. The signal connector tracks the live pose
(per-frame `localToWorld` in `updateJourneyEffects`), but the camera does not,
so the focused composition slowly un-frames while the user reads the
datasheet. The board should **steady under the probe**: focus damps the float
to ~20% amplitude, release resumes it.

## Target

`src/scroll/journey.js` exports an `isFocusMode()` getter; `main.js` passes it
into `updateBoardParallax` as a new boolean param (after `journeyLive`);
`src/three/board.js` multiplies all three float amplitudes by a `focusDamp`
that lerps 1 → 0.2 on focus and 0.2 → 1 on release, using the repo's existing
delta-scaled lerp (so the damp is frame-rate independent, identical at 30/60fps):

```js
// src/three/board.js — target (inside updateBoardParallax)
// Focus touchdown: when a chip is focused the probe is "on" the board —
// damp the hover to 20% so the focused composition steadies, resume on release.
const focusTarget = focusMode ? 0.2 : 1;
focusDamp += (focusTarget - focusDamp) * lerpFactor(0.06, delta);
boardGroup.position.y = Math.sin(elapsed * 0.55) * FLOAT_AMP_Y * wake * focusDamp;
boardGroup.position.z = Math.cos(elapsed * 0.37) * FLOAT_AMP_Z * wake * focusDamp;
boardGroup.rotation.z = Math.sin(elapsed * 0.31) * FLOAT_AMP_ROLL * wake * focusDamp;
```

## Repo conventions to follow

- The delta-scaled lerp pattern already exists in `src/three/board.js:405-409`
  (`lerpFactor(k, delta)` = `1 - Math.pow(1 - k, (delta || 1/60) * 60)`); reuse it for `focusDamp` — the hover.js convention, same frame-rate independence.
- Cross-module state is threaded through `main.js` tick arguments, never imported module-to-module (e.g. `journeyLive` at `main.js:246`). Mirror that: journey.js exports the getter, main.js passes the value in.
- `focusedChip` is already module-private state in journey.js — the getter reads it, no refactor of the focus machinery.

## Steps

1. In `src/scroll/journey.js`, after `getActiveSectionId()` (~line 796), add:
   ```js
   /** True while a chip focus view is active (clicked chip / Esc releases). */
   export function isFocusMode() {
     return !!focusedChip;
   }
   ```
2. In `main.js`, import `isFocusMode` from `./src/scroll/journey.js` (extend the existing import line) and in the tick callback pass it:
   ```js
   updateBoardParallax(elapsed, mouse, delta, activeSectionId, journeyLive, isFocusMode());
   ```
3. In `src/three/board.js`:
   - Add module state `/** @type {number} */ let focusDamp = 1;`
   - Extend the signature: `@param {boolean} [focusMode]` on the JSDoc and parameter list (after `journeyLive`).
   - Inside the `if (journeyLive && !motionPrefs.reduced)` block, before the writes, add the focusTarget lerp (above) and multiply all three amplitudes by `focusDamp`. Compose with plan 011's `wake` if both are applied: `... * FLOAT_AMP_Y * wake * focusDamp`.
4. Do not change the sine frequencies, amplitudes, or the camera glide in `focusProject`.

## Boundaries

- Do NOT make the camera track the drifting chip — that is a larger framing-contract change (camera stops baked from static `COMPONENT_WORLD`); out of scope. The damp is the correct quick fix: the probe touches down, the composition steadies.
- Do NOT touch `focusProject`'s glide, the LED flash, or the panel activation.
- Do NOT change reduced-motion behavior.
- If `focusedChip` / the tick signature no longer matches (drift since `eaff1f2`), STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` and `npm run build` both pass.
- **Feel check**: click a project chip (e.g. U2's Projects) — the camera glides, and within ~1s the board's hover visibly shrinks to ~20% (chip holds nearly still while you read the datasheet). Press Esc — the hover resumes over ~1s. Click the same chip again to toggle closed and confirm the resume. Slow-motion (devtools 0.25×) during focus: the chip's drift must decay smoothly to near-zero, never step. The signal connector still tracks the component end (unchanged). Confirm on a real browser — the dev preview webview cannot render the scene.
