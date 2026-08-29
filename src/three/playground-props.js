// @ts-check
// ============================================================
// PCB Playground Props — Solder-Pin Bowling Pins & Jump Ramps
//
// 1. Solder-Pin Bowling Pins:
//    - A triangle cluster of 6 shiny gold pins positioned on the board.
//    - Knocking into them with the Nano-Rover triggers physics tumble,
//      velocity scatter, and satisfying metallic impact chimes.
//
// 2. PCB Solder Jump Ramps:
//    - Sloped wedge ramps near capacitor banks that launch the
//      Nano-Rover into a 3D parabolic aerial jump.
// ============================================================

import * as THREE from 'three';
import { disposableResources } from './scene.js';
import { hoverBlip } from '../utils/sound.js';
import { registerTeardownObject, LAYER_OFFSETS } from './teardown.js';

/**
 * @typedef {{
 *   mesh: THREE.Mesh,
 *   basePos: THREE.Vector3,
 *   pos: THREE.Vector3,
 *   vel: THREE.Vector3,
 *   rot: THREE.Euler,
 *   rotVel: THREE.Vector3,
 *   isHit: boolean
 * }} SolderPin
 */

/** @type {SolderPin[]} */
const pins = [];
/** @type {THREE.Mesh | null} */
let rampMesh = null;

/**
 * Initialize playground props on the board.
 * @param {THREE.Group} boardGroup
 */
export function initPlaygroundProps(boardGroup) {
    // 1. Construct Solder-Pin Bowling Pins (6 pins in a triangle at x: 3.2, y: 4.8)
    const pinGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.45, 16);
    disposableResources.geometries.add(pinGeo);

    const pinMat = new THREE.MeshStandardMaterial({
        color: 0xc9a24b,
        metalness: 0.9,
        roughness: 0.2,
        emissive: 0xc9a24b,
        emissiveIntensity: 0.2
    });
    disposableResources.materials.add(pinMat);

    const clusterOrigin = new THREE.Vector2(3.2, 4.8);
    const pinOffsets = [
        [0, 0],
        [-0.22, 0.28], [0.22, 0.28],
        [-0.44, 0.56], [0, 0.56], [0.44, 0.56]
    ];

    pins.length = 0;
    pinOffsets.forEach(([ox, oy]) => {
        const mesh = new THREE.Mesh(pinGeo, pinMat.clone());
        mesh.rotation.x = Math.PI / 2;
        mesh.castShadow = true;

        const posX = clusterOrigin.x + ox;
        const posY = clusterOrigin.y + oy;
        const posZ = 0.08 + 0.22; // Base resting height

        mesh.position.set(posX, posY, posZ);
        boardGroup.add(mesh);
        registerTeardownObject(mesh, LAYER_OFFSETS.COMPONENTS);

        pins.push({
            mesh,
            basePos: new THREE.Vector3(posX, posY, posZ),
            pos: new THREE.Vector3(posX, posY, posZ),
            vel: new THREE.Vector3(),
            rot: new THREE.Euler(Math.PI / 2, 0, 0),
            rotVel: new THREE.Vector3(),
            isHit: false
        });
    });

    // 2. Construct Solder Jump Ramp near capacitor bank (x: -3.2, y: 1.0)
    const rampGeo = new THREE.BoxGeometry(0.8, 1.2, 0.25);
    disposableResources.geometries.add(rampGeo);

    const rampMat = new THREE.MeshStandardMaterial({
        color: 0x14b8a6,
        metalness: 0.6,
        roughness: 0.4,
        emissive: 0x14b8a6,
        emissiveIntensity: 0.3
    });
    disposableResources.materials.add(rampMat);

    rampMesh = new THREE.Mesh(rampGeo, rampMat);
    rampMesh.position.set(-3.2, 1.0, 0.08 + 0.1);
    rampMesh.rotation.x = -0.22; // slight slope angle
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    boardGroup.add(rampMesh);
    registerTeardownObject(rampMesh, LAYER_OFFSETS.COMPONENTS);
}

/**
 * Check collisions between Nano-Rover and playground props.
 * @param {THREE.Vector3} roverPos
 * @param {number} roverSpeed
 * @param {number} roverAngle
 * @returns {{ jumped: boolean }}
 */
export function checkPropCollisions(roverPos, roverSpeed, roverAngle) {
    let jumped = false;

    // 1. Check Bowling Pin collisions
    pins.forEach(pin => {
        const dx = roverPos.x - pin.pos.x;
        const dy = roverPos.y - pin.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.45 && Math.abs(roverSpeed) > 0.05) {
            if (!pin.isHit) {
                pin.isHit = true;
                hoverBlip();
            }

            // Scatter velocity away from rover
            const pushDirX = Math.cos(roverAngle);
            const pushDirY = Math.sin(roverAngle);
            const force = Math.abs(roverSpeed) * 3.5 + 0.5;

            pin.vel.x += pushDirX * force + (Math.random() - 0.5) * 0.5;
            pin.vel.y += pushDirY * force + (Math.random() - 0.5) * 0.5;
            pin.vel.z += 1.2 + Math.random() * 1.5;

            pin.rotVel.x += (Math.random() - 0.5) * 12;
            pin.rotVel.y += (Math.random() - 0.5) * 12;
            pin.rotVel.z += (Math.random() - 0.5) * 8;
        }
    });

    // 2. Check Jump Ramp collision
    if (rampMesh) {
        const rx = Math.abs(roverPos.x - rampMesh.position.x);
        const ry = Math.abs(roverPos.y - rampMesh.position.y);
        if (rx < 0.45 && ry < 0.65 && roverSpeed > 1.2) {
            jumped = true;
        }
    }

    return { jumped };
}

/**
 * Update pin tumble physics and decay per frame.
 * @param {number} delta Frame delta time
 */
export function updatePlaygroundProps(delta) {
    pins.forEach(pin => {
        if (!pin.isHit) return;

        // Apply gravity & velocity
        pin.vel.z -= 9.8 * delta;
        pin.pos.x += pin.vel.x * delta;
        pin.pos.y += pin.vel.y * delta;
        pin.pos.z += pin.vel.z * delta;

        // Ground floor bounce
        if (pin.pos.z <= pin.basePos.z) {
            pin.pos.z = pin.basePos.z;
            pin.vel.z = -pin.vel.z * 0.35; // Bouncy restitution
            pin.vel.x *= 0.85;
            pin.vel.y *= 0.85;
        }

        // Apply rotation
        pin.rot.x += pin.rotVel.x * delta;
        pin.rot.y += pin.rotVel.y * delta;
        pin.rot.z += pin.rotVel.z * delta;
        pin.rotVel.multiplyScalar(0.92);

        pin.mesh.position.copy(pin.pos);
        pin.mesh.rotation.copy(pin.rot);
    });
}

/**
 * Reset all bowling pins to their starting upright positions.
 */
export function resetPins() {
    pins.forEach(pin => {
        pin.isHit = false;
        pin.pos.copy(pin.basePos);
        pin.vel.set(0, 0, 0);
        pin.rot.set(Math.PI / 2, 0, 0);
        pin.rotVel.set(0, 0, 0);
        pin.mesh.position.copy(pin.basePos);
        pin.mesh.rotation.set(Math.PI / 2, 0, 0);
    });
}
