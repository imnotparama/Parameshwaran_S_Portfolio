// @ts-check
// ============================================================
// 3D Exploded Hardware Teardown & CAD/CAM Layer Stackup View
//
// Separates the physical PCB assembly along the Z-axis into
// 6 discrete CAD/CAM engineering layers:
//   L1 (Z +2.5): Silkscreen & Stencil Mask
//   L1.5 (Z +1.8): SMD Components & Silicon Chips
//   L2 (Z +1.1): Top Copper Traces & Pads
//   L3 (Z  0.0): FR-4 Dielectric Glass-Epoxy Core Substrate
//   L4 (Z -0.7): Internal Ground Plane (GND)
//   L5 (Z -1.4): Internal Power Plane (+3.3V / +5V Split)
//   L6 (Z -2.1): Bottom Copper Routing & Ground Shield
//
// Features:
// - Interactive CAD/CAM Layer Stackup Inspector
// - X-Ray Fluoroscopic Inverted PCB Shader pass
// - Dynamic Z-Expansion separation slider (20% - 200%)
// - Glowing vertical laser alignment guides linking through-hole vias
// ============================================================

import * as THREE from 'three';
import gsap from 'gsap';
import { motionPrefs } from '../utils/motion-prefs.js';
import { camera, disposableResources } from './scene.js';
import { switchClack, clickBlip } from '../utils/sound.js';
import { emitUartLog, emitSystemEvent } from '../ui/telemetry.js';
import { hapticClick } from '../utils/haptics.js';

let isExploded = false;
let isXRay = false;
let currentSeparationScale = 1.0;
let activeLayerFilter = 'ALL';

/** @type {THREE.Group | null} */
let laserGuidesGroup = null;
/** @type {THREE.LineBasicMaterial | null} */
let laserMat = null;

/** @type {THREE.Mesh | null} */
let gndPlaneMesh = null;
/** @type {THREE.Mesh | null} */
let pwrPlaneMesh = null;

// Registry of objects and their base rest positions
/** @type {Array<{ object: THREE.Object3D, baseZ: number, layer: number, layerKey: string }>} */
const layerItems = [];

// Saved camera pose before teardown to restore on exit
const savedCameraPos = new THREE.Vector3();

// Layer Z offsets when exploded at 100% scale
export const LAYER_OFFSETS = {
    SILKSCREEN: 2.5,
    COMPONENTS: 1.8,
    TOP_COPPER: 1.1,
    TRACES: 1.1,
    CORE: 0.0,
    GND_PLANE: -0.7,
    PWR_PLANE: -1.4,
    BOTTOM_COPPER: -2.1,
    BOTTOM: -2.1
};

/**
 * Register an object with a specific teardown layer.
 * @param {THREE.Object3D} object
 * @param {number} layerOffset
 * @param {string} [layerKey]
 */
export function registerTeardownObject(object, layerOffset, layerKey) {
    let key = layerKey;
    if (!key) {
        if (layerOffset >= 2.2) key = 'SILK';
        else if (layerOffset >= 1.5) key = 'COMPONENTS';
        else if (layerOffset >= 0.8) key = 'TOP_CU';
        else if (layerOffset === 0.0) key = 'FR4';
        else if (layerOffset >= -0.8) key = 'GND';
        else if (layerOffset >= -1.6) key = 'PWR';
        else key = 'BOT_CU';
    }

    layerItems.push({
        object,
        baseZ: object.position.z,
        layer: layerOffset,
        layerKey: key
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
        positions.push(x, y, -2.6);
        positions.push(x, y, 3.2);
    });

    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    disposableResources.geometries.add(lineGeom);

    const laserLines = new THREE.LineSegments(lineGeom, laserMat);
    laserGuidesGroup.add(laserLines);
    boardGroup.add(laserGuidesGroup);
}

/**
 * Create physical Ground and Power plane meshes that separate in exploded view.
 * @param {THREE.Group} boardGroup
 */
function createInternalPlanes(boardGroup) {
    const planeGeo = new THREE.BoxGeometry(9.6, 14.2, 0.015);
    disposableResources.geometries.add(planeGeo);

    // L4: Ground Plane (Solid Copper Pour with thermal relief rings)
    const gndMat = new THREE.MeshStandardMaterial({
        color: 0xb87333,
        emissive: 0x92400e,
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.85,
        transparent: true,
        opacity: 0.95
    });
    disposableResources.materials.add(gndMat);
    gndPlaneMesh = new THREE.Mesh(planeGeo, gndMat);
    gndPlaneMesh.position.set(0, 0, -0.04);
    gndPlaneMesh.visible = false;
    boardGroup.add(gndPlaneMesh);
    registerTeardownObject(gndPlaneMesh, LAYER_OFFSETS.GND_PLANE, 'GND');

    // L5: Power Plane (Split Voltage Plane: +3.3V / +5V)
    const pwrMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        emissive: 0xb45309,
        emissiveIntensity: 0.45,
        roughness: 0.3,
        metalness: 0.8,
        transparent: true,
        opacity: 0.95
    });
    disposableResources.materials.add(pwrMat);
    pwrPlaneMesh = new THREE.Mesh(planeGeo, pwrMat);
    pwrPlaneMesh.position.set(0, 0, -0.06);
    pwrPlaneMesh.visible = false;
    boardGroup.add(pwrPlaneMesh);
    registerTeardownObject(pwrPlaneMesh, LAYER_OFFSETS.PWR_PLANE, 'PWR');
}

/**
 * Initialize DOM listeners for the CAD/CAM Rack inspector.
 */
function initTeardownUI() {
    const xrayBtn = document.getElementById('cad-cam-xray-btn');
    if (xrayBtn) {
        xrayBtn.addEventListener('click', () => {
            toggleXRayMode();
        });
    }

    const closeBtn = document.getElementById('cad-cam-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            setTeardownState(false);
        });
    }

    const slider = /** @type {HTMLInputElement | null} */ (document.getElementById('cad-cam-z-slider'));
    if (slider) {
        slider.addEventListener('input', (e) => {
            const target = /** @type {HTMLInputElement} */ (e.target);
            const val = parseInt(target.value, 10);
            setExplosionScale(val / 100);
            const label = document.getElementById('cad-cam-z-val');
            if (label) label.textContent = `${val}%`;
        });
    }

    const layerBtns = document.querySelectorAll('.cad-layer-btn');
    layerBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = /** @type {HTMLElement} */ (e.currentTarget);
            const layerKey = target.dataset.layer || 'ALL';
            setLayerFilter(layerKey);
        });
    });
}

/**
 * Initialize the Teardown Manager.
 * @param {THREE.Group} boardGroup
 */
export function initTeardown(boardGroup) {
    createLaserGuides(boardGroup);
    createInternalPlanes(boardGroup);
    initTeardownUI();
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

    // Play tactile mechanical switch clack and haptic response
    switchClack();
    hapticClick();

    // Toggle body class & HUD button state
    document.body.classList.toggle('teardown-active', isExploded);
    const teardownBtn = document.getElementById('teardown-toggle-btn');
    if (teardownBtn) {
        teardownBtn.setAttribute('aria-pressed', String(isExploded));
        teardownBtn.classList.toggle('active', isExploded);
    }

    // Toggle CAD/CAM HUD Rack
    const cadRack = document.getElementById('cad-cam-rack');
    if (cadRack) {
        cadRack.hidden = !isExploded;
    }

    // Internal planes visibility
    if (gndPlaneMesh) gndPlaneMesh.visible = isExploded;
    if (pwrPlaneMesh) pwrPlaneMesh.visible = isExploded;

    if (isExploded) {
        emitUartLog('CAD', 'CAD/CAM 6-Layer Stackup Exploded · Layer Inspection Active');
        emitSystemEvent('CAD/CAM STACKUP', '6-Layer physical PCB separation rendered along Z-axis');
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

        // Separate each registered object along Z with current scale
        applyLayerSeparation(duration, ease);

        // Fade in laser alignment guides
        if (laserMat) {
            gsap.to(laserMat, {
                opacity: isXRay ? 1.0 : 0.75,
                duration: duration * 0.8,
                delay: duration * 0.2,
                ease: 'power2.out',
                overwrite: 'auto'
            });
        }
    } else {
        // Deactivate X-Ray if leaving teardown
        if (isXRay) toggleXRayMode(false);

        // Reset layer filter to ALL
        setLayerFilter('ALL');

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

/**
 * Apply the current layer separation along Z with the active scale.
 * @param {number} duration
 * @param {string} ease
 */
function applyLayerSeparation(duration = 0.6, ease = 'power2.out') {
    layerItems.forEach(item => {
        const targetZ = item.baseZ + (item.layer * currentSeparationScale);
        gsap.to(item.object.position, {
            z: targetZ,
            duration: motionPrefs.reduced ? 0.01 : duration,
            ease,
            overwrite: 'auto'
        });
    });
}

/**
 * Set the explosion separation distance scale factor (0.2 to 2.0).
 * @param {number} factor
 */
export function setExplosionScale(factor) {
    currentSeparationScale = factor;
    if (isExploded) {
        applyLayerSeparation(0.2, 'power1.out');
    }
}

/**
 * Filter and isolate a specific CAD/CAM layer.
 * @param {string} layerKey e.g. 'ALL', 'SILK', 'TOP_CU', 'FR4', 'GND', 'PWR', 'BOT_CU'
 */
export function setLayerFilter(layerKey) {
    activeLayerFilter = layerKey;
    clickBlip();
    hapticClick();

    document.querySelectorAll('.cad-layer-btn').forEach(btn => {
        const b = /** @type {HTMLElement} */ (btn);
        if (b.dataset.layer === layerKey) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    emitUartLog('CAD', `Isolating Layer: ${layerKey}`);

    layerItems.forEach(item => {
        const match = (layerKey === 'ALL') || (item.layerKey === layerKey) || (layerKey === 'TOP_CU' && item.layerKey === 'COMPONENTS');
        gsap.to(item.object, {
            visible: match,
            duration: 0.2
        });
    });
}

/**
 * Get the currently isolated layer filter key.
 * @returns {string}
 */
export function getActiveLayerFilter() {
    return activeLayerFilter;
}

/**
 * Toggle the X-Ray Fluoroscopic Inverted PCB Shader inspection mode.
 * @param {boolean} [forced]
 */
export function toggleXRayMode(forced) {
    isXRay = (forced !== undefined) ? forced : !isXRay;
    clickBlip();
    hapticClick();

    document.body.classList.toggle('xray-active', isXRay);
    const xrayBtn = document.getElementById('cad-cam-xray-btn');
    if (xrayBtn) {
        xrayBtn.classList.toggle('active', isXRay);
        xrayBtn.setAttribute('aria-pressed', String(isXRay));
    }

    if (laserMat) {
        laserMat.color.setHex(isXRay ? 0x00ffff : 0x3ee6a0);
        laserMat.opacity = isExploded ? (isXRay ? 1.0 : 0.75) : 0.0;
    }

    emitUartLog('XRAY', `X-Ray Fluoroscopy: ${isXRay ? 'ENABLED (Inverted Contrast)' : 'DISABLED'}`);
    emitSystemEvent('X-RAY INSPECTION', isXRay ? 'Fluoroscopic trace pass activated' : 'Standard shader restored');
}
