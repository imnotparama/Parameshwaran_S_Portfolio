import * as THREE from 'three';
import { traceData } from './traces.js';

export const particles = [];

const PARTICLE_RADIUS = 0.09;
// Electrons are LIVE — they use the signal green, the only glow in the fab-shop palette
const DEFAULT_PARTICLE_COLOR = 0x3ee6a0;
const BOOST_PARTICLE_COLOR = 0xffffff;

export function createParticles(boardGroup) {
    // Increase particle radius from 0.046 to 0.09
    const particleGeo = new THREE.SphereGeometry(0.09, 8, 8);
    
    // Bright glowing MeshStandardMaterial (emissiveIntensity 2.5)
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
            const mat = defaultMaterial.clone();
            const pMesh = new THREE.Mesh(particleGeo, mat);
            pMesh.visible = false;
            boardGroup.add(pMesh);

            // Add subtle PointLight to cast moving glows on the board
            const pLight = new THREE.PointLight(0xffffff, 0.3, 1.5);
            pMesh.add(pLight);

            const progress = i / numParticlesPerTrace;

            particles.push({
                mesh: pMesh,
                points: pathPoints,
                progress: progress,
                baseSpeed: 0.2, // Constant speed to prevent clumping over time
                speedMultiplier: 1.0,
                connectedComponent: trace.component,
                material: mat
            });
        }
    });
}

// Animate particles along the trace points
export function updateParticles(delta) {
    particles.forEach(p => {
        if (!p.mesh || !p.mesh.visible) return;

        // Calculate speed with delta clamping to prevent jumps
        const clampedDelta = Math.min(delta, 0.05);
        const speed = p.baseSpeed * p.speedMultiplier;
        p.progress += clampedDelta * speed;

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

// Speed up and brighten particles connected to hovered component
export function setHoveredTraceSpeedBoost(componentRef, isHovered) {
    particles.forEach(p => {
        if (p.connectedComponent === componentRef || (isHovered && componentRef === 'U1')) {
            p.speedMultiplier = isHovered ? 3.0 : 1.0;
            p.material.color.setHex(isHovered ? 0xffffff : 0x3ee6a0);
            if (p.material.emissive) {
                p.material.emissive.setHex(isHovered ? 0xffffff : 0x3ee6a0);
            }
        } else {
            p.speedMultiplier = 1.0;
            p.material.color.setHex(0x3ee6a0);
            if (p.material.emissive) {
                p.material.emissive.setHex(0x3ee6a0);
            }
        }
    });
}
