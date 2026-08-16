// @ts-check
import * as THREE from 'three';
import gsap from 'gsap';
import { disposableResources } from './scene.js';
import { motionPrefs } from '../utils/motion-prefs.js';
import { getSectionAmbient } from './ambient-tunings.js';

/**
 * A routed copper trace between two components, materialized as solid 3D
 * segments plus endpoint/corner vias.
 * @typedef {Object} TraceRoute
 * @property {string} component Ref designator the trace feeds (e.g. 'U2', 'C1', 'J1').
 * @property {THREE.Vector3[]} points Route polyline (board-local space).
 * @property {number} width Trace width in world units.
 * @property {THREE.Mesh[]} meshes Solid 3D segment meshes that make up the trace.
 */

/** @type {TraceRoute[]} */
export const traceData = [];

// ─── Traveling current dot ────────────────────────────────────
// A single emissive dot that flows along the ACTIVE section's trace —
// the arrival pulse is the one-shot flash; this is the SUSTAINED current,
// power visibly flowing from the CPU to whatever the sidebar is showing.
// Deterministic: t = f(elapsed), position sampled from a cached CatmullRom
// curve in board-local space (no DOM, no wall-clock reads).
// Decorative ambient motion — reduced-motion users get a static dot at the
// trace's source (still reads as powered, never flickers).
const TRACE_CURRENT_SPEED = 0.3; // t units per second (≈1.3–2 world u/s)
/** @type {Record<string, string>} */
const SECTION_TRACE = { 'sec-hero': '', 'sec-about': 'U1', 'sec-projects': 'U2', 'sec-skills': 'C1', 'sec-experience': 'J1', 'sec-contact': 'ANT1' };

/** @type {Map<string, THREE.CatmullRomCurve3>} */
let traceCurves = new Map();
/** @type {THREE.Mesh | null} */
let currentDot = null;

// ─── Trace power ripple ───────────────────────────────────────
// The copper is alive: a power blob continuously floods EVERY trace from the
// CPU outward — the current dot is the active section's focused pulse, this
// is the whole board's ambient current (the electrons ride on top of it).
// Deterministic from elapsed; the blob is a sharpened sine travelling along
// each route's cumulative length, so the wave visibly flows through the
// copper instead of the board reading as a solid stamped part.
const TRACE_BASE_INTENSITY = 0.4;   // the built-in static glow (unchanged)
const RIPPLE_AMP = 0.75;             // blob adds up to +0.75 on top
const RIPPLE_SPEED = 0.45;           // waves per second
const RIPPLE_WAVELENGTH = 3.2;       // world units per wave — blob spans ~3u

/** @type {Array<{ mat: THREE.MeshStandardMaterial, distFromStart: number }>} */
const rippleSegments = [];
/** @type {Map<string, THREE.MeshStandardMaterial[]>} */
const traceMatByRef = new Map();
/** Materials the probe is currently energizing (hover highlight) — the
 *  ripple skips these and they get their own fast shimmer instead. */
/** @type {Set<THREE.MeshStandardMaterial>} */
const highlightedTraceMats = new Set();

/** @param {THREE.Group} boardGroup */
export function createTraces(boardGroup) {
    const thickness = 0.16;
    const surfaceZ = thickness / 2 + 0.005;

    // Metal trace material (Proper Gold)
    const traceMaterial = new THREE.MeshStandardMaterial({
        color: 0xc8960c,
        roughness: 0.3,
        metalness: 0.85,
        emissive: 0xc8960c,
        emissiveIntensity: 0.4
    });
    disposableResources.materials.add(traceMaterial);

    const viaOuterMaterial = new THREE.MeshStandardMaterial({
        color: 0xc8960c,
        roughness: 0.25,
        metalness: 0.9
    });
    disposableResources.materials.add(viaOuterMaterial);

    const viaInnerMaterial = new THREE.MeshStandardMaterial({
        color: 0x050f05,
        roughness: 0.9,
        metalness: 0.0
    });
    disposableResources.materials.add(viaInnerMaterial);

    // Trace route point layouts (coordinates strictly 0, 45, 90 deg)
    const rawPaths = [
        // 1. CPU (U1) to GPU (U2) Main Bus
        {
            component: 'U2',
            width: 0.09,
            points: [
                new THREE.Vector3(-0.6, 2.2, surfaceZ),
                new THREE.Vector3(-0.6, 3.2, surfaceZ),
                new THREE.Vector3(-1.9, 3.2, surfaceZ),
                new THREE.Vector3(-3.2, 4.5, surfaceZ)
            ]
        },
        // 2. CPU (U1) to C1-C4 Capacitor bank medium traces
        {
            component: 'C1',
            width: 0.05,
            points: [
                new THREE.Vector3(0.2, 2.2, surfaceZ),
                new THREE.Vector3(0.2, 3.0, surfaceZ),
                new THREE.Vector3(1.0, 3.8, surfaceZ),
                new THREE.Vector3(2.3, 3.8, surfaceZ),
                new THREE.Vector3(2.3, 4.2, surfaceZ)
            ]
        },
        {
            component: 'C2',
            width: 0.05,
            points: [
                new THREE.Vector3(0.4, 2.2, surfaceZ),
                new THREE.Vector3(0.4, 2.8, surfaceZ),
                new THREE.Vector3(1.2, 3.6, surfaceZ),
                new THREE.Vector3(2.9, 3.6, surfaceZ),
                new THREE.Vector3(2.9, 4.2, surfaceZ)
            ]
        },
        {
            component: 'C3',
            width: 0.05,
            points: [
                new THREE.Vector3(0.6, 2.2, surfaceZ),
                new THREE.Vector3(0.6, 2.6, surfaceZ),
                new THREE.Vector3(1.4, 3.4, surfaceZ),
                new THREE.Vector3(3.5, 3.4, surfaceZ),
                new THREE.Vector3(3.5, 4.2, surfaceZ)
            ]
        },
        {
            component: 'C4',
            width: 0.05,
            points: [
                new THREE.Vector3(0.8, 2.2, surfaceZ),
                new THREE.Vector3(0.8, 2.4, surfaceZ),
                new THREE.Vector3(1.6, 3.2, surfaceZ),
                new THREE.Vector3(4.1, 3.2, surfaceZ),
                new THREE.Vector3(4.1, 4.2, surfaceZ)
            ]
        },
        // 3. CPU (U1) to Crystal (Y1) Thin Trace
        {
            component: 'Y1',
            width: 0.03,
            points: [
                new THREE.Vector3(-1.25, 0.8, surfaceZ),
                new THREE.Vector3(-2.1, 0.8, surfaceZ),
                new THREE.Vector3(-2.4, 0.5, surfaceZ),
                new THREE.Vector3(-2.9, 0.5, surfaceZ)
            ]
        },
        // 4. CPU (U1) to USB connector (J1) Thick Trace
        {
            component: 'J1',
            width: 0.10,
            points: [
                new THREE.Vector3(0, -0.2, surfaceZ),
                new THREE.Vector3(0, -6.9, surfaceZ)
            ]
        },
        // 5. CPU (U1) to Antenna (ANT1) Medium Trace
        {
            component: 'ANT1',
            width: 0.05,
            points: [
                new THREE.Vector3(1.25, 0.8, surfaceZ),
                new THREE.Vector3(2.1, 0.8, surfaceZ),
                new THREE.Vector3(2.4, 0.5, surfaceZ),
                new THREE.Vector3(3.0, 0.5, surfaceZ)
            ]
        },
        // 6. USB (J1) to VR1 Power trace
        {
            component: 'VR1',
            width: 0.06,
            points: [
                new THREE.Vector3(0.6, -6.9, surfaceZ),
                new THREE.Vector3(0.6, -5.8, surfaceZ),
                new THREE.Vector3(1.9, -5.8, surfaceZ),
                new THREE.Vector3(3.2, -4.5, surfaceZ),
                new THREE.Vector3(3.5, -4.5, surfaceZ)
            ]
        },
        // 7. LED array (D1-D7) to VR1 Power trace
        {
            component: 'D1-D7',
            width: 0.04,
            points: [
                new THREE.Vector3(-2.3, -4.5, surfaceZ),
                new THREE.Vector3(-1.3, -4.5, surfaceZ),
                new THREE.Vector3(-0.7, -3.9, surfaceZ),
                new THREE.Vector3(0.7, -3.9, surfaceZ),
                new THREE.Vector3(1.3, -4.5, surfaceZ),
                new THREE.Vector3(3.0, -4.5, surfaceZ)
            ]
        },
        // 8. Ground edge ring trace connecting to ANT1
        {
            component: 'ANT1',
            width: 0.03,
            points: [
                new THREE.Vector3(3.0, 0.5, surfaceZ),
                new THREE.Vector3(4.5, 0.5, surfaceZ),
                new THREE.Vector3(4.5, 6.6, surfaceZ),
                new THREE.Vector3(-4.5, 6.6, surfaceZ),
                new THREE.Vector3(-4.5, -6.6, surfaceZ),
                new THREE.Vector3(4.5, -6.6, surfaceZ),
                new THREE.Vector3(4.5, -4.2, surfaceZ),
                new THREE.Vector3(4.1, -4.2, surfaceZ)
            ]
        }
    ];

    // Helper to generate solid 3D traces (rotates box geometry between points)
    const addTraceMesh = (/** @type {THREE.Vector3} */ pA, /** @type {THREE.Vector3} */ pB, /** @type {number} */ traceWidth) => {
        const distance = pA.distanceTo(pB);
        const midpoint = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);

        const segmentGeo = new THREE.BoxGeometry(traceWidth, distance, 0.012);
        const segment = new THREE.Mesh(segmentGeo, traceMaterial.clone());

        segment.position.copy(midpoint);
        // Align segment angle
        const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
        segment.rotation.z = angle - Math.PI / 2;
        segment.receiveShadow = true;
        boardGroup.add(segment);
        return segment;
    };

    // Helper to create small copper vias (rings)
    const addVia = (/** @type {number} */ px, /** @type {number} */ py) => {
        const viaGroup = new THREE.Group();
        viaGroup.position.set(px, py, surfaceZ);
        boardGroup.add(viaGroup);

        // Via copper pad ring
        const ringGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.015, 12);
        ringGeo.rotateX(Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, viaOuterMaterial);
        viaGroup.add(ring);

        // Via internal hole (dark center)
        const holeGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.018, 12);
        holeGeo.rotateX(Math.PI / 2);
        const hole = new THREE.Mesh(holeGeo, viaInnerMaterial);
        hole.position.z = 0.001;
        viaGroup.add(hole);
    };

    // Construct traces and vias
    rawPaths.forEach(path => {
        const meshes = [];
        let dist = 0;
        for (let i = 0; i < path.points.length - 1; i++) {
            const pA = path.points[i];
            const pB = path.points[i + 1];
            const seg = addTraceMesh(pA, pB, path.width);
            meshes.push(seg);
            // Record the segment + its cumulative distance from the CPU so the
            // ripple wave can travel along the route (per-segment cloned
            // materials — independent writes, no shared-material fights).
            const segMat = /** @type {THREE.MeshStandardMaterial} */ (seg.material);
            rippleSegments.push({ mat: segMat, distFromStart: dist });
            if (!traceMatByRef.has(path.component)) traceMatByRef.set(path.component, []);
            /** @type {THREE.MeshStandardMaterial[]} */ (traceMatByRef.get(path.component)).push(segMat);
            dist += pA.distanceTo(pB);

            // Place vias at corners (intermediate points)
            if (i > 0) {
                addVia(pA.x, pA.y);
            }
        }
        // Place vias at start and end points
        addVia(path.points[0].x, path.points[0].y);
        addVia(path.points[path.points.length - 1].x, path.points[path.points.length - 1].y);

        // Save trace metadata for particle flows
        traceData.push({
            component: path.component,
            points: path.points,
            width: path.width,
            meshes: meshes
        });
    });

    // Cache one smooth curve per component (first route wins — ANT1 has two
    // routes but is never an active-section ref, so no ambiguity in practice).
    traceCurves = new Map();
    traceData.forEach((route) => {
        if (!traceCurves.has(route.component)) {
            traceCurves.set(route.component, new THREE.CatmullRomCurve3(route.points, false, 'catmullrom', 0.4));
        }
    });

    // The current dot — small, bright, blooms through the same threshold as
    // the electrons (MeshStandardMaterial emissive, tone-mapped by bloom).
    const dotGeo = new THREE.SphereGeometry(0.07, 16, 16);
    const dotMat = new THREE.MeshStandardMaterial({
        color: 0x03160d,
        emissive: 0x3ee6a0,
        emissiveIntensity: 2.5
    });
    currentDot = new THREE.Mesh(dotGeo, dotMat);
    currentDot.name = 'trace-current-dot'; // named for debugging / scene-graph queries
    currentDot.visible = false;
    boardGroup.add(currentDot);
    disposableResources.geometries.add(dotGeo);
    disposableResources.materials.add(dotMat);

    // Ambient signal pulses — one small gold dot continuously traveling each
    // main trace route, independent of scroll: this is what makes the board
    // read as "powered on" rather than just lit (the green current dot is the
    // active section's focused pulse; these are the whole board's ambient
    // current, in the copper's own gold). Deterministic: position is sampled
    // from the cached CatmullRom curves at a staggered, seeded phase. Hidden
    // entirely under reduced motion — a static dot on every trace would read
    // as sensor noise (same posture as dust/sweep/flecks).
    ambientPulses = [];
    const pulseGeo = new THREE.SphereGeometry(0.05, 10, 10);
    let pulseIdx = 0;
    traceCurves.forEach((curve) => {
        const pulseMat = new THREE.MeshStandardMaterial({
            color: 0x3d2c07,
            emissive: 0xc8960c,
            emissiveIntensity: 1.4
        });
        const pulse = new THREE.Mesh(pulseGeo, pulseMat);
        pulse.name = 'ambient-pulse'; // named for scene-graph queries / smoke test
        pulse.visible = false;
        boardGroup.add(pulse);
        ambientPulses.push({ mesh: pulse, curve, phase: pulseIdx * 0.137 + 0.31 });
        pulseIdx++;
    });
    disposableResources.geometries.add(pulseGeo);
}

// ─── Ambient signal pulses ────────────────────────────────────
// One gold current dot per main trace route, continuously traveling — the
// board's ambient current (the green trace-current-dot is the ACTIVE section's
// focused pulse; these run on every route, independent of scroll). Slower
// than the current dot so the two layers never move in lockstep.
const AMBIENT_PULSE_SPEED = 0.2; // t units per second
let ambientPulseSpeedMultiplier = 1;
/** @type {ReturnType<typeof setTimeout> | null} */
let traceEnergizeTimeoutId = null;

/** @typedef {{ mesh: THREE.Mesh, curve: THREE.CatmullRomCurve3, phase: number }} AmbientPulse */
/** @type {AmbientPulse[]} */
let ambientPulses = [];

/** Per-frame continuous current along every main trace route. Called from the
 *  tick loop — runs independent of scroll, alongside the active-section
 *  current dot (traces.updateTraceCurrent). The section's pulseSpeed scales
 *  the travel rate (the prototype zone races its pulses; the capacitor banks
 *  let theirs cruise) — composed with the probe-energize surge multiplier.
 *  @param {number} elapsed
 *  @param {string} [sectionId] */
export function updateAmbientPulses(elapsed, sectionId) {
    const t = getSectionAmbient(sectionId);
    for (const p of ambientPulses) {
        if (motionPrefs.reduced) {
            p.mesh.visible = false;
            continue;
        }
        p.mesh.visible = true;
        const s = (elapsed * AMBIENT_PULSE_SPEED * t.pulseSpeed * ambientPulseSpeedMultiplier + p.phase) % 1;
        p.curve.getPoint(s, p.mesh.position);
        p.mesh.position.z += 0.02; // lift just above the trace surface
    }
}

/** Energize (or release) the copper feeding a component when the probe
 *  hovers it — the board answers the pointer through its traces, not just
 *  the component body. 'U1' is the power source: hovering it lights every
 *  route. No-ops for refs with no route (RN1, TP1/2, BZ1, project chips).
 *  @param {string} ref @param {boolean} on */
export function highlightTrace(ref, on) {
    const mats = ref === 'U1'
        ? rippleSegments.map(s => s.mat)
        : (traceMatByRef.get(ref) || []);
    if (on) {
        for (const m of mats) {
            highlightedTraceMats.add(m);
            gsap.killTweensOf(m);
        }
    } else {
        for (const m of mats) {
            if (!highlightedTraceMats.has(m)) continue;
            highlightedTraceMats.delete(m);
            gsap.killTweensOf(m);
            // Decay back to the ripple's base; the ripple resumes writing once
            // the tween completes (the isTweening guard below holds it off).
            gsap.to(m, { emissiveIntensity: TRACE_BASE_INTENSITY, duration: 0.35, ease: 'power2.out', overwrite: 'auto' });
        }
    }
}

/** Per-frame copper current. Called from the tick loop. The active section's
 *  signature shapes the wave itself: rippleSpeed (tempo), rippleWavelength
 *  (the spatial period — wide long waves for the I/O port, tight short ones
 *  in the prototype zone), and rippleAmp (how much the power blob lifts off
 *  the base glow). All are multipliers ≤ 1.0 on the amplitude so the smoke
 *  test's [base, base+amp] bound holds for every section.
 *  @param {number} elapsed
 *  @param {string} [sectionId] */
export function updateTraceRipple(elapsed, sectionId) {
    const t = getSectionAmbient(sectionId);
    for (const seg of rippleSegments) {
        const m = seg.mat;
        if (highlightedTraceMats.has(m)) {
            // Probe-energized: steady bright with a fast shimmer — reads as
            // "the probe is touching this copper", distinct from the slow
            // traveling blob. Held flat under reduced motion (a user-triggered
            // response, not ambient motion — but no strobe).
            m.emissiveIntensity = motionPrefs.reduced ? 1.5 : 1.5 + 0.3 * Math.sin(elapsed * 4);
            continue;
        }
        // Reduced motion: copper holds its static base glow (powered, calm).
        // isTweening guard: never fight the hover-release tween on the same
        // property — same pattern as the LED breathe vs the focus flash.
        if (motionPrefs.reduced || gsap.isTweening(m)) continue;
        const phase = (elapsed * RIPPLE_SPEED * t.rippleSpeed - seg.distFromStart / (RIPPLE_WAVELENGTH * t.rippleWavelength)) % 1;
        const blob = Math.pow(Math.max(0, Math.sin(phase * Math.PI)), 3);
        m.emissiveIntensity = TRACE_BASE_INTENSITY + RIPPLE_AMP * t.rippleAmp * blob;
    }
}

/** Drive the current dot along the active section's trace. Called per frame
 *  from the tick loop with the live section id (getActiveSectionId). The
 *  section's dotSpeed scales the travel rate — the focused signal flows fast
 *  to the antenna, deliberate toward the capacitor banks.
 *  @param {number} elapsed
 *  @param {string} activeSectionId */
export function updateTraceCurrent(elapsed, activeSectionId) {
    if (!currentDot) return;
    const ref = SECTION_TRACE[activeSectionId] || '';
    const curve = ref ? traceCurves.get(ref) : undefined;
    if (!curve) {
        currentDot.visible = false;
        return;
    }
    currentDot.visible = true;
    const tune = getSectionAmbient(activeSectionId);
    // Reduced motion: pin the dot at the trace source (the CPU end) — the
    // component still reads as powered without ambient travel.
    const t = motionPrefs.reduced ? 0 : (elapsed * TRACE_CURRENT_SPEED * tune.dotSpeed) % 1;
    curve.getPoint(t, currentDot.position);
    // Lift just above the trace surface (trace height 0.012, centered on
    // surfaceZ — the polyline's own z is the board surface).
    currentDot.position.z += 0.025;
}

/** Energize or de-energize the trace for a given section.
 *  @param {string} sectionId
 *  @param {boolean} on */
export function energizeTraceForSection(sectionId, on) {
    const ref = SECTION_TRACE[sectionId];
    if (!ref) return; // no trace for this section

    const mats = ref === 'U1'
        ? rippleSegments.map(s => s.mat)
        : (traceMatByRef.get(ref) || []);

    if (on) {
        // Reduced motion: no surge flash — the trace simply holds its base
        // glow (same posture as the ripple, which is frozen at base there).
        if (motionPrefs.reduced) return;
        // Energize: surge pulse then settle
        for (const m of mats) {
            gsap.killTweensOf(m);
            gsap.to(m, { emissiveIntensity: 2.5, duration: 0.1 })
                .then(() => gsap.to(m, { emissiveIntensity: TRACE_BASE_INTENSITY, duration: 0.8, ease: 'power3.out' }));
        }
        // Accelerate ambient pulse speed on that route for 1.5s
        if (traceEnergizeTimeoutId !== null) clearTimeout(traceEnergizeTimeoutId);
        ambientPulseSpeedMultiplier = 3;
        traceEnergizeTimeoutId = setTimeout(() => {
            ambientPulseSpeedMultiplier = 1;
        }, 1500);
    } else {
        // De-energize: decay back to base intensity (should already be decaying from the surge)
        // We'll do nothing because the surge pulse already decays to base.
        // But to be safe, we'll ensure it decays to base.
        for (const m of mats) {
            gsap.killTweensOf(m);
            // Reduced motion: snap to base instead of tweening (ripple frozen).
            if (motionPrefs.reduced) {
                m.emissiveIntensity = TRACE_BASE_INTENSITY;
                continue;
            }
            gsap.to(m, { emissiveIntensity: TRACE_BASE_INTENSITY, duration: 0.8, ease: 'power3.out' });
        }
    }
}