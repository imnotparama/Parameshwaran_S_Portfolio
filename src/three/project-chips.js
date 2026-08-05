// ============================================================
// Project components — each project is a distinct component
// on the board near the U2 project array.
//   shipped  → finished, soldered chip: solid trace, steady glow
//   building → open breadboard patch: jumper wires, faint flicker
// This gives "still figuring the rest out" a literal visual form.
// ============================================================
import * as THREE from 'three';
import { disposableResources } from './scene.js';
import { interactiveObjects } from './components.js';
import { portfolioData } from '../data/portfolio.js';

const flickerLeds = []; // { mat, seed }
const steadyLeds = [];

export function createProjectChips(boardGroup) {
    const thickness = 0.16;
    const surfaceZ = thickness / 2 + 0.005;

    const chipMat = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.6,
        metalness: 0.3
    });
    const goldMat = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.3,
        metalness: 0.9
    });
    const breadboardMat = new THREE.MeshStandardMaterial({
        color: 0xd6c8a2,
        roughness: 0.95,
        metalness: 0.0
    });
    const solderTraceMat = new THREE.MeshStandardMaterial({
        color: 0xc8960c,
        roughness: 0.3,
        metalness: 0.85,
        emissive: 0x3ee6a0,
        emissiveIntensity: 0.5
    });
    disposableResources.materials.add(chipMat);
    disposableResources.materials.add(goldMat);
    disposableResources.materials.add(breadboardMat);
    disposableResources.materials.add(solderTraceMat);

    const projects = portfolioData.projects;
    const spacing = 0.68;
    const startX = -2.5 - ((projects.length - 1) * spacing) / 2; // centered under U2 region
    const rowY = 2.9;
    const busY = 2.25; // shared signal bus the soldered chips connect to

    // Shared bus line under the chip row (only soldered chips join it)
    const busGeo = new THREE.BoxGeometry((projects.length - 1) * spacing + 0.6, 0.05, 0.012);
    disposableResources.geometries.add(busGeo);
    const busMesh = new THREE.Mesh(busGeo, solderTraceMat.clone());
    busMesh.position.set(-2.5, busY, surfaceZ);
    boardGroup.add(busMesh);

    projects.forEach((proj, i) => {
        const x = startX + i * spacing;
        const group = new THREE.Group();
        group.position.set(x, rowY, surfaceZ);
        boardGroup.add(group);

        const isBuilding = proj.status === 'building';

        if (isBuilding) {
            buildBreadboardPatch(group, goldMat);
        } else {
            buildSolderedChip(group, chipMat, goldMat, solderTraceMat, busY - rowY);
        }

        // Invisible hover bounds → tooltip shows the project name
        const boundsGeo = new THREE.BoxGeometry(0.6, 0.6, 0.3);
        const bounds = new THREE.Mesh(boundsGeo, new THREE.MeshBasicMaterial({ visible: false }));
        bounds.position.z = 0.1;
        bounds.name = proj.ref;
        bounds.userData = {
            componentName: `${proj.title} — ${isBuilding ? 'BREADBOARD (IN BUILD)' : 'SOLDERED (SHIPPED)'}`,
            type: 'PROJECT',
            isInteractive: true
        };
        group.add(bounds);
        interactiveObjects.push(bounds);
    });
}

// Finished, soldered chip — solid trace to the bus, steady glow LED.
function buildSolderedChip(group, chipMat, goldMat, traceMat, busOffsetY) {
    const bodyGeo = new THREE.BoxGeometry(0.42, 0.42, 0.12);
    const body = new THREE.Mesh(bodyGeo, chipMat.clone());
    body.position.z = 0.06;
    body.castShadow = true;
    group.add(body);

    // Gold solder pads on two sides
    const padGeo = new THREE.BoxGeometry(0.07, 0.05, 0.03);
    for (let p = 0; p < 3; p++) {
        const off = (p - 1) * 0.13;
        const padL = new THREE.Mesh(padGeo, goldMat);
        padL.position.set(-0.245, off, 0.015);
        group.add(padL);
        const padR = new THREE.Mesh(padGeo, goldMat);
        padR.position.set(0.245, off, 0.015);
        group.add(padR);
    }

    // Solid finished trace down to the shared bus — steady glow
    const traceLen = Math.abs(busOffsetY) - 0.21;
    const traceGeo = new THREE.BoxGeometry(0.05, traceLen, 0.012);
    const trace = new THREE.Mesh(traceGeo, traceMat.clone());
    trace.position.set(0, busOffsetY / 2, 0.002);
    group.add(trace);

    // Steady status LED — shipped means it stays lit
    const ledGeo = new THREE.SphereGeometry(0.05, 10, 10);
    const ledMat = new THREE.MeshStandardMaterial({
        color: 0x3ee6a0,
        emissive: 0x3ee6a0,
        emissiveIntensity: 1.4,
        roughness: 0.3
    });
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0.14, 0.14, 0.14);
    group.add(led);
    steadyLeds.push(ledMat);
}

// Open breadboard patch — visible jumper wires, faint flicker.
function buildBreadboardPatch(group, goldMat) {
    const plateGeo = new THREE.BoxGeometry(0.56, 0.56, 0.05);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xd6c8a2, roughness: 0.95 });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.z = 0.025;
    group.add(plate);

    // Breadboard tie-point holes (small dark dots grid)
    const holeGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6);
    holeGeo.rotateX(Math.PI / 2);
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x2a2419, roughness: 1 });
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            const hole = new THREE.Mesh(holeGeo, holeMat);
            hole.position.set((c - 1.5) * 0.12, (r - 1.5) * 0.12, 0.052);
            group.add(hole);
        }
    }

    // Small chip loosely placed on the patch (slightly rotated — not seated)
    const microGeo = new THREE.BoxGeometry(0.2, 0.2, 0.08);
    const microMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6 });
    const micro = new THREE.Mesh(microGeo, microMat);
    micro.position.set(-0.08, 0.06, 0.09);
    micro.rotation.z = 0.18;
    group.add(micro);

    // Visible jumper wires arcing over the patch
    const jumperColors = [0xef4444, 0x3b82f6, 0xf59e0b];
    for (let j = 0; j < 3; j++) {
        const a = new THREE.Vector3(-0.2 + j * 0.1, -0.2, 0.05);
        const b = new THREE.Vector3(0.15 + j * 0.05, 0.18 - j * 0.08, 0.05);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        mid.z = 0.22 + j * 0.03;
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        const tubeGeo = new THREE.TubeGeometry(curve, 12, 0.012, 6, false);
        const tubeMat = new THREE.MeshStandardMaterial({
            color: jumperColors[j],
            roughness: 0.5
        });
        group.add(new THREE.Mesh(tubeGeo, tubeMat));
    }

    // Faintly flickering LED — still being figured out
    const ledGeo = new THREE.SphereGeometry(0.045, 10, 10);
    const ledMat = new THREE.MeshStandardMaterial({
        color: 0xc8960c,
        emissive: 0xc8960c,
        emissiveIntensity: 0.7,
        roughness: 0.3
    });
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0.18, -0.18, 0.09);
    group.add(led);
    flickerLeds.push({ mat: ledMat, seed: Math.random() * 100 });
}

// Per-frame: flicker the breadboard LEDs, keep soldered ones steady.
export function updateProjectChips(elapsed) {
    for (const f of flickerLeds) {
        const n = Math.sin(elapsed * 7 + f.seed) * Math.sin(elapsed * 13.7 + f.seed * 2);
        f.mat.emissiveIntensity = n > 0.55 ? 0.15 : 0.7 + n * 0.25;
    }
}
