// ============================================================
// Project components — each project is a distinct component
// on the board near the U2 project array.
//   shipped  → finished, soldered chip: solid trace, steady glow
//   building → open breadboard patch: jumper wires, faint flicker
// This gives "still figuring the rest out" a literal visual form.
// ============================================================
// @ts-check
import * as THREE from 'three';
import gsap from 'gsap';
import { disposableResources } from './scene.js';
import { interactiveObjects } from './components.js';
import { motionPrefs } from '../utils/motion-prefs.js';
import { portfolioData } from '../data/portfolio.js';

/** @typedef {{ mat: THREE.MeshStandardMaterial, seed: number }} FlickerLed */

/**
 * Chip lookup for the click-to-component focus interaction (journey.js).
 * pos is the chip group's position in boardGroup LOCAL space — the same
 * space COMPONENT_WORLD uses, so focus reuses the CAMERA_OFFSET language.
 * mats is every per-chip material (excludes the shared goldMat so the
 * filter's dim/brighten never bleeds across chips).
 * @typedef {{ pos: THREE.Vector3, data: any, ledMat: THREE.MeshStandardMaterial, mats: THREE.MeshStandardMaterial[] }} ChipRecord
 */

/** @type {FlickerLed[]} */
const flickerLeds = [];

/** A shipped chip's status LED: steady base glow with a slow deterministic
 *  breathe (seeded phase, like the flicker) so the whole board reads as
 *  powered — the shipped LEDs shouldn't sit perfectly flat while the radar
 *  sweeps, the current dot travels, and the breadboard LEDs flicker. */
/** @typedef {{ mat: THREE.MeshStandardMaterial, seed: number }} SteadyLed */
/** @type {SteadyLed[]} */
const steadyLeds = [];

// Decorative motion — respect prefers-reduced-motion: shipped LEDs hold a
// flat emissive (powered, not pulsing). Same gate pattern as the radar ring
// (components.js) and the current dot (traces.js); the flag comes from
// motionPrefs (../utils/motion-prefs.js), the single policy source.

/** @type {Record<string, ChipRecord>} */
export const projectChips = {};

// ─── Project filter (SMD DIP-switch pins) ─────────────────────
// section UI (sections.js) drives the DOM cards; this drives the 3D chips
// in sync — non-matching chips dim (emissiveIntensity → 0.05, LED off) so
// the board visibly filters like the datasheet grid. 'ALL' restores.
// The LED materials keep their per-frame flicker/breathe ONLY for matching
// chips — dimmed LEDs are pinned flat at 0.05 by updateProjectChips (same
// hold-as-static posture as reduced motion).
/** @type {Set<THREE.MeshStandardMaterial>} */
const dimmedLedMats = new Set();
let activeProjectFilter = 'ALL';

/** @param {THREE.Group} boardGroup */
export function createProjectChips(boardGroup) {
    const thickness = 0.16;
    const surfaceZ = thickness / 2 + 0.005;

    const chipMat = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.6,
        metalness: 0.3
    });
    const goldMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.3,
        metalness: 0.9
    });
    const breadboardMat = new THREE.MeshStandardMaterial({
        color: 0xd6c8a2,
        roughness: 0.95,
        metalness: 0.0
    });
    const solderTraceMat = new THREE.MeshStandardMaterial({
        color: 0xc8960c,
        roughness: 0.3,
        metalness: 0.85,
        emissive: 0x3ee6a0,
        emissiveIntensity: 0.5
    });
    disposableResources.materials.add(chipMat);
    disposableResources.materials.add(goldMat);
    disposableResources.materials.add(breadboardMat);
    disposableResources.materials.add(solderTraceMat);

    const projects = portfolioData.projects;
    const spacing = 0.68;
    const startX = -2.5 - ((projects.length - 1) * spacing) / 2; // centered under U2 region
    const rowY = 2.9;
    const busY = 2.25; // shared signal bus the soldered chips connect to

    // Shared bus line under the chip row (only soldered chips join it)
    const busGeo = new THREE.BoxGeometry((projects.length - 1) * spacing + 0.6, 0.05, 0.012);
    disposableResources.geometries.add(busGeo);
    const busMesh = new THREE.Mesh(busGeo, solderTraceMat.clone());
    busMesh.position.set(-2.5, busY, surfaceZ);
    boardGroup.add(busMesh);

    projects.forEach((proj, i) => {
        const x = startX + i * spacing;
        const group = new THREE.Group();
        group.position.set(x, rowY, surfaceZ);
        boardGroup.add(group);

        const isBuilding = proj.status === 'building';

        const ledMat = isBuilding
            ? buildBreadboardPatch(group)
            : buildSolderedChip(group, chipMat, goldMat, solderTraceMat, busY - rowY);

        // Local position + data for the focus camera glide and detail datasheet.
        // mats = every per-chip material (shared goldMat excluded — dimming
        // one chip must never dim its neighbor's pads).
        /** @type {THREE.MeshStandardMaterial[]} */
        const chipMats = [];
        group.traverse((o) => {
            if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && o.material !== goldMat) {
                chipMats.push(o.material);
            }
        });
        projectChips[proj.ref] = {
            pos: group.position.clone(),
            data: proj,
            ledMat,
            mats: chipMats
        };
        if (activeProjectFilter !== 'ALL') {
            applyChipFilter(projectChips[proj.ref]);
        }

        // Invisible hover bounds → tooltip shows the project name
        const boundsGeo = new THREE.BoxGeometry(0.6, 0.6, 0.3);
        const bounds = new THREE.Mesh(boundsGeo, new THREE.MeshBasicMaterial({ visible: false }));
        bounds.position.z = 0.1;
        bounds.name = proj.ref;
        bounds.userData = {
            componentName: `${proj.title} — ${isBuilding ? 'BREADBOARD (IN BUILD)' : 'SOLDERED (SHIPPED)'}`,
            type: 'PROJECT',
            isInteractive: true
        };
        group.add(bounds);
        interactiveObjects.push(bounds);
    });
}

// Finished, soldered chip — solid trace to the bus, steady glow LED.
/**
 * @param {THREE.Group} group
 * @param {THREE.MeshStandardMaterial} chipMat
 * @param {THREE.MeshStandardMaterial} goldMat
 * @param {THREE.MeshStandardMaterial} traceMat
 * @param {number} busOffsetY
 * @returns {THREE.MeshStandardMaterial} the steady status LED material (for focus flash)
 */
function buildSolderedChip(group, chipMat, goldMat, traceMat, busOffsetY) {
    const bodyGeo = new THREE.BoxGeometry(0.42, 0.42, 0.12);
    const body = new THREE.Mesh(bodyGeo, chipMat.clone());
    body.position.z = 0.06;
    body.castShadow = true;
    group.add(body);

    // Gold solder pads on two sides
    const padGeo = new THREE.BoxGeometry(0.07, 0.05, 0.03);
    for (let p = 0; p < 3; p++) {
        const off = (p - 1) * 0.13;
        const padL = new THREE.Mesh(padGeo, goldMat);
        padL.position.set(-0.245, off, 0.015);
        group.add(padL);
        const padR = new THREE.Mesh(padGeo, goldMat);
        padR.position.set(0.245, off, 0.015);
        group.add(padR);
    }

    // Solid finished trace down to the shared bus — steady glow
    const traceLen = Math.abs(busOffsetY) - 0.21;
    const traceGeo = new THREE.BoxGeometry(0.05, traceLen, 0.012);
    const trace = new THREE.Mesh(traceGeo, traceMat.clone());
    trace.position.set(0, busOffsetY / 2, 0.002);
    group.add(trace);

    // Steady status LED — shipped means it stays lit
    const ledGeo = new THREE.SphereGeometry(0.05, 10, 10);
    const ledMat = new THREE.MeshStandardMaterial({
        color: 0x3ee6a0,
        emissive: 0x3ee6a0,
        emissiveIntensity: 1.4,
        roughness: 0.3
    });
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0.14, 0.14, 0.14);
    group.add(led);
    // Seed per LED (deterministic at build time — same seeded-phase pattern
    // as the breadboard flicker) so the array breathes slightly out of sync.
    steadyLeds.push({ mat: ledMat, seed: Math.sin(group.position.x * 12.9898 + group.position.y * 78.233) * 43758.5453 });
    return ledMat;
}

// Open breadboard patch — visible jumper wires, faint flicker.
/** @param {THREE.Group} group @returns {THREE.MeshStandardMaterial} the flicker LED material (for focus flash) */
function buildBreadboardPatch(group) {
    const plateGeo = new THREE.BoxGeometry(0.56, 0.56, 0.05);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xd6c8a2, roughness: 0.95 });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.z = 0.025;
    group.add(plate);

    // Breadboard tie-point holes (small dark dots grid)
    const holeGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6);
    holeGeo.rotateX(Math.PI / 2);
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x2a2419, roughness: 1 });
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            const hole = new THREE.Mesh(holeGeo, holeMat);
            hole.position.set((c - 1.5) * 0.12, (r - 1.5) * 0.12, 0.052);
            group.add(hole);
        }
    }

    // Small chip loosely placed on the patch (slightly rotated — not seated)
    const microGeo = new THREE.BoxGeometry(0.2, 0.2, 0.08);
    const microMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6 });
    const micro = new THREE.Mesh(microGeo, microMat);
    micro.position.set(-0.08, 0.06, 0.09);
    micro.rotation.z = 0.18;
    group.add(micro);

    // Visible jumper wires arcing over the patch
    const jumperColors = [0xef4444, 0x3b82f6, 0xf59e0b];
    for (let j = 0; j < 3; j++) {
        const a = new THREE.Vector3(-0.2 + j * 0.1, -0.2, 0.05);
        const b = new THREE.Vector3(0.15 + j * 0.05, 0.18 - j * 0.08, 0.05);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        mid.z = 0.22 + j * 0.03;
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        const tubeGeo = new THREE.TubeGeometry(curve, 12, 0.012, 6, false);
        const tubeMat = new THREE.MeshStandardMaterial({
            color: jumperColors[j],
            roughness: 0.5
        });
        group.add(new THREE.Mesh(tubeGeo, tubeMat));
    }

    // Faintly flickering LED — still being figured out
    const ledGeo = new THREE.SphereGeometry(0.045, 10, 10);
    const ledMat = new THREE.MeshStandardMaterial({
        color: 0xc8960c,
        emissive: 0xc8960c,
        emissiveIntensity: 0.7,
        roughness: 0.3
    });
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0.18, -0.18, 0.09);
    group.add(led);
    // Deterministic per-LED phase (animejs discipline — no unseeded randomness):
    // each breadboard LED gets a fixed offset so they flicker out of lockstep,
    // identical on every page load and OG capture. The old Math.random() seed
    // made the board's "in build" LEDs pulse differently every visit.
    flickerLeds.push({ mat: ledMat, seed: flickerLeds.length * 2.4 });
    return ledMat;
}

/** Dim (or restore) one chip's 3D body to match the active filter. The LED
 *  itself is pinned by updateProjectChips via dimmedLedMats — this handles
 *  the body materials (the emissive trace + gold pads) so a dimmed chip
 *  reads as unpowered on the board, not just de-lit.
 *  @param {ChipRecord} chip */
function applyChipFilter(chip) {
    const dimmed = activeProjectFilter !== 'ALL' && chip.data.category !== activeProjectFilter;
    if (dimmed) {
        dimmedLedMats.add(chip.ledMat);
    } else {
        dimmedLedMats.delete(chip.ledMat);
    }
    for (const m of chip.mats) {
        gsap.killTweensOf(m);
        if (dimmed) {
            gsap.to(m, { emissiveIntensity: 0.05, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
        } else {
            gsap.to(m, { emissiveIntensity: m === chip.ledMat ? 1.4 : 0.5, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
        }
    }
}

/** Filter the board's project chips by category — dims non-matching chips
 *  and switches their LEDs off (sync with the DOM grid via sections.js).
 *  'ALL' restores every chip. Under reduced motion the chips snap to their
 *  new state instead of animating (same posture as the rest of the board).
 *  @param {string} filter */
export function setProjectFilter(filter) {
    activeProjectFilter = filter;
    for (const ref of Object.keys(projectChips)) {
        applyChipFilter(projectChips[ref]);
    }
}

// Per-frame: flicker the breadboard LEDs, keep soldered ones steady.
/** @param {number} elapsed */
export function updateProjectChips(elapsed) {
    // Reduced motion: every LED holds a calm, powered value — the breadboard
    // flicker is a per-frame strobe (caught by the tick smoke test running
    // ungated) and the breathe is ambient; both are decorative and gated by
    // the single policy flag (motionPrefs, plan 013). Dimmed (filtered-out)
    // LEDs stay flat off in BOTH modes — the filter is a user-driven state,
    // not motion.
    const ledValue = (/** @type {THREE.MeshStandardMaterial} */ mat, /** @type {number} */ base) =>
        dimmedLedMats.has(mat) ? 0.05 : base;
    if (motionPrefs.reduced) {
        for (const f of flickerLeds) f.mat.emissiveIntensity = ledValue(f.mat, 0.7);
        for (const s of steadyLeds) s.mat.emissiveIntensity = ledValue(s.mat, 1.4);
        return;
    }
    for (const f of flickerLeds) {
        if (dimmedLedMats.has(f.mat)) {
            f.mat.emissiveIntensity = 0.05;
            continue;
        }
        const n = Math.sin(elapsed * 7 + f.seed) * Math.sin(elapsed * 13.7 + f.seed * 2);
        f.mat.emissiveIntensity = n > 0.55 ? 0.15 : 0.7 + n * 0.25;
    }
    // Shipped LEDs: slow, subtle breathe around their 1.4 build-time base
    // (±0.08, ~7s period) — "powered but calm". The amplitude is small
    // relative to the base so it never reads as a light show or a dimming
    // fault (a lower base would slam the LED from 1.4 on the first tick),
    // and the focus flash (journey.js gsap tween with overwrite) still
    // dominates during its short run.
    for (const s of steadyLeds) {
        if (dimmedLedMats.has(s.mat)) {
            s.mat.emissiveIntensity = 0.05;
            continue;
        }
        // Skip materials the focus flash (journey.js focusProject) is
        // actively tweening — the breathe must not fight the flash's
        // 0.15→1.9 dip/spike. The rAF ordering (app loop before GSAP's
        // ticker) makes the flash win today, but that's registration
        // luck, not a guarantee: a same-property write every frame can
        // mask the tween if the loop ever registers later (HMR re-entry).
        if (gsap.isTweening(s.mat)) continue;
        s.mat.emissiveIntensity = 1.4 + Math.sin(elapsed * 0.9 + s.seed) * 0.08;
    }
}
