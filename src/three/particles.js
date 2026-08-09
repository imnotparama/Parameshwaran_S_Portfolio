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
