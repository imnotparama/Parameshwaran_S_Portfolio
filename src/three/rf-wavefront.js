// @ts-check
// ============================================================
// 3D RF Microwave Radiation Wavefronts & Toroidal Magnetic Flux Engine
// Simulates physical electromagnetic wave propagation around ANT1 (2.4GHz)
// and swirling toroidal magnetic induction flux lines around power inductor L1.
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { motionPrefs } from '../utils/motion-prefs.js';
import { disposableResources } from './scene.js';

/** @type {THREE.Group | null} */
let rfGroup = null;

// ANT1 Wavefront shells
/** @type {Array<{ mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial, phase: number }>} */
const wavefrontRings = [];
/** @type {Array<{ mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial, phase: number }>} */
const j1WavefrontRings = [];
/** @type {THREE.Group | null} */
let commsBeaconGroup = null;
let burstEnergy = 0; // 0..1 surge on packet transmission

// Toroidal Magnetic Flux Lines (around L1)
/** @type {THREE.Group | null} */
let toroidalFluxGroup = null;

/**
 * Initialize RF Radiation & Toroidal Flux in boardGroup.
 * @param {THREE.Group} boardGroup
 */
export function initRfWavefront(boardGroup) {
    if (rfGroup) return;

    rfGroup = new THREE.Group();
    rfGroup.name = 'RfRadiationGroup';
    boardGroup.add(rfGroup);

    // -------------------------------------------------------------
    // 1. ANT1 2.4GHz Spherical Microwave Wavefront Shells
    // Positioned at the ceramic antenna feedpoint (x = 3.5, y = 0.5, z = 0.12)
    // -------------------------------------------------------------
    const antPos = new THREE.Vector3(3.5, 0.5, 0.12);
    const ringCount = 5;

    for (let i = 0; i < ringCount; i++) {
        // Thin glowing concentric wavefront ring
        const ringGeo = new THREE.RingGeometry(0.1, 0.18, 48);
        disposableResources.geometries.add(ringGeo);

        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x3ee6a0,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        disposableResources.materials.add(ringMat);

        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.copy(antPos);
        // Tilt slightly in 3D for spatial depth
        ringMesh.rotation.x = 0.25;
        ringMesh.rotation.y = 0.15;
        rfGroup.add(ringMesh);

        wavefrontRings.push({
            mesh: ringMesh,
            mat: ringMat,
            phase: i / ringCount
        });
    }

    // -------------------------------------------------------------
    // 1b. J1 USB-C Physical-Layer Carrier Wave Rings
    // Positioned at USB-C Port (x = 0, y = -6.6, z = 0.15)
    // -------------------------------------------------------------
    const j1Pos = new THREE.Vector3(0, -6.6, 0.15);
    for (let j = 0; j < 3; j++) {
        const jRingGeo = new THREE.RingGeometry(0.12, 0.18, 32);
        disposableResources.geometries.add(jRingGeo);
        const jRingMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        disposableResources.materials.add(jRingMat);
        const jMesh = new THREE.Mesh(jRingGeo, jRingMat);
        jMesh.position.copy(j1Pos);
        rfGroup.add(jMesh);
        j1WavefrontRings.push({
            mesh: jMesh,
            mat: jRingMat,
            phase: j / 3
        });
    }

    // -------------------------------------------------------------
    // 1c. 3D Holographic Comms Beacon over ANT1
    // -------------------------------------------------------------
    commsBeaconGroup = new THREE.Group();
    commsBeaconGroup.position.set(3.5, 0.5, 0.35);
    rfGroup.add(commsBeaconGroup);

    const beaconGeo = new THREE.ConeGeometry(0.24, 0.55, 4, 1, true);
    disposableResources.geometries.add(beaconGeo);
    const beaconMat = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending
    });
    disposableResources.materials.add(beaconMat);
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.rotation.x = Math.PI; // invert beacon pointing down to feedpoint
    commsBeaconGroup.add(beaconMesh);

    // Tip photon emitter
    const tipGeo = new THREE.SphereGeometry(0.04, 8, 8);
    disposableResources.geometries.add(tipGeo);
    const tipMat = new THREE.MeshBasicMaterial({
        color: 0x5eead4,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending
    });
    disposableResources.materials.add(tipMat);
    const tipMesh = new THREE.Mesh(tipGeo, tipMat);
    tipMesh.position.y = 0.3;
    commsBeaconGroup.add(tipMesh);

    // -------------------------------------------------------------
    // 2. Toroidal Magnetic Flux Rings around Power Inductor (L1)
    // Positioned near switching regulator inductor (x = 0.8, y = -2.5)
    // -------------------------------------------------------------
    toroidalFluxGroup = new THREE.Group();
    toroidalFluxGroup.position.set(0.8, -2.5, 0.2);
    rfGroup.add(toroidalFluxGroup);

    const fluxCount = 6;
    for (let f = 0; f < fluxCount; f++) {
        const curvePoints = [];
        const radiusX = 0.65;
        const radiusY = 0.38;
        const tilt = (f / fluxCount) * Math.PI;

        for (let a = 0; a <= 32; a++) {
            const angle = (a / 32) * Math.PI * 2;
            const x = Math.cos(angle) * radiusX;
            const y = Math.sin(angle) * radiusY;
            const z = Math.sin(angle * 2) * 0.12;
            curvePoints.push(new THREE.Vector3(x, y, z));
        }

        const fluxGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
        disposableResources.geometries.add(fluxGeo);

        const fluxMat = new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.28,
            blending: THREE.AdditiveBlending
        });
        disposableResources.materials.add(fluxMat);

        const fluxLine = new THREE.Line(fluxGeo, fluxMat);
        fluxLine.rotation.z = tilt;
        toroidalFluxGroup.add(fluxLine);
    }
}

/**
 * Trigger an intense microwave packet burst from ANT1 (e.g. on Contact section or RF ping).
 */
export function triggerRfBurst() {
    burstEnergy = 1.0;

    wavefrontRings.forEach((ring, idx) => {
        gsap.killTweensOf(ring.mat);
        gsap.fromTo(ring.mat, 
            { opacity: 0.95 }, 
            { opacity: 0.25, duration: 1.2 + idx * 0.15, ease: 'power2.out' }
        );
    });
}

/**
 * Update RF Wavefronts & Toroidal Flux per frame.
 * @param {number} elapsed
 * @param {number} delta
 */
export function updateRfWavefront(elapsed, delta) {
    if (!rfGroup) return;

    if (motionPrefs.reduced) return; // hold static on reduced-motion

    // Decay burst energy smoothly
    if (burstEnergy > 0) {
        burstEnergy = Math.max(0, burstEnergy - delta * 1.5);
    }

    const speed = 0.45 + burstEnergy * 1.2;

    // Propagate spherical microwave wavefront shells outward
    wavefrontRings.forEach((ring) => {
        ring.phase = (ring.phase + delta * speed) % 1.0;

        // Scale expands outward (0.2u to 2.8u)
        const scale = 0.2 + ring.phase * (2.8 + burstEnergy * 1.5);
        ring.mesh.scale.set(scale, scale, scale);

        // Inverse-square law attenuation: opacity fades as the wave expands
        const fade = Math.sin(ring.phase * Math.PI);
        const baseAlpha = 0.35 + burstEnergy * 0.55;
        ring.mat.opacity = Math.max(0, Math.min(1.0, fade * baseAlpha));

        // Shift color slightly toward golden RF on high burst
        if (burstEnergy > 0.3) {
            ring.mat.color.setHex(0x5eead4);
        } else {
            ring.mat.color.setHex(0x3ee6a0);
        }
    });

    // Animate J1 USB-C carrier field rings
    j1WavefrontRings.forEach((jRing) => {
        jRing.phase = (jRing.phase + delta * 0.35) % 1.0;
        const jScale = 0.3 + jRing.phase * 1.6;
        jRing.mesh.scale.set(jScale, jScale, jScale);
        const jFade = Math.sin(jRing.phase * Math.PI);
        jRing.mat.opacity = Math.max(0, Math.min(0.6, jFade * 0.4));
    });

    // Gentle float and rotation on 3D comms beacon
    if (commsBeaconGroup) {
        commsBeaconGroup.rotation.z = elapsed * 0.4;
        commsBeaconGroup.position.z = 0.35 + Math.sin(elapsed * 2.0) * 0.04;
    }

    // Rotate Toroidal Magnetic Flux lines around inductor core
    if (toroidalFluxGroup) {
        toroidalFluxGroup.rotation.z = elapsed * 0.6;
    }
}
