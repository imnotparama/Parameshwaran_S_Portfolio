// @ts-check
import * as THREE from 'three';
import { traceData } from './traces.js';

/** @typedef {{ mesh: THREE.Mesh, points: THREE.Vector3[], progress: number, baseSpeed: number }} Particle */

/** @type {Particle[]} */
export const particles = [];

/** @param {THREE.Group} boardGroup */
export function createParticles(boardGroup) {
    // Increase particle radius from 0.046 to 0.09
    const particleGeo = new THREE.SphereGeometry(0.09, 8, 8);
    
    // Bright glowing MeshStandardMaterial (emissiveIntensity 2.5)
    // No per-particle PointLight: the electrons are emissive at 2.5 and bloom
    // threshold is 0.7, so they glow brightly on their own. 60 moving point
    // lights (5 per trace x 12 traces) forced every lit material's shader to
    // evaluate 60 attenuations per fragment all journey long — the subtle
    // 0.3-intensity "moving glow" they added is redundant with the emissive +
    // bloom already in the scene (threejs-animation perf discipline: limit
    // active lights, disable what's not needed).
    const defaultMaterial = new THREE.MeshStandardMaterial({
        color: 0x3ee6a0,
        emissive: 0x3ee6a0,
        emissiveIntensity: 2.5,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.95
    });

    // Populate particles along each trace path
    traceData.forEach(trace => {
        const pathPoints = trace.points;
        const numParticlesPerTrace = 5; // Increased from 3 to 5

        for (let i = 0; i < numParticlesPerTrace; i++) {
            // Share ONE material across all particles — nothing differentiates
            // them per-particle (only mesh.visible toggles), and 60 clones were
            // 60 identical program bindings for zero gain (threejs-animation
            // perf discipline: share resources).
            const pMesh = new THREE.Mesh(particleGeo, defaultMaterial);
            pMesh.visible = false;
            boardGroup.add(pMesh);

            const progress = i / numParticlesPerTrace;

            particles.push({
                mesh: pMesh,
                points: pathPoints,
                progress: progress,
                baseSpeed: 0.2 // Constant speed to prevent clumping over time
            });
        }
    });

    // The trace electrons are the "current" layer; the dust cloud is the
    // atmosphere around the board. Same call site — one create call.
    createAmbientDust(boardGroup);
}

// ─── Ambient dust ─────────────────────────────────────────────
// A faint cloud of motes drifting around the board — pure atmosphere that
// sells the "live bench" feel (the board floats inside it; in night bench
// the motes catch the bloom). Deterministic from elapsed: every mote's
// drift is a fixed-seed sine (golden-angle-ish spacing via a hash, never
// Math.random), so the cloud is identical on every run and costs zero
// allocation per frame. Hidden entirely for reduced-motion users — a static
// speck field would read as sensor noise (same posture as the bench sweep).
const DUST_REDUCED_MOTION = typeof window !== 'undefined' &&
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DUST_COUNT = 32;
// Board-local box around the board (group scale 0.85 applies to children):
// x ±7, y ±8 surrounds the ±5.5×±7.5 substrate; z ranges from behind the
// board to in front of it so the cloud has depth, not a flat sheet.
const DUST_BOX_X = 7;
const DUST_BOX_Y = 8;
const DUST_Z_MIN = -1;
const DUST_Z_MAX = 2;

/** @typedef {{ mesh: THREE.Mesh, seed: number, bx: number, by: number, bz: number }} DustMote */
/** @type {DustMote[]} */
const dustMotes = [];

/** Deterministic unit hash — fixed for a given index, so the cloud layout
 *  never changes between loads (no Math.random in the animation path).
 *  @param {number} i @param {number} k @returns {number} */
function dustHash(i, k) {
    const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return s - Math.floor(s);
}

/** @param {THREE.Group} boardGroup */
function createAmbientDust(boardGroup) {
    const dustGeo = new THREE.SphereGeometry(0.035, 6, 6);
    const dustMat = new THREE.MeshBasicMaterial({
        color: 0xa8e6c8,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    for (let i = 0; i < DUST_COUNT; i++) {
        const mesh = new THREE.Mesh(dustGeo, dustMat);
        mesh.visible = false;
        boardGroup.add(mesh);
        dustMotes.push({
            mesh,
            seed: i * 1.7 + 0.31,
            bx: (dustHash(i, 1) * 2 - 1) * DUST_BOX_X,
            by: (dustHash(i, 2) * 2 - 1) * DUST_BOX_Y,
            bz: DUST_Z_MIN + dustHash(i, 3) * (DUST_Z_MAX - DUST_Z_MIN)
        });
    }
}

/** Per-frame mote drift. Called from the tick loop.
 *  @param {number} elapsed */
export function updateAmbientDust(elapsed) {
    for (const m of dustMotes) {
        if (DUST_REDUCED_MOTION) {
            m.mesh.visible = false;
            continue;
        }
        m.mesh.visible = true;
        // Slow Lissajous drift — each mote wanders a small cell around its
        // base position; different frequencies per axis so nothing moves in
        // lockstep (the cloud reads organic, never mechanical).
        m.mesh.position.set(
            m.bx + Math.sin(elapsed * 0.21 + m.seed) * 0.5,
            m.by + Math.sin(elapsed * 0.14 + m.seed * 1.7) * 0.65,
            m.bz + Math.cos(elapsed * 0.11 + m.seed * 2.3) * 0.4
        );
    }
}

// Animate particles along the trace points
/** @param {number} delta */
export function updateParticles(delta) {
    particles.forEach(p => {
        if (!p.mesh || !p.mesh.visible) return;

        // Delta is already clamped to MAX_DELTA (0.05) at the tick source in
        // scene.js — particles never see a post-background-tab spike.
        const speed = p.baseSpeed;
        p.progress += delta * speed;

        if (p.progress >= 1.0) {
            p.progress = 0.0;
        }

        // Interpolate along multi-segment coordinate vectors
        const numSegments = p.points.length - 1;
        if (numSegments < 1) return;

        const segmentProgress = p.progress * numSegments;
        const currentSegmentIndex = Math.floor(segmentProgress);
        const subProgress = segmentProgress - currentSegmentIndex;

        if (currentSegmentIndex < numSegments) {
            const startNode = p.points[currentSegmentIndex];
            const endNode = p.points[currentSegmentIndex + 1];

            // Linear interpolate position
            p.mesh.position.lerpVectors(startNode, endNode, subProgress);
        }
    });
}
