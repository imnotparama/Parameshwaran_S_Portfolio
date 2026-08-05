import * as THREE from 'three';
import { disposableResources } from './scene.js';

export const interactiveObjects = [];
export const cpuPins = [];
export let siliconDieMesh;
export let ledMeshes = [];
export let cpuRadarRing;

// ─── CPU radar sweep — the ring is an open arc that rotates like a
// radar line, with a gentle opacity pulse. Driven per-frame from
// elapsed time (procedural, deterministic).

// Decorative motion — respect prefers-reduced-motion: keep the arc static
const RADAR_REDUCED_MOTION = typeof window !== 'undefined' &&
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function updateRadarRing(elapsed) {
    if (!cpuRadarRing) return;
    if (RADAR_REDUCED_MOTION) return; // static arc for reduced-motion users
    cpuRadarRing.rotation.z = elapsed * 0.8; // full revolution ≈ 7.8s
    const mat = cpuRadarRing.material;
    if (mat && mat.opacity !== undefined) {
        mat.opacity = 0.45 + Math.sin(elapsed * 2.2) * 0.15;
    }
}

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

    // Dynamic tagging of isInteractive = true
    interactiveObjects.forEach(obj => {
        if (!obj.userData) obj.userData = {};
        obj.userData.isInteractive = true;
    });
}
