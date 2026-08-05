// ============================================================
// Board geometry + canvas silkscreen
// ============================================================
import * as THREE from 'three';
import { disposableResources } from './scene.js';
import { showFallbackUI } from '../ui/fallback.js';

export let boardGroup;
export let silkscreenMesh;

export function createBoard(scene) {
    boardGroup = new THREE.Group();

    // 1. Create Board base using ExtrudeGeometry for rounded corners
    const width = 11;
    const height = 15;
    const thickness = 0.16;
    const radius = 0.4;

    const shape = new THREE.Shape();
    // Rounded rectangle path centered at (0, 0)
    const x = -width / 2;
    const y = -height / 2;

    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + height - radius);
    shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    shape.lineTo(x + radius, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);

    const extrudeSettings = {
        depth: thickness,
        bevelEnabled: false
    };

    const boardGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    boardGeometry.center();
    disposableResources.geometries.add(boardGeometry);

    // Matte dark-green board core material
    const boardMaterial = new THREE.MeshStandardMaterial({
        color: 0x0a2b0a,
        roughness: 0.8,
        metalness: 0.15
    });
    disposableResources.materials.add(boardMaterial);

    const boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);
    boardMesh.receiveShadow = true;
    boardMesh.castShadow = true;
    boardGroup.add(boardMesh);

    // Lighter soldermask top overlay layer
    const maskGeom = new THREE.PlaneGeometry(width - 0.1, height - 0.1);
    disposableResources.geometries.add(maskGeom);
    const maskMat = new THREE.MeshStandardMaterial({
        color: 0x1e4d33,
        roughness: 0.7,
        metalness: 0.2
    });
    disposableResources.materials.add(maskMat);
    const soldermask = new THREE.Mesh(maskGeom, maskMat);
    soldermask.position.z = thickness / 2 + 0.001; // Just above base
    soldermask.receiveShadow = true;
    boardGroup.add(soldermask);

    // 2. Generate Silkscreen, Markings, Logo, and Copper Pour on off-screen canvas
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 4096;
    const ctx = canvas.getContext('2d');

    let silkscreenTexture = null;
    if (ctx) {
        try {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // A. Draw Ground Plane Hatched Copper Pour in 4 Corners (Dark Gold)
            ctx.strokeStyle = 'rgba(201, 162, 75, 0.22)';
            ctx.lineWidth = 8;

            const drawHatchedPour = (startX, startY, endX, endY) => {
                ctx.save();
                ctx.beginPath();
                ctx.rect(startX, startY, endX - startX, endY - startY);
                ctx.clip();
                for (let i = -2000; i < 4000; i += 48) {
                    ctx.moveTo(startX + i, startY);
                    ctx.lineTo(startX + i - (endY - startY), endY);
                }
                ctx.stroke();
                ctx.restore();
            };

            // Top Left
            drawHatchedPour(80, 80, 600, 900);
            // Top Right
            drawHatchedPour(1448, 80, 1968, 900);
            // Bottom Left
            drawHatchedPour(80, 3100, 600, 4016);
            // Bottom Right
            drawHatchedPour(1448, 3100, 1968, 4016);

            // B. Set up silkscreen text style
            ctx.fillStyle = '#ece7d8';
            ctx.font = 'bold 67px monospace';

            // C. Component Outline Boxes
            ctx.strokeStyle = '#ece7d8';
            ctx.lineWidth = 6;

            // U1 CPU Outline
            ctx.strokeRect(1024 - 240, 2048 - 272 - 240, 480, 480);
            ctx.font = '56px monospace';
            ctx.fillText('U1 - ECE_MCU_v2.0', 1024 - 190, 2048 - 272 + 300);

            // U2 Projects Outline
            ctx.strokeRect(428 - 168, 1092 - 168, 336, 336);
            ctx.fillText('U2 - PROJECTS', 428 - 140, 1092 + 224);

            // C1-C4 Outline (Caps)
            ctx.strokeRect(1620 - 300, 1092 - 80, 600, 160);
            ctx.fillText('C1-C4 - SKILLS', 1620 - 150, 1092 + 140);

            // Y1 Crystal Outline
            ctx.strokeRect(372 - 120, 2048 - 272 - 60, 240, 120);
            ctx.fillText('Y1', 372 - 20, 2048 - 272 + 110);

            // J1 USB-C Outline
            ctx.strokeRect(1024 - 128, 4000 - 128, 256, 128);
            ctx.fillText('J1 - USB_PWR', 1024 - 120, 4000 - 160);

            // VR1 Stack Outline
            ctx.strokeRect(1676 - 100, 3276 - 80, 200, 160);
            ctx.fillText('VR1 - STACK', 1676 - 120, 3276 + 140);

            // D1-D7 Certs Outline
            ctx.strokeRect(372 - 240, 3276 - 160, 480, 320);
            ctx.fillText('D1-D7 - CERTS', 372 - 140, 3276 + 220);

            // RN1 Languages Outline
            ctx.strokeRect(1024 - 160, 3000 - 30, 320, 60);
            ctx.fillText('RN1 - LANGS', 1024 - 120, 3000 + 80);

            // D. Border Outline Tracing with Rounded Corners
            ctx.strokeStyle = 'rgba(236, 231, 216, 0.8)';
            ctx.lineWidth = 10;
            const offset = 50;
            const w = canvas.width - 2 * offset;
            const h = canvas.height - 2 * offset;
            const r = 100;
            ctx.beginPath();
            ctx.moveTo(offset + r, offset);
            ctx.lineTo(offset + w - r, offset);
            ctx.quadraticCurveTo(offset + w, offset, offset + w, offset + r);
            ctx.lineTo(offset + w, offset + h - r);
            ctx.quadraticCurveTo(offset + w, offset + h, offset + w - r, offset + h);
            ctx.lineTo(offset + r, offset + h);
            ctx.quadraticCurveTo(offset, offset + h, offset, offset + h - r);
            ctx.lineTo(offset, offset + r);
            ctx.quadraticCurveTo(offset, offset, offset + r, offset);
            ctx.stroke();

            // E. Silkscreen Labels & Text Markings
            ctx.fillStyle = '#ece7d8';

            ctx.font = 'bold 100px monospace';
            ctx.fillText('PARAMA-DEV-BOARD-v1.0', 120, 3960);
            ctx.font = '67px monospace';
            ctx.fillText('REV A', 1800, 160);
            ctx.fillText('DESIGNED BY: PARAMESHWARAN S', 1120, 3880);
            ctx.fillText('CHENNAI, INDIA 2025', 1320, 3960);

            // F. SRM Institute marking near Y1 Crystal
            ctx.save();
            ctx.translate(372, 2048 - 272 - 300);
            ctx.rotate(-Math.PI / 2);
            ctx.font = '45px monospace';
            ctx.fillText('SRM INSTITUTE OF SCIENCE AND TECHNOLOGY', -380, 0);
            ctx.restore();

            // G. Sine Wave graphic silkscreen near Y1 Crystal
            ctx.strokeStyle = '#ece7d8';
            ctx.lineWidth = 4;
            ctx.strokeRect(372 - 100, 2048 - 272 - 180, 200, 80);
            ctx.beginPath();
            for (let i = 0; i <= 200; i++) {
                const sx = 372 - 100 + i;
                const sy = 2048 - 272 - 140 + Math.sin((i / 200) * Math.PI * 4) * 24;
                if (i === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            }
            ctx.stroke();
            ctx.font = '39px monospace';
            ctx.fillText('CLOCK osc', 372 - 72, 2048 - 272 - 200);

            // H. Tamil character "ம்"
            ctx.font = 'bold 123px sans-serif';
            ctx.fillText('ம்', 120, 260);

            // I. Small crosshair registration targets in 4 corners
            const drawCrosshair = (cx, cy) => {
                ctx.strokeStyle = '#ece7d8';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(cx, cy, 28, 0, Math.PI * 2);
                ctx.moveTo(cx - 44, cy);
                ctx.lineTo(cx + 44, cy);
                ctx.moveTo(cx, cy - 44);
                ctx.lineTo(cx, cy + 44);
                ctx.stroke();
            };
            drawCrosshair(160, 160);
            drawCrosshair(1888, 160);
            drawCrosshair(160, 3936);
            drawCrosshair(1888, 3936);

            // I2. Mounting-hole markers — gold plated rings aligned with the
            // 3D holes added in createBoard (same local coords ±4.64, ±6.92).
            ctx.strokeStyle = 'rgba(201, 162, 75, 0.55)';
            ctx.lineWidth = 5;
            [[160, 160], [1888, 160], [160, 3936], [1888, 3936]].forEach(([mx, my]) => {
                ctx.beginPath();
                ctx.arc(mx, my, 50, 0, Math.PI * 2);
                ctx.stroke();
            });

            // I3. Pin-1 marker dot next to U1 (real IC assembly convention)
            ctx.fillStyle = '#ece7d8';
            ctx.beginPath();
            ctx.arc(1024 - 240 + 42, 2048 - 272 - 240 + 42, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = 'bold 44px monospace';
            ctx.fillText('1', 1024 - 240 + 70, 2048 - 272 - 240 + 56);

            // I4. Fab markings along the bottom edge
            ctx.font = '34px monospace';
            ctx.fillText('Pb-FREE / NO-CLEAN', 130, 3810);
            ctx.fillText('IPC-A-610 CLASS 2', 130, 3850);

            // J. Silkscreen QR Code block (mock) at bottom center
            ctx.fillStyle = '#ece7d8';
            ctx.fillRect(1024 - 70, 3700 - 70, 140, 140);
            ctx.fillStyle = '#0a2b0a';
            ctx.fillRect(1024 - 54, 3700 - 54, 108, 108);
            ctx.fillStyle = '#ece7d8';
            ctx.fillRect(1024 - 42, 3700 - 42, 36, 36);
            ctx.fillRect(1024 + 6, 3700 - 42, 36, 36);
            ctx.fillRect(1024 - 42, 3700 + 6, 36, 36);
            ctx.fillRect(1024 - 20, 3700 - 20, 16, 16);
            ctx.fillRect(1024 + 4, 3700 - 4, 12, 12);
            ctx.fillRect(1024 - 18, 3700 + 10, 16, 8);

            // Create the texture from the canvas
            silkscreenTexture = new THREE.CanvasTexture(canvas);
            disposableResources.textures.add(silkscreenTexture);
        } catch (e) {
            console.error('Failed to create silkscreen texture:', e);
            // Create a fallback texture (solid color) so the board still renders
            const fallbackCanvas = document.createElement('canvas');
            fallbackCanvas.width = 64;
            fallbackCanvas.height = 64;
            const fctx = fallbackCanvas.getContext('2d');
            if (fctx) {
                fctx.fillStyle = '#124712'; // soldermask color
                fctx.fillRect(0, 0, 64, 64);
            }
            silkscreenTexture = new THREE.CanvasTexture(fallbackCanvas);
            disposableResources.textures.add(silkscreenTexture);
        }
    } else {
        console.warn('Canvas context not available, creating fallback silkscreen texture');
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = 64;
        fallbackCanvas.height = 64;
        const fctx = fallbackCanvas.getContext('2d');
        if (fctx) {
            fctx.fillStyle = '#124712'; // soldermask color
            fctx.fillRect(0, 0, 64, 64);
        }
        silkscreenTexture = new THREE.CanvasTexture(fallbackCanvas);
        disposableResources.textures.add(silkscreenTexture);
    }

    // Thin overlay mesh just above soldermask surface
    const silkscreenGeom = new THREE.PlaneGeometry(width - 0.1, height - 0.1);
    disposableResources.geometries.add(silkscreenGeom);
    const silkscreenMat = new THREE.MeshBasicMaterial({
        map: silkscreenTexture,
        transparent: true,
        depthWrite: false
    });
    disposableResources.materials.add(silkscreenMat);

    silkscreenMesh = new THREE.Mesh(silkscreenGeom, silkscreenMat);
    silkscreenMesh.position.z = thickness / 2 + 0.003;
    boardGroup.add(silkscreenMesh);

    // 3. Mounting holes — plated-through holes in the 4 corners (reads instantly
    // as a real PCB). Positions align with the silkscreen crosshairs/markers above
    // (canvas 160/1888 x 160/3936 maps to local ±4.64, ±6.92).
    const holeGeo = new THREE.CylinderGeometry(0.24, 0.24, thickness + 0.03, 20);
    holeGeo.rotateX(Math.PI / 2);
    const ringGeo = new THREE.TorusGeometry(0.26, 0.05, 10, 26);
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x030a05, roughness: 0.95, metalness: 0 });
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xc9a24b, roughness: 0.3, metalness: 0.85 });
    disposableResources.geometries.add(holeGeo);
    disposableResources.geometries.add(ringGeo);
    disposableResources.materials.add(holeMat);
    disposableResources.materials.add(ringMat);

    [[4.64, 6.92], [-4.64, 6.92], [4.64, -6.92], [-4.64, -6.92]].forEach(([hx, hy]) => {
        const hole = new THREE.Mesh(holeGeo, holeMat);
        hole.position.set(hx, hy, 0);
        boardGroup.add(hole);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(hx, hy, 0);
        boardGroup.add(ring);
    });

    boardGroup.scale.set(0.85, 0.85, 0.85);
    scene.add(boardGroup);
}
export function updateBoardParallax(elapsed, mouse) {
    if (!boardGroup) return;

    // Check if we're in journey mode (camera controlled by scroll)
    const isJourneyMode = document.body.classList.contains('full-journey');

    if (!isJourneyMode) {
        // Legacy: full board tilt + bob
        const targetRotX = -Math.PI / 10 - mouse.y * 0.08;
        const targetRotY = -Math.PI / 20 + mouse.x * 0.08;

        const bob = Math.sin(elapsed * 1.5) * 0.08;
        boardGroup.position.z = bob;

        boardGroup.rotation.x += (targetRotX - boardGroup.rotation.x) * 0.08;
        boardGroup.rotation.y += (targetRotY - boardGroup.rotation.y) * 0.08;
    } else {
        // Journey mode: camera controls all movement; board stays put
        // Ultra-smooth micro-tilt with higher lerp for fluid response
        const microTiltX = -mouse.y * 0.003;
        const microTiltY = mouse.x * 0.003;
        const lerpFactor = 0.035;
        boardGroup.rotation.x += (microTiltX - boardGroup.rotation.x) * lerpFactor;
        boardGroup.rotation.y += (microTiltY - boardGroup.rotation.y) * lerpFactor;
    }
}