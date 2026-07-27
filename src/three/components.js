import * as THREE from 'three';
import { disposableResources } from './scene.js';

export const interactiveObjects = [];
export const insideInteractiveObjects = [];
export const cpuPins = [];
export let siliconDieMesh;
export let ledMeshes = [];
export let cpuRadarRing;

// Groups containing internal architectures of components
export let cpuInsideGroup;
export let gpuInsideGroup;
export let oscInsideGroup;
export let antInsideGroup;
export let usbInsideGroup;
export let vrInsideGroup;

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
        sCtx.strokeStyle = 'rgba(0, 255, 136, 0.35)';
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
                    sCtx.fillStyle = 'rgba(0, 255, 136, 0.45)';
                    sCtx.fillRect(c * cellSize + 2, r * cellSize + 2, cellSize - 4, cellSize - 4);
                } else if ((r + c) % 2 === 0) {
                    sCtx.fillStyle = 'rgba(0, 255, 136, 0.1)';
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
        color: 0x00ff88,
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
        color: 0x00ff88,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    cpuRadarRing = new THREE.Mesh(ringGeo, ringMat);
    cpuRadarRing.position.set(0, 0, 0.01);
    cpuGroup.add(cpuRadarRing);

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

    // CPU Microarchitecture Internals
    cpuInsideGroup = new THREE.Group();
    cpuInsideGroup.position.set(0, 0, 0.12);
    cpuInsideGroup.visible = false;
    cpuGroup.add(cpuInsideGroup);

    const subCoreGeo = new THREE.BoxGeometry(0.68, 0.68, 0.05);
    const makeSubCore = (name, x, y, color) => {
        const mat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.5, metalness: 0.4 });
        const mesh = new THREE.Mesh(subCoreGeo, mat);
        mesh.position.set(x, y, 0.03);
        mesh.name = name;
        cpuInsideGroup.add(mesh);
        insideInteractiveObjects.push(mesh);

        const edges = new THREE.EdgesGeometry(subCoreGeo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color }));
        line.position.copy(mesh.position);
        cpuInsideGroup.add(line);
    };

    makeSubCore('core_alu', -0.38, 0.38, 0xf59e0b); // ALU Core
    makeSubCore('core_npu', 0.38, 0.38, 0xef4444);  // Neural Core
    makeSubCore('core_cu', -0.38, -0.38, 0x3b82f6); // CU Core
    makeSubCore('core_io', 0.38, -0.38, 0x10b981);  // I/O Core

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

    // GPU Silicon execution cores (Projects)
    gpuInsideGroup = new THREE.Group();
    gpuInsideGroup.position.set(-3.2, 4.5, surfaceZ + 0.09);
    gpuInsideGroup.visible = false;
    boardGroup.add(gpuInsideGroup);

    const gpuSiliconGeom = new THREE.BoxGeometry(1.3, 1.3, 0.04);
    const gpuSilicon = new THREE.Mesh(gpuSiliconGeom, chipMaterial);
    gpuInsideGroup.add(gpuSilicon);

    const projCoreGeo = new THREE.BoxGeometry(0.32, 0.32, 0.05);
    const makeProjCore = (name, x, y) => {
        const mat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.4, metalness: 0.3 });
        const mesh = new THREE.Mesh(projCoreGeo, mat);
        mesh.position.set(x, y, 0.03);
        mesh.name = name;
        gpuInsideGroup.add(mesh);
        insideInteractiveObjects.push(mesh);

        const edges = new THREE.EdgesGeometry(projCoreGeo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00bfff }));
        line.position.copy(mesh.position);
        gpuInsideGroup.add(line);
    };

    // 3 x 2 grid of project cores
    makeProjCore('proj_core_1', -0.38, 0.38);
    makeProjCore('proj_core_2', 0.0, 0.38);
    makeProjCore('proj_core_3', 0.38, 0.38);
    makeProjCore('proj_core_4', -0.38, -0.38);
    makeProjCore('proj_core_5', 0.0, -0.38);
    makeProjCore('proj_core_6', 0.38, -0.38);

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

    // Two gold mounting pads
    const padGeo = new THREE.BoxGeometry(0.1, 0.2, 0.02);
    disposableResources.geometries.add(padGeo);
    const padL = new THREE.Mesh(padGeo, goldMaterial);
    padL.position.set(-4.15, 0.5, surfaceZ - 0.04);
    boardGroup.add(padL);
    const padR = new THREE.Mesh(padGeo, goldMaterial);
    padR.position.set(-2.85, 0.5, surfaceZ - 0.04);
    boardGroup.add(padR);

    // Oscillator internal timing plates (Education Nodes)
    oscInsideGroup = new THREE.Group();
    oscInsideGroup.position.set(-3.5, 0.5, surfaceZ + 0.15);
    oscInsideGroup.visible = false;
    boardGroup.add(oscInsideGroup);

    const makeEduPlate = (name, x, label) => {
        const plateGeo = new THREE.BoxGeometry(0.24, 0.36, 0.04);
        const mat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.3, metalness: 0.8 });
        const mesh = new THREE.Mesh(plateGeo, mat);
        mesh.position.set(x, 0, 0);
        mesh.name = name;
        oscInsideGroup.add(mesh);
        insideInteractiveObjects.push(mesh);

        const edges = new THREE.EdgesGeometry(plateGeo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xaa44ff }));
        line.position.copy(mesh.position);
        oscInsideGroup.add(line);
    };

    makeEduPlate('edu_plate_1', -0.32, 'BTech');
    makeEduPlate('edu_plate_2', 0.0, 'Class12');
    makeEduPlate('edu_plate_3', 0.32, 'Class10');

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

    // Antenna contact details internally
    antInsideGroup = new THREE.Group();
    antInsideGroup.position.set(3.5, 0.5, surfaceZ + 0.1);
    antInsideGroup.visible = false;
    boardGroup.add(antInsideGroup);

    const antReceiverGeo = new THREE.BoxGeometry(0.5, 0.5, 0.05);
    const antReceiverMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.4, metalness: 0.8 });
    const antReceiver = new THREE.Mesh(antReceiverGeo, antReceiverMat);
    antReceiver.name = 'ant_receiver';
    antInsideGroup.add(antReceiver);
    insideInteractiveObjects.push(antReceiver);

    const antEdges = new THREE.EdgesGeometry(antReceiverGeo);
    const antLine = new THREE.LineSegments(antEdges, new THREE.LineBasicMaterial({ color: 0x00ffff }));
    antInsideGroup.add(antLine);

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

    // USB inside contact gold pins (Experience Nodes)
    usbInsideGroup = new THREE.Group();
    usbInsideGroup.position.set(0, -7.3, surfaceZ + 0.2);
    usbInsideGroup.visible = false;
    boardGroup.add(usbInsideGroup);

    const makeUsbContact = (name, x) => {
        const contactGeo = new THREE.BoxGeometry(0.18, 0.4, 0.04);
        const mesh = new THREE.Mesh(contactGeo, goldMaterial);
        mesh.position.set(x, 0, 0);
        mesh.name = name;
        usbInsideGroup.add(mesh);
        insideInteractiveObjects.push(mesh);

        const edges = new THREE.EdgesGeometry(contactGeo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff8800 }));
        line.position.copy(mesh.position);
        usbInsideGroup.add(line);
    };

    makeUsbContact('usb_contact_1', -0.3);
    makeUsbContact('usb_contact_2', 0.0);
    makeUsbContact('usb_contact_3', 0.3);

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
        insideInteractiveObjects.push(dome);

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

    // Tech Stack Cooling Fins slices (Voltage Regulator Internals)
    vrInsideGroup = new THREE.Group();
    vrInsideGroup.position.set(3.5, -4.5, surfaceZ + 0.2);
    vrInsideGroup.visible = false;
    boardGroup.add(vrInsideGroup);

    const makeVrFin = (name, x) => {
        const finGeom = new THREE.BoxGeometry(0.08, 0.6, 0.25);
        const mesh = new THREE.Mesh(finGeom, metalMaterial);
        mesh.position.set(x, 0, 0);
        mesh.name = name;
        vrInsideGroup.add(mesh);
        insideInteractiveObjects.push(mesh);

        const edges = new THREE.EdgesGeometry(finGeom);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff4444 }));
        line.position.copy(mesh.position);
        vrInsideGroup.add(line);
    };

    makeVrFin('vr_fin_1', -0.32);
    makeVrFin('vr_fin_2', -0.16);
    makeVrFin('vr_fin_3', 0.0);
    makeVrFin('vr_fin_4', 0.16);
    makeVrFin('vr_fin_5', 0.32);

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
    insideInteractiveObjects.forEach(obj => {
        if (!obj.userData) obj.userData = {};
        obj.userData.isInteractive = true;
    });
}
