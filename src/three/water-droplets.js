// @ts-check
// ============================================================
// Water Droplets Physics
// Adds realistic, hydrophobic liquid water droplets onto the board surface.
// The droplets act like tiny physical magnifying lenses with high specular
// sheen and gentle surface tension wobbles when disturbed.
// ============================================================
import * as THREE from 'three';
import { motionPrefs } from '../utils/motion-prefs.js';
import { disposableResources } from './scene.js';

/** @type {THREE.Group | null} */
let dropletsGroup = null;

/** @typedef {{ mesh: THREE.Mesh, baseScale: THREE.Vector3, wobblePhase: number }} Droplet */
/** @type {Droplet[]} */
const droplets = [];

/**
 * Initialize water droplets on the board surface.
 * @param {THREE.Group} boardGroup
 */
export function initWaterDroplets(boardGroup) {
    if (dropletsGroup) return;

    dropletsGroup = new THREE.Group();
    dropletsGroup.name = 'WaterDropletsGroup';
    boardGroup.add(dropletsGroup);

    // Droplet Dome Geometry (half sphere)
    const dropGeo = new THREE.SphereGeometry(0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    disposableResources.geometries.add(dropGeo);

    // High-specular refractive water material
    const dropMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.05,
        metalness: 0.15,
        transparent: true,
        opacity: 0.72
    });
    disposableResources.materials.add(dropMat);

    // Positions on the board where no components sit (e.g. near fiducials & copper margins)
    const dropPositions = [
        new THREE.Vector3(-4.8, 6.2, 0.11),  // Top left edge
        new THREE.Vector3(4.5, -6.0, 0.11),   // Bottom right edge
        new THREE.Vector3(-3.9, -5.2, 0.11)   // Bottom left margin
    ];

    const scales = [
        new THREE.Vector3(1.1, 1.1, 0.45),
        new THREE.Vector3(0.85, 0.85, 0.38),
        new THREE.Vector3(0.65, 0.65, 0.32)
    ];

    dropPositions.forEach((pos, idx) => {
        const mesh = new THREE.Mesh(dropGeo, dropMat);
        mesh.position.copy(pos);
        mesh.scale.copy(scales[idx]);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        dropletsGroup?.add(mesh);

        droplets.push({
            mesh,
            baseScale: scales[idx].clone(),
            wobblePhase: idx * 2.1
        });
    });
}

/**
 * Disturb droplets with an external impulse (e.g. spacebar wave).
 */
export function disturbDroplets() {
    droplets.forEach((d) => {
        d.wobblePhase += 3.0;
    });
}

/**
 * Per-frame animation for water droplet surface tension wobble.
 * @param {number} elapsed
 */
export function updateWaterDroplets(elapsed) {
    if (!dropletsGroup) return;
    if (motionPrefs.reduced) {
        droplets.forEach((d) => d.mesh.scale.copy(d.baseScale));
        return;
    }

    droplets.forEach((d) => {
        // Natural micro-wobble from board vibration
        const wobble = Math.sin(elapsed * 4 + d.wobblePhase) * 0.04;
        d.mesh.scale.x = d.baseScale.x * (1 + wobble);
        d.mesh.scale.y = d.baseScale.y * (1 - wobble);
        d.mesh.scale.z = d.baseScale.z * (1 + wobble * 0.5);
    });
}
