# 015 — Night-bench calm float modulation

- **Status**: DONE (executed 2026-08)
- **Severity**: LOW
- **Category**: Physicality & Ambient States
- **Estimated scope**: 1 file (`src/three/board.js`), ~10 lines

## Problem

When the user cuts power to the bench via the PWR LED or 'P' shortcut (`body.night-bench`), the lighting dims and bloom adjusts, but the board's levitation frequency and amplitude remained identical to daytime operation.

## Target

Modulate the levitation sine parameters when `body.night-bench` is active:
- Levitation frequency scaled by `0.65x` (slower, calmer drift)
- Levitation amplitude scaled by `0.75x` (tighter, quieter hover)
- Gated by `!motionPrefs.reduced`: reduced motion stays fully planted ($0$ float).

```js
// src/three/board.js — updateBoardParallax
const isNight = typeof document !== 'undefined' && document.body?.classList?.contains('night-bench');
const speedMod = isNight ? 0.65 : 1.0;
const ampMod = isNight ? 0.75 : 1.0;

boardGroup.position.y = Math.sin(elapsed * 0.55 * speedMod) * FLOAT_AMP_Y * wake * focusDamp * distScale * ampMod;
boardGroup.position.z = Math.cos(elapsed * 0.37 * speedMod) * FLOAT_AMP_Z * wake * focusDamp * distScale * ampMod;
boardGroup.rotation.z = Math.sin(elapsed * 0.31 * speedMod) * FLOAT_AMP_ROLL * wake * focusDamp * distScale * ampMod;
```

## Verification

- `npm run typecheck`: passes with 0 errors.
- `npm run smoke`: passes without NaN or out-of-bounds float values.
- Reduced motion: verified board remains planted at $y=0, z=0, \text{rot}=0$.
