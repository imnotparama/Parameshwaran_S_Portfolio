// @ts-check
// ============================================================
// Golden Celebration Corner Sparks
// When the visitor reaches the Contact section (or completes the journey),
// the four brass corner standoff screws emit celebratory golden sparks.
// ============================================================
import * as THREE from 'three';
import { motionPrefs } from '../utils/motion-prefs.js';
import { disposableResources } from './scene.js';

/** @type {THREE.Points | null} */
let sparkPoints = null;

const SPARK_COUNT = 32;
const sparkPositions = new Float32Array(SPARK_COUNT * 3);
const sparkVelocities = new Float32Array(SPARK_COUNT * 3);
let sparkLifetimes = new Float32Array(SPARK_COUNT);
let sparksActive = false;

const CORNER_ORIGINS = [
    new THREE.Vector3(-4.8, 6.8, 0.2),   // Top-Left
    new THREE.Vector3(4.8, 6.8, 0.2),    // Top-Right
    new THREE.Vector3(-4.8, -6.8, 0.2),  // Bottom-Left
    new THREE.Vector3(4.8, -6.8, 0.2)    // Bottom-Right
];

/**
 * Initialize golden celebration sparks on the board.
 * @param {THREE.Group} boardGroup
 */
export function initCornerSparks(boardGroup) {
    if (sparkPoints) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    disposableResources.geometries.add(geo);

    const mat = new THREE.PointsMaterial({
        color: 0xffd700,
        size: 0.12,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending
    });
    disposableResources.materials.add(mat);

    sparkPoints = new THREE.Points(geo, mat);
    sparkPoints.name = 'CornerCelebrationSparks';
    boardGroup.add(sparkPoints);
}

/**
 * Trigger celebratory spark pop from corner screws.
 */
export function triggerCornerSparks() {
    if (motionPrefs.reduced || !sparkPoints) return;

    sparksActive = true;
    const mat = /** @type {THREE.PointsMaterial} */ (sparkPoints.material);
    mat.opacity = 1.0;

    for (let i = 0; i < SPARK_COUNT; i++) {
        const corner = CORNER_ORIGINS[i % 4];
        const i3 = i * 3;
        sparkPositions[i3] = corner.x;
        sparkPositions[i3 + 1] = corner.y;
        sparkPositions[i3 + 2] = corner.z;

        // Radial outward burst velocity
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 2.5;
        sparkVelocities[i3] = Math.cos(angle) * speed;
        sparkVelocities[i3 + 1] = Math.sin(angle) * speed;
        sparkVelocities[i3 + 2] = (Math.random() + 0.5) * speed;

        sparkLifetimes[i] = 1.0;
    }

    sparkPoints.geometry.attributes.position.needsUpdate = true;
}

/**
 * Per-frame animation for golden sparks.
 * @param {number} delta
 */
export function updateCornerSparks(delta) {
    if (!sparksActive || !sparkPoints || motionPrefs.reduced) return;

    let anyAlive = false;
    const posAttr = sparkPoints.geometry.attributes.position;
    const array = /** @type {Float32Array} */ (posAttr.array);

    for (let i = 0; i < SPARK_COUNT; i++) {
        if (sparkLifetimes[i] > 0) {
            anyAlive = true;
            sparkLifetimes[i] -= delta * 1.2;

            const i3 = i * 3;
            array[i3] += sparkVelocities[i3] * delta;
            array[i3 + 1] += sparkVelocities[i3 + 1] * delta;
            array[i3 + 2] += sparkVelocities[i3 + 2] * delta;

            // Gravity decay
            sparkVelocities[i3 + 2] -= 3.5 * delta;
        }
    }

    posAttr.needsUpdate = true;

    const mat = /** @type {THREE.PointsMaterial} */ (sparkPoints.material);
    if (!anyAlive) {
        sparksActive = false;
        mat.opacity = 0;
    } else {
        mat.opacity = Math.max(0, mat.opacity - delta * 0.8);
    }
}
