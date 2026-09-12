// @ts-check
// ============================================================
// FLIR Thermal Infrared Heat Camera & Conductive Dissipation Engine
// Simulates real-time infrared thermal imaging across the PCB.
// Heat blooms from active silicon dies (U1, U2, LDO) and dissipates
// conductively through copper ground planes and thermal vias.
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { motionPrefs } from '../utils/motion-prefs.js';
import { disposableResources } from './scene.js';
import { clickBlip, switchClack } from '../utils/sound.js';

let thermalActive = false;
/** @type {THREE.Group | null} */
let thermalGroup = null;
/** @type {THREE.Mesh | null} */
let cpuThermalMesh = null;
/** @type {THREE.MeshBasicMaterial | null} */
let cpuThermalMat = null;
/** @type {THREE.Mesh | null} */
let ldoThermalMesh = null;
/** @type {THREE.MeshBasicMaterial | null} */
let ldoThermalMat = null;
/** @type {THREE.Mesh[]} */
let projectThermalMeshes = [];
/** @type {THREE.MeshBasicMaterial[]} */
let projectThermalMats = [];
/** @type {THREE.Sprite | null} */
let thermalReticleSprite = null;

// Live thermal physics state
let currentDieTemp = 42.5; // °C
let targetDieTemp = 42.5;

/**
 * Generate FLIR Ironbow / False-Color Thermal Gradient Canvas Texture.
 * Creates a smooth 2D radial heat dissipation pattern with realistic conduction isotherms.
 * @param {number} size
 * @param {number} coreIntensity 0..1
 */
function createThermalGradientTexture(size = 256, coreIntensity = 0.9) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2;

    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
    // FLIR false-color thermal palette: White (hot core) -> Yellow -> Orange -> Magenta -> Deep Violet -> Dark Navy -> Transparent
    grad.addColorStop(0.00, `rgba(255, 255, 255, ${coreIntensity})`);
    grad.addColorStop(0.15, `rgba(255, 235, 120, ${coreIntensity * 0.95})`);
    grad.addColorStop(0.35, `rgba(255, 100, 20, ${coreIntensity * 0.85})`);
    grad.addColorStop(0.60, `rgba(180, 20, 140, ${coreIntensity * 0.6})`);
    grad.addColorStop(0.80, `rgba(40, 10, 90, ${coreIntensity * 0.3})`);
    grad.addColorStop(1.00, 'rgba(10, 5, 30, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Overlay delicate circular isotherm contour lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(frac => {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * frac, 0, Math.PI * 2);
        ctx.stroke();
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    return texture;
}

/**
 * Create HUD Thermal Crosshair Sprite.
 */
function createThermalReticle() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, 256, 128);

    // Crosshair brackets
    ctx.strokeStyle = '#ff9900';
    ctx.lineWidth = 2;
    // Top-left
    ctx.strokeRect(10, 10, 18, 18);
    // Center reticle
    ctx.beginPath();
    ctx.moveTo(35, 40); ctx.lineTo(45, 40);
    ctx.moveTo(40, 35); ctx.lineTo(40, 45);
    ctx.stroke();

    // Telemetry text
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('FLIR IR // T_MAX', 60, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
    ctx.fillText('42.5°C [NOMINAL]', 60, 48);
    ctx.fillStyle = '#ffaa44';
    ctx.font = '11px monospace';
    ctx.fillText('ε=0.95 · COPPER POIL', 60, 66);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.92,
        depthTest: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2.2, 1.1, 1.0);
    return sprite;
}

/**
 * Initialize FLIR Thermal Visualizer inside boardGroup.
 * @param {THREE.Group} boardGroup
 */
export function initThermalMode(boardGroup) {
    if (thermalGroup) return;

    thermalGroup = new THREE.Group();
    thermalGroup.name = 'ThermalVisualizationGroup';
    thermalGroup.visible = false;
    boardGroup.add(thermalGroup);

    // Surface elevation slightly above PCB (+0.14) to eliminate z-fighting
    const heatZ = 0.14;

    // 1. CPU (U1) Primary Heat Bloom
    const cpuTex = createThermalGradientTexture(256, 0.95);
    disposableResources.textures.add(cpuTex);
    cpuThermalMat = new THREE.MeshBasicMaterial({
        map: cpuTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    disposableResources.materials.add(cpuThermalMat);

    const cpuGeo = new THREE.PlaneGeometry(5.2, 5.2);
    disposableResources.geometries.add(cpuGeo);
    cpuThermalMesh = new THREE.Mesh(cpuGeo, cpuThermalMat);
    cpuThermalMesh.position.set(0, 1.0, heatZ);
    thermalGroup.add(cpuThermalMesh);

    // 2. Power Regulator LDO (near L1) Heat Bloom
    const ldoTex = createThermalGradientTexture(128, 0.85);
    disposableResources.textures.add(ldoTex);
    ldoThermalMat = new THREE.MeshBasicMaterial({
        map: ldoTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    disposableResources.materials.add(ldoThermalMat);

    const ldoGeo = new THREE.PlaneGeometry(2.4, 2.4);
    disposableResources.geometries.add(ldoGeo);
    ldoThermalMesh = new THREE.Mesh(ldoGeo, ldoThermalMat);
    ldoThermalMesh.position.set(0.8, -2.5, heatZ);
    thermalGroup.add(ldoThermalMesh);

    // 3. Project Chips (U2 expansion bus) Thermal Spots
    // 3 chip positions along project bus
    const chipPositions = [
        [-2.8, -1.2],
        [-1.4, -1.2],
        [0.0, -1.2]
    ];
    chipPositions.forEach(([x, y]) => {
        const pTex = createThermalGradientTexture(128, 0.75);
        disposableResources.textures.add(pTex);
        const pMat = new THREE.MeshBasicMaterial({
            map: pTex,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        disposableResources.materials.add(pMat);
        const pGeo = new THREE.PlaneGeometry(1.8, 1.8);
        disposableResources.geometries.add(pGeo);
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.position.set(x, y, heatZ);
        if (thermalGroup) thermalGroup.add(pMesh);
        projectThermalMeshes.push(pMesh);
        projectThermalMats.push(pMat);
    });

    // 4. Floating 3D Thermal Reticle
    thermalReticleSprite = createThermalReticle();
    if (thermalReticleSprite && thermalGroup) {
        thermalReticleSprite.position.set(0.5, 2.8, heatZ + 0.3);
        thermalGroup.add(thermalReticleSprite);
    }
}

/**
 * Toggle FLIR Thermal Camera Mode on/off.
 * @returns {boolean}
 */
export function toggleThermalMode() {
    thermalActive = !thermalActive;
    switchClack();

    // Toggle button UI state in top bar
    const btn = document.getElementById('btn-thermal-toggle');
    if (btn) {
        btn.classList.toggle('active', thermalActive);
        btn.setAttribute('aria-pressed', String(thermalActive));
    }

    if (!thermalGroup) return thermalActive;

    if (thermalActive) {
        thermalGroup.visible = true;
        clickBlip();

        // Animate thermal bloom in
        const duration = motionPrefs.reduced ? 0.05 : 0.6;
        if (cpuThermalMat) gsap.to(cpuThermalMat, { opacity: 0.88, duration, ease: 'power2.out' });
        if (ldoThermalMat) gsap.to(ldoThermalMat, { opacity: 0.75, duration, ease: 'power2.out' });
        projectThermalMats.forEach(mat => {
            gsap.to(mat, { opacity: 0.65, duration, ease: 'power2.out' });
        });
        if (thermalReticleSprite) {
            gsap.fromTo(thermalReticleSprite.scale, { x: 0.5, y: 0.25 }, { x: 2.2, y: 1.1, duration: 0.5, ease: 'back.out(1.5)' });
        }
    } else {
        const duration = motionPrefs.reduced ? 0.05 : 0.4;
        if (cpuThermalMat) gsap.to(cpuThermalMat, { opacity: 0, duration, ease: 'power1.in' });
        if (ldoThermalMat) gsap.to(ldoThermalMat, { opacity: 0, duration, ease: 'power1.in' });
        projectThermalMats.forEach(mat => {
            gsap.to(mat, { opacity: 0, duration, ease: 'power1.in' });
        });
        setTimeout(() => {
            if (!thermalActive && thermalGroup) thermalGroup.visible = false;
        }, Math.round(duration * 1000));
    }

    return thermalActive;
}

/**
 * Is thermal mode currently enabled?
 */
export function isThermalActive() {
    return thermalActive;
}

/**
 * Set target silicon die temperature (e.g. from Overclock or heavy project focus).
 * @param {number} tempC
 */
export function setThermalLoad(tempC) {
    targetDieTemp = Math.max(30, Math.min(85, tempC));
}

/**
 * Per-frame thermal update loop.
 * Runs smoothly in the animation scheduler.
 * @param {number} elapsed
 * @param {number} delta
 */
export function updateThermal(elapsed, delta) {
    if (!thermalActive || !thermalGroup || !thermalGroup.visible) return;

    // Convective relaxation toward target temperature
    currentDieTemp += (targetDieTemp - currentDieTemp) * Math.min(1.0, delta * 2.5);

    if (motionPrefs.reduced) return; // hold steady on reduced motion

    // Realistic thermal flicker & breathing dissipation
    const thermalPulse = Math.sin(elapsed * 3.2) * 0.04;
    if (cpuThermalMesh) {
        const scale = 1.0 + (currentDieTemp - 40) * 0.008 + thermalPulse;
        cpuThermalMesh.scale.set(scale, scale, 1.0);
    }

    if (cpuThermalMat) {
        const intensity = 0.8 + (currentDieTemp - 40) * 0.005 + thermalPulse;
        cpuThermalMat.opacity = Math.max(0.2, Math.min(1.0, intensity));
    }
}
