// @ts-check
// ============================================================
// 3D Exploded Hardware Teardown View ('E' / HUD Button)
//
// Separates the physical PCB assembly along the Z-axis into
// 5 floating holographic/physical layers:
//   Tier 1 (Z +2.4): Silkscreen & Stencil Mask
//   Tier 2 (Z +1.6): SMD Components & Silicon Chips
//   Tier 3 (Z +0.8): Copper Traces, Routing & Annular Rings
//   Tier 4 (Z  0.0): FR-4 Dielectric Glass-Epoxy Core Substrate
//   Tier 5 (Z -0.8): Ground Plane & Plated Through-Hole Vias
//
// Features glowing vertical laser alignment beams linking layers,
// cinematic 45° camera perspective, and smooth GSAP transitions.
// ============================================================

import * as THREE from 'three';
import gsap from 'gsap';
import { motionPrefs } from '../utils/motion-prefs.js';
import { camera, disposableResources } from './scene.js';
import { switchClack } from '../utils/sound.js';

let isExploded = false;
/** @type {THREE.Group | null} */
let laserGuidesGroup = null;
/** @type {THREE.LineBasicMaterial | null} */
let laserMat = null;

// Registry of objects and their base rest positions
/** @type {Array<{ object: THREE.Object3D, baseZ: number, layer: number }>} */
const layerItems = [];

// Saved camera pose before teardown to restore on exit
const savedCameraPos = new THREE.Vector3();

// Layer Z offsets when exploded
export const LAYER_OFFSETS = {
    SILKSCREEN: 2.2,
    COMPONENTS: 1.5,
    TRACES: 0.75,
    CORE: 0.0,
    BOTTOM: -0.75
};

/**
 * Register an object with a specific teardown layer.
 * @param {THREE.Object3D} object
 * @param {number} layerOffset
 */
export function registerTeardownObject(object, layerOffset) {
    layerItems.push({
        object,
        baseZ: object.position.z,
        layer: layerOffset
    });
}

/**
 * Create vertical laser alignment guides that visually connect through-hole vias.
 * @param {THREE.Group} boardGroup
 */
function createLaserGuides(boardGroup) {
    laserGuidesGroup = new THREE.Group();
    laserMat = new THREE.LineBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending
    });
    disposableResources.materials.add(laserMat);

    // Guide coordinates (mounting holes + chip corners)
    const points = [
        [-4.64, -6.92], [4.64, -6.92], [-4.64, 6.92], [4.64, 6.92],
        [-2.0, -2.0], [2.0, -2.0], [-2.0, 2.0], [2.0, 2.0],
        [-4.0, 0.0], [4.0, 0.0]
    ];

    const lineGeom = new THREE.BufferGeometry();
    /** @type {number[]} */
    const positions = [];

    points.forEach(([x, y]) => {
        // Vertical line spanning from bottom layer to top silkscreen
        positions.push(x, y, -1.2);
        positions.push(x, y, 2.8);
    });

    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    disposableResources.geometries.add(lineGeom);

    const laserLines = new THREE.LineSegments(lineGeom, laserMat);
    laserGuidesGroup.add(laserLines);
    boardGroup.add(laserGuidesGroup);
}

/**
 * Initialize the Teardown Manager.
 * @param {THREE.Group} boardGroup
 */
export function initTeardown(boardGroup) {
    createLaserGuides(boardGroup);
}

/**
 * Check if the Exploded Teardown mode is currently active.
 * @returns {boolean}
 */
export function isTeardownActive() {
    return isExploded;
}

/**
 * Toggle between Assembled and Exploded Teardown view.
 * @param {() => void} [onCameraRestore] Callback to restore standard journey camera
 */
export function toggleTeardown(onCameraRestore) {
    setTeardownState(!isExploded, onCameraRestore);
}

/**
 * Set the Teardown state explicitly.
 * @param {boolean} active
 * @param {() => void} [onCameraRestore]
 */
export function setTeardownState(active, onCameraRestore) {
    if (isExploded === active) return;
    isExploded = active;

    // Play tactile mechanical switch clack
    switchClack();

    // Toggle body class & HUD button state
    document.body.classList.toggle('teardown-active', isExploded);
    const teardownBtn = document.getElementById('teardown-toggle-btn');
    if (teardownBtn) {
        teardownBtn.setAttribute('aria-pressed', String(isExploded));
        teardownBtn.classList.toggle('active', isExploded);
    }

    const duration = motionPrefs.reduced ? 0.01 : 1.2;
    const ease = 'power3.inOut';

    if (!camera) return;

    if (isExploded) {
        // Save current camera position
        savedCameraPos.copy(camera.position);

        // Elevate camera to cinematic 3/4 angled inspection view
        gsap.to(camera.position, {
            x: 0,
            y: -5.5,
            z: 14.5,
            duration,
            ease,
            overwrite: 'auto'
        });

        // Separate each registered object along Z
        layerItems.forEach(item => {
            gsap.to(item.object.position, {
                z: item.baseZ + item.layer,
                duration,
                ease,
                overwrite: 'auto'
            });
        });

        // Fade in laser alignment guides
        if (laserMat) {
            gsap.to(laserMat, {
                opacity: 0.75,
                duration: duration * 0.8,
                delay: duration * 0.2,
                ease: 'power2.out',
                overwrite: 'auto'
            });
        }
    } else {
        // Collapse all layers back to their base rest positions
        layerItems.forEach(item => {
            gsap.to(item.object.position, {
                z: item.baseZ,
                duration,
                ease,
                overwrite: 'auto'
            });
        });

        // Fade out laser guides
        if (laserMat) {
            gsap.to(laserMat, {
                opacity: 0.0,
                duration: duration * 0.5,
                ease: 'power2.in',
                overwrite: 'auto'
            });
        }

        // Restore camera
        if (onCameraRestore) {
            onCameraRestore();
        } else {
            gsap.to(camera.position, {
                x: savedCameraPos.x,
                y: savedCameraPos.y,
                z: savedCameraPos.z,
                duration,
                ease,
                overwrite: 'auto'
            });
        }
    }
}
