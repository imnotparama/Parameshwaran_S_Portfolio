// @ts-check
// ============================================================
// Paper Airplane Resume Delivery
// Clicking "Download Resume" folds and launches a 3D origami paper
// airplane that swoops gracefully across the board and flies off-screen
// before opening the resume download.
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { motionPrefs } from '../utils/motion-prefs.js';
import { disposableResources } from './scene.js';
import { switchClack, hoverBlip } from '../utils/sound.js';

/** @type {THREE.Mesh | null} */
let airplaneMesh = null;
let isFlying = false;

/**
 * Initialize the 3D origami paper airplane on the board.
 * @param {THREE.Group} boardGroup
 */
export function initPaperAirplane(boardGroup) {
    if (airplaneMesh) return;

    // Origami Paper Airplane Geometry (classic dart fold)
    // Vertices: Nose (0, 0.4, 0.04), Left wing tip (-0.3, -0.3, 0.08),
    // Right wing tip (0.3, -0.3, 0.08), Tail center (0, -0.25, 0.0), Keel bottom (0, 0, -0.06)
    const positions = new Float32Array([
        // Left Wing
        0, 0.4, 0.04,
        -0.35, -0.3, 0.09,
        0, -0.28, 0.02,

        // Right Wing
        0, 0.4, 0.04,
        0, -0.28, 0.02,
        0.35, -0.3, 0.09,

        // Left Keel
        0, 0.4, 0.04,
        0, -0.28, 0.02,
        0, -0.1, -0.06,

        // Right Keel
        0, 0.4, 0.04,
        0, -0.1, -0.06,
        0, -0.28, 0.02
    ]);

    const planeGeo = new THREE.BufferGeometry();
    planeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    planeGeo.computeVertexNormals();
    disposableResources.geometries.add(planeGeo);

    const planeMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.6,
        metalness: 0.05,
        side: THREE.DoubleSide
    });
    disposableResources.materials.add(planeMat);

    airplaneMesh = new THREE.Mesh(planeGeo, planeMat);
    airplaneMesh.name = 'PaperAirplane';
    airplaneMesh.visible = false;
    boardGroup.add(airplaneMesh);
}

/**
 * Launch the paper airplane flight trajectory and trigger download on completion.
 * @param {string} resumeUrl
 * @param {() => void} [onComplete]
 */
export function launchPaperAirplane(resumeUrl, onComplete) {
    if (isFlying) return;

    if (motionPrefs.reduced || !airplaneMesh) {
        if (onComplete) onComplete();
        else if (resumeUrl) window.open(resumeUrl, '_blank');
        return;
    }

    isFlying = true;
    switchClack();

    // Start position (resting on board near Parama serial sticker)
    airplaneMesh.position.set(-3.2, 4.5, 0.15);
    airplaneMesh.rotation.set(0, 0, -0.4);
    airplaneMesh.scale.set(1.2, 1.2, 1.2);
    airplaneMesh.visible = true;

    hoverBlip();

    // Swooping 3D flight arc: takes off, curves forward, rolls wings, glides past camera
    const tl = gsap.timeline({
        onComplete: () => {
            if (airplaneMesh) airplaneMesh.visible = false;
            isFlying = false;
            if (onComplete) onComplete();
            else if (resumeUrl) window.open(resumeUrl, '_blank');
        }
    });

    tl.to(airplaneMesh.position, {
        x: 0,
        y: 2.0,
        z: 2.2,
        duration: 0.5,
        ease: 'power2.in'
    })
    .to(airplaneMesh.rotation, {
        z: 0.2,
        x: -0.3,
        duration: 0.5,
        ease: 'power1.inOut'
    }, 0)
    .to(airplaneMesh.position, {
        x: 5.5,
        y: -3.5,
        z: 4.8,
        duration: 0.7,
        ease: 'power1.out'
    }, 0.5)
    .to(airplaneMesh.rotation, {
        z: 0.8,
        y: 0.5,
        duration: 0.7,
        ease: 'power1.out'
    }, 0.5);
}
