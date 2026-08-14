// ============================================================
// Headless deterministic smoke test — the real motion pipeline.
//
// Builds the actual board modules (createBoard / createComponents /
// createTraces / createParticles / createProjectChips) into a bare THREE
// scene, registers the SAME tick callbacks main.js registers (same order,
// same module instances), drives them over a simulated time window, and
// asserts the motion invariants:
//
//   - levitation stays inside its amplitude bounds (and starts from 0 —
//     the wake-in kills the settle-pop)
//   - the copper ripple stays within [base, base + amp]
//   - the bench sweep stays on the board and under its opacity ceiling
//   - the dust motes stay inside their drift box
//   - NO NaN / Infinity in any mesh position, scale, rotation, or material
//     emissiveIntensity / opacity
//   - with motionPrefs.reduced forced true, everything goes STATIC:
//     float planted, ripple frozen, sweep + dust hidden
//
// No DOM, no WebGL, no dependencies: a minimal window/document shim is
// installed BEFORE the modules import (the modules guard all their real
// DOM/2D-context usage — a null 2d context falls back to a blank texture).
//
// Excluded from the pipeline (camera/raycast/DOM-bound, out of the motion
// invariants' scope): checkHover (needs a raycaster + camera), updateProbe
// (needs the probe activated), updateJourneyEffects (DOM panel/connector).
//
// Run: npm run smoke
// ============================================================
import assert from 'node:assert';

// ── 1. Minimal DOM shim (must precede every app import) ────────
const classSet = new Set(['full-journey']);
globalThis.window = {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener() {},
    AudioContext: undefined,
    webkitAudioContext: undefined
};
globalThis.document = {
    body: {
        classList: {
            contains: (c) => classSet.has(c),
            add: (c) => classSet.add(c),
            remove: (c) => classSet.delete(c)
        },
        style: {},
        dataset: {}
    },
    // A canvas that yields no 2d context — every consumer guards for that
    // and falls back to a blank texture (board.js silkscreen, components.js
    // silicon die).
    createElement: (tag) => ({ tagName: String(tag).toUpperCase(), width: 0, height: 0, style: {}, getContext: () => null }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
};
globalThis.matchMedia = globalThis.window.matchMedia;

// ── 2. Import the real modules (same instances the app uses) ──
const THREE = await import('three');
const { tickCallbacks } = await import('../src/three/scene.js');
const board = await import('../src/three/board.js');
const { createComponents, updateRadarRing } = await import('../src/three/components.js');
const { createTraces, updateTraceCurrent, updateTraceRipple } = await import('../src/three/traces.js');
const { createParticles, updateParticles, updateAmbientDust } = await import('../src/three/particles.js');
const { createProjectChips, updateProjectChips } = await import('../src/three/project-chips.js');
const { mouse } = await import('../src/utils/hover.js');
const { motionPrefs } = await import('../src/utils/motion-prefs.js');

// NOTE: `board.boardGroup` is read via the module namespace GETTER after
// createBoard runs — destructuring would snapshot the pre-create `undefined`.
assert.ok(board.boardGroup === undefined, 'boardGroup must start unset before createBoard');

// ── 3. Build the board ─────────────────────────────────────────
const sc = new THREE.Scene();
board.createBoard(sc);
const boardGroup = board.boardGroup;
createComponents(boardGroup);
createTraces(boardGroup);
createParticles(boardGroup);
createProjectChips(boardGroup);

// Snapshot the scene graph once — all assertions reuse these sets.
const allMeshes = [];
const allMaterials = new Set();
boardGroup.traverse((o) => {
    if (!o.isMesh) return;
    allMeshes.push(o);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => { if (m) allMaterials.add(m); });
});
assert.ok(allMeshes.length > 40, `expected a full board graph, got ${allMeshes.length} meshes`);

// Structural classifiers:
const rippleMats = [...allMaterials].filter(
    (m) => m.emissive && typeof m.emissive.getHex === 'function' && m.emissive.getHex() === 0xc8960c && typeof m.emissiveIntensity === 'number'
);
// Sweep = the thin additive planes (0.05 / 0.4 wide); the CPU's silicon die is
// also an additive PlaneGeometry (1.6×1.6) — width < 1 excludes it.
const sweepMeshes = allMeshes.filter(
    (m) => m.geometry && m.geometry.type === 'PlaneGeometry' && m.material && m.material.isMeshBasicMaterial && m.material.blending === 2 && m.geometry.parameters && m.geometry.parameters.width < 1
);
const dustMeshes = allMeshes.filter(
    (m) => m.geometry && m.geometry.type === 'SphereGeometry' && m.material && m.material.isMeshBasicMaterial && m.material.blending === 2
);
assert.ok(rippleMats.length > 0, 'expected copper ripple segment materials');
assert.strictEqual(sweepMeshes.length, 2, 'expected the sweep lead + trail');
assert.strictEqual(dustMeshes.length, 32, 'expected 32 dust motes');

// ── 4. Register the real tick pipeline (main.js order) ────────
tickCallbacks.push((elapsed, delta) => {
    updateParticles(delta);
    updateRadarRing(elapsed);
    updateProjectChips(elapsed);
    // journeyLive=true, focusMode=false → the float runs at full wake
    board.updateBoardParallax(elapsed, mouse, delta, 'sec-about', true, false);
    updateAmbientDust(elapsed);
    updateTraceCurrent(elapsed, 'sec-about');
    updateTraceRipple(elapsed);
    board.updateBenchSweep(elapsed);
});

// Invariant bounds — pulled from the source constants:
const FLOAT_AMP_Y = 0.16;
const FLOAT_AMP_Z = 0.07;
const FLOAT_AMP_ROLL = 0.012;
const ABOUT_MAX_TILT = 0.03; // the About boost's ±1.7° ceiling (maxTilt)
const RIPPLE_BASE = 0.4;
const RIPPLE_MAX = 0.4 + 0.75; // base + amp
const SWEEP_MIN_X = -5.2;
const SWEEP_MAX_X = -5.2 + 10.4;
const SWEEP_LEAD_OPACITY_MAX = 0.15;
const SWEEP_TRAIL_OPACITY_MAX = 0.06;
const DUST_X_MAX = 7 + 0.5;
const DUST_Y_MAX = 8 + 0.65;
const DUST_Z_MIN = -1 - 0.4;
const DUST_Z_MAX = 2 + 0.4;
const EPS = 1e-6;

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Count violations + scan for non-finite values across the whole graph. */
function audit() {
    const problems = [];
    const abs = (v) => Math.abs(v);
    // Float (group pose):
    if (abs(boardGroup.position.y) > FLOAT_AMP_Y + EPS) problems.push(`float y ${boardGroup.position.y}`);
    if (abs(boardGroup.position.z) > FLOAT_AMP_Z + EPS) problems.push(`float z ${boardGroup.position.z}`);
    if (abs(boardGroup.rotation.z) > FLOAT_AMP_ROLL + EPS) problems.push(`float roll ${boardGroup.rotation.z}`);
    // Cursor tilt (About boost): whatever the mouse input, the board tilt must
    // never exceed the ±maxTilt ceiling.
    if (abs(boardGroup.rotation.x) > ABOUT_MAX_TILT + EPS) problems.push(`tilt x ${boardGroup.rotation.x}`);
    if (abs(boardGroup.rotation.y) > ABOUT_MAX_TILT + EPS) problems.push(`tilt y ${boardGroup.rotation.y}`);
    // Sweep: lead = the 0.05-wide plane, trail = the 0.4-wide one.
    for (const m of sweepMeshes) {
        if (m.position.x < SWEEP_MIN_X - EPS || m.position.x > SWEEP_MAX_X + EPS) problems.push(`sweep x ${m.position.x}`);
        const cap = m.geometry.parameters.width < 0.1 ? SWEEP_LEAD_OPACITY_MAX : SWEEP_TRAIL_OPACITY_MAX;
        if (m.material.opacity > cap + EPS) problems.push(`sweep opacity ${m.material.opacity}`);
    }
    // Dust:
    for (const m of dustMeshes) {
        if (abs(m.position.x) > DUST_X_MAX + EPS) problems.push(`dust x ${m.position.x}`);
        if (abs(m.position.y) > DUST_Y_MAX + EPS) problems.push(`dust y ${m.position.y}`);
        if (m.position.z < DUST_Z_MIN - EPS || m.position.z > DUST_Z_MAX + EPS) problems.push(`dust z ${m.position.z}`);
    }
    // Ripple:
    for (const m of rippleMats) {
        const i = m.emissiveIntensity;
        if (i < RIPPLE_BASE - EPS || i > RIPPLE_MAX + EPS) problems.push(`ripple ${i}`);
    }
    // Non-finite scan (the "no NaN" invariant):
    for (const m of allMeshes) {
        for (const p of [m.position.x, m.position.y, m.position.z]) if (!isFiniteNum(p)) problems.push(`NaN pos ${m.name || m.uuid}`);
        for (const p of [m.scale.x, m.scale.y, m.scale.z]) if (!isFiniteNum(p)) problems.push(`NaN scale ${m.name || m.uuid}`);
        for (const p of [m.rotation.x, m.rotation.y, m.rotation.z]) if (!isFiniteNum(p)) problems.push(`NaN rotation ${m.name || m.uuid}`);
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
            if (!mat) continue;
            if (typeof mat.emissiveIntensity === 'number' && !isFiniteNum(mat.emissiveIntensity)) problems.push(`NaN emissiveIntensity ${mat.uuid}`);
            if (typeof mat.opacity === 'number' && !isFiniteNum(mat.opacity)) problems.push(`NaN opacity ${mat.uuid}`);
        }
    }
    return problems;
}

// ── 5. Phase A — normal motion over a long window ─────────────
// 12000 frames @ 60fps ≈ 200s of sim: covers ~18 float periods, ~33 sweep
// crossings, and many ripple wavelengths (the "no drift over time" check).
const DT = 1 / 60;
const NORMAL_FRAMES = 12000;
let firstTickY = null;
for (let i = 0; i < NORMAL_FRAMES; i++) {
    // Sweep the cursor through a deterministic orbit so the tilt (and its
    // clamp) is exercised across the whole input range, not just the origin.
    mouse.set(Math.sin(i * 0.013), Math.cos(i * 0.011));
    tickCallbacks.forEach((cb) => cb(i * DT, DT));
    if (i === 0) firstTickY = boardGroup.position.y;
}
const normalProblems = audit();
assert.ok(firstTickY === 0, `wake-in: first live tick must write y=0 (settle-pop guard), got ${firstTickY}`);
assert.ok(normalProblems.length === 0, `normal-motion invariants violated:\n  - ${normalProblems.join('\n  - ')}`);

// ── 6. Phase B — reduced motion forces everything static ─────
motionPrefs.reduced = true; // the live flag — same switch the listener flips
// Drive ONE settle tick first: project-chips.js snaps the LEDs to their calm
// powered values (flicker → 0.7, steady → 1.4) on the transition into reduced
// mode — a deliberate one-time settle, not motion. The snapshot happens
// AFTER it, so the assertion is "nothing moves once reduced" (plus the float
// is checked separately below, since it must not move at all).
tickCallbacks.forEach((cb) => cb(200, DT));
const floatPose = { y: boardGroup.position.y, z: boardGroup.position.z, rz: boardGroup.rotation.z };
const materialSnap = [...allMaterials].map((m) => ({ ei: m.emissiveIntensity, op: m.opacity }));
for (let i = 1; i < 2000; i++) {
    tickCallbacks.forEach((cb) => cb(200 + i * DT, DT));
}
// Float stays planted:
assert.ok(
    Math.abs(boardGroup.position.y - floatPose.y) < EPS &&
    Math.abs(boardGroup.position.z - floatPose.z) < EPS &&
    Math.abs(boardGroup.rotation.z - floatPose.rz) < EPS,
    'reduced motion: the float must not move'
);
// Every material frozen (ripple, LED breathe, radar, current dot):
[...allMaterials].forEach((m, idx) => {
    const snap = materialSnap[idx];
    if (typeof m.emissiveIntensity === 'number') assert.ok(Math.abs(m.emissiveIntensity - snap.ei) < EPS, `reduced: emissiveIntensity moved on ${m.uuid}`);
    if (typeof m.opacity === 'number') assert.ok(Math.abs(m.opacity - snap.op) < EPS, `reduced: opacity moved on ${m.uuid}`);
});
// Sweep + dust hidden:
for (const m of sweepMeshes) assert.ok(!m.visible, 'reduced: sweep must be hidden');
for (const m of dustMeshes) assert.ok(!m.visible, 'reduced: dust must be hidden');
// And the whole graph still finite:
assert.ok(audit().length === 0, 'reduced-motion run produced non-finite values');

// ── 7. Report ─────────────────────────────────────────────────
console.log('── tick smoke test: PASS ────────────────────────────');
console.log(`  graph: ${allMeshes.length} meshes, ${allMaterials.size} materials`);
console.log(`  ripple segments: ${rippleMats.length} | sweep: 2 | dust: ${dustMeshes.length}`);
console.log(`  phase A: ${NORMAL_FRAMES} frames normal motion — float/ripple/sweep/dust in bounds, zero NaN`);
console.log(`    wake-in first tick y = ${firstTickY} (no settle-pop)`);
console.log(`    final float y = ${boardGroup.position.y.toFixed(4)} (|y| ≤ ${FLOAT_AMP_Y})`);
console.log(`  phase B: reduced-motion run — float planted, ${allMaterials.size} materials frozen, sweep + dust hidden`);
