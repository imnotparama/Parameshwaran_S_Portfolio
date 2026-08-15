# 014 — Bench sweep component-energizing proximity reaction

- **Status**: DONE (executed 2026-08)
- **Severity**: LOW
- **Category**: Physicality & Ambient Delight
- **Estimated scope**: 1 file (`src/three/board.js`), ~15 lines

## Problem

The bench sweep laser line crosses the board periodically (`SWEEP_PERIOD = 6s`) as an ambient instrumentation feature. While the laser line swept across the board, components remained entirely unreactive to its passage, missing an opportunity for tactile physical feedback that an instrument is actively scanning the circuit substrate.

## Target

As the laser line sweeps across the PCB X-axis:
1. Compute the proximity of `sweepLead.position.x` to the major chip components (such as U1 CPU at $X=0$).
2. Within a narrow proximity window ($\pm 0.45$ units), apply a momentary emissive/opacity boost ($+0.15 \times \text{envelope}$) to the silicon die grid (`siliconDieMesh.material.opacity`).
3. Gated strictly behind `!motionPrefs.reduced`: when reduced-motion is enabled, the sweep is hidden and component opacities stay fixed at baseline ($0.8$).

```js
// src/three/board.js — updateBenchSweep
if (siliconDieMesh && siliconDieMesh.material instanceof THREE.MeshBasicMaterial) {
    const distU1 = Math.abs(leadX - 0);
    if (distU1 < 0.45) {
        const proximityBoost = (1 - distU1 / 0.45) * env * 0.15;
        siliconDieMesh.material.opacity = 0.8 + proximityBoost;
    } else {
        siliconDieMesh.material.opacity = 0.8;
    }
}
```

## Verification

- `npm run typecheck`: passes with 0 errors.
- `npm run smoke`: 12,000 frames pass motion invariants without NaN or unbounded opacity.
- Reduced motion: verified that `siliconDieMesh.material.opacity` resets to baseline 0.8.
