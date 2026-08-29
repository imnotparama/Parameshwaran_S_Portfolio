// @ts-check
// ============================================================
// High-Voltage Turbo Overclock Engine ('T' / Turbo Switch)
//
// 1. Voltage & Clock Surge:
//    - Surges board from 3.3V nominal to 5.0V Turbo (100MHz).
//    - Accelerates copper trace electron flows & ripple waves.
//
// 2. Procedural Electrical Arc Sparks:
//    - Real-time electric arc line segments jumping between
//      Test Points (TP1, TP2) and CPU ground pins.
//    - High-frequency particle sparks with additive glow.
//
// 3. Volumetric Solder Smoke:
//    - Subtle 3D smoke wisps drifting from the U1 CPU heatsink.
//
// Respects motionPrefs.reduced (disables intense strobes & particles).
// ============================================================

import * as THREE from 'three';
import gsap from 'gsap';
import { motionPrefs } from '../utils/motion-prefs.js';
import { disposableResources } from './scene.js';
import { hoverBlip, switchClack } from '../utils/sound.js';

let isOverclocked = false;

/** @type {THREE.Group | null} */
let arcGroup = null;
/** @type {THREE.LineSegments | null} */
let arcLines = null;
/** @type {THREE.LineBasicMaterial | null} */
let arcMaterial = null;

// Smoke particle system
const SMOKE_COUNT = 36;
/** @type {THREE.InstancedMesh | null} */
let smokeMesh = null;
/** @type {Array<{ pos: THREE.Vector3, vel: THREE.Vector3, life: number, maxLife: number, scale: number }>} */
const smokeParticles = [];
const dummyObj = new THREE.Object3D();

/**
 * Initialize electrical arcs and smoke particle geometry.
 * @param {THREE.Group} boardGroup
 */
export function initOverclock(boardGroup) {
    // 1. Electrical Arc Lines
    arcGroup = new THREE.Group();
    arcMaterial = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        linewidth: 2
    });
    disposableResources.materials.add(arcMaterial);

    const arcGeom = new THREE.BufferGeometry();
    const maxSegments = 64;
    const positions = new Float32Array(maxSegments * 6);
    arcGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    disposableResources.geometries.add(arcGeom);

    arcLines = new THREE.LineSegments(arcGeom, arcMaterial);
    arcGroup.add(arcLines);
    boardGroup.add(arcGroup);

    // 2. Solder Smoke Particle System
    const smokeGeo = new THREE.PlaneGeometry(0.2, 0.2);
    disposableResources.geometries.add(smokeGeo);

    // Soft radial smoke texture
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
        grad.addColorStop(0, 'rgba(210, 230, 220, 0.6)');
        grad.addColorStop(0.5, 'rgba(180, 200, 190, 0.25)');
        grad.addColorStop(1, 'rgba(150, 170, 160, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
    }
    const smokeTex = new THREE.CanvasTexture(canvas);
    disposableResources.textures.add(smokeTex);

    const smokeMat = new THREE.MeshBasicMaterial({
        map: smokeTex,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.NormalBlending
    });
    disposableResources.materials.add(smokeMat);

    smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, SMOKE_COUNT);
    smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    disposableResources.geometries.add(smokeMesh.geometry);
    disposableResources.materials.add(smokeMesh.material);

    // Initialize smoke particles pooling
    smokeParticles.length = 0;
    for (let i = 0; i < SMOKE_COUNT; i++) {
        smokeParticles.push({
            pos: new THREE.Vector3(0, 0, -100),
            vel: new THREE.Vector3(),
            life: Math.random() * 2,
            maxLife: 1.5 + Math.random() * 1.5,
            scale: 0.5 + Math.random() * 0.8
        });
    }

    boardGroup.add(smokeMesh);
}

/**
 * Check if Turbo Overclock is currently engaged.
 * @returns {boolean}
 */
export function isOverclockActive() {
    return isOverclocked;
}

/**
 * Toggle Turbo Overclock mode.
 */
export function toggleOverclock() {
    setOverclockState(!isOverclocked);
}

/**
 * Set Turbo Overclock mode explicitly.
 * @param {boolean} active
 */
export function setOverclockState(active) {
    if (isOverclocked === active) return;
    isOverclocked = active;

    switchClack();
    hoverBlip();

    document.body.classList.toggle('overclock-active', isOverclocked);
    const turboBtn = document.getElementById('turbo-toggle-btn');
    if (turboBtn) {
        turboBtn.setAttribute('aria-pressed', String(isOverclocked));
        turboBtn.classList.toggle('active', isOverclocked);
    }

    if (arcMaterial) {
        gsap.to(arcMaterial, {
            opacity: isOverclocked ? 0.9 : 0.0,
            duration: 0.3,
            overwrite: 'auto'
        });
    }

    // Update HUD scope readout if active
    const scopeVal = document.getElementById('hud-scope-val');
    if (scopeVal && isOverclocked) {
        scopeVal.textContent = 'TURBO · 100.000MHz · 5.0V SURGE';
    }
}

/**
 * Generate a procedural lightning arc between two 3D vectors.
 * @param {THREE.Vector3} start
 * @param {THREE.Vector3} end
 * @param {Float32Array} positions
 * @param {number} offset
 * @param {number} segments
 * @returns {number} New offset
 */
function generateArc(start, end, positions, offset, segments = 5) {
    let current = start.clone();
    for (let i = 0; i < segments; i++) {
        const t = (i + 1) / segments;
        const next = new THREE.Vector3().lerpVectors(start, end, t);

        if (i < segments - 1) {
            // Add jitter
            next.x += (Math.random() - 0.5) * 0.25;
            next.y += (Math.random() - 0.5) * 0.25;
            next.z += (Math.random() - 0.5) * 0.15;
        }

        positions[offset++] = current.x;
        positions[offset++] = current.y;
        positions[offset++] = current.z;

        positions[offset++] = next.x;
        positions[offset++] = next.y;
        positions[offset++] = next.z;

        current = next;
    }
    return offset;
}

/**
 * Update electrical arcs and smoke particles each frame.
 * @param {number} elapsed Scene elapsed time
 * @param {number} delta Frame delta time
 */
export function updateOverclock(elapsed, delta) {
    if (!isOverclocked || motionPrefs.reduced) {
        if (smokeMesh && smokeMesh.visible) {
            smokeMesh.visible = false;
        }
        return;
    }

    if (smokeMesh) smokeMesh.visible = true;

    // 1. Update Electrical Arc Lines
    if (arcLines && arcMaterial && arcMaterial.opacity > 0.05) {
        const geom = /** @type {THREE.BufferGeometry} */ (arcLines.geometry);
        const posAttr = /** @type {THREE.BufferAttribute} */ (geom.getAttribute('position'));
        const positions = /** @type {Float32Array} */ (posAttr.array);

        let offset = 0;
        // Arc from TP1 (-1.5, 3.2, 0.08) to CPU U1 edge (-0.8, 1.2, 0.08)
        if (Math.random() < 0.8) {
            offset = generateArc(
                new THREE.Vector3(-1.5, 3.2, 0.08),
                new THREE.Vector3(-0.8, 1.2, 0.08),
                positions, offset, 6
            );
        }

        // Arc from TP2 (2.2, -3.0, 0.08) to CPU U1 edge (0.8, -1.0, 0.08)
        if (Math.random() < 0.8) {
            offset = generateArc(
                new THREE.Vector3(2.2, -3.0, 0.08),
                new THREE.Vector3(0.8, -1.0, 0.08),
                positions, offset, 6
            );
        }

        // Zero out unused segments
        for (let i = offset; i < positions.length; i++) {
            positions[i] = 0;
        }

        posAttr.needsUpdate = true;
    }

    // 2. Update Solder Smoke Particles
    if (smokeMesh) {
        for (let i = 0; i < SMOKE_COUNT; i++) {
            const p = smokeParticles[i];
            p.life += delta;

            if (p.life >= p.maxLife) {
                // Respawn at CPU heatsink center (0, 0, 0.15)
                p.life = 0;
                p.pos.set(
                    (Math.random() - 0.5) * 1.2,
                    (Math.random() - 0.5) * 1.2,
                    0.15
                );
                p.vel.set(
                    (Math.random() - 0.5) * 0.15,
                    (Math.random() - 0.5) * 0.15 + 0.1, // slight upwards drift along Y
                    0.35 + Math.random() * 0.4          // rising outwards along Z
                );
            } else {
                p.pos.addScaledVector(p.vel, delta);
            }

            const lifeFrac = p.life / p.maxLife;
            const currentScale = p.scale * (1.0 + lifeFrac * 2.2);

            dummyObj.position.copy(p.pos);
            dummyObj.scale.set(currentScale, currentScale, currentScale);
            dummyObj.rotation.z = elapsed * 0.5 + i;
            dummyObj.updateMatrix();

            smokeMesh.setMatrixAt(i, dummyObj.matrix);
        }

        smokeMesh.instanceMatrix.needsUpdate = true;
        const mat = /** @type {THREE.MeshBasicMaterial} */ (smokeMesh.material);
        mat.opacity = 0.35;
    }
}
