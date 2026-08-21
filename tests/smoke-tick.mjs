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
//   - the LCD SIM BOUNDARY: lcd-sim.js (the zero-THREE/DOM simulation)
//     imports BEFORE the shim is installed — any THREE/DOM dependency that
//     sneaks into the pure module fails the suite at import time
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

// ── 0. Pure sim import (NO shim) ────────────────────────────────
// lcd-sim.js is the zero-THREE/DOM SIGNAL RUNNER simulation. It must load
// in a bare Node context — BEFORE the window/document shim below — with no
// three.js, no DOM, no matchMedia. (lcd.js re-imports the SAME module
// instance after the shim; the ES module cache dedupes, so the whole suite
// drives one sim.) The standalone init proves the extraction boundary: any
// future THREE/DOM dependency sneaking into the sim fails here, at import.
const lcdSim = await import('../src/three/lcd-sim.js');
assert.strictEqual(lcdSim.simView().state, 'off', 'lcd-sim: the pure sim initializes powered down with no shim');
assert.strictEqual(typeof lcdSim.stepRunner, 'function', 'lcd-sim: stepRunner is the sim step seam');

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
const { stepFrame } = await import('../src/three/scene.js');
import { getTickBucket, tickPrioritized, CRITICAL, STANDARD, DEFERRED, onTick } from '../src/three/tick-scheduler.js';
const tickCallbacks = getTickBucket(CRITICAL);
const board = await import('../src/three/board.js');
const { createComponents, updateRadarRing, updateLedArray, interactiveObjects } = await import('../src/three/components.js');
// The namespace (not the destructure) for values createComponents ASSIGNS
// later — a destructured binding snapshots the pre-create `undefined` (same
// pattern as `board.boardGroup` above).
const componentsNs = await import('../src/three/components.js');
const { createTraces, updateTraceCurrent, updateTraceRipple, updateAmbientPulses } = await import('../src/three/traces.js');
const idle = await import('../src/three/idle.js');
const { createParticles, updateParticles, updateAmbientDust, updateAmbientGoldFlecks } = await import('../src/three/particles.js');
const { createProjectChips, updateProjectChips } = await import('../src/three/project-chips.js');
const { createLcd, updateLcdScreen, focusLcd, exitLcd, isLcdActive, lcdStateSnapshot, getBestScore, setBestListener, resetRunCounter, LCD_LOCAL_POS } = await import('../src/three/lcd.js');
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
// hash-nav.js is the pure shareable-URL mapping — main.js's hash routing
// (applyHashNavigation / navigateToSection) resolves every '#/...' through it.
const { SECTION_HASHES, hashToSectionId } = await import('../src/utils/hash-nav.js');

// NOTE: `board.boardGroup` is read via the module namespace GETTER after
// createBoard runs — destructuring would snapshot the pre-create `undefined`.
assert.ok(board.boardGroup === undefined, 'boardGroup must start unset before createBoard');

// ── 0. Phase R — real-loop clock (the dead-clock regression lock) ──
// The LCD-frozen bug was a frame loop that never advanced: animate() read
// timer.getDelta() without ever calling timer.update(), so EVERY frame
// delivered delta = 0 and bootAccum += 0 forever. The suite drives tick
// callbacks with explicit deltas, so it could never see a zero-delta loop.
// This phase drives the REAL chain — stepFrame(timestamp) is exactly what
// animate() calls each frame (timer.update → getDelta → clamp →
// tickPrioritized(elapsed, delta, budget)) — through a fake-rAF cadence
// with synthetic timestamps in the performance.now() timebase. Runs before
// the board build so a dead clock fails the suite fast.
{
    const delivered = [];
    tickCallbacks.push((elapsed, delta) => delivered.push({ elapsed, delta }));
    const t0 = performance.now();
    // Fake rAF driver: two steady 60fps frames, a duplicate-timestamp
    // re-fire, a 1s hitch (background-tab return), then a normal step.
    const frameTs = [t0, t0 + 16.7, t0 + 33.4, t0 + 33.4, t0 + 1033.4, t0 + 1050.1];
    for (const ts of frameTs) stepFrame(ts);
    tickCallbacks.pop();
    assert.strictEqual(delivered.length, frameTs.length, 'real-loop: every frame delivers an (elapsed, delta) pair to the callbacks');
    // Steady frames deliver exactly 16.7ms — the clock genuinely advances.
    assert.ok(Math.abs(delivered[1].delta - 0.0167) < 1e-9, `real-loop: a steady frame delivers 16.7ms (got ${delivered[1].delta})`);
    assert.ok(Math.abs(delivered[2].delta - 0.0167) < 1e-9, `real-loop: the second steady frame advances too (got ${delivered[2].delta})`);
    // A duplicate timestamp (same-frame re-fire) delivers delta 0 — but the
    // callbacks still RUN (the loop is alive, the frame is just static).
    assert.strictEqual(delivered[3].delta, 0, 'real-loop: a duplicate-timestamp frame delivers delta 0 (callbacks still fire)');
    // The 1s hitch is clamped at the source — never a teleport.
    assert.strictEqual(delivered[4].delta, 0.05, 'real-loop: a 1s hitch is clamped to the 50ms cap (MAX_DELTA)');
    // And the frame after the hitch is back to a normal step.
    assert.ok(Math.abs(delivered[5].delta - 0.0167) < 1e-9, 'real-loop: the post-hitch frame delivers a normal 16.7ms step');
    // Elapsed is the accumulation of delivered deltas, not wall-clock.
    assert.ok(delivered[2].elapsed > delivered[0].elapsed, 'real-loop: elapsed accumulates across frames');
}

// ── 0b. Phase R2 — priority-scheduler budget gating ───────────
// Verifies that STANDARD and DEFERRED callbacks are actually shed when
// the frame budget is tight, while CRITICAL always runs.  Uses the
// scheduler's own API (tickPrioritized) with a tiny budget so the
// critical pass alone exceeds it.
{
    // Register one callback per tier that stamps a flag.
    const flags = { critical: false, standard: false, deferred: false };
    const { getSkipCounts } = await import('../src/three/tick-scheduler.js');
    onTick(CRITICAL, () => { flags.critical = true; });
    onTick(STANDARD, () => { flags.standard = true; });
    onTick(DEFERRED, () => { flags.deferred = true; });

    // Frame with a tiny budget (0ms) — the critical pass alone exceeds it,
    // so STANDARD is skipped.  DEFERRED has its own 5ms threshold which a
    // trivial critical pass won't hit — so DEFERRED still runs here.
    tickPrioritized(0, 1 / 60, 0);
    assert.strictEqual(flags.critical, true, 'scheduler: CRITICAL always runs');
    assert.strictEqual(flags.standard, false, 'scheduler: STANDARD skipped under 0ms budget');
    assert.strictEqual(flags.deferred, true, 'scheduler: DEFERRED runs when total < 5ms (trivial critical)');
    const skipA = getSkipCounts();
    assert.ok(skipA.standard > 0, 'scheduler: skip count tracks STANDARD shedding');
    assert.strictEqual(skipA.deferred, 0, 'scheduler: DEFERRED not skipped when total < 5ms');

    // Reset flags for the generous-budget test.
    flags.critical = false;
    flags.standard = false;
    flags.deferred = false;

    // Frame with a huge budget — everything runs.
    tickPrioritized(0, 1 / 60, 999);
    assert.strictEqual(flags.critical, true, 'scheduler: CRITICAL runs with generous budget');
    assert.strictEqual(flags.standard, true, 'scheduler: STANDARD runs with generous budget');
    assert.strictEqual(flags.deferred, true, 'scheduler: DEFERRED runs with generous budget');
    const skipB = getSkipCounts();
    assert.strictEqual(skipB.standard, 0, 'scheduler: no STANDARD skips with generous budget');
    assert.strictEqual(skipB.deferred, 0, 'scheduler: no DEFERRED skips with generous budget');

    // Simulate a slow critical pass (>5ms) to test DEFERRED skipping.
    // Spin-wait inside a CRITICAL callback to inflate the frame time.
    flags.critical = false;
    flags.standard = false;
    flags.deferred = false;
    onTick(CRITICAL, () => { const end = performance.now() + 8; while (performance.now() < end) {} });
    tickPrioritized(0, 1 / 60, 0);
    assert.strictEqual(flags.standard, false, 'scheduler: STANDARD skipped when critical > budget');
    assert.strictEqual(flags.deferred, false, 'scheduler: DEFERRED skipped when total > 5ms');
    const skipC = getSkipCounts();
    assert.ok(skipC.standard > 0, 'scheduler: skip count tracks STANDARD shedding under load');
    assert.ok(skipC.deferred > 0, 'scheduler: skip count tracks DEFERRED shedding under load');

    // Clean up — remove the test callbacks so they don't fire in later phases.
    // pop() removes the last-registered callback per tier.
    getTickBucket(CRITICAL).pop(); // spin-wait callback
    getTickBucket(CRITICAL).pop(); // flag callback
    getTickBucket(STANDARD).pop();
    getTickBucket(DEFERRED).pop();
}

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
    tickPrioritized(i * DT, DT, Infinity);
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

// ── 4b. Hash deep links — the shareable-URL mapping ──────────
// Every section must be reachable by a stable URL (#/about, #/projects, ...)
// exactly like #/lcd — hashToSectionId is the pure resolver main.js routes
// through, so this asserts the contract headlessly:
//   • all five sections resolve from their slugs (and round-trip back)
//   • the bare root (empty hash) lands on the hero
//   • 'lcd' belongs to the game, not a section — resolves to null
//   • unknown hashes resolve to null (never a wrong section)
//   • hand-typed hashes work: optional '#/' prefix + case-insensitive
const HASH_SECTIONS = [
    ['about', 'sec-about'],
    ['projects', 'sec-projects'],
    ['skills', 'sec-skills'],
    ['experience', 'sec-experience'],
    ['contact', 'sec-contact']
];
for (const [slug, secId] of HASH_SECTIONS) {
    assert.strictEqual(hashToSectionId(`#/${slug}`), secId, `hash #/${slug} → ${secId}`);
    assert.strictEqual(hashToSectionId(slug), secId, `bare slug ${slug} → ${secId}`);
    // The shareable registry round-trips: the section's own slug resolves
    // back to it (no stale duplicate mapping).
    assert.strictEqual(SECTION_HASHES[secId], slug, `SECTION_HASHES[${secId}] = '${slug}'`);
}
// Every registered section is covered by the list above (the hero is the
// empty-slug entry, intentionally reachable only via the bare root).
assert.strictEqual(Object.keys(SECTION_HASHES).length, 6, 'exactly six sections in the registry');
assert.strictEqual(hashToSectionId(''), 'sec-hero', 'empty hash → hero');
assert.strictEqual(hashToSectionId('#/'), 'sec-hero', "'#/' → hero");
assert.strictEqual(hashToSectionId('#/lcd'), null, '#/lcd is the game branch, not a section');
assert.strictEqual(hashToSectionId('#/nope'), null, 'unknown hash → null');
assert.strictEqual(hashToSectionId('#/ABOUT'), 'sec-about', 'hash resolution is case-insensitive');
assert.strictEqual(hashToSectionId('#about'), 'sec-about', "'#about' (no slash) resolves too");

// ── 5e. Phase E — LCD1 SIGNAL RUNNER (power cycle + physics + keys) ──
// The 128×64 monochrome LCD runner: the display is OFF at rest; focusing it
// (click or #/lcd) powers it on — boot POST → 3-2-1 countdown → the run
// AUTO-STARTS (Enter/tap skips the countdown; the LCG re-seed makes a
// skipped countdown play the identical layout). The pulse auto-runs;
// Up/W/Space jump (double jump), Down/S slide under beams, D/Shift dash
// (invulnerable), P pause, ~ hidden debug, Esc powers off. Every run
// re-seeds the fixed LCG, so the SAME trace plays each time: an unsteered
// run dies at the same sim-time with the same score, and records are
// comparable. lcdStateSnapshot is the pure seam (same pattern as journey's
// stepQueue / idle's drift offset). Assertions:
//   • the power cycle — createLcd leaves it 'off'; focusLcd boots → count;
//     the countdown auto-starts the run; exitLcd powers back down
//   • the auto-runner — an unsteered run scrolls (dist grows) and scores
//     from distance without any input
//   • physics — a jump lifts the pulse (vy < 0, jumpsUsed 1) and gravity
//     returns it; a double jump works mid-air (jumpsUsed 2); down slides;
//     dash grants timed invulnerability with a cooldown
//   • the exclusive-keyboard gate — keys captured only while body.lcd-active;
//     Esc powers off and releases; Enter starts; ~ toggles hidden debug
//   • pause — P freezes dist/score/world, the glow dims; Enter resumes;
//     Esc quits a paused run
//   • touch — tap starts, tap jumps while running, swipe-down slides, a
//     second finger pauses; the scroll lock holds while playing and relaxes
//     while paused
//   • death + persistence — an unsteered run dies deterministically, sets
//     the record (localStorage) + a leaderboard entry + FIRST RUN; an
//     identical second run scores the same and does NOT re-fire the listener
// Reduced-motion visitors still get the game: focusing the LCD is an EXPLICIT
// user action, so the machine powers on and the run auto-starts even with
// prefers-reduced-motion — only the ambient chrome (glow pulse, ghosting,
// CRT flicker, blink) is silenced. Regression lock for the "the LCD only
// shows the SIGNAL RUNNER title" bug (focusLcd used to park on a frozen
// title when playerActive was still false).
motionPrefs.reduced = true;
focusLcd();
for (let i = 0; i < Math.ceil(1.0 / DT) + 1; i++) updateLcdScreen(0, DT);
assert.strictEqual(lcdStateSnapshot().state, 'count', 'reduced: focusing powers on even with prefers-reduced-motion');
for (let i = 0; i < Math.ceil(0.75 / DT) + 1; i++) updateLcdScreen(0, DT);
assert.strictEqual(lcdStateSnapshot().state, 'playing', 'reduced: the run auto-starts when focused (no frozen title)');
exitLcd();
updateLcdScreen(0, DT); // power-down snap: the glow returns to 0 under reduced motion
assert.strictEqual(lcdStateSnapshot().glowOpacity, 0, 'reduced: powering down returns the glow to 0');
motionPrefs.reduced = false; // the boot POST must auto-advance in this phase
const LCD_BOOT_TICKS = Math.ceil(1.0 / DT) + 1; // cross the boot boundary (1.0s power-on) into the countdown

// The display starts powered down.
exitLcd(); // re-arm from earlier phases (mid-state safety)
assert.strictEqual(lcdStateSnapshot().state, 'off', 'LCD: the display is OFF at rest');
assert.strictEqual(lcdStateSnapshot().glowOpacity, 0, 'LCD: no glow when powered down');

// Passive gate: while INACTIVE the listener ignores keys — no preventDefault.
let cancelledKeys = [];
const fakeKey = (key) => {
    const e = { type: 'keydown', key, metaKey: false, ctrlKey: false, altKey: false, preventDefault: () => { cancelledKeys.push(key); } };
    window.dispatchEvent(e);
};
const fakeKeyUp = (key) => {
    const e = { type: 'keyup', key, metaKey: false, ctrlKey: false, altKey: false, preventDefault: () => { cancelledKeys.push(key); } };
    window.dispatchEvent(e);
};
const fakeTouch = (type, x, y, touchCount = 1) => {
    const lift = type === 'touchend' || type === 'touchcancel';
    const touches = lift ? [] : Array.from({ length: touchCount }, () => ({ clientX: x, clientY: y }));
    window.dispatchEvent({
        type,
        cancelable: true,
        touches,
        changedTouches: lift ? [{ clientX: x, clientY: y }] : [],
        preventDefault: () => { cancelledTouch.push(type); }
    });
};
let cancelledTouch = [];
cancelledKeys = [];
fakeKey('ArrowUp');
assert.strictEqual(cancelledKeys.length, 0, 'LCD: keys must pass through while inactive');

// Focus powers the machine on: boot POST → auto-start countdown → the run
// LAUNCHES ITSELF — no Enter needed. The countdown is pure (3-2-1 digits);
// the same fixed LCG re-seed means skipping it (Enter/tap) plays the
// identical layout.
focusLcd();
assert.ok(isLcdActive(), 'LCD: focusLcd() sets the exclusive-keys class');
assert.strictEqual(lcdStateSnapshot().state, 'boot', 'LCD: focusing powers the machine on (boot POST)');
for (let i = 0; i < LCD_BOOT_TICKS; i++) updateLcdScreen(0, DT);
const booted = lcdStateSnapshot();
assert.strictEqual(booted.state, 'count', 'LCD: the boot POST ends in the auto-start countdown');
assert.strictEqual(booted.count, true, 'LCD: the snapshot reports the countdown state');
assert.strictEqual(booted.score, 0, 'LCD: the countdown is scoreless');
assert.strictEqual(booted.best, 0, 'LCD: best starts at 0 with no record');
assert.strictEqual(booted.achvCount, 0, 'LCD: no achievements before a first run');
assert.strictEqual(booted.boardLen, 0, 'LCD: an empty leaderboard before a first run');
// The countdown auto-advances: 0.75s (3-2-1 at 0.25s per digit) → playing,
// with dist still 0 (nothing has scrolled yet) and the pulse grounded at
// the start line. Step tick-by-tick and break the INSTANT the run starts —
// the transition tick itself is still pre-gameplay, so dist must be exactly
// 0 (a naive ceil+buffer loop can round the boundary and sneak one
// gameplay tick in, drifting dist to 2).
for (let i = 0; i < Math.ceil(0.75 / DT) + 4; i++) {
    updateLcdScreen(0, DT);
    if (lcdStateSnapshot().state === 'playing') break;
}
const autoStarted = lcdStateSnapshot();
assert.strictEqual(autoStarted.state, 'playing', 'LCD: the countdown auto-starts the run (no input)');
assert.strictEqual(autoStarted.dist, 0, 'LCD: the auto-start begins at distance 0');
assert.strictEqual(autoStarted.player.onGround, true, 'LCD: the pulse starts grounded at the trace');

// Active gate: action keys are captured from the moment of focus; a bound
// action key is preventDefaulted but leaves the run running. The pulse
// auto-runs (dist + score grow without input).
cancelledKeys = [];
fakeKey('ArrowUp');
assert.deepStrictEqual(cancelledKeys, ['ArrowUp'], 'LCD: action keys are captured from the moment of focus');
assert.strictEqual(lcdStateSnapshot().state, 'playing', 'LCD: a jump press during a run must not stop it');
const runA = lcdStateSnapshot();
for (let i = 0; i < 30; i++) updateLcdScreen(0.5 + i / 60, DT); // 0.5s
const runB = lcdStateSnapshot();
assert.ok(runB.dist > runA.dist, `LCD: the pulse auto-runs (dist ${runA.dist} → ${runB.dist})`);
assert.ok(runB.score >= runA.score, 'LCD: distance accrues score without input');
assert.ok(runB.player.x >= runA.player.x, 'LCD: the pulse moves along the trace');
// Display telemetry — the HUD reads SPD + FPS; both hold real in-range
// values while running (FPS is frame-rate dependent, so it lives OUTSIDE
// the determinism hash — this is why the identical-runs assertions above
// still hold while these vary by platform).
assert.ok(runB.speed >= 85 && runB.speed <= 150, `LCD: the HUD speed stays in range (${runB.speed})`);
assert.ok(runB.fps > 0 && runB.fps <= 240, `LCD: the HUD FPS reads a real rate (${runB.fps})`);
// Let the gate-check jump arc complete so the physics block starts from a
// grounded pulse (a mid-air press would read as the double jump).
for (let i = 0; i < 40; i++) updateLcdScreen(1 + i / 60, DT); // ~0.66s — full jump arc
assert.strictEqual(lcdStateSnapshot().player.onGround, true, 'LCD: the pulse is grounded before the physics block');

// Physics — all within the first ~130 ticks (the first obstacle arrives
// ~170 ticks in), so these inputs cannot dodge it and the unsteered death
// below stays deterministic.
fakeKey('ArrowUp'); // jump
const jumped = lcdStateSnapshot();
assert.strictEqual(jumped.player.onGround, false, 'LCD: a jump leaves the ground');
assert.ok(jumped.player.vy < 0, `LCD: a jump gives upward velocity (vy ${jumped.player.vy})`);
assert.strictEqual(jumped.player.jumpsUsed, 1, 'LCD: a single jump uses one jump');
fakeKey('ArrowUp'); // double jump mid-air
const doubled = lcdStateSnapshot();
assert.strictEqual(doubled.player.jumpsUsed, 2, 'LCD: a double jump works mid-air');
assert.ok(doubled.player.onGround === false, 'LCD: the double jump keeps the pulse airborne');
for (let i = 0; i < 60; i++) updateLcdScreen(1 + i / 60, DT); // ~1s — gravity returns the pulse
const landed = lcdStateSnapshot();
assert.strictEqual(landed.player.onGround, true, 'LCD: gravity returns the pulse to the trace');
assert.strictEqual(landed.player.y, 50, 'LCD: the pulse lands at the trace line');
fakeKey('ArrowDown'); // slide
assert.strictEqual(lcdStateSnapshot().player.sliding, true, 'LCD: Down slides the pulse');
fakeKeyUp('ArrowDown');
assert.strictEqual(lcdStateSnapshot().player.sliding, false, 'LCD: releasing Down stands the pulse up');
fakeKey('d'); // dash
const dashed = lcdStateSnapshot();
assert.strictEqual(dashed.player.dashing, true, 'LCD: D dashes the pulse');
assert.ok(dashed.player.invuln > 0, `LCD: a dash grants invulnerability (${dashed.player.invuln}s)`);
for (let i = 0; i < Math.ceil(0.35 / DT); i++) updateLcdScreen(2 + i / 60, DT);
assert.strictEqual(lcdStateSnapshot().player.dashing, false, 'LCD: the dash ends after its window');
assert.ok(lcdStateSnapshot().player.invuln < dashed.player.invuln, 'LCD: the invulnerability decays');

// Hidden debug: ~ toggles the diagnostics overlay.
assert.strictEqual(lcdStateSnapshot().debug, false, 'LCD: debug is off by default');
fakeKey('Backquote');
assert.strictEqual(lcdStateSnapshot().debug, true, 'LCD: ~ toggles the hidden debug overlay');
fakeKey('Backquote');
assert.strictEqual(lcdStateSnapshot().debug, false, 'LCD: ~ toggles debug back off');

// Pause — P freezes the world: dist/score/player hold across 2s, the glow
// dims, and action keys stay captured but inert. Enter resumes.
fakeKey('p');
assert.strictEqual(lcdStateSnapshot().state, 'paused', 'LCD: P pauses the run');
const paused0 = lcdStateSnapshot();
for (let i = 0; i < 120; i++) updateLcdScreen(2.5 + i / 60, DT); // 2s paused
const paused1 = lcdStateSnapshot();
assert.strictEqual(paused1.dist, paused0.dist, 'LCD: distance is frozen while paused');
assert.strictEqual(paused1.score, paused0.score, 'LCD: score is frozen while paused');
assert.deepStrictEqual(paused1.player, paused0.player, 'LCD: the pulse is frozen while paused');
assert.ok(paused1.glowOpacity >= 0.05 && paused1.glowOpacity <= 0.12, `LCD: the glow dims while paused (${paused1.glowOpacity})`);
cancelledKeys.length = 0;
fakeKey('ArrowUp');
assert.deepStrictEqual(cancelledKeys, ['ArrowUp'], 'LCD: action keys stay captured while paused');
assert.strictEqual(lcdStateSnapshot().state, 'paused', 'LCD: a jump press is inert while paused');
fakeKey('Enter');
assert.strictEqual(lcdStateSnapshot().state, 'playing', 'LCD: Enter resumes a paused run');

// Screen glow: while a run is live the halo pulses within its bounds.
for (let i = 0; i < 20; i++) updateLcdScreen(3 + i / 60, DT);
const glowOn = lcdStateSnapshot().glowOpacity;
assert.ok(glowOn >= 0.15 && glowOn <= 0.35, `LCD: the screen glow pulses in bounds while playing (${glowOn})`);

// Abandon this physics run (Esc powers off) — the record comes from the
// unsteered runs below.
fakeKey('Escape');
assert.ok(!isLcdActive(), 'LCD: Escape powers the display off');
assert.strictEqual(lcdStateSnapshot().state, 'off', 'LCD: the display powers down on exit');
assert.strictEqual(lcdStateSnapshot().best, 0, 'LCD: an abandoned run must not set the record');

// Death + persistence: an UNSTEERED run dies at the first obstacle
// (deterministic — same trace every run), scores from distance/electrons,
// sets the record (localStorage), writes a leaderboard entry, and unlocks
// FIRST RUN. The best listener fires exactly once.
const bestKey = 'parama-signal-runner-best';
const bestEvents = [];
setBestListener((b) => bestEvents.push(b));
assert.strictEqual(getBestScore(), 0, 'LCD: no record before the first death');
const unsteeredRun = () => {
    focusLcd();
    for (let i = 0; i < LCD_BOOT_TICKS; i++) updateLcdScreen(0, DT);
    for (let i = 0; i < Math.ceil(0.75 / DT) + 1; i++) updateLcdScreen(0, DT); // auto-start countdown
    let guard = 0;
    let s = lcdStateSnapshot();
    while (!s.over && guard < 6000) {
        updateLcdScreen(0, DT);
        s = lcdStateSnapshot();
        guard++;
    }
    return s;
};
// Pin the run counter so the first death plays seed 1234567 (the layout the
// assertions below are written against — earlier phase-E runs already
// consumed runs 0+ via the auto-start/physics/pause blocks).
resetRunCounter();
const death1 = unsteeredRun();
assert.strictEqual(death1.seed, 1234567, 'LCD: the first death plays the pinned seed 1234567');
assert.ok(death1.over, 'LCD: an unsteered run eventually dies at an obstacle');
assert.ok(death1.score > 0, `LCD: the run scored from distance before dying (${death1.score})`);
assert.strictEqual(death1.best, death1.score, 'LCD: the death sets best equal to its score');
assert.strictEqual(death1.newRecord, true, 'LCD: beating the record flags a new record');
assert.strictEqual(death1.achvCount, 1, 'LCD: a finished run unlocks FIRST RUN');
assert.strictEqual(death1.boardLen, 1, 'LCD: a finished run writes a leaderboard entry');
assert.strictEqual(globalThis.window.localStorage.getItem(bestKey), String(death1.score), 'LCD: the new best is persisted to localStorage');
assert.deepStrictEqual(bestEvents, [death1.score], 'LCD: the best listener fires once with the new record');
// Seed stamping: the record is layout-relative — it carries the seed it was
// set on, persisted alongside the score, and every leaderboard entry is
// stamped with the layout it was run on.
const bestSeedKey = 'parama-signal-runner-best-seed';
assert.strictEqual(death1.bestSeed, death1.seed, 'LCD: the record carries the seed it was set on');
assert.strictEqual(globalThis.window.localStorage.getItem(bestSeedKey), String(death1.seed), 'LCD: the record seed is persisted to localStorage');
const boardAfter1 = JSON.parse(globalThis.window.localStorage.getItem('parama-signal-runner-board') || '[]');
assert.strictEqual(boardAfter1[0].seed, death1.seed, 'LCD: the leaderboard entry is stamped with the run seed');
// Board-reactive FX — the LCD tells the board what happened: the record run
// fires a NEW RECORD celebration (D1-D7 chase) and the death fires a board
// power dip. Both are transient timers that decay deterministically.
assert.ok(death1.fx.celebrate > 0, 'LCD: a record run fires the NEW RECORD celebration');
assert.ok(death1.fx.dip > 0, 'LCD: a death fires the board power dip');
for (let i = 0; i < Math.ceil(2.5 / DT) + 2; i++) updateLcdScreen(0, DT); // FX_CELEBRATE_SEC
const fxDecayed = lcdStateSnapshot();
assert.strictEqual(fxDecayed.fx.celebrate, 0, 'LCD: the celebration decays to 0');
assert.strictEqual(fxDecayed.fx.dip, 0, 'LCD: the power dip decays to 0');
const deathDist = death1.dist;
const deathScore = death1.score;
const deathObstacle = death1.obstacles[0] && death1.obstacles[0].type;
assert.ok(deathObstacle, 'LCD: the death was caused by an obstacle');

// An IDENTICAL second run (re-seeded trace, no input) dies at the same
// distance with the same score — and since it does not beat the record, the
// listener does not re-fire, the record holds, and the leaderboard grows.
fakeKey('Escape'); // power off between runs
assert.strictEqual(lcdStateSnapshot().state, 'off', 'LCD: powered down between runs');
resetRunCounter(); // pin seed 1234567 again — an IDENTICAL run must play the same layout
const death2 = unsteeredRun();
assert.strictEqual(death2.seed, 1234567, 'LCD: the identical run plays the pinned seed');
assert.ok(death2.over, 'LCD: the second run also dies');
assert.strictEqual(death2.dist, deathDist, `LCD: the same trace dies at the same distance (${deathDist})`);
assert.strictEqual(death2.score, deathScore, 'LCD: the same trace scores the same');
assert.strictEqual(death2.best, deathScore, 'LCD: an identical run must not raise the record');
assert.strictEqual(death2.newRecord, false, 'LCD: an identical run is not a new record');
assert.strictEqual(death2.boardLen, 2, 'LCD: the second death writes another leaderboard entry');
assert.strictEqual(globalThis.window.localStorage.getItem(bestKey), String(deathScore), 'LCD: storage unchanged by the identical run');
assert.deepStrictEqual(bestEvents, [deathScore], 'LCD: an identical run must not re-fire the listener');
// Seed stamping on the identical (pinned-seed) run: the record seed holds,
// and both leaderboard entries carry the same pinned seed.
assert.strictEqual(death2.bestSeed, death1.seed, 'LCD: an identical run keeps the record seed');
const boardAfter2 = JSON.parse(globalThis.window.localStorage.getItem('parama-signal-runner-board') || '[]');
assert.strictEqual(boardAfter2[0].seed, death1.seed, 'LCD: the top entry keeps the record run seed');
assert.strictEqual(boardAfter2[1].seed, death1.seed, 'LCD: the second entry carries the same pinned seed');
assert.strictEqual(death2.fx.celebrate, 0, 'LCD: an identical run does NOT re-fire the celebration (only records celebrate)');
assert.ok(death2.fx.dip > 0, 'LCD: the second death fires the power dip too');

// Per-run seed variety + bounded difficulty envelope: without a reset, every
// run advances the seed (BASE_SEED + runCount) — layouts DIFFER, so deaths
// land at different distances — yet the spawn cadence/speed/mix are FIXED
// constants, so unsteered runs stay inside a bounded band, keeping SIG
// comparable across layouts.
const envelopeDists = [{ seed: death1.seed, dist: deathDist }];
for (let k = 0; k < 3; k++) {
    const s = unsteeredRun();
    envelopeDists.push({ seed: s.seed, dist: s.dist });
    fakeKey('Escape');
}
const dists = envelopeDists.map((e) => e.dist);
assert.ok(
    dists.every((d) => d >= 100 && d <= 3000),
    `LCD: unsteered death stays in the difficulty envelope across seeds (${dists.join(', ')})`
);
assert.ok(new Set(envelopeDists.map((e) => e.seed)).size === envelopeDists.length, `LCD: each run advances to a distinct seed (${envelopeDists.map((e) => e.seed).join(', ')})`);
assert.ok(new Set(dists).size >= 2, `LCD: different seeds produce different layouts (${dists.join(', ')})`);

// Touch — the same exclusive contract: tap starts, tap jumps while running,
// a swipe down slides, a second finger pauses; the scroll lock holds while
// playing and relaxes while paused.
const touchRun = () => {
    focusLcd();
    for (let i = 0; i < LCD_BOOT_TICKS; i++) updateLcdScreen(0, DT);
    for (let i = 0; i < Math.ceil(0.75 / DT) + 1; i++) updateLcdScreen(0, DT); // auto-start countdown
};
// Tap while running = the touch Up (jump).
touchRun();
cancelledTouch.length = 0;
fakeTouch('touchstart', 5, 5);
fakeTouch('touchend', 5, 5);
const tapJump = lcdStateSnapshot();
assert.ok(tapJump.player.vy < 0, 'LCD: a tap while running jumps (the touch Up)');
assert.ok(cancelledTouch.includes('touchend'), 'LCD: the jump tap cancels its synthetic click');
for (let i = 0; i < 60; i++) updateLcdScreen(0, DT); // land
// Swipe down = slide.
cancelledTouch.length = 0;
fakeTouch('touchstart', 5, 5);
fakeTouch('touchmove', 5, 50);
fakeTouch('touchend', 5, 50);
assert.strictEqual(lcdStateSnapshot().player.sliding, true, 'LCD: a swipe down slides the pulse');
assert.ok(cancelledTouch.includes('touchend'), 'LCD: a steering swipe cancels its synthetic click');
// A second finger = the touch P.
cancelledTouch.length = 0;
fakeTouch('touchstart', 5, 5, 2);
fakeTouch('touchend', 5, 5, 2);
assert.strictEqual(lcdStateSnapshot().state, 'paused', 'LCD: a second finger pauses the run');
// The scroll lock relaxes while paused (a drag scrolls the page away)...
cancelledTouch.length = 0;
fakeTouch('touchmove', 5, 60);
assert.ok(!cancelledTouch.includes('touchmove'), 'LCD: the scroll lock relaxes while paused');
// ...a tap resumes, and the lock holds again while playing.
fakeTouch('touchstart', 5, 5);
fakeTouch('touchend', 5, 5);
assert.strictEqual(lcdStateSnapshot().state, 'playing', 'LCD: a tap resumes a paused run');
cancelledTouch.length = 0;
fakeTouch('touchmove', 5, 60);
assert.ok(cancelledTouch.includes('touchmove'), 'LCD: the scroll lock holds while playing');
fakeKey('Escape'); // clean exit after the touch run
assert.ok(!isLcdActive(), 'LCD: clean exit after the touch run');

// The record survives a re-arm and a deep-link focus still replays the POST.
exitLcd();
assert.strictEqual(lcdStateSnapshot().state, 'off', 'LCD: exitLcd powers the display off');
assert.strictEqual(lcdStateSnapshot().best, deathScore, 'LCD: the record survives a re-arm');
assert.strictEqual(lcdStateSnapshot().bestSeed, death1.seed, 'LCD: the record seed survives a re-arm');
fakeKey('Escape');
focusLcd(true);
assert.strictEqual(lcdStateSnapshot().state, 'boot', 'LCD: a deep-link focus replays the boot POST');
for (let i = 0; i < LCD_BOOT_TICKS; i++) updateLcdScreen(0, DT);
assert.strictEqual(lcdStateSnapshot().state, 'count', 'LCD: the replayed boot lands in the auto-start countdown');
fakeKey('Escape');
assert.ok(!isLcdActive(), 'LCD: clean exit after the deep-link replay test');
assert.strictEqual(lcdStateSnapshot().state, 'off', 'LCD: powered down after the replay test');

// Every 1000px the trace reaches a CPU checkpoint — a status flash fires on
// the glass (fx.milestone > 0, milestonePx on a 1000 boundary). The pinned
// layout (seed 1234567) makes a SCRIPTED policy deterministic: jump whenever
// a ground obstacle is 20-45px ahead — found by sweeping the policy against
// the real sim, so it is a test constant, not luck. It survives past the
// first two checkpoints (crossing 1000 then 2000 proves the cadence).
resetRunCounter(); // pin seed 1234567 for the policy run
focusLcd();
for (let i = 0; i < LCD_BOOT_TICKS; i++) updateLcdScreen(0, DT);
for (let i = 0; i < Math.ceil(0.75 / DT) + 1; i++) updateLcdScreen(0, DT); // auto-start countdown
let s = lcdStateSnapshot();
let guard = 0;
while (s.fx.milestonePx < 2000 && !s.over && guard < 15000) {
    const px = s.player.x;
    if (s.player.onGround && s.obstacles.some((o) => o.x >= px + 20 && o.x <= px + 45)) {
        fakeKey('ArrowUp');
    }
    updateLcdScreen(0, DT);
    s = lcdStateSnapshot();
    guard++;
}
assert.strictEqual(s.over, false, 'LCD: the scripted policy survives past the CPU checkpoints');
assert.strictEqual(s.fx.milestonePx, 2000, 'LCD: CPU checkpoints flash every 1000px (crossed 1000 then 2000)');
assert.ok(s.fx.milestone > 0, 'LCD: the CPU status flash is active at the checkpoint');
fakeKey('Escape');
assert.strictEqual(lcdStateSnapshot().state, 'off', 'LCD: powered down after the milestone run');

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

// ── 6b. LCD visibility — the screen quad must be the nearest surface ────
// Regression for the blank-LCD bug: the screen quad used to sit INSIDE the
// bezel trim's SOLID box (trim front face at z≈0.176, screen at z≈0.175), so
// every pixel of the display was occluded by the trim slab — the game could
// never be seen. This raycasts from the real LCD focus pose (journey's
// CHIP_FOCUS_OFFSET (0,1.5,2.8)) through the screen center and asserts the
// nearest surface is the screen quad itself, not the trim/bezel.
const screenQuads = [];
boardGroup.traverse((o) => { if (o.isMesh && o.name === 'lcd-screen') screenQuads.push(o); });
assert.strictEqual(screenQuads.length, 1, 'expected the LCD screen quad in the graph');
const lcdCam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
lcdCam.position.copy(LCD_LOCAL_POS).add(new THREE.Vector3(0, 1.5, 2.8));
lcdCam.lookAt(LCD_LOCAL_POS.clone().add(new THREE.Vector3(0, 0.05, 0)));
lcdCam.updateMatrixWorld();
const lcdRay = new THREE.Raycaster();
lcdRay.setFromCamera(new THREE.Vector2(0, 0), lcdCam);
const lcdHits = lcdRay.intersectObjects(sc.children, true);
assert.ok(lcdHits.length > 0, 'LCD: the screen-center ray must hit the board');
// The invisible LCD1 hit-bounds box encloses the assembly and the raycaster
// does not skip it (visible:false is on the MATERIAL, not the mesh) — filter
// invisible-material hits, mirroring what the eye sees (a mesh with an
// invisible material is never drawn, so it cannot occlude the display).
const lcdVisibleHits = lcdHits.filter((h) => !(h.object.material && h.object.material.visible === false));
assert.ok(lcdVisibleHits.length > 0, 'LCD: the screen-center ray must hit a visible surface');
assert.strictEqual(lcdVisibleHits[0].object.name, 'lcd-screen', 'LCD: the nearest VISIBLE surface at the screen center must be the screen quad — the trim/bezel must not occlude the display');

// ── 7. Phase B — reduced motion forces everything static ─────
motionPrefs.reduced = true; // the live flag — same switch the listener flips
// Drive ONE settle tick first: project-chips.js snaps the LEDs to their calm
// powered values (flicker → 0.7, steady → 1.4) on the transition into reduced
// mode — a deliberate one-time settle, not motion. The snapshot happens
// AFTER it, so the assertion is "nothing moves once reduced" (plus the float
// is checked separately below, since it must not move at all).
tickPrioritized(200, DT, Infinity);
const floatPose = { y: boardGroup.position.y, z: boardGroup.position.z, rz: boardGroup.rotation.z };
const materialSnap = [...allMaterials].map((m) => ({ ei: m.emissiveIntensity, op: m.opacity }));
// The LCD game must hold still too (reduced motion: no auto-play).
const lcdReduced0 = lcdStateSnapshot();
for (let i = 1; i < 2000; i++) {
    tickPrioritized(200 + i * DT, DT, Infinity);
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
// Board FX are motion too: even if the LCD reports a celebration or a dip,
// the array and the radar ignore it under reduced motion (calm base 0.1 /
// static arc) — the record still persists, only the motion is cut.
motionPrefs.reduced = true;
const rotBefore = componentsNs.cpuRadarRing.rotation.z;
updateRadarRing(1.5, { celebrateFrac: 0.9, dipFrac: 0.5 });
assert.strictEqual(componentsNs.cpuRadarRing.rotation.z, rotBefore, 'reduced: the radar ignores the dip FX');
updateLedArray(1.5, 'sec-about', { celebrateFrac: 0.9, dipFrac: 0.5 });
for (const m of ledDomeMats) {
    assert.ok(Math.abs(m.emissiveIntensity - 0.1) < EPS, 'reduced: LEDs hold the calm base during FX');
}
motionPrefs.reduced = false;
// And in NORMAL motion the FX are real: the chase lights the array past its
// pulse peak (1.9 ≈ the arrival flash) and a deep dip drives it below the
// calm base (a power dip, not a flicker).
updateLedArray(1.5, 'sec-about', { celebrateFrac: 0.5, dipFrac: 0 });
const chaseMax = Math.max(...ledDomeMats.map((m) => m.emissiveIntensity));
assert.ok(chaseMax > 1.0, `LCD: the NEW RECORD chase lights an LED past the pulse peak (${chaseMax.toFixed(2)})`);
updateLedArray(1.5, 'sec-about', { celebrateFrac: 0, dipFrac: 0.9 });
for (const m of ledDomeMats) assert.ok(m.emissiveIntensity < 0.1, 'LCD: a deep power dip drives the array below its calm base');

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

// Idle SELF-TEST — after a LONG stillness (60s) the board runs a one-shot
// diagnostic: the D1-D7 POST walk + a compressed POST log on the scope. The
// start is wall-clock-gated (not waitable), so the suite uses the
// forceSelfTestIdle seam to cross the threshold, then drives the run with
// real deltas and asserts the pure math: fire-once, advance, complete,
// cancel-on-interaction, reduced-motion gate, and the LED walk lighting
// past the calm base.
assert.strictEqual(idle.updateIdleSelfTest(DT).active, false, 'self-test: not running before the idle threshold');
assert.strictEqual(idle.selfTestPostLine(0), '> POST GEOMETRY', 'self-test: POST line 1 is the geometry check');
assert.strictEqual(idle.selfTestPostLine(0.5), '> POST RAIL OK', 'self-test: POST line 2 is the rail check');
assert.strictEqual(idle.selfTestPostLine(0.99), '> SYS OPERATIONAL', 'self-test: POST line 3 is the operational line');
idle.forceSelfTestIdle();
const stStart = idle.updateIdleSelfTest(DT);
assert.strictEqual(stStart.active, true, 'self-test: fires once the idle threshold is crossed');
assert.strictEqual(stStart.frac, 0, 'self-test: the run starts at the beginning of the sweep (frac 0 — no snap-in)');
// The sweep advances with real deltas — a few ticks in, the fraction grew.
let adv = stStart;
for (let i = 0; i < 10; i++) adv = idle.updateIdleSelfTest(DT);
assert.ok(adv.frac > 0 && adv.frac < 0.2, `self-test: the sweep advances with deltas (${adv.frac.toFixed(3)})`);
// LED POST walk: with the run active, the walked diodes light past the calm
// base (a shift-register progress check, distinct from the celebrate chase).
updateLedArray(1.5, 'sec-about', null, 0.5);
const walkMax = Math.max(...ledDomeMats.map((m) => m.emissiveIntensity));
assert.ok(walkMax > 1.0, `self-test: the POST walk lights a diode past the calm base (${walkMax.toFixed(2)})`);
// Reduced motion: the self-test never fires (stand-down + no start).
motionPrefs.reduced = true;
idle.forceSelfTestIdle();
assert.strictEqual(idle.updateIdleSelfTest(DT).active, false, 'self-test: gated off under reduced motion');
motionPrefs.reduced = false;
// One-shot: driving through the whole run completes it, and it does NOT
// re-fire while still idle — an interaction re-arms it for the next period.
idle.forceSelfTestIdle();
let st = idle.updateIdleSelfTest(DT);
let selfTestGuard = 0;
while (st.active && selfTestGuard < 10000) { st = idle.updateIdleSelfTest(DT); selfTestGuard++; }
assert.ok(!st.active, 'self-test: the run completes and stands down');
assert.strictEqual(idle.updateIdleSelfTest(DT).active, false, 'self-test: one-shot — no re-fire while still idle');
idle.noteInteraction(); // re-arm
idle.forceSelfTestIdle();
assert.strictEqual(idle.updateIdleSelfTest(DT).active, true, 'self-test: an interaction re-arms the one-shot');
idle.noteInteraction(); // cancel mid-run
assert.strictEqual(idle.updateIdleSelfTest(DT).active, false, 'self-test: an interaction cancels the run instantly');

// ── 8b. Idle HEARTBEAT — a 20s-interval LED flash + scope flicker ──
// Fires every HEARTBEAT_INTERVAL_MS; the flash is a sine pulse that peaks
// at 1.0 then decays over HEARTBEAT_FLASH_SEC.  Repeats (NOT one-shot).
// Cancelled instantly on interaction, skipped under reduced motion.
{
    // Not firing before the interval.
    const hb0 = idle.updateIdleHeartbeat(DT);
    assert.strictEqual(hb0.frac, 0, 'heartbeat: not flashing before the interval');
    // Force past the interval.  The first tick starts the flash (frac = sin(0) = 0);
    // the second tick advances it into the sine pulse.
    idle.forceHeartbeatIdle();
    idle.updateIdleHeartbeat(DT); // starts the flash
    const hb1 = idle.updateIdleHeartbeat(DT); // advances into the pulse
    assert.ok(hb1.frac > 0, `heartbeat: fires once the interval is crossed (${hb1.frac.toFixed(3)})`);
    // The flash advances with deltas — a few ticks in, frac grew then
    // decayed (sine pulse peaks in the middle of the flash).
    let hbMax = hb1.frac;
    for (let i = 0; i < 10; i++) {
        const h = idle.updateIdleHeartbeat(DT);
        hbMax = Math.max(hbMax, h.frac);
    }
    assert.ok(hbMax > 0.5, `heartbeat: the sine pulse peaks above 0.5 (${hbMax.toFixed(3)})`);
    // Drive through the full flash to completion.
    let hg = 0;
    while (idle.updateIdleHeartbeat(DT).frac > 0 && hg < 1000) hg++;
    assert.ok(hg > 0, 'heartbeat: the flash completes and frac returns to 0');
    assert.strictEqual(idle.updateIdleHeartbeat(DT).frac, 0, 'heartbeat: idle after flash completes');
    // Repeats: driving past another interval fires again.
    idle.forceHeartbeatIdle();
    idle.updateIdleHeartbeat(DT); // starts the flash
    assert.ok(idle.updateIdleHeartbeat(DT).frac > 0, 'heartbeat: repeats on the next interval (not one-shot)');
    // Cancel mid-flash: interaction stops it instantly.
    idle.noteInteraction();
    assert.strictEqual(idle.updateIdleHeartbeat(DT).frac, 0, 'heartbeat: an interaction cancels the flash instantly');
    // Reduced motion: never fires.
    motionPrefs.reduced = true;
    idle.forceHeartbeatIdle();
    assert.strictEqual(idle.updateIdleHeartbeat(DT).frac, 0, 'heartbeat: gated off under reduced motion');
    motionPrefs.reduced = false;
    // LED array: a heartbeat flash lights all diodes past the calm base.
    updateLedArray(1.5, 'sec-about', null, 0, 0.8);
    const hbMaxLed = Math.max(...ledDomeMats.map((m) => m.emissiveIntensity));
    assert.ok(hbMaxLed > 1.0, `heartbeat: the LED flash lights all diodes past the calm base (${hbMaxLed.toFixed(2)})`);
}

// ── 9. Report ─────────────────────────────────────────────────
console.log('── tick smoke test: PASS ────────────────────────────');
console.log(`  graph: ${allMeshes.length} meshes, ${allMaterials.size} materials`);
console.log(`  ripple segments: ${rippleMats.length} | sweep: 2 | dust: ${dustMeshes.length} | pulses: ${pulseMeshes.length} | LEDs: ${ledDomeMats.length}`);
console.log(`  phase R: real-loop clock — stepFrame drives timer.update → getDelta → clamp → tickPrioritized as ONE chain (the dead-clock lock): 16.7ms steady frames, duplicate-ts frame still fires, 1s hitch clamped to the 50ms cap, elapsed accumulates`);
console.log(`  phase R2: priority-scheduler budget gating — CRITICAL always runs, STANDARD shed under 0ms budget, DEFERRED shed under >5ms total, generous budget runs all three tiers`);
console.log(`  phase A: ${NORMAL_FRAMES} frames normal motion — float/ripple/sweep/dust/LED/pulse in bounds, zero NaN`);
console.log(`    wake-in first tick y = ${firstTickY} (no settle-pop)`);
console.log(`    final float y = ${boardGroup.position.y.toFixed(4)} (|y| ≤ ${FLOAT_AMP_Y})`);
console.log(`  phase B: reduced-motion run — float planted, ${allMaterials.size} materials frozen, sweep + dust + pulses hidden, LCD game holds still`);
console.log(`  phase F: per-section ambient signatures — ${SECTION_IDS.length} neighborhoods (hero/about/projects/skills/experience/contact), each swept 5s through LED/ripple/pulse/dust/fleck/dot with bounds held`);
console.log(`  phase E: LCD1 SIGNAL RUNNER — power cycle (off→boot→3-2-1 countdown→auto-start→off), SPD/FPS HUD telemetry, auto-run + distance scoring, jump/double-jump/slide/dash physics, exclusive keys + ~ debug, pause (frozen world, dimmed glow), touch (tap-jump / swipe-slide / two-finger-pause / scroll-lock), deterministic unsteered death → record + leaderboard + FIRST RUN, identical re-run (pinned seed) holds the record, per-run seed variety (different layouts) within a bounded difficulty envelope, board FX (record chase / death dip fire + decay, no chase on identical runs, CPU checkpoint at 1000px), #/lcd boot replay`);
console.log(`  hash deep links: #/about #/projects #/skills #/experience #/contact resolve to their sections (round-trip), bare root → hero, #/lcd + unknown → null, case/slash-insensitive`);
console.log(`  phase C: raycast layer — ${rayAimed} aimable component-poses (${aimedNames.size} unique components) across ${RAY_POSES.length} camera poses, hover === independent ray at the same NDC (${rayAimed - rayMisses.length}/${rayAimed})`);
console.log(`  phase D: idle drift — offset bounds |x| ≤ ${DRIFT_X_MAX.toFixed(3)}, |y| ≤ ${DRIFT_Y_MAX.toFixed(3)}, deterministic, interaction resets the clock`);
console.log(`  idle self-test: 60s-stillness one-shot POST — fires at the threshold, sweep advances with deltas, LED walk lights past the calm base, completes and does NOT re-fire (one-shot), an interaction cancels instantly + re-arms, reduced-motion never starts it, POST line progression GEOMETRY → RAIL → OPERATIONAL`);
console.log(`  idle heartbeat: 20s-interval LED flash — sine pulse peaks >0.5, repeats (not one-shot), interaction cancels instantly, reduced-motion gated, LED array lights past the calm base`);
console.log(`  ambient: hover shadow (opacity ${shadowBlob.material.opacity.toFixed(2)}) + ${fleckMeshes.length} gold flecks + ${ledDomeMats.length} pulsing LEDs, all in bounds, hidden/frozen under reduced motion`);
