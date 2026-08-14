// @ts-check
import * as THREE from 'three';
import gsap from 'gsap';
import { disposableResources } from './scene.js';
import { beepBuzzer } from '../utils/buzzer.js';
import { motionPrefs } from '../utils/motion-prefs.js';

/** @type {THREE.Mesh[]} */
export const interactiveObjects = [];
/** @type {THREE.Mesh[]} */
export const cpuPins = [];
/** @type {THREE.Mesh | undefined} */
export let siliconDieMesh;
/** @type {THREE.Mesh[]} */
export let ledMeshes = [];
/** @type {THREE.Mesh | undefined} */
export let cpuRadarRing;

// ─── CPU radar sweep — the ring is an open arc that rotates like a
// radar line, with a gentle opacity pulse. Driven per-frame from
// elapsed time (procedural, deterministic).

// Decorative motion — respect prefers-reduced-motion: keep the arc static
// (motionPrefs from ../utils/motion-prefs.js — the single policy source).

/** @param {number} elapsed */
export function updateRadarRing(elapsed) {
    if (!cpuRadarRing) return;
    if (motionPrefs.reduced) return; // static arc for reduced-motion users
    cpuRadarRing.rotation.z = elapsed * 0.8; // full revolution ≈ 7.8s
    // The ring is created with MeshBasicMaterial above — keep in sync if that
    // ever changes (instanceof narrows Material | Material[]; the old property
    // check couldn't).
    const mat = cpuRadarRing.material;
    if (mat instanceof THREE.MeshBasicMaterial) {
        mat.opacity = 0.45 + Math.sin(elapsed * 2.2) * 0.15;
    }
}

// ─── D1-D7 LED array — the status LEDs pulse at rest ──────────
// The seven diodes were a flat constant glow (0.1). Now they breathe on
// staggered seeded intervals — brief bright peaks then a settle — so the
// array reads as powered instrumentation instead of paint. Runs continuously
// (like the sweep/ripple, it's ambient life, not idle-gated): the idle loop
// gates the camera drift; the LEDs stay alive whenever the board is on.
// Reduced motion: hold the calm built-in 0.1 — powered, never strobing.
const LED_PULSE_BASE = 0.1;
const LED_PULSE_AMP = 0.6;      // peaks at 0.7, well under the arrival flash

// The three tactile switches, in board-local coordinates (SW1 = top).
// Hoisted so main.js can wire switch behaviors without re-declaring the
// geometry — hover.js's SWITCH clicks arrive with the object's name, and
// main.js routes them; SW3's "nearest chip" math reads these positions.
export const SWITCH_POS = [[4.7, 2.9], [4.7, 0.9], [4.7, -1.9]];

/** @typedef {{ mesh: THREE.Mesh, mat: THREE.MeshStandardMaterial, phase: number, freq: number }} LedPulse */
/** @type {LedPulse[]} */
const ledPulseDrivers = [];

/** @param {number} elapsed */
export function updateLedArray(elapsed) {
    for (const d of ledPulseDrivers) {
        if (motionPrefs.reduced) {
            d.mat.emissiveIntensity = LED_PULSE_BASE;
            continue;
        }
        // Sharpened sine (n²·²): a slow rise with a brief bright peak reads as
        // a status pulse, not a sinusoid. Per-LED freq/phase desync the array.
        const n = 0.5 + 0.5 * Math.sin(elapsed * d.freq * Math.PI * 2 + d.phase);
        d.mat.emissiveIntensity = LED_PULSE_BASE + Math.pow(n, 2.2) * LED_PULSE_AMP;
    }
}

/** @param {THREE.Group} boardGroup */
export function createComponents(boardGroup) {
    const thickness = 0.16;
    const surfaceZ = thickness / 2 + 0.005;

    // Helper material generation
    const chipMaterial = new THREE.MeshStandardMaterial({
        color: 0x18181b, // Dark zinc gray
        roughness: 0.65,
        metalness: 0.25
    });

    const metalMaterial = new THREE.MeshStandardMaterial({
        color: 0xe5e7eb, // Bright silver
        roughness: 0.25,
        metalness: 0.95
    });

    const goldMaterial = new THREE.MeshStandardMaterial({
        color: 0xd97706, // Amber gold
        roughness: 0.3,
        metalness: 0.9,
        emissive: 0x78350f,
        emissiveIntensity: 0.1
    });

    // Package lead-frame outlines — gold on ICs, silver on the crystal can.
    // A thin perimeter line reads as a real package seam at the new camera angle.
    const goldFrameMat = new THREE.LineBasicMaterial({ color: 0xc9a24b, transparent: true, opacity: 0.55 });
    const silverFrameMat = new THREE.LineBasicMaterial({ color: 0xd6dde4, transparent: true, opacity: 0.5 });

    // -------------------------------------------------------------
    // COMPONENT 1 — Main CPU / IC Chip (U1) - About & Skills
    // -------------------------------------------------------------
    const cpuGroup = new THREE.Group();
    cpuGroup.position.set(0, 1.0, surfaceZ);
    boardGroup.add(cpuGroup);

    const cpuGeo = new THREE.BoxGeometry(2.4, 2.4, 0.22);
    const cpuMesh = new THREE.Mesh(cpuGeo, chipMaterial.clone());
    cpuMesh.castShadow = true;
    cpuMesh.receiveShadow = true;
    cpuMesh.name = 'U1'; // Ref Designator
    cpuMesh.userData = { componentName: 'Main CPU (About Me)', type: 'CPU' };
    cpuGroup.add(cpuMesh);
    interactiveObjects.push(cpuMesh);

    // Dynamic grid for silicon die glow on top surface (6x6 grid layout)
    const siliconCanvas = document.createElement('canvas');
    siliconCanvas.width = 128;
    siliconCanvas.height = 128;
    const sCtx = siliconCanvas.getContext('2d');
    if (sCtx) {
        sCtx.clearRect(0, 0, 128, 128);
        const cellSize = 128 / 6;

        // Draw 6x6 grid lines
        sCtx.strokeStyle = 'rgba(62, 230, 160, 0.35)';
        sCtx.lineWidth = 1.0;
        for (let i = 0; i <= 6; i++) {
            // Horizontal
            sCtx.beginPath();
            sCtx.moveTo(0, i * cellSize);
            sCtx.lineTo(128, i * cellSize);
            sCtx.stroke();
            // Vertical
            sCtx.beginPath();
            sCtx.moveTo(i * cellSize, 0);
            sCtx.lineTo(i * cellSize, 128);
            sCtx.stroke();
        }

        // Draw cells (alternating fills & bright core)
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 6; c++) {
                const isCore = (r === 2 || r === 3) && (c === 2 || c === 3);
                if (isCore) {
                    sCtx.fillStyle = 'rgba(62, 230, 160, 0.45)';
                    sCtx.fillRect(c * cellSize + 2, r * cellSize + 2, cellSize - 4, cellSize - 4);
                } else if ((r + c) % 2 === 0) {
                    sCtx.fillStyle = 'rgba(62, 230, 160, 0.1)';
                    sCtx.fillRect(c * cellSize + 2, r * cellSize + 2, cellSize - 4, cellSize - 4);
                }
            }
        }
    }
    const siliconTexture = new THREE.CanvasTexture(siliconCanvas);
    const siliconGeo = new THREE.PlaneGeometry(1.6, 1.6);
    const siliconMat = new THREE.MeshBasicMaterial({
        map: siliconTexture,
        transparent: true,
        color: 0x3ee6a0,
        opacity: 0.8, // Brighter glowing silicon die
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    siliconDieMesh = new THREE.Mesh(siliconGeo, siliconMat);
    siliconDieMesh.position.set(0, 0, 0.115);
    cpuGroup.add(siliconDieMesh);

    // CPU Radar loading ring (Upgrade 3)
    const ringGeo = new THREE.RingGeometry(1.6, 1.7, 48, 1, 0, Math.PI * 1.55);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    cpuRadarRing = new THREE.Mesh(ringGeo, ringMat);
    cpuRadarRing.position.set(0, 0, 0.01);
    cpuGroup.add(cpuRadarRing);

    // Gold lead-frame outline around the chip top (package seam, real-IC look)
    const cpuFramePts = [
        new THREE.Vector3(-1.2, -1.2, 0.112),
        new THREE.Vector3(1.2, -1.2, 0.112),
        new THREE.Vector3(1.2, 1.2, 0.112),
        new THREE.Vector3(-1.2, 1.2, 0.112)
    ];
    const cpuFrame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(cpuFramePts), goldFrameMat);
    cpuGroup.add(cpuFrame);

    disposableResources.geometries.add(cpuGeo);

    // CPU Pins - 8 pins per side (32 pins total)
    const cpuPinGeo = new THREE.BoxGeometry(0.12, 0.06, 0.05);
    disposableResources.geometries.add(cpuPinGeo);
    const offsetStride = 0.25;

    /** @param {number} px @param {number} py @param {number} rotation */
    const addPin = (px, py, rotation) => {
        const pinMesh = new THREE.Mesh(cpuPinGeo, goldMaterial.clone());
        pinMesh.position.set(px, py, -0.08);
        pinMesh.rotation.z = rotation;
        cpuGroup.add(pinMesh);
        cpuPins.push(pinMesh);
    };

    for (let i = 0; i < 8; i++) addPin(-1.25, (i - 3.5) * offsetStride, 0); // Left
    for (let i = 0; i < 8; i++) addPin((i - 3.5) * offsetStride, 1.25, Math.PI / 2); // Top
    for (let i = 0; i < 8; i++) addPin(1.25, (3.5 - i) * offsetStride, 0); // Right
    for (let i = 0; i < 8; i++) addPin((3.5 - i) * offsetStride, -1.25, Math.PI / 2); // Bottom

    // -------------------------------------------------------------
    // COMPONENT 2 — GPU / DSP Chip (U2) - Projects
    // -------------------------------------------------------------
    const gpuGeo = new THREE.BoxGeometry(1.8, 1.8, 0.18);
    disposableResources.geometries.add(gpuGeo);
    const gpuMesh = new THREE.Mesh(gpuGeo, chipMaterial.clone());
    gpuMesh.position.set(-3.2, 4.5, surfaceZ);
    gpuMesh.castShadow = true;
    gpuMesh.name = 'U2';
    gpuMesh.userData = { componentName: 'GPU (Projects)', type: 'GPU' };
    boardGroup.add(gpuMesh);
    interactiveObjects.push(gpuMesh);

    // GPU pins (pins on two sides)
    const gpuPinGeo = new THREE.BoxGeometry(0.1, 0.05, 0.04);
    disposableResources.geometries.add(gpuPinGeo);
    for (let i = 0; i < 6; i++) {
        const offset = (i - 2.5) * 0.22;
        const pinL = new THREE.Mesh(gpuPinGeo, metalMaterial);
        pinL.position.set(-3.2 - 0.95, 4.5 + offset, surfaceZ - 0.05);
        boardGroup.add(pinL);
        const pinR = new THREE.Mesh(gpuPinGeo, metalMaterial);
        pinR.position.set(-3.2 + 0.95, 4.5 + offset, surfaceZ - 0.05);
        boardGroup.add(pinR);
    }

    // Gold lead-frame outline on U2
    const gpuFramePts = [
        new THREE.Vector3(-0.9, -0.9, surfaceZ + 0.091),
        new THREE.Vector3(0.9, -0.9, surfaceZ + 0.091),
        new THREE.Vector3(0.9, 0.9, surfaceZ + 0.091),
        new THREE.Vector3(-0.9, 0.9, surfaceZ + 0.091)
    ];
    const gpuFrame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(gpuFramePts), goldFrameMat);
    gpuFrame.position.set(-3.2, 4.5, 0);
    boardGroup.add(gpuFrame);

    // -------------------------------------------------------------
    // COMPONENT 3 — Capacitor Bank (C1-C4) - Skills (Display only)
    // -------------------------------------------------------------
    const capGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.7, 16);
    capGeo.rotateX(Math.PI / 2);
    const capTopGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16);
    capTopGeo.rotateX(Math.PI / 2);

    const capBodyMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5, metalness: 0.3 });
    const capStripeMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.3, metalness: 0.9 });

    const capXPositions = [2.3, 2.9, 3.5, 4.1];
    const skillCategories = ['AI/ML', 'WEB', 'DATA', 'HW'];

    capXPositions.forEach((cx, index) => {
        const capGroup = new THREE.Group();
        capGroup.position.set(cx, 4.5, surfaceZ);
        boardGroup.add(capGroup);

        const body = new THREE.Mesh(capGeo, capBodyMat.clone());
        body.castShadow = true;
        body.position.z = 0.35;
        body.name = `C${index + 1}`;
        body.userData = { componentName: `Capacitor C${index + 1} (${skillCategories[index]} Skills)`, type: 'CAP' };
        capGroup.add(body);
        interactiveObjects.push(body);

        const top = new THREE.Mesh(capTopGeo, capStripeMat);
        top.position.set(0, 0, 0.7);
        capGroup.add(top);
    });

    // -------------------------------------------------------------
    // COMPONENT 4 — Crystal Oscillator (Y1) - Education
    // -------------------------------------------------------------
    const oscGeo = new THREE.BoxGeometry(1.2, 0.6, 0.26);
    disposableResources.geometries.add(oscGeo);
    const oscMesh = new THREE.Mesh(oscGeo, metalMaterial.clone());
    oscMesh.position.set(-3.5, 0.5, surfaceZ + 0.03);
    oscMesh.castShadow = true;
    oscMesh.name = 'Y1';
    oscMesh.userData = { componentName: 'Crystal Oscillator Y1 (Education)', type: 'CRYSTAL' };
    boardGroup.add(oscMesh);
    interactiveObjects.push(oscMesh);

    // Silver seam line around the crystal can top
    const oscFramePts = [
        new THREE.Vector3(-0.6, -0.3, surfaceZ + 0.161),
        new THREE.Vector3(0.6, -0.3, surfaceZ + 0.161),
        new THREE.Vector3(0.6, 0.3, surfaceZ + 0.161),
        new THREE.Vector3(-0.6, 0.3, surfaceZ + 0.161)
    ];
    const oscFrame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(oscFramePts), silverFrameMat);
    oscFrame.position.set(-3.5, 0.5, 0);
    boardGroup.add(oscFrame);

    // Two gold mounting pads
    const padGeo = new THREE.BoxGeometry(0.1, 0.2, 0.02);
    disposableResources.geometries.add(padGeo);
    const padL = new THREE.Mesh(padGeo, goldMaterial);
    padL.position.set(-4.15, 0.5, surfaceZ - 0.04);
    boardGroup.add(padL);
    const padR = new THREE.Mesh(padGeo, goldMaterial);
    padR.position.set(-2.85, 0.5, surfaceZ - 0.04);
    boardGroup.add(padR);

    // -------------------------------------------------------------
    // COMPONENT 5 — WiFi/Bluetooth Antenna (ANT1) - Contact
    // -------------------------------------------------------------
    const antGroup = new THREE.Group();
    antGroup.position.set(3.5, 0.5, surfaceZ);
    boardGroup.add(antGroup);

    // Zigzag coordinates relative to antGroup center (3.5, 0.5)
    const antPoints = [
        new THREE.Vector3(0, 1.0, 0),
        new THREE.Vector3(0.3, 0.7, 0),
        new THREE.Vector3(0, 0.4, 0),
        new THREE.Vector3(0.3, 0.1, 0),
        new THREE.Vector3(0, -0.2, 0)
    ];

    for (let i = 0; i < antPoints.length - 1; i++) {
        const pA = antPoints[i];
        const pB = antPoints[i + 1];
        
        const dist = pA.distanceTo(pB);
        const midX = (pA.x + pB.x) / 2;
        const midY = (pA.y + pB.y) / 2;
        const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
        
        const segGeo = new THREE.BoxGeometry(dist, 0.05, 0.02);
        const segMesh = new THREE.Mesh(segGeo, goldMaterial.clone());
        segMesh.position.set(midX, midY, 0);
        segMesh.rotation.z = angle;
        antGroup.add(segMesh);
    }

    const antBoundsGeo = new THREE.BoxGeometry(1.0, 1.0, 0.15);
    const antBoundsMesh = new THREE.Mesh(antBoundsGeo, new THREE.MeshBasicMaterial({ visible: false }));
    antBoundsMesh.position.set(3.5, 0.5, surfaceZ + 0.05);
    antBoundsMesh.name = 'ANT1';
    antBoundsMesh.userData = { componentName: 'Antenna ANT1 (Contact)', type: 'ANTENNA' };
    boardGroup.add(antBoundsMesh);
    interactiveObjects.push(antBoundsMesh);

    // -------------------------------------------------------------
    // COMPONENT 6 — USB Power Connector (J1) - Experience
    // -------------------------------------------------------------
    const usbGeo = new THREE.BoxGeometry(1.2, 0.8, 0.32);
    disposableResources.geometries.add(usbGeo);
    const usbMesh = new THREE.Mesh(usbGeo, metalMaterial.clone());
    usbMesh.position.set(0, -7.3, surfaceZ + 0.06);
    usbMesh.castShadow = true;
    usbMesh.name = 'J1';
    usbMesh.userData = { componentName: 'USB Connector J1 (Experience)', type: 'USB' };
    boardGroup.add(usbMesh);
    interactiveObjects.push(usbMesh);

    // -------------------------------------------------------------
    // COMPONENT 7 — LED Array (D1-D7) - Certifications
    // -------------------------------------------------------------
    const ledColors = [0x10b981, 0x3b82f6, 0xf59e0b, 0xef4444, 0x8b5cf6, 0x06b6d4, 0xf8fafc];
    const ledCoords = [
        { x: -4.4, y: -4.2 }, { x: -3.8, y: -4.2 }, { x: -3.2, y: -4.2 }, { x: -2.6, y: -4.2 },
        { x: -4.1, y: -4.8 }, { x: -3.5, y: -4.8 }, { x: -2.9, y: -4.8 }
    ];

    const ledGeo = new THREE.SphereGeometry(0.08, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    disposableResources.geometries.add(ledGeo);
    const ledBaseGeo = new THREE.BoxGeometry(0.2, 0.2, 0.03);
    disposableResources.geometries.add(ledBaseGeo);

    ledCoords.forEach((coord, index) => {
        const ledGroup = new THREE.Group();
        ledGroup.position.set(coord.x, coord.y, surfaceZ);
        boardGroup.add(ledGroup);

        const plasticMat = new THREE.MeshStandardMaterial({
            color: ledColors[index],
            emissive: ledColors[index],
            emissiveIntensity: 0.1,
            roughness: 0.2
        });
        const dome = new THREE.Mesh(ledGeo, plasticMat);
        dome.position.z = 0.03;
        dome.rotation.x = Math.PI / 2;
        dome.name = `led_diode_${index + 1}`; // unique names for individual hovers
        ledGroup.add(dome);
        ledMeshes.push(dome);

        const base = new THREE.Mesh(ledBaseGeo, chipMaterial.clone());
        ledGroup.add(base);
    });

    // D1-D7 at-rest pulse drivers — staggered seeded intervals (deterministic:
    // the "slightly randomized" cadence of the idle brief comes from a fixed
    // hash, never Math.random — the board breathes identically on every load).
    ledPulseDrivers.length = 0;
    ledMeshes.forEach((mesh, i) => {
        const h = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
        ledPulseDrivers.push({
            mesh,
            mat: /** @type {THREE.MeshStandardMaterial} */ (mesh.material),
            phase: i * 1.31 + 0.41,
            freq: 0.42 + (h - Math.floor(h)) * 0.5 // 0.42–0.92 Hz, per-LED
        });
    });

    const ledBoundsMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 0.15), new THREE.MeshBasicMaterial({ visible: false }));
    ledBoundsMesh.position.set(-3.5, -4.5, surfaceZ + 0.05);
    ledBoundsMesh.name = 'D1-D7';
    ledBoundsMesh.userData = { componentName: 'LED Array D1-D7 (Certifications)', type: 'LEDS' };
    boardGroup.add(ledBoundsMesh);
    interactiveObjects.push(ledBoundsMesh);

    // -------------------------------------------------------------
    // COMPONENT 8 — Voltage Regulator (VR1) - Stack
    // -------------------------------------------------------------
    const vrGroup = new THREE.Group();
    vrGroup.position.set(3.5, -4.5, surfaceZ);
    boardGroup.add(vrGroup);

    const vrBodyGeo = new THREE.BoxGeometry(0.7, 0.7, 0.16);
    disposableResources.geometries.add(vrBodyGeo);
    const vrBody = new THREE.Mesh(vrBodyGeo, chipMaterial.clone());
    vrBody.position.z = 0.08;
    vrGroup.add(vrBody);

    const vrTabGeo = new THREE.BoxGeometry(0.7, 0.3, 0.04);
    const vrTab = new THREE.Mesh(vrTabGeo, metalMaterial.clone());
    vrTab.position.set(0, 0.5, 0.02);
    vrGroup.add(vrTab);

    const vrBoundsGeo = new THREE.BoxGeometry(0.8, 1.0, 0.2);
    const vrBoundsMesh = new THREE.Mesh(vrBoundsGeo, new THREE.MeshBasicMaterial({ visible: false }));
    vrBoundsMesh.name = 'VR1';
    vrBoundsMesh.userData = { componentName: 'Regulator VR1 (Tech Stack)', type: 'REGULATOR' };
    vrBoundsMesh.position.z = 0.1;
    vrGroup.add(vrBoundsMesh);
    interactiveObjects.push(vrBoundsMesh);

    // -------------------------------------------------------------
    // COMPONENT 9 — Resistor Network (RN1) - Languages (Display only)
    // -------------------------------------------------------------
    const rnGeo = new THREE.BoxGeometry(1.3, 0.16, 0.35);
    disposableResources.geometries.add(rnGeo);
    const rnMesh = new THREE.Mesh(rnGeo, chipMaterial.clone());
    rnMesh.position.set(0, -3.5, surfaceZ + 0.15);
    rnMesh.castShadow = true;
    rnMesh.name = 'RN1';
    rnMesh.userData = { componentName: 'Resistor Network RN1 (Programming Languages)', type: 'RESISTOR' };
    boardGroup.add(rnMesh);
    interactiveObjects.push(rnMesh);

    // -------------------------------------------------------------
    // COMPONENT 10 — Piezo Buzzer (BZ1) - the horn
    // A brass piezo disc with a center dimple + two wire legs. Clicking it
    // fires pulseBuzzer(): a scale pulse, an emissive flash, an expanding
    // sound-wave ring, and the WebAudio beep (the horn moment).
    // Positioned at (-1, -5.5): the board's right half is off-frame at the
    // establishing shot (rotated framing), so a buzzer at x=4.2 was
    // invisible — this spot is on-canvas and near the LED array / J1.
    // -------------------------------------------------------------
    const buzzerGroup = new THREE.Group();
    buzzerGroup.position.set(-1, -5.5, surfaceZ);
    boardGroup.add(buzzerGroup);

    const piezoMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.35,
        metalness: 0.85,
        emissive: 0x3ee6a0,
        emissiveIntensity: 0 // dark until pulsed — "if it glows, it's live"
    });
    const dimpleMat = new THREE.MeshStandardMaterial({
        color: 0x1c1917,
        roughness: 0.6,
        metalness: 0.4
    });

    const discGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24);
    discGeo.rotateX(Math.PI / 2);
    const disc = new THREE.Mesh(discGeo, piezoMat);
    disc.position.z = 0.045;
    disc.castShadow = true;
    disc.name = 'BZ1';
    disc.userData = { componentName: 'Piezo Buzzer BZ1 (Sound)', type: 'BUZZER' };
    buzzerGroup.add(disc);
    interactiveObjects.push(disc);

    // Center dimple (the piezo's contact pin)
    const dimpleGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.04, 20);
    dimpleGeo.rotateX(Math.PI / 2);
    const dimple = new THREE.Mesh(dimpleGeo, dimpleMat);
    dimple.position.z = 0.07;
    buzzerGroup.add(dimple);

    // Two gold wire legs to the board
    const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.1, 8);
    const legL = new THREE.Mesh(legGeo, goldMaterial);
    legL.position.set(-0.18, 0, 0.02);
    legL.rotation.x = 0.5;
    buzzerGroup.add(legL);
    const legR = new THREE.Mesh(legGeo, goldMaterial);
    legR.position.set(0.18, 0, 0.02);
    legR.rotation.x = 0.5;
    buzzerGroup.add(legR);

    // Expanding sound-wave ring (the visible "beep") — spawned per click
    const buzzerRingGeo = new THREE.RingGeometry(0.22, 0.27, 32);
    const buzzerRingMat = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const buzzerRing = new THREE.Mesh(buzzerRingGeo, buzzerRingMat);
    buzzerRing.rotation.x = -Math.PI / 2;
    buzzerRing.position.z = 0.1;
    buzzerRing.visible = false;
    buzzerGroup.add(buzzerRing);

    disposableResources.geometries.add(discGeo);
    disposableResources.geometries.add(dimpleGeo);
    disposableResources.geometries.add(legGeo);
    disposableResources.geometries.add(buzzerRingGeo);

    // -------------------------------------------------------------
    // TP1, TP2 — Test Points
    // -------------------------------------------------------------
    const tpGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.015, 12);
    tpGeo.rotateX(Math.PI / 2);

    const tp1 = new THREE.Mesh(tpGeo, goldMaterial.clone());
    tp1.position.set(-1.5, 3.2, surfaceZ);
    tp1.name = 'TP1';
    tp1.userData = { componentName: 'Test Point TP1 (5V System)', type: 'TESTPOINT' };
    boardGroup.add(tp1);
    interactiveObjects.push(tp1);

    const tp2 = new THREE.Mesh(tpGeo, goldMaterial.clone());
    tp2.position.set(2.2, -3.0, surfaceZ);
    tp2.name = 'TP2';
    tp2.userData = { componentName: 'Test Point TP2 (GND Reference)', type: 'TESTPOINT' };
    boardGroup.add(tp2);
    interactiveObjects.push(tp2);

    // -------------------------------------------------------------
    // COMPONENTS 11+ — dead-zone fillers. The board was ~60% empty
    // substrate; these recognizable parts (SW1-3, RF1, C5, HDR1, L1,
    // RV1) make it read as a fully populated assembly. All hoverable
    // (glow + scope readout) like the rest; the tactile switches are
    // clickable — a press dip + instrument blip (hover.js routes
    // SWITCH clicks here). All passive (no emissive, no per-frame
    // writes) so they never fight the ambient layers.
    // -------------------------------------------------------------

    // Tactile push buttons — a row of three along the right edge.
    // The CAP is the interactive part (it's what you'd press).
    const btnBaseMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.7, metalness: 0.25 });
    const btnCapMat = new THREE.MeshStandardMaterial({ color: 0xd7dbe0, roughness: 0.35, metalness: 0.5 });
    const btnBaseGeo = new THREE.BoxGeometry(0.42, 0.42, 0.12);
    const btnCapGeo = new THREE.BoxGeometry(0.26, 0.26, 0.045);
    disposableResources.geometries.add(btnBaseGeo);
    disposableResources.geometries.add(btnCapGeo);
    disposableResources.materials.add(btnBaseMat);
    disposableResources.materials.add(btnCapMat);

    // RF shield can — RF1 top-right (WiFi/BLE module can with embossed
    // top frame + vent slots).
    const rfBodyMat = new THREE.MeshStandardMaterial({ color: 0x8f99a3, roughness: 0.35, metalness: 0.9 });
    const rfVentMat = new THREE.MeshStandardMaterial({ color: 0x39424d, roughness: 0.5, metalness: 0.7 });
    const rfFrameMat = new THREE.LineBasicMaterial({ color: 0x2b3440, transparent: true, opacity: 0.85 });
    const rfBodyGeo = new THREE.BoxGeometry(1.5, 1.5, 0.2);
    const rfVentGeo = new THREE.BoxGeometry(0.05, 0.5, 0.012);
    disposableResources.geometries.add(rfBodyGeo);
    disposableResources.geometries.add(rfVentGeo);
    disposableResources.materials.add(rfBodyMat);
    disposableResources.materials.add(rfVentMat);
    disposableResources.materials.add(rfFrameMat);

    // Electrolytic through-hole capacitor — C5 bottom-center-right: black
    // can with a gold top and the classic + polarity cross.
    const ecBodyMat = new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.6, metalness: 0.3 });
    const ecTopMat = new THREE.MeshStandardMaterial({ color: 0xc9a24b, roughness: 0.25, metalness: 0.9 });
    const ecCrossMat = new THREE.MeshStandardMaterial({ color: 0x141519, roughness: 0.8, metalness: 0.1 });
    const ecBodyGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.8, 20);
    const ecTopGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.02, 20);
    const ecCrossGeo = new THREE.BoxGeometry(0.4, 0.06, 0.014);
    ecBodyGeo.rotateX(Math.PI / 2); // stand upright (axis along Z)
    ecTopGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(ecBodyGeo);
    disposableResources.geometries.add(ecTopGeo);
    disposableResources.geometries.add(ecCrossGeo);
    disposableResources.materials.add(ecBodyMat);
    disposableResources.materials.add(ecTopMat);
    disposableResources.materials.add(ecCrossMat);

    // Pin header — HDR1 top-left: black housing, 6 gold pins standing up.
    const hdrHousingMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.8, metalness: 0.1 });
    const hdrHousingGeo = new THREE.BoxGeometry(0.18, 1.35, 0.12);
    const hdrPinGeo = new THREE.BoxGeometry(0.05, 0.05, 0.18);
    disposableResources.geometries.add(hdrHousingGeo);
    disposableResources.geometries.add(hdrPinGeo);
    disposableResources.materials.add(hdrHousingMat);

    // Shielded power inductor — L1 top-center: squat dark block with a
    // silver band and gold end-pads (buck-stage choke).
    const indBodyMat = new THREE.MeshStandardMaterial({ color: 0x23252a, roughness: 0.55, metalness: 0.4 });
    const indBandMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c7, roughness: 0.3, metalness: 0.85 });
    const indBodyGeo = new THREE.BoxGeometry(0.9, 0.9, 0.34);
    const indBandGeo = new THREE.BoxGeometry(0.9, 0.2, 0.01);
    const indPadGeo = new THREE.BoxGeometry(0.18, 0.3, 0.02);
    disposableResources.geometries.add(indBodyGeo);
    disposableResources.geometries.add(indBandGeo);
    disposableResources.geometries.add(indPadGeo);
    disposableResources.materials.add(indBodyMat);
    disposableResources.materials.add(indBandMat);

    // Trim pot — RV1 left-mid: classic blue trimpot with a gold screw head.
    const rvBodyMat = new THREE.MeshStandardMaterial({ color: 0x1e4d8f, roughness: 0.5, metalness: 0.2 });
    const rvBodyGeo = new THREE.BoxGeometry(0.62, 0.62, 0.2);
    const rvScrewGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.045, 14);
    rvScrewGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(rvBodyGeo);
    disposableResources.geometries.add(rvScrewGeo);
    disposableResources.materials.add(rvBodyMat);

    SWITCH_POS.forEach(([sx, sy], i) => {
        const base = new THREE.Mesh(btnBaseGeo, btnBaseMat);
        base.position.set(sx, sy, surfaceZ + 0.06);
        base.castShadow = true;
        boardGroup.add(base);
        const cap = new THREE.Mesh(btnCapGeo, btnCapMat);
        cap.position.set(sx, sy, surfaceZ + 0.1425);
        cap.castShadow = true;
        cap.name = `SW${i + 1}`;
        cap.userData = { componentName: `Tactile Switch SW${i + 1} (Front Panel)`, type: 'SWITCH' };
        boardGroup.add(cap);
        tactileButtons.push({ cap });
        interactiveObjects.push(cap);
    });

    // RF1 — metal can + embossed top frame + three vent slots.
    const rfMesh = new THREE.Mesh(rfBodyGeo, rfBodyMat);
    rfMesh.position.set(4.1, 6.0, surfaceZ + 0.1);
    rfMesh.castShadow = true;
    rfMesh.name = 'RF1';
    rfMesh.userData = { componentName: 'RF Shield RF1 (WiFi/BLE Can)', type: 'RF' };
    boardGroup.add(rfMesh);
    interactiveObjects.push(rfMesh);
    const rfFrame = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.62, -0.62, 0.101),
        new THREE.Vector3(0.62, -0.62, 0.101),
        new THREE.Vector3(0.62, 0.62, 0.101),
        new THREE.Vector3(-0.62, 0.62, 0.101)
    ]), rfFrameMat);
    rfFrame.position.set(4.1, 6.0, surfaceZ + 0.1);
    boardGroup.add(rfFrame);
    for (let v = 0; v < 3; v++) {
        const vent = new THREE.Mesh(rfVentGeo, rfVentMat);
        vent.position.set(4.1 - 0.25 + v * 0.25, 6.0, surfaceZ + 0.201);
        boardGroup.add(vent);
    }

    // C5 — upright electrolytic: dark can, gold top, + cross, cast shadow.
    const c5 = new THREE.Mesh(ecBodyGeo, ecBodyMat);
    c5.position.set(2.6, -6.5, surfaceZ + 0.4);
    c5.castShadow = true;
    c5.name = 'C5';
    c5.userData = { componentName: 'Electrolytic C5 (Bulk Rail)', type: 'CAP' };
    boardGroup.add(c5);
    interactiveObjects.push(c5);
    const c5Top = new THREE.Mesh(ecTopGeo, ecTopMat);
    c5Top.position.set(2.6, -6.5, surfaceZ + 0.8);
    boardGroup.add(c5Top);
    for (const [cx] of [[0], [Math.PI / 2]]) {
        const cross = new THREE.Mesh(ecCrossGeo, ecCrossMat);
        cross.rotation.z = cx;
        cross.position.set(2.6, -6.5, surfaceZ + 0.811);
        boardGroup.add(cross);
    }

    // HDR1 — housing + 6 gold pins as children (the housing is the hit
    // target; children ride along for raycast-free decoration).
    const hdrMesh = new THREE.Mesh(hdrHousingGeo, hdrHousingMat);
    hdrMesh.position.set(-4.85, 5.0, surfaceZ + 0.06);
    hdrMesh.castShadow = true;
    hdrMesh.name = 'HDR1';
    hdrMesh.userData = { componentName: 'Pin Header HDR1 (Breakout)', type: 'HDR' };
    boardGroup.add(hdrMesh);
    interactiveObjects.push(hdrMesh);
    for (let p = 0; p < 6; p++) {
        const pin = new THREE.Mesh(hdrPinGeo, goldMaterial);
        pin.position.set(0, 5.0 - 0.55 + p * 0.22, surfaceZ + 0.06 + 0.06 + 0.09);
        hdrMesh.add(pin);
    }

    // L1 — inductor body + silver band + gold end-pads.
    const l1 = new THREE.Mesh(indBodyGeo, indBodyMat);
    l1.position.set(-1.9, 6.6, surfaceZ + 0.17);
    l1.castShadow = true;
    l1.name = 'L1';
    l1.userData = { componentName: 'Shielded Inductor L1 (Buck Stage)', type: 'IND' };
    boardGroup.add(l1);
    interactiveObjects.push(l1);
    const l1Band = new THREE.Mesh(indBandGeo, indBandMat);
    l1Band.position.set(-1.9, 6.6, surfaceZ + 0.341);
    boardGroup.add(l1Band);
    for (const px of [-0.48, 0.48]) {
        const pad = new THREE.Mesh(indPadGeo, goldMaterial);
        pad.position.set(-1.9 + px, 6.6, surfaceZ);
        boardGroup.add(pad);
    }

    // RV1 — blue trimpot with a gold adjustment screw.
    const rvMesh = new THREE.Mesh(rvBodyGeo, rvBodyMat);
    rvMesh.position.set(-4.85, -1.2, surfaceZ + 0.1);
    rvMesh.castShadow = true;
    rvMesh.name = 'RV1';
    rvMesh.userData = { componentName: 'Trimmer RV1 (Tune)', type: 'TRIMPOT' };
    boardGroup.add(rvMesh);
    interactiveObjects.push(rvMesh);
    const rvScrew = new THREE.Mesh(rvScrewGeo, goldMaterial);
    rvScrew.position.set(-4.85, -1.2, surfaceZ + 0.21);
    boardGroup.add(rvScrew);

    // Dynamic tagging of isInteractive = true
    interactiveObjects.forEach(obj => {
        if (!obj.userData) obj.userData = {};
        obj.userData.isInteractive = true;
    });
}

// ─── Buzzer horn moment ───────────────────────────────────────
// Clicking the piezo fires the whole moment: the disc pulses and flashes
// live-green, an additive ring expands like a sound wave, and the WebAudio
// beep plays (the horn). The ring stays hidden at rest (opacity 0, visible
// false) so nothing ambient renders.
/** @type {THREE.Group | null} */
let buzzerGroupRef = null;
/** @type {THREE.MeshStandardMaterial | null} */
let buzzerMatRef = null;
/** @type {THREE.Mesh | null} */
let buzzerRingRef = null;

// The builder sets these during createComponents; pulseBuzzer reads them
// (module-scope refs survive HMR re-entry via re-init).
export function pulseBuzzer() {
    // Lazy lookup keeps the module free of init-order coupling — the refs
    // are set whenever createComponents ran.
    if (!buzzerGroupRef) {
        // Find by walking interactiveObjects for the BUZZER entry's parent.
        const disc = interactiveObjects.find((o) => o.userData && o.userData.type === 'BUZZER');
        if (disc) {
            buzzerGroupRef = /** @type {THREE.Group | null} */ (disc.parent);
            const mat = /** @type {any} */ (disc.material);
            if (mat && mat.emissive) buzzerMatRef = mat;
            const ring = buzzerGroupRef && buzzerGroupRef.children.find((c) => c instanceof THREE.Mesh && c.geometry && c.geometry.type === 'RingGeometry');
            if (ring instanceof THREE.Mesh) buzzerRingRef = ring;
        }
    }
    if (!buzzerGroupRef) return;

    gsap.killTweensOf(buzzerGroupRef.scale);
    gsap.fromTo(buzzerGroupRef.scale, { x: 1, y: 1, z: 1 }, {
        x: 1.28, y: 1.28, z: 1.28,
        duration: 0.16, yoyo: true, repeat: 1, ease: 'power1.out', overwrite: 'auto'
    });

    if (buzzerMatRef) {
        gsap.killTweensOf(buzzerMatRef);
        gsap.fromTo(buzzerMatRef, { emissiveIntensity: 0 }, {
            emissiveIntensity: 2.4,
            duration: 0.1, yoyo: true, repeat: 1, ease: 'power1.out', overwrite: 'auto'
        });
    }

    if (buzzerRingRef) {
        gsap.killTweensOf(buzzerRingRef.scale);
        gsap.killTweensOf(buzzerRingRef.material);
        buzzerRingRef.visible = true;
        // THREE scale is a Vector3 — tween its components, not the property
        // (a scalar `scale: 1.7` tween throws on Object3D).
        gsap.fromTo(buzzerRingRef.scale, { x: 0.25, y: 0.25, z: 0.25 }, {
            x: 1.7, y: 1.7, z: 1.7,
            duration: 0.55, ease: 'power2.out', overwrite: 'auto'
        });
        gsap.fromTo(buzzerRingRef.material, { opacity: 0.9 }, {
            opacity: 0,
            duration: 0.55, ease: 'power2.out', overwrite: 'auto',
            onComplete: () => { if (buzzerRingRef) buzzerRingRef.visible = false; }
        });
    }

    beepBuzzer();
}

// ─── Tactile switch press ─────────────────────────────────────
// Clicking SW1-3 dips the cap and springs it back (hover.js routes SWITCH
// clicks here, alongside the instrument blip). Purely visual — the buttons
// are front-panel dressing that feels mechanical.
/** @type {Array<{ cap: THREE.Mesh }>} */
const tactileButtons = [];

/** @param {string} name */
export function pressTactile(name) {
    const btn = tactileButtons.find((b) => b.cap.name === name);
    if (!btn) return;
    gsap.killTweensOf(btn.cap.position);
    gsap.to(btn.cap.position, {
        z: btn.cap.position.z - 0.055,
        duration: 0.09,
        ease: 'power2.in',
        yoyo: true,
        repeat: 1,
        overwrite: 'auto'
    });
}
