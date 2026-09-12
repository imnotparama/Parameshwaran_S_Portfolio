// @ts-check
// ============================================================
// Precision Laser Surface Profiling & Optical Inspection Scan
// Simulates an automated optical inspection (AOI) / laser vibrometry sweep.
// A vibrant emerald laser sheet slices across the 3D board, illuminating
// component topography, solder joints, and traces.
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { motionPrefs } from '../utils/motion-prefs.js';
import { disposableResources } from './scene.js';
import { clickBlip } from '../utils/sound.js';

/** @type {THREE.Group | null} */
let scanGroup = null;
/** @type {THREE.Mesh | null} */
let laserSheetMesh = null;
/** @type {THREE.MeshBasicMaterial | null} */
let laserSheetMat = null;
/** @type {THREE.Line | null} */
let laserBeamLine = null;
/** @type {THREE.LineBasicMaterial | null} */
let laserBeamMat = null;

let isScanning = false;
let scanProgress = 0; // 0 (top: y = +5.5) -> 1 (bottom: y = -5.5)
const BOARD_TOP_Y = 5.5;
const BOARD_BOTTOM_Y = -5.5;

/**
 * Initialize the Laser Scanner inside boardGroup.
 * @param {THREE.Group} boardGroup
 */
export function initLaserScanner(boardGroup) {
    if (scanGroup) return;

    scanGroup = new THREE.Group();
    scanGroup.name = 'LaserScannerGroup';
    scanGroup.visible = false;
    boardGroup.add(scanGroup);

    // 1. Volumetric Laser Sheet (Vertical Plane slicing downward)
    // Width 11.0u (spans board), Height 1.4u (reaches above tall capacitors)
    const sheetGeo = new THREE.PlaneGeometry(10.5, 1.2);
    disposableResources.geometries.add(sheetGeo);

    // Laser sheet gradient texture (transparent top -> sharp bright laser edge at bottom)
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0.0, 'rgba(62, 230, 160, 0.0)');
        grad.addColorStop(0.6, 'rgba(62, 230, 160, 0.15)');
        grad.addColorStop(0.9, 'rgba(62, 230, 160, 0.55)');
        grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.95)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 256);
    }
    const sheetTex = new THREE.CanvasTexture(canvas);
    disposableResources.textures.add(sheetTex);

    laserSheetMat = new THREE.MeshBasicMaterial({
        map: sheetTex,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    disposableResources.materials.add(laserSheetMat);

    laserSheetMesh = new THREE.Mesh(sheetGeo, laserSheetMat);
    // Orient sheet vertically: X horizontal, Y is slice thickness, Z is height above board
    laserSheetMesh.rotation.x = Math.PI / 2;
    laserSheetMesh.position.set(0, BOARD_TOP_Y, 0.6);
    scanGroup.add(laserSheetMesh);

    // 2. High-intensity Focal Line right along the PCB surface
    const linePoints = [
        new THREE.Vector3(-5.2, 0, 0.08),
        new THREE.Vector3(5.2, 0, 0.08)
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    disposableResources.geometries.add(lineGeo);

    laserBeamMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending
    });
    disposableResources.materials.add(laserBeamMat);

    laserBeamLine = new THREE.Line(lineGeo, laserBeamMat);
    laserBeamLine.position.set(0, BOARD_TOP_Y, 0.08);
    scanGroup.add(laserBeamLine);
}

/**
 * Trigger an optical laser inspection scan sweep across the board.
 */
export function triggerLaserScan() {
    if (!scanGroup || isScanning) return;

    if (motionPrefs.reduced) return; // respect accessibility preference

    isScanning = true;
    scanGroup.visible = true;
    scanProgress = 0;
    clickBlip();

    const duration = 1.6;

    // Animate scan position from top to bottom
    const scanObj = { progress: 0 };
    gsap.fromTo(scanObj, { progress: 0 }, {
        progress: 1,
        duration,
        ease: 'power1.inOut',
        onUpdate: () => {
            scanProgress = scanObj.progress;
            const currentY = BOARD_TOP_Y + (BOARD_BOTTOM_Y - BOARD_TOP_Y) * scanProgress;

            if (laserSheetMesh) {
                laserSheetMesh.position.y = currentY;
            }
            if (laserBeamLine) {
                laserBeamLine.position.y = currentY;
            }
        },
        onComplete: () => {
            isScanning = false;
            if (scanGroup) scanGroup.visible = false;
        }
    });

    // Animate subtle opacity fade-out at edges
    if (laserSheetMat && laserBeamMat) {
        gsap.fromTo([laserSheetMat, laserBeamMat], 
            { opacity: 0.9 }, 
            { opacity: 0.7, duration, ease: 'sine.inOut' }
        );
    }
}

/**
 * Is a laser scan currently executing?
 */
export function isLaserScanning() {
    return isScanning;
}
