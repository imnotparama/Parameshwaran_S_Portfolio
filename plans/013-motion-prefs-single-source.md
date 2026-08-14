# 013 — One reduced-motion policy source (motionPrefs)

- **Status**: DONE (executed 2026-08, commit `aaf61de`)
- **Commit**: `eaff1f2`

> Reconcile note: the seven const locations cited below are historical — the
> fix deleted them (the plan's own outcome). Current state: `src/utils/motion-prefs.js`
> owns the query + live listener; `grep -rn "REDUCED_MOTION" src/` returns nothing.
- **Severity**: LOW
- **Category**: Cohesion & tokens / Accessibility
- **Estimated scope**: 7 files, ~40 lines

## Problem

The same `prefers-reduced-motion` check is evaluated at module load **seven
times**, each with its own constant:

```js
// src/three/traces.js:36, components.js:23, board.js:375 + :415,
// particles.js:71, power.js:37, project-chips.js:38 — current (one of seven)
const TRACE_REDUCED_MOTION = typeof window !== 'undefined' &&
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

Three problems:
1. **Fragmentation**: each module independently picks its own policy posture — some *hide* (sweep `board.js:388`, dust `particles.js:77`), some *stay-but-still* (radar `components.js:29`, current dot `traces.js:382`), some *gate a trigger* (surge `power.js:98`, breathe `project-chips.js:252`). There is no single statement of what the site's reduced-motion posture IS.
2. **Frozen at load**: all seven are evaluated once; an OS-level change mid-session (e.g. enabling reduced motion while the tab is open) is ignored until reload.
3. **Drift risk**: session 2 already caught one module that shipped *without* the gate (the connector dashes, fixed ad-hoc). Seven copies is seven chances to forget the policy on the next feature.

## Target

A single `src/utils/motion-prefs.js` module owning the query and a live
listener; every consumer reads `motionPrefs.reduced` at **call time** (all
seven usages are inside functions already, so no module-eval reads exist):

```js
// src/utils/motion-prefs.js — new
// @ts-check
/** The site's single reduced-motion policy. All motion modules read
 *  motionPrefs.reduced at call time — no per-module matchMedia copies.
 *  @type {{ reduced: boolean }} */
export const motionPrefs = { reduced: false };
if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    /** @param {MediaQueryListEvent | MediaQueryList} e */
    const apply = (e) => { motionPrefs.reduced = !!e.matches; };
    apply(mq);
    mq.addEventListener('change', apply);
}
```

Each consumer deletes its const and reads the flag inside the function:

```js
// src/three/traces.js:354 — target (exemplar)
import { motionPrefs } from '../utils/motion-prefs.js';
// ...
if (highlightedTraceMats.has(m)) {
    m.emissiveIntensity = motionPrefs.reduced ? 1.5 : 1.5 + 0.3 * Math.sin(elapsed * 4);
    continue;
}
```

## Repo conventions to follow

- Shared cross-module state already lives in `src/utils/` (e.g. `hover.js` owns the shared `mouse`; `buzzer.js` the WebAudio). `motion-prefs.js` follows that placement.
- `@ts-check` is the repo standard on every module (checkJs is part of `npm run typecheck`); the new file must carry it and JSDoc its exports.
- Do not change any policy *decision* — this is a straight move of the same checks to one source. (Policies: hide = sweep, dust; stay-but-still = radar, current dot; gate = surge, breathe; planted = float; hold-base = ripple.)

## Steps

1. Create `src/utils/motion-prefs.js` exactly as in Target (both the `matchMedia` call and the live `change` listener; guard for older engines with the `mq.addEventListener` existence check or a fallback to `mq.addListener` — check `mq.addEventListener` is a function before calling).
2. In each of the seven modules, delete the local `*_REDUCED_MOTION` const and replace its uses with `motionPrefs.reduced`:
   - `src/three/traces.js` (const :36; uses :354, :360, :382) — import `motionPrefs`.
   - `src/three/components.js` (const :23; use :29).
   - `src/three/board.js` (consts :375 sweep, :415 float; uses :388-389, :458).
   - `src/three/particles.js` (const :71; use :77).
   - `src/three/power.js` (const :37; use :98).
   - `src/three/project-chips.js` (const :38; use :252).
3. Keep every call site's condition logic identical — only the source of the boolean changes.
4. Run `npm run typecheck` and fix any checkJs narrowing issues (e.g. `motionPrefs.reduced` is a plain boolean — no narrowing needed).

## Boundaries

- Do NOT change any policy decision (hide vs stay-but-still vs gate) — move them verbatim.
- Do NOT touch the CSS-layer reduced-motion block (`scroll.css` `.connector-path` freeze, blanket `animation-duration` override in `style.css`).
- Do NOT add dependencies.
- If a module no longer matches the cited lines (drift since `eaff1f2`), STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` and `npm run build` both pass; `grep -rn "REDUCED_MOTION" src/` returns nothing (all seven consts gone).
- **Feel check**: with OS reduced motion ON, load the page — sweep and dust are hidden, radar/current dot hold still, surge and breathe are gated, board stays planted (identical to before the refactor). Toggle OS reduced motion OFF *while the tab is open*: within ~1s the sweep/dust resume without a reload (proves the live listener). Real browser required; the dev preview webview cannot render the scene.
