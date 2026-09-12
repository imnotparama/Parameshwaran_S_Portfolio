// @ts-check
// ============================================================
// Automated Robotic Inspection Probe
// A sleek miniature robotic arm that glides smoothly across the board
// to inspect whichever project the user is looking at.
// Designed to be clean, lightweight, and silky smooth.
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { motionPrefs } from '../utils/motion-prefs.js';
import { disposableResources } from './scene.js';
import { clickBlip } from '../utils/sound.js';

/** @type {THREE.Group | null} */
let probeRobotGroup = null;
/** @type {THREE.Group | null} */
let carriageGroup = null;
/** @type {THREE.Group | null} */
let needleGroup = null;
/** @type {THREE.Mesh | null} */
let contactGlowMesh = null;
/** @type {THREE.MeshBasicMaterial | null} */
let contactGlowMat = null;

let targetX = -2.5;
let isLanded = false;

/**
 * Initialize the robotic probe in boardGroup.
 * @param {THREE.Group} boardGroup
 */
export function initFlyingProbe(boardGroup) {
    if (probeRobotGroup) return;

    probeRobotGroup = new THREE.Group();
    probeRobotGroup.name = 'FlyingProbeRobot';
    boardGroup.add(probeRobotGroup);

    // 1. Sleek overhead carbon-fiber rail spanning across the project chips
    // Sits at Y = 2.9 (above the chips), Z = 0.75 (elevated for depth)
    const railY = 2.9;
    const railZ = 0.75;

    const railGeo = new THREE.CylinderGeometry(0.02, 0.02, 7.5, 16);
    railGeo.rotateZ(Math.PI / 2); // align horizontally along X
    disposableResources.geometries.add(railGeo);

    const railMat = new THREE.MeshStandardMaterial({
        color: 0x1e2621,
        metalness: 0.85,
        roughness: 0.25
    });
    disposableResources.materials.add(railMat);

    const railMesh = new THREE.Mesh(railGeo, railMat);
    railMesh.position.set(-2.5, railY, railZ);
    probeRobotGroup.add(railMesh);

    // 2. Carriage that glides smoothly along the rail
    carriageGroup = new THREE.Group();
    carriageGroup.position.set(-2.5, railY, railZ);
    probeRobotGroup.add(carriageGroup);

    // Carriage sleek body block
    const carriageGeo = new THREE.BoxGeometry(0.28, 0.16, 0.12);
    disposableResources.geometries.add(carriageGeo);

    const carriageMat = new THREE.MeshStandardMaterial({
        color: 0x0f1a14,
        metalness: 0.7,
        roughness: 0.3
    });
    disposableResources.materials.add(carriageMat);

    const carriageMesh = new THREE.Mesh(carriageGeo, carriageMat);
    carriageGroup.add(carriageMesh);

    // Small status indicator LED on top of carriage
    const ledGeo = new THREE.SphereGeometry(0.025, 12, 12);
    disposableResources.geometries.add(ledGeo);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x3ee6a0 });
    disposableResources.materials.add(ledMat);
    const ledMesh = new THREE.Mesh(ledGeo, ledMat);
    ledMesh.position.set(0, 0, 0.07);
    carriageGroup.add(ledMesh);

    // 3. Vertical Needle assembly that descends down to touch the chip
    needleGroup = new THREE.Group();
    needleGroup.position.set(0, 0, -0.06);
    carriageGroup.add(needleGroup);

    // Dual micro-needles (left & right pins)
    const needleGeo = new THREE.CylinderGeometry(0.008, 0.002, 0.45, 8);
    needleGeo.rotateX(Math.PI / 2); // point toward board (-Z)
    disposableResources.geometries.add(needleGeo);

    const needleMat = new THREE.MeshStandardMaterial({
        color: 0xc9a24b, // Gold probe tips
        metalness: 0.95,
        roughness: 0.1
    });
    disposableResources.materials.add(needleMat);

    const leftNeedle = new THREE.Mesh(needleGeo, needleMat);
    leftNeedle.position.set(-0.08, 0, -0.22);
    needleGroup.add(leftNeedle);

    const rightNeedle = new THREE.Mesh(needleGeo, needleMat);
    rightNeedle.position.set(0.08, 0, -0.22);
    needleGroup.add(rightNeedle);

    // 4. Contact glow ring when touching down
    const glowGeo = new THREE.RingGeometry(0.03, 0.12, 24);
    disposableResources.geometries.add(glowGeo);

    contactGlowMat = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    disposableResources.materials.add(contactGlowMat);

    contactGlowMesh = new THREE.Mesh(glowGeo, contactGlowMat);
    contactGlowMesh.position.set(0, 0, -0.45);
    needleGroup.add(contactGlowMesh);
}

/**
 * Move the robotic probe smoothly to inspect a target position.
 * @param {number} x Target X coordinate
 */
export function flyProbeTo(x) {
    const cGroup = carriageGroup;
    const nGroup = needleGroup;
    if (!cGroup || !nGroup) return;
    targetX = x;

    if (motionPrefs.reduced) {
        cGroup.position.x = targetX;
        nGroup.position.z = -0.15;
        if (contactGlowMat) contactGlowMat.opacity = 0.6;
        return;
    }

    // 1. Lift needles up
    gsap.to(nGroup.position, {
        z: 0.05,
        duration: 0.25,
        ease: 'power2.out',
        onComplete: () => {
            if (contactGlowMat) contactGlowMat.opacity = 0;

            // 2. Glide smoothly across to the new project
            gsap.to(cGroup.position, {
                x: targetX,
                duration: 0.6,
                ease: 'power2.inOut',
                onComplete: () => {
                    // 3. Descend gently onto the chip pins
                    gsap.to(nGroup.position, {
                        z: -0.18,
                        duration: 0.3,
                        ease: 'back.out(1.4)',
                        onComplete: () => {
                            isLanded = true;
                            clickBlip();
                            // Soft contact glow
                            if (contactGlowMat) {
                                gsap.fromTo(contactGlowMat, 
                                    { opacity: 0.8 }, 
                                    { opacity: 0.3, duration: 0.8, yoyo: true, repeat: 1 }
                                );
                            }
                        }
                    });
                }
            });
        }
    });
}

/**
 * Per-frame update (smooth micro-breathing when landed).
 * @param {number} elapsed
 */
export function updateFlyingProbe(elapsed) {
    if (!needleGroup || motionPrefs.reduced || !isLanded) return;
    // Tiny natural mechanical compliance vibration (barely perceptible, makes it feel real)
    const microJitter = Math.sin(elapsed * 12) * 0.002;
    needleGroup.position.z = -0.18 + microJitter;
}
