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
//   - at hero camera distance (distScale=3) the SCALED float amplitudes stay
//     in bounds, the shadow clamp holds, and the sweep widens exactly by the
//     scale while staying on the board
//   - the hero camera pose (getCameraConfigForStop) projects the board center
//     onto the sidebar panel's center line (per-viewport alignment)
//   - the snap layer's pure math: computeDirectionalStop (next/prev stop with
//     the 2px no-re-target tolerance + end clamping) and wheelStepQueue
//     (delta → capped section steps with the accumulator carry) and stepQueue
//     (the shared wheel/keyboard queue clamp), including the burst invariant
//     that N notches or N keypresses chain at most MAX_QUEUED_STEPS glides
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
    webkitAudioContext: undefined,
    // In-memory localStorage — lets the high-score phase observe the
    // persistence write without touching the real disk.
    localStorage: (() => {
        const m = new Map();
        return {
            getItem: (k) => (m.has(k) ? m.get(k) : null),
            setItem: (k, v) => { m.set(k, String(v)); },
            removeItem: (k) => { m.delete(k); }
        };
    })()
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
const { createLcd, updateLcdScreen, focusLcd, exitLcd, isLcdActive, lcdStateSnapshot, getBestScore, setBestListener } = await import('../src/three/lcd.js');
const { mouse, initHover, checkHover, clearHover } = await import('../src/utils/hover.js');
const { motionPrefs } = await import('../src/utils/motion-prefs.js');
// journey.js's getCameraConfigForStop exports the per-viewport hero pose —
// the alignment assertion (phase A3) projects its board center and checks it
// lands on the panel's center line. computeDirectionalStop + wheelStepQueue
// are the snap layer's PURE seams (phase A4) — the DOM wheel path isn't
// headless-testable. Safe headless: module top-level only registers
// ScrollTrigger plugins + guarded load listeners (no ScrollTrigger instances
// until initJourney, which the test never calls).
const { getCameraConfigForStop, computeDirectionalStop, wheelStepQueue, stepQueue } = await import('../src/scroll/journey.js');

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
// LCD1 — the shim's null 2d context skips the screen quad, but the meshes
// join the graph and the game state initializes so the deterministic
// simulation (phase E) is exercisable through the same tick seam.
createLcd(boardGroup);

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
    // LCD1's screen — attract demo / player run (mirrors main.js order).
    updateLcdScreen(elapsed, delta);
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

// ── 5a2. Phase F — per-section ambient signatures ─────────────
// SECTION_AMBIENT gives every journey stop its own circuit-neighborhood
// tuning (LED pulse tempo/brightness, ripple wave shape, signal-pulse
// speed, dust/fleck density, current-dot speed). The long-run phase above
// exercised only the 'sec-about' baseline — drive EVERY section through the
// real update fns and reuse audit() to pin the invariant bounds for each
// signature: LED [base, peak], ripple [base, base+amp], dust/fleck drift
// boxes, no NaN. Also assert the multipliers are sane and the amplitude
// caps (ledAmp / rippleAmp / drift ≤ 1.0) are respected, so the bounds are
// mathematically guaranteed for every future tuning too.
const { SECTION_AMBIENT } = await import('../src/three/ambient-tunings.js');
const SECTION_IDS = ['sec-hero', 'sec-about', 'sec-projects', 'sec-skills', 'sec-experience', 'sec-contact'];
for (const id of SECTION_IDS) {
    assert.ok(SECTION_AMBIENT[id], `missing ambient signature for ${id}`);
}
for (const [id, s] of Object.entries(SECTION_AMBIENT)) {
    for (const [k, v] of Object.entries(s)) {
        assert.ok(Number.isFinite(v) && v >= 0, `${id}.${k} must be a finite non-negative multiplier (got ${v})`);
    }
    assert.ok(s.ledAmp <= 1.0, `${id}.ledAmp > 1.0 would break the LED peak ≤ 0.7 bound`);
    assert.ok(s.rippleAmp <= 1.0, `${id}.rippleAmp > 1.0 would break the ripple ≤ base+amp bound`);
    assert.ok(s.dustDrift <= 1.0 && s.fleckDrift <= 1.0, `${id} drift multipliers > 1.0 would break the drift-box bounds`);
}
// Bounds sweep: 5s of sim per section through the real update fns.
for (const id of SECTION_IDS) {
    for (let i = 0; i < 300; i++) {
        const t = i * DT;
        updateLedArray(t, id);
        updateAmbientDust(t, id);
        updateAmbientGoldFlecks(t, id);
        updateTraceRipple(t, id);
        updateAmbientPulses(t, id);
        updateTraceCurrent(t, id);
    }
    const problems = audit();
    assert.deepStrictEqual(problems, [], `phase F: ambient invariants broke at ${id}:\n  - ${problems.join('\n  - ')}`);
}

// ── 5b. Phase A2 — hero-distance amplitudes (distScale = 3) ──
// main.js scales the ambient amplitudes with camera distance so the hero
// framing (z≈25-33) reads alive instead of sub-pixel static: 1.0 at the
// component stops, ramping to ≤3 at hero. Drive the float, shadow, and sweep
// at the max scale and assert the SCALED bounds hold: float ≤ 3× its
// amplitude, the shadow stays inside its own (unscaled) bounds via its new
// clamp, the sweep widens by exactly the scale while still sweeping on the
// board, and nothing goes NaN.
const DIST_SCALE_MAX = 3;
for (let i = 0; i < 1200; i++) {
    mouse.set(Math.sin(i * 0.013), Math.cos(i * 0.011));
    board.updateBoardParallax(i * DT, mouse, DT, 'sec-about', true, false, DIST_SCALE_MAX);
    board.updateHoverShadow();
    board.updateBenchSweep(i * DT, DIST_SCALE_MAX);
}
assert.ok(Math.abs(boardGroup.position.y) <= FLOAT_AMP_Y * DIST_SCALE_MAX + EPS, `scaled float y ${boardGroup.position.y} exceeds ${FLOAT_AMP_Y * DIST_SCALE_MAX}`);
assert.ok(Math.abs(boardGroup.position.z) <= FLOAT_AMP_Z * DIST_SCALE_MAX + EPS, `scaled float z ${boardGroup.position.z} exceeds ${FLOAT_AMP_Z * DIST_SCALE_MAX}`);
assert.ok(Math.abs(boardGroup.rotation.z) <= FLOAT_AMP_ROLL * DIST_SCALE_MAX + EPS, `scaled float roll ${boardGroup.rotation.z} exceeds ${FLOAT_AMP_ROLL * DIST_SCALE_MAX}`);
assert.ok(
    shadowBlob.material.opacity >= SHADOW_OPACITY_MIN - EPS && shadowBlob.material.opacity <= SHADOW_OPACITY_MAX + EPS,
    `scaled float pushed the shadow outside its bounds (opacity ${shadowBlob.material.opacity.toFixed(3)})`
);
assert.ok(
    shadowBlob.scale.x >= SHADOW_SCALE_MIN && shadowBlob.scale.x <= SHADOW_SCALE_MAX,
    `scaled float pushed the shadow outside its bounds (scale ${shadowBlob.scale.x.toFixed(3)})`
);
for (const m of sweepMeshes) {
    assert.ok(Math.abs(m.scale.x - DIST_SCALE_MAX) < EPS, `sweep must widen exactly by distScale (${m.scale.x})`);
    assert.ok(m.position.x >= SWEEP_MIN_X - EPS && m.position.x <= SWEEP_MAX_X + EPS, `scaled sweep left the board (x ${m.position.x})`);
}
for (const v of [boardGroup.position.x, boardGroup.position.y, boardGroup.position.z, boardGroup.rotation.x, boardGroup.rotation.y, boardGroup.rotation.z]) {
    assert.ok(isFiniteNum(v), `NaN in scaled float pose (${v})`);
}
// Reset the pose the phase-C raycast poses were designed around (the float
// froze mid-swing at the max amplitude):
boardGroup.position.set(0, 0, 0);
boardGroup.rotation.set(0, 0, 0);
for (const m of sweepMeshes) m.scale.set(1, 1, 1);

// ── 5c. Phase A3 — hero panel alignment (per-viewport) ───────
// The datasheet sidebar is pinned top:84px / bottom:24px, so its center sits
// at h/2+30 — while the hero camera centers the board on the full canvas. A
// fixed offset can't fix the gap (it flips sign with aspect), so
// getCameraConfigForStop applies a per-viewport shift until the board's
// projected center lands on the panel's center line. Assert the returned
// pose does that at the shim viewport (742.4×800 canvas).
const heroCfg = getCameraConfigForStop('sec-hero');
const alignCam = new THREE.PerspectiveCamera(45, 742.4 / 800, 0.1, 1000);
alignCam.position.copy(heroCfg.pos);
alignCam.lookAt(heroCfg.look);
alignCam.updateMatrixWorld(true);
const heroBoardCenter = new THREE.Vector3(0, 0, 0.085).project(alignCam);
const heroBoardCenterPx = ((1 - heroBoardCenter.y) / 2) * 800;
const panelCenterPx = 800 / 2 + 30; // 84 + (800 - 108) / 2
assert.ok(
    Math.abs(heroBoardCenterPx - panelCenterPx) < 4,
    `hero alignment: board center ${heroBoardCenterPx.toFixed(1)}px vs panel center ${panelCenterPx}px (drift ${(heroBoardCenterPx - panelCenterPx).toFixed(1)}px)`
);

// ── 5d. Phase A4 — the snap layer's pure direction/queue math ─
// The DOM wheel path (initJourney's wheel listener) isn't headless-testable,
// so journey.js exports the two pure seams it's built on. These assert the
// invariants the layer guarantees live: a section step needs WHEEL_STEP_PX
// (240) of accumulated wheel input — two standard notches or one flick — so
// a single 120px notch stays sub-threshold and scrolls natively instead of
// jumping a full page; a burst chains at most MAX_QUEUED_STEPS glides (the
// queue counts the in-flight step, consumed on completion); the 2px
// tolerance stops a landed glide from re-targeting itself.
const STOPS = [0, 840, 1680, 2520, 3360, 4200];
const snapChecks = [
    // [stops, y, dir, expected, label]
    [STOPS, 1000, 1, 1680, 'mid-leg forward → next stop'],
    [STOPS, 1000, -1, 840, 'mid-leg backward → previous stop'],
    [STOPS, 1680, 1, 2520, 'exactly ON a stop, forward → the stop after'],
    [STOPS, 1680, -1, 840, 'exactly ON a stop, backward → the stop before'],
    [STOPS, 1678, 1, 2520, 'within 2px of a stop counts as ON it (no re-target)'],
    [STOPS, 0, 1, 840, 'at the hero, forward → about'],
    [STOPS, 0, -1, 0, 'at the hero, backward → clamped to 0'],
    [STOPS, 5000, 1, 4200, 'past the last stop, forward → clamped to last'],
    [STOPS, 5000, -1, 4200, 'past the last stop, backward → last'],
    [[], 0, 1, 0, 'empty stops, forward → 0'],
    [[], 0, -1, 0, 'empty stops, backward → 0']
];
for (const [stops, y, dir, expected, label] of snapChecks) {
    assert.strictEqual(computeDirectionalStop(stops, y, dir), expected, `computeDirectionalStop: ${label}`);
}

// wheelStepQueue — step extraction + accumulator carry (the sub-threshold
// remainder rides along so a half-notch isn't lost):
assert.deepStrictEqual(wheelStepQueue(120), { queue: 0, accum: 120 }, 'one notch stays sub-threshold (native scroll, no page jump)');
assert.deepStrictEqual(wheelStepQueue(120, 120), { queue: 1, accum: 0 }, 'two notches cross the threshold → one step');
assert.deepStrictEqual(wheelStepQueue(250), { queue: 1, accum: 10 }, 'one step + remainder carried');
assert.deepStrictEqual(wheelStepQueue(119), { queue: 0, accum: 119 }, 'sub-threshold delta accumulates');
assert.deepStrictEqual(wheelStepQueue(60, 60), { queue: 0, accum: 120 }, 'accumulated deltas stay sub-threshold');
assert.deepStrictEqual(wheelStepQueue(-120), { queue: 0, accum: -120 }, 'single backward notch stays sub-threshold');
assert.deepStrictEqual(wheelStepQueue(-120, -120), { queue: -1, accum: 0 }, 'two backward notches → one backward step');
assert.deepStrictEqual(wheelStepQueue(500, 0, 120, 3), { queue: 3, accum: 20 }, 'oversized delta capped at max steps, remainder kept');
assert.deepStrictEqual(wheelStepQueue(-500, 0, 120, 3), { queue: -3, accum: -20 }, 'oversized backward delta capped, remainder kept');

// Burst invariant: a burst of wheel input chains at most MAX_QUEUED_STEPS
// glides — the queue counts the in-flight step (consumed on completion), so
// the cap bounds a whole gesture, not just the backlog. Each 120px notch
// contributes toward the WHEEL_STEP_PX=240 step, so steps emerge every two
// notches; a single big flick delta is covered by the explicit oversized
// wheelStepQueue cases above. Simulates the real code path: per-notch
// wheelStepQueue + the capped add, then one glide per queued step.
const simulateBurst = (deltas, cap = 3) => {
    let accum = 0, queue = 0;
    for (const d of deltas) {
        const r = wheelStepQueue(d, accum);
        accum = r.accum;
        queue = Math.max(-cap, Math.min(cap, queue + r.queue));
    }
    return Math.abs(queue);
};
assert.strictEqual(simulateBurst([120]), 0, '1-notch burst → 0 glides (sub-threshold, native scroll)');
assert.strictEqual(simulateBurst([120, 120]), 1, '2-notch burst → 1 glide');
assert.strictEqual(simulateBurst([120, 120, 120]), 1, '3-notch burst → 1 glide (remainder carried)');
assert.strictEqual(simulateBurst([120, 120, 120, 120]), 2, '4-notch burst → 2 glides');
assert.strictEqual(simulateBurst(Array(9).fill(120)), 3, '9-notch burst → still capped at 3');
assert.strictEqual(simulateBurst(Array(4).fill(-120)), 2, '4-notch backward burst → 2 glides');
assert.strictEqual(simulateBurst([120, 120, -120]), 1, 'mixed burst → net direction');
assert.strictEqual(simulateBurst([60, 60, 60, 60]), 1, 'trackpad-style small deltas accumulate to 1 step');
assert.strictEqual(simulateBurst(Array(24).fill(40)), 3, 'trackpad-style small deltas accumulate to 3 steps (capped)');

// stepQueue — the pure queue-state math shared by wheel and keyboard
// stepping (clamped add; the keyboard path is queueStep(dir) = this + pump):
assert.strictEqual(stepQueue(0, 1), 1, 'step forward from empty');
assert.strictEqual(stepQueue(3, 1), 3, 'already at the cap, forward → capped');
assert.strictEqual(stepQueue(3, -1), 2, 'back off the cap');
assert.strictEqual(stepQueue(0, -1), -1, 'step backward from empty');
assert.strictEqual(stepQueue(-3, -1), -3, 'already at the negative cap, backward → capped');
assert.strictEqual(stepQueue(2, 2), 3, 'multi-step delta capped at the burst bound');
assert.strictEqual(stepQueue(-2, -2), -3, 'negative multi-step delta capped');
assert.strictEqual(stepQueue(0, 0), 0, 'zero delta leaves the queue unchanged');
assert.strictEqual(stepQueue(1, -1, 2), 0, 'custom cap respected');

// Keyboard burst invariant: rapid ArrowDown presses chain exactly
// min(presses, cap) glides — same cap semantics as the wheel, per press.
const simulateKeyBurst = (presses, cap = 3) => {
    let queue = 0;
    for (let i = 0; i < presses; i++) queue = stepQueue(queue, 1, cap);
    return Math.abs(queue);
};
assert.strictEqual(simulateKeyBurst(0), 0, 'no presses → no steps');
assert.strictEqual(simulateKeyBurst(1), 1, 'one ArrowDown → 1 glide');
assert.strictEqual(simulateKeyBurst(2), 2, 'two rapid ArrowDowns → 2 glides');
assert.strictEqual(simulateKeyBurst(5), 3, 'five rapid ArrowDowns → capped at 3 glides');
assert.strictEqual(simulateKeyBurst(8), 3, 'holding ArrowDown (auto-repeat) → still capped per burst');
assert.strictEqual(simulateKeyBurst(4, 2), 2, 'cap of 2 respected');
// Mixed direction: ArrowDown ×2 then ArrowUp → net one step.
let mixedQ = 0;
mixedQ = stepQueue(mixedQ, 1);
mixedQ = stepQueue(mixedQ, 1);
mixedQ = stepQueue(mixedQ, -1);
assert.strictEqual(mixedQ, 1, 'ArrowDown ×2 + ArrowUp → net 1 step');

// ── 5e. Phase E — LCD1 SIGNAL REPAIR (state machine + movement + keys) ──
// The 128×64 monochrome LCD game: boot POST → ready (idle) → Enter starts a
// 30s run; the cursor walks one grid cell per keypress collecting signal
// packets; all TARGET packets before the timer = MISSION COMPLETE, timer
// out = SIGNAL LOST. lcdStateSnapshot is the pure seam (same pattern as
// journey's stepQueue / idle's drift offset). Assertions:
//   • the state machine — boot POST ends at ready; the ready screen is
//     deterministic (idle only accumulates); exitLcd re-arms ready
//   • movement — a keypress moves the cursor exactly one cell; no key = no
//     move; a held key auto-walks at MOVE_REPEAT and stops on keyup
//   • the exclusive-keyboard gate — keys are captured (preventDefault)
//     ONLY while body.lcd-active is set; Esc releases; Enter starts
//   • the timer — an unsteered run times out at 30s → SIGNAL LOST
//   • the win — a scripted walk collects all TARGET packets → MISSION
//     COMPLETE; the finished run's score becomes the persisted best
//   • a worse run doesn't lower the record; it survives a re-arm
const LCD_TARGET = 12;
const LCD_TIME_LIMIT = 30;
const LCD_MOVE_REPEAT_TICKS = Math.ceil(0.14 / DT); // ceil(MOVE_REPEAT 0.14s / (1/60)) = 9 ticks
const LCD_BOOT_TICKS = Math.ceil(2.9 / DT) + 5;

// The game starts in 'boot' and POSTs into 'ready' (the idle screen).
exitLcd(); // re-arm from the earlier phases (mid-state safety)
for (let i = 0; i < LCD_BOOT_TICKS; i++) updateLcdScreen(0, DT);
const booted = lcdStateSnapshot();
assert.strictEqual(booted.state, 'ready', 'LCD: the boot POST ends at the ready screen');
assert.strictEqual(booted.score, 0, 'LCD: ready starts scoreless');
assert.strictEqual(booted.packets, 0, 'LCD: no packets until a run starts');
assert.strictEqual(booted.best, 0, 'LCD: best starts at 0 with no record');
assert.strictEqual(booted.glowOpacity, 0, 'LCD: the screen glow is off at rest');
// Determinism: the ready screen is pure — 2s of idle changes nothing
// observable (the frame hash + state hold; only idle time accrues).
const idleA = lcdStateSnapshot();
for (let i = 0; i < 120; i++) updateLcdScreen(0, DT); // 2s idle
const idleB = lcdStateSnapshot();
assert.strictEqual(idleB.frameHash, idleA.frameHash, 'LCD: the ready screen must be deterministic (no auto-play)');
assert.strictEqual(idleB.state, idleA.state, 'LCD: idle must not change state');
assert.ok(idleB.idleAccum > idleA.idleAccum, `LCD: idle time accumulates (${idleA.idleAccum} → ${idleB.idleAccum})`);

// Passive gate: while INACTIVE the listener ignores keys — no preventDefault,
// and a stray ArrowRight leaves the cursor exactly where it was.
let cancelledKeys = [];
const fakeKey = (key) => {
    // The shim's dispatchEvent routes by e.type — a real KeyboardEvent has
    // type 'keydown', so the fake must carry it too.
    const e = { type: 'keydown', key, metaKey: false, ctrlKey: false, altKey: false, preventDefault: () => { cancelledKeys.push(key); } };
    window.dispatchEvent(e);
};
const fakeKeyUp = (key) => {
    const e = { type: 'keyup', key, metaKey: false, ctrlKey: false, altKey: false, preventDefault: () => { cancelledKeys.push(key); } };
    window.dispatchEvent(e);
};
cancelledKeys = [];
fakeKey('ArrowRight');
assert.strictEqual(cancelledKeys.length, 0, 'LCD: keys must pass through while inactive');
assert.deepStrictEqual(lcdStateSnapshot().cursor, [7, 3], 'LCD: an inactive keypress must not move the cursor');

// Active gate + movement: focusLcd() shows the ready screen (Enter starts
// the run); keys are captured from the moment of focus but the cursor does
// not move until a run is live; ArrowRight then moves exactly one cell; a
// held key auto-walks at MOVE_REPEAT; keyup stops it; no key = no move.
focusLcd();
assert.ok(isLcdActive(), 'LCD: focusLcd() sets the exclusive-keys class');
const focused = lcdStateSnapshot();
assert.strictEqual(focused.state, 'ready', 'LCD: focusing shows the ready screen (Enter starts)');
assert.strictEqual(focused.timeLeft, LCD_TIME_LIMIT, 'LCD: the ready screen holds the full timer');
assert.deepStrictEqual(focused.cursor, [7, 3], 'LCD: the cursor sits center field');
cancelledKeys = [];
fakeKey('ArrowRight');
assert.deepStrictEqual(cancelledKeys, ['ArrowRight'], 'LCD: movement keys are captured from the moment of focus');
assert.deepStrictEqual(lcdStateSnapshot().cursor, [7, 3], 'LCD: a keypress before a run starts must not move the cursor');
fakeKey('Enter');
const started = lcdStateSnapshot();
assert.strictEqual(started.state, 'playing', 'LCD: Enter starts a run from the ready screen');
assert.strictEqual(started.timeLeft, LCD_TIME_LIMIT, 'LCD: a run starts with the full timer');
assert.deepStrictEqual(started.cursor, [7, 3], 'LCD: the cursor starts center field');
cancelledKeys = [];
fakeKey('ArrowRight');
assert.deepStrictEqual(cancelledKeys, ['ArrowRight'], 'LCD: movement keys are captured while focused');
assert.deepStrictEqual(lcdStateSnapshot().cursor, [8, 3], 'LCD: a keypress moves the cursor exactly one cell');
const beforeHold = lcdStateSnapshot().cursor;
for (let i = 0; i < LCD_MOVE_REPEAT_TICKS; i++) updateLcdScreen(0, DT);
const afterHold = lcdStateSnapshot();
assert.ok(afterHold.cursor[0] === beforeHold[0] + 1, `LCD: a held key auto-walks (${beforeHold[0]} → ${afterHold.cursor[0]})`);
fakeKeyUp('ArrowRight');
const holdStop = lcdStateSnapshot();
for (let i = 0; i < 30; i++) updateLcdScreen(0, DT);
assert.deepStrictEqual(lcdStateSnapshot().cursor, holdStop.cursor, 'LCD: releasing the key stops the auto-walk');

// Collect: walking onto a packet scores 1 and consumes it.
const collect = lcdStateSnapshot();
if (collect.packetPos.length > 0) {
    let guard = 0;
    let snap = lcdStateSnapshot();
    while (snap.score === 0 && !snap.over && guard < 80) {
        const [px, py] = snap.packetPos[0];
        const [cx2, cy2] = snap.cursor;
        let key = null;
        if (cx2 !== px) key = px > cx2 ? 'ArrowRight' : 'ArrowLeft';
        else if (cy2 !== py) key = py > cy2 ? 'ArrowDown' : 'ArrowUp';
        if (!key) break;
        fakeKey(key);
        snap = lcdStateSnapshot();
        guard++;
    }
    assert.ok(snap.score >= 1 || snap.over, 'LCD: walking onto a packet must score (or complete the run)');
}

// Esc releases: class cleared, run abandoned, back to the ready screen.
fakeKey('Escape');
assert.ok(!isLcdActive(), 'LCD: Escape releases the exclusive-keys class');
const afterEsc = lcdStateSnapshot();
assert.strictEqual(afterEsc.state, 'ready', 'LCD: Escape returns to the ready screen');

// ── Touch steering — same exclusive contract as the keyboard: touches pass
// through unfocused; while focused a clean tap does the primary action
// (start on the ready screen, quit while playing — the touch Enter/Esc), a
// drag past SWIPE_PX steers one cell per re-cross and sets heldDir so the
// shared auto-walk continues while the finger is down, lifting cancels the
// touchend (no synthetic click at the lift point) and stops the auto-walk.
const cancelledTouch = [];
const fakeTouch = (type, x, y) => {
    const lift = type === 'touchend' || type === 'touchcancel';
    window.dispatchEvent({
        type,
        cancelable: true,
        touches: lift ? [] : [{ clientX: x, clientY: y }],
        changedTouches: lift ? [{ clientX: x, clientY: y }] : [],
        preventDefault: () => { cancelledTouch.push(type); }
    });
};

// Passive gate while unfocused (state ready, class off after Escape): no
// preventDefault, cursor untouched.
const cursorBeforeTouch = lcdStateSnapshot().cursor;
cancelledTouch.length = 0;
fakeTouch('touchstart', 0, 0);
fakeTouch('touchmove', 50, 0);
fakeTouch('touchend', 50, 0);
assert.strictEqual(cancelledTouch.length, 0, 'LCD: touches pass through while unfocused');
assert.deepStrictEqual(lcdStateSnapshot().cursor, cursorBeforeTouch, 'LCD: an unfocused touch must not move the cursor');

// Focused tap on the ready screen = Enter: starts the run (fresh cursor,
// full timer) and cancels its synthetic click.
focusLcd();
cancelledTouch.length = 0;
fakeTouch('touchstart', 5, 5);
fakeTouch('touchend', 5, 5);
const tapStart = lcdStateSnapshot();
assert.strictEqual(tapStart.state, 'playing', 'LCD: a tap on the ready screen starts a run');
assert.strictEqual(tapStart.timeLeft, LCD_TIME_LIMIT, 'LCD: the touch run starts with the full timer');
assert.deepStrictEqual(tapStart.cursor, [7, 3], 'LCD: the touch run resets the cursor center field');
assert.ok(cancelledTouch.includes('touchend'), 'LCD: the start tap cancels its synthetic click');
// Screen glow: while a run is live the halo brightens and pulses within its
// bounds (GLOW_BASE 0.18 → base+amp 0.32); a second of fade-in lands inside.
for (let i = 0; i < 60; i++) updateLcdScreen(0.5 + i / 60, DT);
const glowOn = lcdStateSnapshot().glowOpacity;
assert.ok(glowOn >= 0.15 && glowOn <= 0.35, `LCD: the screen glow pulses in bounds while playing (${glowOn})`);

// Swipe: a drag past the threshold steers one cell and re-arms, so a
// continuing drag keeps stepping; the held direction auto-walks at the
// repeat cadence while the finger is down; lifting cancels the click and
// stops the walk.
cancelledTouch.length = 0;
fakeTouch('touchstart', 0, 0);
fakeTouch('touchmove', 40, 0);
assert.deepStrictEqual(lcdStateSnapshot().cursor, [8, 3], 'LCD: a swipe right moves the cursor one cell');
fakeTouch('touchmove', 80, 0);
assert.deepStrictEqual(lcdStateSnapshot().cursor, [9, 3], 'LCD: a continuing drag re-arms and steps again');
const beforeTouchHold = lcdStateSnapshot().cursor;
for (let i = 0; i < LCD_MOVE_REPEAT_TICKS; i++) updateLcdScreen(0, DT);
assert.ok(lcdStateSnapshot().cursor[0] > beforeTouchHold[0], 'LCD: a held drag auto-walks at the repeat cadence');
fakeTouch('touchend', 80, 0);
assert.ok(cancelledTouch.includes('touchend'), 'LCD: a steering swipe cancels its synthetic click');
const afterLift = lcdStateSnapshot().cursor;
for (let i = 0; i < 10; i++) updateLcdScreen(0, DT);
assert.deepStrictEqual(lcdStateSnapshot().cursor, afterLift, 'LCD: lifting the finger stops the auto-walk');

// Focused tap while playing = Esc: releases the class, back to ready,
// synthetic click canceled.
cancelledTouch.length = 0;
fakeTouch('touchstart', 5, 5);
fakeTouch('touchend', 5, 5);
assert.ok(!isLcdActive(), 'LCD: a tap while playing releases the exclusive-keys class');
assert.strictEqual(lcdStateSnapshot().state, 'ready', 'LCD: a tap while playing returns to the ready screen');
assert.ok(cancelledTouch.includes('touchend'), 'LCD: the quit tap cancels its synthetic click');
// The glow fades back out at rest.
for (let i = 0; i < 60; i++) updateLcdScreen(1.5 + i / 60, DT);
assert.ok(lcdStateSnapshot().glowOpacity < 0.05, 'LCD: the screen glow fades back at rest');

// Enter starts a run — but only while focused (the exclusive-keys gate):
// after Escape the same key is inert until the LCD is re-focused.
fakeKey('Enter');
assert.strictEqual(lcdStateSnapshot().state, 'ready', 'LCD: Enter is inert while the LCD is unfocused');
focusLcd();
fakeKey('Enter');
const run2 = lcdStateSnapshot();
assert.strictEqual(run2.state, 'playing', 'LCD: Enter starts a run from the ready screen');
assert.strictEqual(run2.score, 0, 'LCD: a fresh run is scoreless');
assert.strictEqual(run2.newRecord, false, 'LCD: a fresh run resets the record flag');

// Timer loss: an unsteered run times out at 30s → SIGNAL LOST, score 0.
for (let i = 0; i < Math.ceil((LCD_TIME_LIMIT + 1) / DT); i++) updateLcdScreen(0, DT);
const lost = lcdStateSnapshot();
assert.ok(lost.over && !lost.win, 'LCD: the timer expiring is SIGNAL LOST');
assert.strictEqual(lost.score, 0, 'LCD: an unsteered run scores 0');
assert.strictEqual(lost.best, 0, 'LCD: a scoreless loss does not set the record');
assert.strictEqual(lost.newRecord, false, 'LCD: a scoreless loss is not a new record');

// Win: a scripted walk collects all TARGET packets → MISSION COMPLETE, and
// the finished run's score becomes the persisted best (localStorage).
const bestKey = 'parama-signal-repair-best';
// The record also surfaces OFF the LCD — the board-readout mirror: the
// getter reads the same module value, and the listener fires on a new
// record (main.js mirrors it into the About/Contact readouts in the
// browser; here we assert the contract headlessly).
const bestEvents = [];
setBestListener((b) => bestEvents.push(b));
assert.strictEqual(getBestScore(), 0, 'LCD: no record before the first win');
const walkAll = () => {
    let guard = 0;
    let snap = lcdStateSnapshot();
    while (!snap.over && guard < 4000) {
        snap = lcdStateSnapshot();
        if (snap.over) break;
        if (snap.packetPos.length === 0) {
            // No packets to chase yet — tick until the next spawn arrives
            // (difficulty adds packets over time; a tick is 1/60s).
            updateLcdScreen(0, DT);
            guard++;
            continue;
        }
        const [px, py] = snap.packetPos[0];
        const [cx2, cy2] = snap.cursor;
        let key = null;
        if (cx2 !== px) key = px > cx2 ? 'ArrowRight' : 'ArrowLeft';
        else if (cy2 !== py) key = py > cy2 ? 'ArrowDown' : 'ArrowUp';
        if (key) fakeKey(key);
        guard++;
    }
    return lcdStateSnapshot();
};
focusLcd();
fakeKey('Enter'); // focus shows the ready screen — Enter starts the run
const won = walkAll();
assert.ok(won.over && won.win, `LCD: collecting all packets is MISSION COMPLETE (state ${won.state}, score ${won.score})`);
assert.strictEqual(won.score, LCD_TARGET, `LCD: a winning run collects all ${LCD_TARGET} packets`);
assert.strictEqual(won.best, LCD_TARGET, 'LCD: the winning run sets best equal to its score');
assert.strictEqual(won.newRecord, true, 'LCD: beating the record flags a new record');
assert.strictEqual(globalThis.window.localStorage.getItem(bestKey), String(LCD_TARGET), 'LCD: the new best is persisted to localStorage');
assert.strictEqual(getBestScore(), LCD_TARGET, 'LCD: getBestScore mirrors the new record');
assert.deepStrictEqual(bestEvents, [LCD_TARGET], 'LCD: the best listener fires once with the new record');

// A worse run (unsteered timeout, score 0) must not lower the record.
fakeKey('Enter');
for (let i = 0; i < Math.ceil((LCD_TIME_LIMIT + 1) / DT); i++) updateLcdScreen(0, DT);
const worse = lcdStateSnapshot();
assert.ok(worse.over && !worse.win, 'LCD: the worse run loses');
assert.strictEqual(worse.best, LCD_TARGET, 'LCD: a worse run must not lower the record');
assert.strictEqual(worse.newRecord, false, 'LCD: a run below the record is not flagged');
assert.strictEqual(globalThis.window.localStorage.getItem(bestKey), String(LCD_TARGET), 'LCD: storage unchanged by a worse run');
assert.deepStrictEqual(bestEvents, [LCD_TARGET], 'LCD: a run below the record must not re-fire the listener');

// The record survives a re-arm (exitLcd) and is the value a fresh boot
// would load.
exitLcd();
const rearmed = lcdStateSnapshot();
assert.strictEqual(rearmed.state, 'ready', 'LCD: exitLcd re-arms the ready screen');
assert.strictEqual(rearmed.best, LCD_TARGET, 'LCD: the record survives a re-arm');

// Leave the game inactive and armed for the phases that follow.
fakeKey('Escape');
assert.ok(!isLcdActive(), 'LCD: clean exit after the gate + score tests');

// The #/lcd deep link replays the boot POST before the ready screen
// (focusLcd(true)); a fresh boot still lands on ready. Phase B turned
// reduced motion on for the suite — flip it back for this block so the
// POST can auto-advance, then restore.
motionPrefs.reduced = false;
focusLcd(true);
assert.strictEqual(lcdStateSnapshot().state, 'boot', 'LCD: a deep-link focus replays the boot POST');
for (let i = 0; i < LCD_BOOT_TICKS; i++) updateLcdScreen(0, DT);
assert.strictEqual(lcdStateSnapshot().state, 'ready', 'LCD: the replayed boot lands on the ready screen');
fakeKey('Escape');
assert.ok(!isLcdActive(), 'LCD: clean exit after the deep-link replay test');
motionPrefs.reduced = true;

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
// The LCD game must hold still too (reduced motion: no auto-play).
const lcdReduced0 = lcdStateSnapshot();
for (let i = 1; i < 2000; i++) {
    tickCallbacks.forEach((cb) => cb(200 + i * DT, DT));
}
const lcdReduced1 = lcdStateSnapshot();
assert.deepStrictEqual(lcdReduced1, lcdReduced0, 'reduced: the LCD game must hold still (no auto-play)');
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
console.log(`  phase B: reduced-motion run — float planted, ${allMaterials.size} materials frozen, sweep + dust + pulses hidden, LCD game holds still`);
console.log(`  phase F: per-section ambient signatures — ${SECTION_IDS.length} neighborhoods (hero/about/projects/skills/experience/contact), each swept 5s through LED/ripple/pulse/dust/fleck/dot with bounds held`);
console.log(`  phase E: LCD1 SIGNAL REPAIR — boot→ready, 1-cell movement + held auto-walk, exclusive keys, touch steering (tap-start / swipe-steer / tap-quit), screen glow (off at rest, pulsing in bounds while playing, fades on quit), #/lcd deep-link boot replay, timer loss + scripted MISSION COMPLETE, persistent best + NEW RECORD flash`);
console.log(`  phase C: raycast layer — ${rayAimed} aimable component-poses (${aimedNames.size} unique components) across ${RAY_POSES.length} camera poses, hover === independent ray at the same NDC (${rayAimed - rayMisses.length}/${rayAimed})`);
console.log(`  phase D: idle drift — offset bounds |x| ≤ ${DRIFT_X_MAX.toFixed(3)}, |y| ≤ ${DRIFT_Y_MAX.toFixed(3)}, deterministic, interaction resets the clock`);
console.log(`  ambient: hover shadow (opacity ${shadowBlob.material.opacity.toFixed(2)}) + ${fleckMeshes.length} gold flecks + ${ledDomeMats.length} pulsing LEDs, all in bounds, hidden/frozen under reduced motion`);
