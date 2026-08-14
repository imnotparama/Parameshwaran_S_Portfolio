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
//   - the D1-D7 LED array pulse stays within [base, peak]
//   - the ambient signal pulses (one per trace route) stay on the board
//   - the idle camera-drift offset is bounded and deterministic, and
//     noteInteraction resets the idle clock
//   - NO NaN / Infinity in any mesh position, scale, rotation, or material
//     emissiveIntensity / opacity
//   - with motionPrefs.reduced forced true, everything goes STATIC:
//     float planted, ripple frozen, sweep + dust + pulses hidden
//   - the RAYCAST LAYER: a real camera + the app's own initHover/checkHover,
//     driven through the DOM mousemove path, must hit the component under the
//     cursor across a sweep of camera poses — this asserts the canvas-rect
//     pointer→NDC conversion AND the raycast pipeline together (the pre-fix
//     window-relative conversion would aim ~21%-of-window left and fail)
//
// No DOM, no WebGL, no dependencies: a minimal window/document shim is
// installed BEFORE the modules import (the modules guard all their real
// DOM/2D-context usage — a null 2d context falls back to a blank texture).
//
// Excluded from the pipeline (DOM-bound, out of the invariants' scope):
// updateProbe (needs activation), updateJourneyEffects (DOM panel/connector).
//
// Run: npm run smoke
// ============================================================
import assert from 'node:assert';
import gsap from 'gsap';

// ── 1. Minimal DOM shim (must precede every app import) ────────
const classSet = new Set(['full-journey']);
// Window event registry — initHover's mousemove listener must actually run
// for the raycast phase, so the shim records listeners and dispatchEvent
// fires them (a real browser does this for us).
const windowListeners = {};
globalThis.window = {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    // Query-aware: '(pointer: fine)' matches (the raycast phase needs a fine
    // pointer), everything else (prefers-reduced-motion) doesn't.
    matchMedia: (q) => ({ matches: q.includes('pointer: fine'), addEventListener() {}, addListener() {} }),
    addEventListener: (type, fn) => { (windowListeners[type] ||= []).push(fn); },
    dispatchEvent: (e) => { (windowListeners[e.type] || []).forEach((fn) => fn(e)); },
    AudioContext: undefined,
    webkitAudioContext: undefined
};
// The canvas the raycast phase aims at — the 58% desktop split (742.4 of
// 1280, left-anchored). The phase-C camera frustum matches this rect, so the
// canvas-relative NDC conversion is what makes the raycast land.
const FAKE_CANVAS_RECT = { left: 0, top: 0, width: 742.4, height: 720, right: 742.4, bottom: 720 };
const FAKE_CANVAS = {
    getBoundingClientRect: () => FAKE_CANVAS_RECT,
    addEventListener: () => {},
    style: {}
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
    // The raycast phase drives initHover's real DOM path: it caches this
    // canvas and converts pointer→NDC against its rect, so the rect must
    // model the desktop 58% split. Any other id stays null (modules guard).
    getElementById: (id) => (id === 'threejs-canvas' ? FAKE_CANVAS : null),
    querySelector: () => null,
    querySelectorAll: () => []
};
globalThis.matchMedia = globalThis.window.matchMedia;

// ── 2. Import the real modules (same instances the app uses) ──
const THREE = await import('three');
const { tickCallbacks } = await import('../src/three/scene.js');
const board = await import('../src/three/board.js');
const { createComponents, updateRadarRing, updateLedArray, interactiveObjects } = await import('../src/three/components.js');
const { createTraces, updateTraceCurrent, updateTraceRipple, updateAmbientPulses } = await import('../src/three/traces.js');
const idle = await import('../src/three/idle.js');
const { createParticles, updateParticles, updateAmbientDust, updateAmbientGoldFlecks } = await import('../src/three/particles.js');
const { createProjectChips, updateProjectChips } = await import('../src/three/project-chips.js');
const { mouse, initHover, checkHover, clearHover } = await import('../src/utils/hover.js');
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
// Ambient signal pulses share the copper's gold emissive (0xc8960c) — exclude
// them from the ripple classifier: their constant 1.4 is not a ripple wave
// (the ripple bound [0.4, 1.15] would otherwise false-positive on them).
const pulseMats = new Set(
    allMeshes.filter((m) => m.name === 'ambient-pulse').map((m) => /** @type {any} */ (m.material))
);
const rippleMats = [...allMaterials].filter(
    (m) => !pulseMats.has(m) && m.emissive && typeof m.emissive.getHex === 'function' && m.emissive.getHex() === 0xc8960c && typeof m.emissiveIntensity === 'number'
);
// Sweep = the thin additive planes (0.05 / 0.4 wide); the CPU's silicon die is
// also an additive PlaneGeometry (1.6×1.6) — width < 1 excludes it.
const sweepMeshes = allMeshes.filter(
    (m) => m.geometry && m.geometry.type === 'PlaneGeometry' && m.material && m.material.isMeshBasicMaterial && m.material.blending === 2 && m.geometry.parameters && m.geometry.parameters.width < 1
);
const dustMeshes = allMeshes.filter(
    (m) => m.geometry && m.geometry.type === 'SphereGeometry' && m.material && m.material.isMeshBasicMaterial && m.material.blending === 2
);
// The hover shadow lives on the SCENE (not boardGroup — a shadow doesn't
// ride the board's roll), so it's outside allMeshes: grab it by name.
const shadowBlob = sc.children.find((o) => o.name === 'hover-shadow');
assert.ok(shadowBlob, 'expected the hover-shadow blob on the scene');
assert.ok(shadowBlob.geometry && shadowBlob.geometry.type === 'PlaneGeometry', 'hover-shadow must be a plane');
const fleckMeshes = [];
boardGroup.traverse((o) => { if (o.isMesh && o.name === 'gold-fleck') fleckMeshes.push(o); });
assert.strictEqual(fleckMeshes.length, 12, 'expected 12 gold flecks');
const pulseMeshes = [];
boardGroup.traverse((o) => { if (o.isMesh && o.name === 'ambient-pulse') pulseMeshes.push(o); });
assert.strictEqual(pulseMeshes.length, 10, `expected one ambient pulse per trace route, got ${pulseMeshes.length}`);
const ledDomeMats = allMeshes
    .filter((m) => m.name && String(m.name).startsWith('led_diode'))
    .map((m) => /** @type {any} */ (m.material));
assert.strictEqual(ledDomeMats.length, 7, 'expected 7 D1-D7 LED domes');
assert.ok(rippleMats.length > 0, 'expected copper ripple segment materials');
assert.strictEqual(sweepMeshes.length, 2, 'expected the sweep lead + trail');
assert.strictEqual(dustMeshes.length, 32, 'expected 32 dust motes');

// ── 4. Register the real tick pipeline (main.js order) ────────
tickCallbacks.push((elapsed, delta) => {
    updateParticles(delta);
    updateRadarRing(elapsed);
    updateLedArray(elapsed);
    updateProjectChips(elapsed);
    // journeyLive=true, focusMode=false → the float runs at full wake
    board.updateBoardParallax(elapsed, mouse, delta, 'sec-about', true, false);
    board.updateHoverShadow();
    updateAmbientDust(elapsed);
    updateAmbientGoldFlecks(elapsed);
    updateTraceCurrent(elapsed, 'sec-about');
    updateAmbientPulses(elapsed);
    updateTraceRipple(elapsed);
    board.updateBenchSweep(elapsed);
    // Idle drift: camera is null headlessly, so this exercises the no-op
    // guard (the offset bounds themselves are asserted in phase D).
    idle.updateIdleDrift(elapsed, delta);
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
const EPS = 1e-6;
const DUST_X_MAX = 7 + 0.5;
const DUST_Y_MAX = 8 + 0.65;
const DUST_Z_MIN = -1 - 0.4;
const DUST_Z_MAX = 2 + 0.4;
// Hover shadow: opacity maps the float height (y ∈ ±FLOAT_AMP_Y), scale
// breathes ±6% with the depth motion; flecks drift in a box above the board.
const SHADOW_OPACITY_MIN = 0.12;
const SHADOW_OPACITY_MAX = 0.34;
const SHADOW_SCALE_MAX = 1 + 0.06 + EPS;
const SHADOW_SCALE_MIN = 1 - 0.06 - EPS;
const FLECK_X_MAX = 5.5 + 0.6;
const FLECK_Y_MAX = 0.8 + 2.4 + 0.45;
const FLECK_Y_MIN = 0.8 - 0.45;
const FLECK_Z_MIN = -0.3 - 0.5;
const FLECK_Z_MAX = -0.3 + 2.3 + 0.5;
// D1-D7 LED array pulse: base 0.1 → peak 0.7 (LED_PULSE_BASE/AMP in components.js).
const LED_PULSE_BASE = 0.1;
const LED_PULSE_MAX = 0.7;
// Ambient pulses travel trace routes — CatmullRom overshoot stays well inside
// the board (trace points span ±5.5 × ±7.5); bound with margin.
const PULSE_X_MAX = 8;
const PULSE_Y_MAX = 8.5;
// Idle drift: pure offset bounds at the default (hero-framing) amplitude.
const DRIFT_AMP_DEFAULT = 0.0022 * 23;
const DRIFT_X_MAX = DRIFT_AMP_DEFAULT + EPS;
const DRIFT_Y_MAX = DRIFT_AMP_DEFAULT * 0.75 + EPS;

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
    // D1-D7 LED array pulse bounds:
    for (const m of ledDomeMats) {
        const i = m.emissiveIntensity;
        if (i < LED_PULSE_BASE - EPS || i > LED_PULSE_MAX + EPS) problems.push(`led pulse ${i}`);
    }
    // Ambient signal pulses stay on the board:
    for (const m of pulseMeshes) {
        if (Math.abs(m.position.x) > PULSE_X_MAX + EPS) problems.push(`pulse x ${m.position.x}`);
        if (Math.abs(m.position.y) > PULSE_Y_MAX + EPS) problems.push(`pulse y ${m.position.y}`);
    }
    // Hover shadow (scene-level, outside allMeshes):
    const smat = shadowBlob.material;
    if (smat.opacity < SHADOW_OPACITY_MIN - EPS || smat.opacity > SHADOW_OPACITY_MAX + EPS) problems.push(`shadow opacity ${smat.opacity}`);
    if (shadowBlob.scale.x < SHADOW_SCALE_MIN || shadowBlob.scale.x > SHADOW_SCALE_MAX) problems.push(`shadow scale ${shadowBlob.scale.x}`);
    // Gold flecks:
    for (const m of fleckMeshes) {
        if (abs(m.position.x) > FLECK_X_MAX + EPS) problems.push(`fleck x ${m.position.x}`);
        if (m.position.y < FLECK_Y_MIN - EPS || m.position.y > FLECK_Y_MAX + EPS) problems.push(`fleck y ${m.position.y}`);
        if (m.position.z < FLECK_Z_MIN - EPS || m.position.z > FLECK_Z_MAX + EPS) problems.push(`fleck z ${m.position.z}`);
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

// ── 6. Phase C — the raycast layer (hover alignment) ─────────
// A real PerspectiveCamera plus the app's own initHover/checkHover, driven
// through the DOM mousemove path. The camera frustum matches the FAKE_CANVAS
// rect (the 58% split), so the canvas-relative pointer→NDC conversion is
// what makes the ray land on the component under the cursor. Sweeps six
// poses around the board and asserts checkHover's reported hover matches an
// INDEPENDENT raycast at the same NDC for every aimable component (both rays
// see the same world, so occlusion resolves identically — any conversion or
// raycast drift shows up as a mismatch).
const CAM = new THREE.PerspectiveCamera(50, FAKE_CANVAS_RECT.width / FAKE_CANVAS_RECT.height, 0.1, 100);
initHover(CAM, sc);
const hoverTargets = interactiveObjects.filter((o) => o.userData && o.userData.isInteractive);
const independentRay = new THREE.Raycaster();
const RAY_POSES = [
    { p: [0, 0, 13],    l: [0, 0, 0] },  // straight-on, board centered
    { p: [9, 4, 12],    l: [0, 0, 0] },  // high side
    { p: [-8, 5, 14],   l: [0, 0, 0] },  // low side
    { p: [0, -6, 12],   l: [0, 0, 0] },  // low front
    { p: [6, 7, 11],    l: [0, 0, 0] },  // steep high
    { p: [0, 2, 5],     l: [0, 0, 0] }   // close-up
];
const scratch = new THREE.Vector3();
const ndcV = new THREE.Vector2();
let rayAimed = 0;
const rayMisses = [];
const aimedNames = new Set();
for (const pose of RAY_POSES) {
    CAM.position.set(pose.p[0], pose.p[1], pose.p[2]);
    CAM.lookAt(pose.l[0], pose.l[1], pose.l[2]);
    CAM.updateMatrixWorld(true);
    sc.updateMatrixWorld(true);
    for (const mesh of hoverTargets) {
        mesh.getWorldPosition(scratch);
        scratch.project(CAM);
        if (scratch.z > 1) continue; // behind the camera
        if (Math.abs(scratch.x) > 0.95 || Math.abs(scratch.y) > 0.95) continue; // off-canvas
        const px = (scratch.x + 1) / 2 * FAKE_CANVAS_RECT.width + FAKE_CANVAS_RECT.left;
        const py = (1 - scratch.y) / 2 * FAKE_CANVAS_RECT.height + FAKE_CANVAS_RECT.top;
        // Independent expected hit at the same NDC (the world checkHover sees):
        independentRay.setFromCamera(ndcV.set(scratch.x, scratch.y), CAM);
        const expected = independentRay.intersectObjects(hoverTargets, false)[0];
        if (!expected) continue;
        // Drive the app's hover through the real DOM path — updateMouseCoords
        // converts these pixels against the FAKE_CANVAS rect (canvas-relative):
        window.dispatchEvent(Object.assign(new Event('mousemove'), { clientX: px, clientY: py }));
        checkHover(1 / 60); checkHover(1 / 60); checkHover(1 / 60); // ≥1 raycast (3-frame throttle)
        const got = document.body.dataset.hoverRef || '';
        rayAimed++;
        aimedNames.add(mesh.name);
        if (got !== expected.object.name) {
            rayMisses.push({ pose: pose.p.join(','), aim: mesh.name, expected: expected.object.name, got });
        }
    }
}
// Clean the hover state before phase B: release the final hover through the
// proper path (un-energizes the copper feeding it), kill the glow tweens,
// reset scales — and force the copper back to its ripple base, because the
// release tween can't be relied on to complete in Node's tickless
// environment (a frozen energized mat at 1.5 would violate the ripple bound).
clearHover();
gsap.killTweensOf(sc.children); // includes the hover light
gsap.killTweensOf([...allMeshes, ...allMaterials]);
for (const m of allMeshes) m.scale.setScalar(1);
for (const m of rippleMats) m.emissiveIntensity = RIPPLE_BASE;
assert.ok(rayAimed > 20, `raycast phase: expected many aimable component-poses, got ${rayAimed}`);
assert.ok(rayMisses.length === 0, `hover misaligned (checkHover ≠ independent ray at same NDC):\n  - ${rayMisses.slice(0, 8).map((m) => JSON.stringify(m)).join('\n  - ')}`);

// ── 7. Phase B — reduced motion forces everything static ─────
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
// Sweep + dust + flecks + ambient pulses hidden:
for (const m of sweepMeshes) assert.ok(!m.visible, 'reduced: sweep must be hidden');
for (const m of dustMeshes) assert.ok(!m.visible, 'reduced: dust must be hidden');
for (const m of fleckMeshes) assert.ok(!m.visible, 'reduced: flecks must be hidden');
for (const m of pulseMeshes) assert.ok(!m.visible, 'reduced: ambient pulses must be hidden');
// Shadow static at the mid opacity (the planted board's grounding) and
// scale 1 — it lives outside allMaterials, so check it explicitly:
assert.ok(
    Math.abs(shadowBlob.material.opacity - (SHADOW_OPACITY_MIN + SHADOW_OPACITY_MAX) / 2) < EPS &&
    shadowBlob.scale.x === 1,
    `reduced: hover shadow must hold still (opacity ${shadowBlob.material.opacity}, scale ${shadowBlob.scale.x})`
);
// And the whole graph still finite:
const reducedProblems = audit();
assert.ok(reducedProblems.length === 0, `reduced-motion run produced audit violations:\n  - ${reducedProblems.slice(0, 8).join('\n  - ')}`);

// ── 8. Phase D — idle-drift layer (bounds + determinism) ─────
// The camera micro-drift offset must be a pure deterministic function of
// elapsed time, bounded by its amplitude — and an interaction resets the
// idle clock (noteInteraction → isIdle false immediately). updateIdleDrift
// itself is already exercised as a no-op guard in the tick pipeline (the
// headless scene has no camera); the applied compose is a 3-line delta.
const driftA = idle.idleDriftOffset(123.456);
const driftB = idle.idleDriftOffset(123.456);
assert.ok(Math.abs(driftA.x) <= DRIFT_X_MAX, `drift x out of bounds ${driftA.x}`);
assert.ok(Math.abs(driftA.y) <= DRIFT_Y_MAX, `drift y out of bounds ${driftA.y}`);
assert.strictEqual(driftA.x, driftB.x, 'drift must be deterministic');
assert.strictEqual(driftA.y, driftB.y, 'drift must be deterministic');
idle.noteInteraction();
assert.ok(!idle.isIdle(), 'isIdle() must be false right after an interaction');

// ── 9. Report ─────────────────────────────────────────────────
console.log('── tick smoke test: PASS ────────────────────────────');
console.log(`  graph: ${allMeshes.length} meshes, ${allMaterials.size} materials`);
console.log(`  ripple segments: ${rippleMats.length} | sweep: 2 | dust: ${dustMeshes.length} | pulses: ${pulseMeshes.length} | LEDs: ${ledDomeMats.length}`);
console.log(`  phase A: ${NORMAL_FRAMES} frames normal motion — float/ripple/sweep/dust/LED/pulse in bounds, zero NaN`);
console.log(`    wake-in first tick y = ${firstTickY} (no settle-pop)`);
console.log(`    final float y = ${boardGroup.position.y.toFixed(4)} (|y| ≤ ${FLOAT_AMP_Y})`);
console.log(`  phase B: reduced-motion run — float planted, ${allMaterials.size} materials frozen, sweep + dust + pulses hidden`);
console.log(`  phase C: raycast layer — ${rayAimed} aimable component-poses (${aimedNames.size} unique components) across ${RAY_POSES.length} camera poses, hover === independent ray at the same NDC (${rayAimed - rayMisses.length}/${rayAimed})`);
console.log(`  phase D: idle drift — offset bounds |x| ≤ ${DRIFT_X_MAX.toFixed(3)}, |y| ≤ ${DRIFT_Y_MAX.toFixed(3)}, deterministic, interaction resets the clock`);
console.log(`  ambient: hover shadow (opacity ${shadowBlob.material.opacity.toFixed(2)}) + ${fleckMeshes.length} gold flecks + ${ledDomeMats.length} pulsing LEDs, all in bounds, hidden/frozen under reduced motion`);
