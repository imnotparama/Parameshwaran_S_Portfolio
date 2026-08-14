// @ts-check
// ============================================================
// Flying Scope Probe — the board's test probe, flyable with WASD
// (and arrows once active). It stands ON the board at a board-local
// coordinate — so it survives every camera move (scroll stays the
// primary path; the probe is board-attached, not camera-relative).
// While active it suspends the mouse raycast hover (one probe at a
// time), glows the component under its tip, drives the HUD scope
// readout, and MEASUREs on Enter (PROJECT → focusProject datasheet,
// BZ1 → pulseBuzzer). Esc exits; the probe hides when idle.
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { interactiveObjects, pulseBuzzer } from './components.js';
import { focusProject } from '../scroll/journey.js';
import { setScopeReadout, clearScopeReadout, clearHover } from '../utils/hover.js';

// Board surface (board thickness 0.16 in board.js — keep in sync).
const SURFACE_Z = 0.085;
const PROBE_SPEED = 2.6;   // board units per second
const BOARD_HALF = 7.0;    // clamp bounds (board spans ±7.5)
const DEFAULT_POS = new THREE.Vector3(0, 2.6, SURFACE_Z); // near the chip row

/** @type {THREE.Group | null} */
let probeGroup = null;
/** @type {THREE.Group | null} */
let boardRef = null;
/** @type {THREE.Mesh | null} */
let probeTip = null;
/** @type {THREE.Object3D | null} */
let probeTarget = null;      // the component currently under the tip
/** @type {THREE.Raycaster | null} */
let raycaster = null;
const pressedKeys = new Set();
let probeActive = false;
// Throttle the tip raycast to every 2nd frame during flight — each pass hits
// the full interactive set (mouse hover is suspended while the probe is
// active, so a dedup is safe; threejs-interaction perf discipline: limit
// raycasts). The probe moves at 2.6 u/s, so a 30Hz check is imperceptible;
// the first frame still runs (0 % 2 === 0) so the tip highlights immediately.
let probeFrame = 0;

/** @param {THREE.Group} boardGroup */
export function createProbe(boardGroup) {
    boardRef = boardGroup;
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6, metalness: 0.3 });
    const bandMat = new THREE.MeshStandardMaterial({
        color: 0x3ee6a0, emissive: 0x3ee6a0, emissiveIntensity: 1.2, roughness: 0.3
    });
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xc9a24b, roughness: 0.3, metalness: 0.9 });

    probeGroup = new THREE.Group();
    probeGroup.name = 'scope-probe'; // named for debugging / scene-graph queries
    probeGroup.position.copy(DEFAULT_POS);
    probeGroup.visible = false;
    boardGroup.add(probeGroup);

    // Handle (vertical cylinder) with a signal-green band
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.55, 12), handleMat);
    handle.position.z = 0.44;
    handle.castShadow = true;
    probeGroup.add(handle);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 12), bandMat);
    band.position.z = 0.3;
    probeGroup.add(band);

    // Metal tip cone — apex exactly at the board surface (group z = SURFACE_Z)
    probeTip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 12), tipMat);
    probeTip.rotation.x = Math.PI; // apex down
    probeTip.position.z = 0.08;    // apex at z=0 → touches the board
    probeTip.castShadow = true;
    probeGroup.add(probeTip);

    // Measurement-point ring on the board under the tip
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0, transparent: true, opacity: 0.4,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.14, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.z = 0.014;
    probeGroup.add(ring);

    raycaster = new THREE.Raycaster();
}

/** Is the flying probe mode currently active? (main.js gates the mouse
 *  hover raycast on this — one probe at a time.) */
export function isProbeModeActive() {
    return probeActive;
}

/** Activate the probe (WASD press). Clears any stale mouse hover so the
 *  two probes never double-glow, then shows the hint's dismissal. */
export function activateProbe() {
    if (!probeGroup || probeActive) return;
    probeActive = true;
    clearHover();
    probeGroup.visible = true;
    document.body.classList.add('probe-flying');
    document.body.classList.add('probe-used');
}

/** Deactivate (Esc). Un-glows the target, hides the probe, restores the
 *  mouse hover path. */
export function deactivateProbe() {
    if (!probeActive) return;
    probeActive = false;
    pressedKeys.clear();
    unhighlightTarget();
    if (probeGroup) probeGroup.visible = false;
    document.body.classList.remove('probe-flying');
    clearScopeReadout();
}

/** @param {string} key Arrow keys / WASD names used by the movement set. */
export function pressProbeKey(/** @type {string} */ key) {
    pressedKeys.add(key);
    activateProbe();
}

export function releaseProbeKey(/** @type {string} */ key) {
    pressedKeys.delete(key);
}

// ─── Highlight swap (same glow language as the mouse hover) ──
function unhighlightTarget() {
    if (!probeTarget) return;
    const obj = probeTarget;
    probeTarget = null;
    if (obj instanceof THREE.Mesh) {
        const mat = /** @type {any} */ (obj.material);
        if (mat.emissive) {
            gsap.killTweensOf(mat);
            mat.emissiveIntensity = 0;
            mat.emissive.setHex(0x000000);
        }
        gsap.killTweensOf(obj.scale);
        gsap.to(obj.scale, { x: 1, y: 1, z: 1, duration: 0.2, overwrite: 'auto' });
    }
}

function highlightTarget(/** @type {THREE.Object3D} */ obj) {
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = /** @type {any} */ (obj.material);
    if (mat.emissive) {
        gsap.killTweensOf(mat);
        mat.emissive.setHex(0x3ee6a0);
        gsap.to(mat, { emissiveIntensity: 0.5, duration: 0.2, overwrite: 'auto' });
    }
    gsap.killTweensOf(obj.scale);
    gsap.to(obj.scale, { x: 1.04, y: 1.04, z: 1.04, duration: 0.2, ease: 'power1.out', overwrite: 'auto' });
}

/** Recompute what's under the tip. The ray is authored in BOARD-LOCAL
 *  space (the probe stands on the board at a local coordinate) but
 *  Raycaster works in WORLD space — so the origin is transformed by the
 *  board group's matrix and the direction by its rotation only.
 *  intersectObjects converts back per-object, netting the local ray. */
function updateTarget() {
    if (!raycaster || !probeGroup || !boardRef) return;
    const localOrigin = new THREE.Vector3(probeGroup.position.x, probeGroup.position.y, 10);
    const localDir = new THREE.Vector3(0, 0, -1);
    const worldOrigin = boardRef.localToWorld(localOrigin);
    const worldDir = localDir.transformDirection(boardRef.matrixWorld);
    raycaster.set(worldOrigin, worldDir);
    const targets = interactiveObjects.filter((o) => o.userData && o.userData.isInteractive);
    const hits = raycaster.intersectObjects(targets, false);
    const next = hits.length > 0 ? hits[0].object : null;
    if (next === probeTarget) return;
    unhighlightTarget();
    probeTarget = next;
    if (next) {
        highlightTarget(next);
        setScopeReadout(/** @type {string} */ (next.name), next.userData);
    } else {
        clearScopeReadout();
    }
}

/** Measure the component under the tip (Enter). */
export function measureProbeTarget() {
    if (!probeActive || !probeTarget) return;
    const ud = probeTarget.userData;
    const name = /** @type {string} */ (probeTarget.name);
    if (ud && ud.type === 'PROJECT') {
        focusProject(name);
    } else if (ud && ud.type === 'BUZZER') {
        pulseBuzzer();
    }
}

/** Per-frame: move the probe, keep it on the board, update the tip target.
 *  @param {number} delta seconds since last frame */
export function updateProbe(delta) {
    if (!probeActive || !probeGroup) return;
    let dx = 0;
    let dy = 0;
    if (pressedKeys.has('w') || pressedKeys.has('ArrowUp')) dy += 1;
    if (pressedKeys.has('s') || pressedKeys.has('ArrowDown')) dy -= 1;
    if (pressedKeys.has('a') || pressedKeys.has('ArrowLeft')) dx -= 1;
    if (pressedKeys.has('d') || pressedKeys.has('ArrowRight')) dx += 1;
    if (dx !== 0 || dy !== 0) {
        // Normalize diagonals so they don't move faster than straights
        const len = Math.hypot(dx, dy);
        probeGroup.position.x = Math.min(BOARD_HALF, Math.max(-BOARD_HALF, probeGroup.position.x + (dx / len) * PROBE_SPEED * delta));
        probeGroup.position.y = Math.min(BOARD_HALF, Math.max(-BOARD_HALF, probeGroup.position.y + (dy / len) * PROBE_SPEED * delta));
    }
    probeFrame++;
    if (probeFrame % 2 === 0) updateTarget();
}
