// @ts-check
// ============================================================
// Miniature Flying Inspection Drone
// A tiny, sleek companion quadcopter drone that hovers above the board,
// smoothly following the user's cursor and shining a warm spotlight
// onto whichever component the user is inspecting.
// ============================================================
import * as THREE from 'three';
import { motionPrefs } from '../utils/motion-prefs.js';
import { disposableResources } from './scene.js';

/** @type {THREE.Group | null} */
let droneGroup = null;

/** @type {THREE.Mesh[]} */
const rotorDiscs = [];

/** @type {THREE.PointLight | null} */
let droneSpotlight = null;

// Drone target and physical tracking
const targetPos = new THREE.Vector3(0, 0, 1.2);
const currentPos = new THREE.Vector3(0, 0, 1.2);
const prevPos = new THREE.Vector3(0, 0, 1.2);

/**
 * Initialize the companion inspection drone.
 * @param {THREE.Group} boardGroup
 */
export function initInspectionDrone(boardGroup) {
    if (droneGroup) return;

    droneGroup = new THREE.Group();
    droneGroup.name = 'InspectionDroneGroup';
    boardGroup.add(droneGroup);

    // 1. Carbon Fiber Fuselage Body
    const bodyGeo = new THREE.BoxGeometry(0.24, 0.24, 0.06);
    disposableResources.geometries.add(bodyGeo);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.35,
        metalness: 0.8
    });
    disposableResources.materials.add(bodyMat);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    droneGroup.add(bodyMesh);

    // 2. Twin Status LEDs (Headlights)
    const ledGeo = new THREE.SphereGeometry(0.02, 8, 8);
    disposableResources.geometries.add(ledGeo);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x3ee6a0 });
    disposableResources.materials.add(ledMat);

    const leftLed = new THREE.Mesh(ledGeo, ledMat);
    leftLed.position.set(-0.07, 0.12, 0);
    const rightLed = new THREE.Mesh(ledGeo, ledMat);
    rightLed.position.set(0.07, 0.12, 0);
    droneGroup.add(leftLed, rightLed);

    // 3. Four Rotor Arms & Spinning Discs
    const armGeo = new THREE.BoxGeometry(0.04, 0.38, 0.02);
    disposableResources.geometries.add(armGeo);

    const arm1 = new THREE.Mesh(armGeo, bodyMat);
    arm1.rotation.z = Math.PI / 4;
    const arm2 = new THREE.Mesh(armGeo, bodyMat);
    arm2.rotation.z = -Math.PI / 4;
    droneGroup.add(arm1, arm2);

    // Translucent blurred rotor discs
    const rotorGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.005, 12);
    disposableResources.geometries.add(rotorGeo);
    const rotorMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.35
    });
    disposableResources.materials.add(rotorMat);

    const rotorOffsets = [
        { x: -0.15, y: -0.15 },
        { x: 0.15, y: -0.15 },
        { x: -0.15, y: 0.15 },
        { x: 0.15, y: 0.15 }
    ];

    rotorOffsets.forEach(pos => {
        const disc = new THREE.Mesh(rotorGeo, rotorMat);
        disc.position.set(pos.x, pos.y, 0.04);
        disc.rotation.x = Math.PI / 2;
        droneGroup?.add(disc);
        rotorDiscs.push(disc);
    });

    // 4. Warm Inspection Spotlight (illuminates components beneath drone)
    droneSpotlight = new THREE.PointLight(0xfff3d6, 1.6, 4.0);
    droneSpotlight.position.set(0, 0, -0.05);
    droneGroup.add(droneSpotlight);

    // Initial position
    droneGroup.position.set(0, 0, 1.2);
}

/**
 * Update drone position target from cursor ray / active hover component.
 * @param {number} x
 * @param {number} y
 */
export function setDroneTarget(x, y) {
    // Keep drone comfortably inside board boundaries
    targetPos.x = Math.max(-5.0, Math.min(5.0, x));
    targetPos.y = Math.max(-6.5, Math.min(6.5, y));
}

/**
 * Animate the inspection drone each frame.
 * @param {number} elapsed
 * @param {number} delta
 */
export function updateInspectionDrone(elapsed, delta) {
    if (!droneGroup) return;

    if (motionPrefs.reduced) {
        droneGroup.position.set(0, 0, 1.2);
        droneGroup.rotation.set(0, 0, 0);
        return;
    }

    // Organic bobbing hover frequency
    const hoverZ = 1.1 + Math.sin(elapsed * 3.5) * 0.05;
    targetPos.z = hoverZ;

    // Smooth physical spring lerp
    const lerpSpeed = Math.min(1.0, delta * 3.5);
    currentPos.lerp(targetPos, lerpSpeed);
    droneGroup.position.copy(currentPos);

    // Bank / tilt in the direction of horizontal travel
    const vx = currentPos.x - prevPos.x;
    const vy = currentPos.y - prevPos.y;
    prevPos.copy(currentPos);

    droneGroup.rotation.y = THREE.MathUtils.lerp(droneGroup.rotation.y, vx * 4.0, 0.1);
    droneGroup.rotation.x = THREE.MathUtils.lerp(droneGroup.rotation.x, -vy * 4.0, 0.1);
    droneGroup.rotation.z = Math.sin(elapsed * 1.5) * 0.04;

    // Spin rotor discs rapidly
    const rotorSpeed = delta * 45;
    rotorDiscs.forEach((disc, idx) => {
        disc.rotation.y += idx % 2 === 0 ? rotorSpeed : -rotorSpeed;
    });
}
