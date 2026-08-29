// @ts-check
// ============================================================
// 3D PCB Nano-Rover Mesh, Suspension & Skid Marks System
//
// 1. SMD Nano-Rover Vehicle Model:
//    - Miniature 4-wheel rover with gold ENIG circuit chassis.
//    - 4 rolling wheels with independent front steering angles.
//    - Dual LED headlights throwing forward illumination cones.
//    - Resistor exhaust ports with neon boost particles.
//
// 2. Drift Tire Skid Mark Decals:
//    - Lays decaying tire tracks on the soldermask when drifting.
// ============================================================

import * as THREE from 'three';
import { disposableResources } from './scene.js';

/** @type {THREE.Group | null} */
export let roverGroup = null;
/** @type {THREE.Mesh | null} */
let flWheel = null;
/** @type {THREE.Mesh | null} */
let frWheel = null;
/** @type {THREE.Mesh | null} */
let blWheel = null;
/** @type {THREE.Mesh | null} */
let brWheel = null;
/** @type {THREE.PointLight | null} */
let headlightL = null;
/** @type {THREE.PointLight | null} */
let headlightR = null;

// Skid mark decal pool
const MAX_SKIDS = 32;
/** @type {THREE.InstancedMesh | null} */
let skidMesh = null;
/** @type {Array<{ pos: THREE.Vector3, rotZ: number, life: number }>} */
const skidDecals = [];
const dummySkid = new THREE.Object3D();
let skidIndex = 0;

/**
 * Construct the 3D Nano-Rover vehicle.
 * @param {THREE.Group} boardGroup
 * @returns {THREE.Group}
 */
export function createRover(boardGroup) {
    roverGroup = new THREE.Group();
    roverGroup.position.set(0, -5.5, 0.22); // Spawn near bottom
    roverGroup.visible = false;

    // 1. Chassis Body (SMD Chip style with bevel)
    const bodyGeo = new THREE.BoxGeometry(0.48, 0.72, 0.16);
    disposableResources.geometries.add(bodyGeo);

    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        metalness: 0.6,
        roughness: 0.3,
        emissive: 0x0a2b0a,
        emissiveIntensity: 0.2
    });
    disposableResources.materials.add(bodyMat);

    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;
    roverGroup.add(bodyMesh);

    // Top Silicon Die / Gold Roof Accent
    const roofGeo = new THREE.PlaneGeometry(0.32, 0.44);
    const roofMat = new THREE.MeshStandardMaterial({
        color: 0xc9a24b,
        metalness: 0.95,
        roughness: 0.15,
        emissive: 0xc9a24b,
        emissiveIntensity: 0.4
    });
    disposableResources.geometries.add(roofGeo);
    disposableResources.materials.add(roofMat);
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.z = 0.081;
    roverGroup.add(roofMesh);

    // 2. Wheels (4 rubber cylinders)
    const wheelGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    disposableResources.geometries.add(wheelGeo);

    const wheelMat = new THREE.MeshStandardMaterial({
        color: 0x09090b,
        metalness: 0.1,
        roughness: 0.9
    });
    disposableResources.materials.add(wheelMat);

    flWheel = new THREE.Mesh(wheelGeo, wheelMat);
    frWheel = new THREE.Mesh(wheelGeo, wheelMat);
    blWheel = new THREE.Mesh(wheelGeo, wheelMat);
    brWheel = new THREE.Mesh(wheelGeo, wheelMat);

    flWheel.position.set(-0.28, 0.24, -0.02);
    frWheel.position.set(0.28, 0.24, -0.02);
    blWheel.position.set(-0.28, -0.24, -0.02);
    brWheel.position.set(0.28, -0.24, -0.02);

    roverGroup.add(flWheel);
    roverGroup.add(frWheel);
    roverGroup.add(blWheel);
    roverGroup.add(brWheel);

    // 3. Headlights (Twin LEDs throwing light cones)
    const headMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const headGeo = new THREE.SphereGeometry(0.04, 8, 8);
    disposableResources.geometries.add(headGeo);
    disposableResources.materials.add(headMat);

    const hlMeshL = new THREE.Mesh(headGeo, headMat);
    const hlMeshR = new THREE.Mesh(headGeo, headMat);
    hlMeshL.position.set(-0.16, 0.36, 0.02);
    hlMeshR.position.set(0.16, 0.36, 0.02);
    roverGroup.add(hlMeshL);
    roverGroup.add(hlMeshR);

    headlightL = new THREE.PointLight(0x00ffff, 1.2, 3.5);
    headlightR = new THREE.PointLight(0x00ffff, 1.2, 3.5);
    headlightL.position.set(-0.16, 0.5, 0.06);
    headlightR.position.set(0.16, 0.5, 0.06);
    roverGroup.add(headlightL);
    roverGroup.add(headlightR);

    boardGroup.add(roverGroup);

    // 4. Drift Skid Marks Decal Pool
    const skidGeo = new THREE.PlaneGeometry(0.08, 0.16);
    disposableResources.geometries.add(skidGeo);

    const skidMat = new THREE.MeshBasicMaterial({
        color: 0x020a04,
        transparent: true,
        opacity: 0.45,
        depthWrite: false
    });
    disposableResources.materials.add(skidMat);

    skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, MAX_SKIDS);
    skidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    disposableResources.geometries.add(skidMesh.geometry);
    disposableResources.materials.add(skidMesh.material);

    skidDecals.length = 0;
    for (let i = 0; i < MAX_SKIDS; i++) {
        skidDecals.push({ pos: new THREE.Vector3(0, 0, -100), rotZ: 0, life: 0 });
    }
    boardGroup.add(skidMesh);

    return roverGroup;
}

/**
 * Drop a skid mark decal at current position during hard drift.
 * @param {THREE.Vector3} pos
 * @param {number} rotZ
 */
export function addSkidMark(pos, rotZ) {
    if (!skidMesh) return;
    const skid = skidDecals[skidIndex];
    skid.pos.set(pos.x, pos.y, 0.081);
    skid.rotZ = rotZ;
    skid.life = 1.0;
    skidIndex = (skidIndex + 1) % MAX_SKIDS;
}

/**
 * Update wheel roll rotation, steering angle, and suspension tilt.
 * @param {{ pos: THREE.Vector3, vel: THREE.Vector3, angle: number, steer: number, speed: number, pitch: number, roll: number, isDrifting: boolean }} state
 * @param {number} delta
 */
export function updateRoverVisuals(state, delta) {
    if (!roverGroup || !roverGroup.visible) return;

    // Apply Position & Yaw Angle
    roverGroup.position.set(state.pos.x, state.pos.y, state.pos.z);
    roverGroup.rotation.z = state.angle;

    // Apply Suspension Pitch & Roll Tilts
    roverGroup.rotation.x = state.pitch;
    roverGroup.rotation.y = state.roll;

    // Front Wheel Steering Angle
    if (flWheel && frWheel) {
        flWheel.rotation.z = state.steer;
        frWheel.rotation.z = state.steer;
    }

    // Wheel Rolling Rotation based on speed
    const wheelRotDelta = (state.speed * delta) / 0.11;
    if (flWheel && frWheel && blWheel && brWheel) {
        flWheel.rotation.x += wheelRotDelta;
        frWheel.rotation.x += wheelRotDelta;
        blWheel.rotation.x += wheelRotDelta;
        brWheel.rotation.x += wheelRotDelta;
    }

    // Add Drift Skid Mark if drifting
    if (state.isDrifting && Math.random() < 0.4) {
        addSkidMark(state.pos, state.angle);
    }

    // Update Skid Marks Decals
    const sm = skidMesh;
    if (sm) {
        skidDecals.forEach((skid, i) => {
            if (skid.life > 0) {
                skid.life -= delta * 0.25; // fade over 4 seconds
                dummySkid.position.copy(skid.pos);
                dummySkid.rotation.z = skid.rotZ;
                dummySkid.scale.set(1, 1, 1);
            } else {
                dummySkid.position.set(0, 0, -100);
            }
            dummySkid.updateMatrix();
            sm.setMatrixAt(i, dummySkid.matrix);
        });
        sm.instanceMatrix.needsUpdate = true;
    }
}
