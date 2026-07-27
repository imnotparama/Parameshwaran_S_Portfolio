import * as THREE from 'three';
import { disposableResources } from './scene.js';

export const traceData = [];
export const vias = [];

export function createTraces(boardGroup) {
    const thickness = 0.16;
    const surfaceZ = thickness / 2 + 0.005;

    // Metal trace material (Proper Gold)
    const traceMaterial = new THREE.MeshStandardMaterial({
        color: 0xc8960c,
        roughness: 0.3,
        metalness: 0.85,
        emissive: 0xc8960c,
        emissiveIntensity: 0.4
    });
    disposableResources.materials.add(traceMaterial);

    const viaOuterMaterial = new THREE.MeshStandardMaterial({
        color: 0xc8960c,
        roughness: 0.25,
        metalness: 0.9
    });
    disposableResources.materials.add(viaOuterMaterial);

    const viaInnerMaterial = new THREE.MeshStandardMaterial({
        color: 0x050f05,
        roughness: 0.9,
        metalness: 0.0
    });
    disposableResources.materials.add(viaInnerMaterial);

    // Trace route point layouts (coordinates strictly 0, 45, 90 deg)
    const rawPaths = [
        // 1. CPU (U1) to GPU (U2) Main Bus
        {
            component: 'U2',
            width: 0.09,
            points: [
                new THREE.Vector3(-0.6, 2.2, surfaceZ),
                new THREE.Vector3(-0.6, 3.2, surfaceZ),
                new THREE.Vector3(-1.9, 3.2, surfaceZ),
                new THREE.Vector3(-3.2, 4.5, surfaceZ)
            ]
        },
        // 2. CPU (U1) to C1-C4 Capacitor bank medium traces
        {
            component: 'C1',
            width: 0.05,
            points: [
                new THREE.Vector3(0.2, 2.2, surfaceZ),
                new THREE.Vector3(0.2, 3.0, surfaceZ),
                new THREE.Vector3(1.0, 3.8, surfaceZ),
                new THREE.Vector3(2.3, 3.8, surfaceZ),
                new THREE.Vector3(2.3, 4.2, surfaceZ)
            ]
        },
        {
            component: 'C2',
            width: 0.05,
            points: [
                new THREE.Vector3(0.4, 2.2, surfaceZ),
                new THREE.Vector3(0.4, 2.8, surfaceZ),
                new THREE.Vector3(1.2, 3.6, surfaceZ),
                new THREE.Vector3(2.9, 3.6, surfaceZ),
                new THREE.Vector3(2.9, 4.2, surfaceZ)
            ]
        },
        {
            component: 'C3',
            width: 0.05,
            points: [
                new THREE.Vector3(0.6, 2.2, surfaceZ),
                new THREE.Vector3(0.6, 2.6, surfaceZ),
                new THREE.Vector3(1.4, 3.4, surfaceZ),
                new THREE.Vector3(3.5, 3.4, surfaceZ),
                new THREE.Vector3(3.5, 4.2, surfaceZ)
            ]
        },
        {
            component: 'C4',
            width: 0.05,
            points: [
                new THREE.Vector3(0.8, 2.2, surfaceZ),
                new THREE.Vector3(0.8, 2.4, surfaceZ),
                new THREE.Vector3(1.6, 3.2, surfaceZ),
                new THREE.Vector3(4.1, 3.2, surfaceZ),
                new THREE.Vector3(4.1, 4.2, surfaceZ)
            ]
        },
        // 3. CPU (U1) to Crystal (Y1) Thin Trace
        {
            component: 'Y1',
            width: 0.03,
            points: [
                new THREE.Vector3(-1.25, 0.8, surfaceZ),
                new THREE.Vector3(-2.1, 0.8, surfaceZ),
                new THREE.Vector3(-2.4, 0.5, surfaceZ),
                new THREE.Vector3(-2.9, 0.5, surfaceZ)
            ]
        },
        // 4. CPU (U1) to USB connector (J1) Thick Trace
        {
            component: 'J1',
            width: 0.10,
            points: [
                new THREE.Vector3(0, -0.2, surfaceZ),
                new THREE.Vector3(0, -6.9, surfaceZ)
            ]
        },
        // 5. CPU (U1) to Antenna (ANT1) Medium Trace
        {
            component: 'ANT1',
            width: 0.05,
            points: [
                new THREE.Vector3(1.25, 0.8, surfaceZ),
                new THREE.Vector3(2.1, 0.8, surfaceZ),
                new THREE.Vector3(2.4, 0.5, surfaceZ),
                new THREE.Vector3(3.0, 0.5, surfaceZ)
            ]
        },
        // 6. USB (J1) to VR1 Power trace
        {
            component: 'VR1',
            width: 0.06,
            points: [
                new THREE.Vector3(0.6, -6.9, surfaceZ),
                new THREE.Vector3(0.6, -5.8, surfaceZ),
                new THREE.Vector3(1.9, -5.8, surfaceZ),
                new THREE.Vector3(3.2, -4.5, surfaceZ),
                new THREE.Vector3(3.5, -4.5, surfaceZ)
            ]
        },
        // 7. LED array (D1-D7) to VR1 Power trace
        {
            component: 'D1-D7',
            width: 0.04,
            points: [
                new THREE.Vector3(-2.3, -4.5, surfaceZ),
                new THREE.Vector3(-1.3, -4.5, surfaceZ),
                new THREE.Vector3(-0.7, -3.9, surfaceZ),
                new THREE.Vector3(0.7, -3.9, surfaceZ),
                new THREE.Vector3(1.3, -4.5, surfaceZ),
                new THREE.Vector3(3.0, -4.5, surfaceZ)
            ]
        },
        // 8. Ground edge ring trace connecting to ANT1
        {
            component: 'ANT1',
            width: 0.03,
            points: [
                new THREE.Vector3(3.0, 0.5, surfaceZ),
                new THREE.Vector3(4.5, 0.5, surfaceZ),
                new THREE.Vector3(4.5, 6.6, surfaceZ),
                new THREE.Vector3(-4.5, 6.6, surfaceZ),
                new THREE.Vector3(-4.5, -6.6, surfaceZ),
                new THREE.Vector3(4.5, -6.6, surfaceZ),
                new THREE.Vector3(4.5, -4.2, surfaceZ),
                new THREE.Vector3(4.1, -4.2, surfaceZ)
            ]
        }
    ];

    // Helper to generate solid 3D traces (rotates box geometry between points)
    const addTraceMesh = (pA, pB, traceWidth) => {
        const distance = pA.distanceTo(pB);
        const midpoint = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
        
        const segmentGeo = new THREE.BoxGeometry(traceWidth, distance, 0.012);
        const segment = new THREE.Mesh(segmentGeo, traceMaterial.clone());
        
        segment.position.copy(midpoint);
        // Align segment angle
        const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
        segment.rotation.z = angle - Math.PI / 2;
        segment.receiveShadow = true;
        boardGroup.add(segment);
        return segment;
    };

    // Helper to create small copper vias (rings)
    const addVia = (px, py) => {
        const viaGroup = new THREE.Group();
        viaGroup.position.set(px, py, surfaceZ);
        boardGroup.add(viaGroup);

        // Via copper pad ring
        const ringGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.015, 12);
        ringGeo.rotateX(Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, viaOuterMaterial);
        viaGroup.add(ring);

        // Via internal hole (dark center)
        const holeGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.018, 12);
        holeGeo.rotateX(Math.PI / 2);
        const hole = new THREE.Mesh(holeGeo, viaInnerMaterial);
        hole.position.z = 0.001;
        viaGroup.add(hole);

        vias.push(viaGroup);
    };

    // Construct traces and vias
    rawPaths.forEach(path => {
        const meshes = [];
        for (let i = 0; i < path.points.length - 1; i++) {
            const pA = path.points[i];
            const pB = path.points[i + 1];
            meshes.push(addTraceMesh(pA, pB, path.width));

            // Place vias at corners (intermediate points)
            if (i > 0) {
                addVia(pA.x, pA.y);
            }
        }
        // Place vias at start and end points
        addVia(path.points[0].x, path.points[0].y);
        addVia(path.points[path.points.length - 1].x, path.points[path.points.length - 1].y);

        // Save trace metadata for particle flows
        traceData.push({
            component: path.component,
            points: path.points,
            width: path.width,
            meshes: meshes
        });
    });
}
