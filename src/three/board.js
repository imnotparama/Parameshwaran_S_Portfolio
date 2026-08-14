// ============================================================
// Board geometry + canvas silkscreen
// ============================================================
// @ts-check
import * as THREE from 'three';
import { disposableResources } from './scene.js';
import { motionPrefs } from '../utils/motion-prefs.js';

/** @type {THREE.Group | undefined} */
export let boardGroup;
// Module-private: the silkscreen mesh is live on the board but nothing imports it.
let silkscreenMesh;

/** @param {THREE.Scene} scene */
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

            /** @param {number} startX @param {number} startY @param {number} endX @param {number} endY */
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

            // C2. Silkscreen designators for the parts added in components.js
            // (the dead-zone fillers SW1-3/RF1/C5/HDR1/L1/RV1 + the remaining
            // unmarked interactive parts BZ1/TP1/TP2/ANT1) — outline boxes +
            // 40px labels. Board-local → canvas: cx = 1024 + x·186,
            // cy = 2048 − y·273 (same mapping as the mounting holes above).
            // Label offsets chosen to clear existing marks: SW labels sit
            // left of the buttons (right edge), C5's above the can (bottom
            // text band), BZ1's below the disc clear of the QR block, TP
            // labels clear of U1/RN1, ANT1's box encloses the full meander
            // (it pokes 0.5u above its bounds mesh) with the label below U1's.
            ctx.font = '40px monospace';
            ctx.lineWidth = 6;
            /** @type {Array<[number, number, number, number, string, number, number]>} */
            const fillerParts = [
                // [cx, cy, boxW, boxH, label, labelX, labelY]
                [1899, 1257, 60, 60, 'SW1', 1789, 1264],
                [1899, 1803, 60, 60, 'SW2', 1789, 1810],
                [1899, 2566, 60, 60, 'SW3', 1789, 2573],
                [1787, 411, 300, 430, 'RF1', 1747, 641],
                [1508, 3821, 180, 240, 'C5', 1488, 3690],
                [121, 684, 60, 390, 'HDR1', 201, 690],
                [670, 247, 190, 270, 'L1', 780, 255],
                [121, 2375, 140, 190, 'RV1', 201, 2380],
                // BZ1 — piezo disc at (-1, -5.5); label below, clear of the
                // QR block (x ≥ 954) and the J1/DESIGNED-BY bottom band.
                [838, 3550, 120, 120, 'BZ1', 798, 3680],
                // TP1/TP2 — the tiny gold test-point pads; small boxes, labels
                // clear of U1's outline (x 784) and RN1's outline (y 2970).
                [745, 1174, 50, 50, 'TP1', 700, 1124],
                [1433, 2867, 50, 50, 'TP2', 1388, 2922],
                // ANT1 — meander antenna at (3.5, 0.5); box encloses the full
                // zigzag (cy 1639-1985), label below clear of U1's label.
                [1675, 1812, 186, 346, 'ANT1', 1615, 2035]
            ];
            fillerParts.forEach(([fx, fy, bw, bh, label, lx, ly]) => {
                ctx.strokeRect(fx - bw / 2, fy - bh / 2, bw, bh);
                ctx.fillText(label, lx, ly);
            });

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
            /** @param {number} cx @param {number} cy */
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

    // Mounting holes share boardGroup; capture a local const so TS narrowing
    // survives the closure (a module-level `let` is 'possibly undefined'
    // inside callbacks even though createBoard assigned it above).
    const board = boardGroup;
    [[4.64, 6.92], [-4.64, 6.92], [4.64, -6.92], [-4.64, -6.92]].forEach(([hx, hy]) => {
        const hole = new THREE.Mesh(holeGeo, holeMat);
        hole.position.set(hx, hy, 0);
        board.add(hole);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(hx, hy, 0);
        board.add(ring);
    });

    // 4. Bench sweep — a signal-green scan line that sweeps across the board
    // surface like a CRT trace, so the copper visibly "scans" under the probe
    // instead of the board reading as a solid stamped part. Additive + faint;
    // sits just above the silkscreen/traces (z 0.09) and below the components,
    // so it passes UNDER the chips — the correct layer for a surface sweep.
    const sweepMat = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const sweepTrailMat = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const sweepGeo = new THREE.PlaneGeometry(0.05, height - 0.6);
    const sweepTrailGeo = new THREE.PlaneGeometry(0.4, height - 0.6);
    sweepLead = new THREE.Mesh(sweepGeo, sweepMat);
    sweepLead.position.z = thickness / 2 + 0.012;
    sweepTrail = new THREE.Mesh(sweepTrailGeo, sweepTrailMat);
    sweepTrail.position.z = thickness / 2 + 0.011;
    boardGroup.add(sweepLead);
    boardGroup.add(sweepTrail);
    disposableResources.geometries.add(sweepGeo);
    disposableResources.geometries.add(sweepTrailGeo);
    disposableResources.materials.add(sweepMat);
    disposableResources.materials.add(sweepTrailMat);

    // Hover shadow — the "it's actually floating" amplifier: a soft radial
    // blob on the bench plane whose opacity tightens as the board descends
    // (closest approach = darkest) and relaxes as it rises. The directional
    // ShadowMaterial on the bench handles the crisp cast; this is the contact
    // grounding that makes the levitation legible. NOT parented to boardGroup
    // — a shadow doesn't roll with the object. The radial gradient is baked
    // once; the per-frame write is only opacity + scale.
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sctx = shadowCanvas.getContext('2d');
    if (sctx) {
        const grad = sctx.createRadialGradient(128, 128, 10, 128, 128, 128);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
        grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.35)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        sctx.fillStyle = grad;
        sctx.fillRect(0, 0, 256, 256);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.22,
        depthWrite: false
    });
    hoverShadow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), shadowMat);
    hoverShadow.name = 'hover-shadow';
    hoverShadow.rotation.x = -Math.PI / 2; // flat on the bench (bench plane at scene.js:372)
    hoverShadow.position.set(0, SHADOW_BASE_Y, 0);
    scene.add(hoverShadow);
    disposableResources.geometries.add(hoverShadow.geometry);
    disposableResources.materials.add(shadowMat);
    disposableResources.textures.add(shadowTex);

    boardGroup.scale.set(0.85, 0.85, 0.85);
    scene.add(boardGroup);
}

// ─── Hover shadow ────────────────────────────────────────────
// Bench plane lives at y = -8.6 (scene.js) with the board resting at y = 0,
// so the blob floats just above it to avoid z-fighting. Opacity maps the
// board's actual height: y ∈ [-FLOAT_AMP_Y, +FLOAT_AMP_Y], higher = farther
// from the bench = lighter. Reading boardGroup.position.y (not the raw sine)
// means the wake-in ramp, the focus damp, and any future pose change all
// compose through the real pose. Reduced motion: the board is planted, so the
// blob holds a fixed mid opacity — stay-but-still, a grounded board still
// grounds itself.
const SHADOW_BASE_Y = -8.55;
const SHADOW_MIN_OPACITY = 0.12;
const SHADOW_MAX_OPACITY = 0.34;
/** @type {THREE.Mesh | null} */
let hoverShadow = null;

/** Per-frame hover shadow — opacity tracks the float height, scale breathes
 *  with the depth motion. No elapsed needed: it reads the live board pose, so
 *  the wake-in ramp and focus damp compose through the real position. */
export function updateHoverShadow() {
    if (!hoverShadow || !boardGroup) return;
    const mat = /** @type {THREE.MeshBasicMaterial} */ (hoverShadow.material);
    if (motionPrefs.reduced) {
        mat.opacity = (SHADOW_MIN_OPACITY + SHADOW_MAX_OPACITY) / 2;
        hoverShadow.scale.setScalar(1);
        return;
    }
    // Clamp the ratio inputs: main.js scales the float amplitudes with camera
    // distance (distScale), so position/amplitude can exceed ±1 at the hero
    // framing — without the clamp the shadow would over-fade / over-breathe
    // there. Saturated is correct behavior for a far board.
    const h = THREE.MathUtils.clamp((boardGroup.position.y + FLOAT_AMP_Y) / (2 * FLOAT_AMP_Y), 0, 1); // 0..1, 1 = highest
    mat.opacity = SHADOW_MAX_OPACITY - h * (SHADOW_MAX_OPACITY - SHADOW_MIN_OPACITY);
    const breathe = THREE.MathUtils.clamp(boardGroup.position.z / FLOAT_AMP_Z, -1, 1); // -1..1
    hoverShadow.scale.set(1 + breathe * 0.06, 1 + breathe * 0.06, 1);
}

// ─── Bench sweep ─────────────────────────────────────────────
// Deterministic from elapsed: the sweep crosses the board once per period,
// with a sine envelope so it fades in/out at the edges (never pops). Hidden
// entirely for reduced-motion users — a static scan line would read as a
// glitch, unlike the radar/current-dot which stay visible-but-still.
const SWEEP_PERIOD = 6;   // seconds per crossing
const SWEEP_MIN_X = -5.2; // board is ±5.5 local; inset slightly
const SWEEP_SPAN = 10.4;
/** @type {THREE.Mesh | null} */
let sweepLead = null;
/** @type {THREE.Mesh | null} */
let sweepTrail = null;

/** @param {number} elapsed */
/** @param {number} elapsed @param {number} [distScale] */
export function updateBenchSweep(elapsed, distScale = 1) {
    if (!sweepLead || !sweepTrail) return;
    if (motionPrefs.reduced) {
        sweepLead.visible = false;
        sweepTrail.visible = false;
        return;
    }
    sweepLead.visible = true;
    sweepTrail.visible = true;
    const p = (elapsed / SWEEP_PERIOD) % 1;
    const env = Math.sin(p * Math.PI); // fade in/out at the edges
    sweepLead.position.x = SWEEP_MIN_X + SWEEP_SPAN * p;
    sweepTrail.position.x = SWEEP_MIN_X + SWEEP_SPAN * p - 0.3; // lags the lead
    // distScale widens the scan line at hero distance — a 0.05-wide plane at
    // z≈33 is a 1px hairline; scaling the MESH (not the geometry) keeps the
    // smoke test's geometry-based width classification intact.
    sweepLead.scale.x = distScale;
    sweepTrail.scale.x = distScale;
    /** @type {THREE.MeshBasicMaterial} */ (sweepLead.material).opacity = env * 0.14;
    /** @type {THREE.MeshBasicMaterial} */ (sweepTrail.material).opacity = env * 0.05;
}
// Delta-scaled lerp factor — same convention as hover.js (1 - pow(1-k, d*60))
// so the parallax response is IDENTICAL at any frame rate: at 60fps it equals
// k exactly, at 30fps it halves per frame but doubles per second of real time.
/** @param {number} k @param {number} [delta] */
function lerpFactor(k, delta) {
    return 1 - Math.pow(1 - k, (delta || 1 / 60) * 60);
}

// Levitation — the board hovers on the bench like it's alive: a slow vertical
// float, a depth breathe, and a gentle roll. Applied only once the journey is
// live (journeyLive — set after boot's arrival tween finishes; the boot tween
// owns position until then, so an early write would yank the board mid-arrival)
// and skipped for reduced-motion users (the board stays planted) — the flag
// comes from motionPrefs (../utils/motion-prefs.js), the single policy source.
// Slow periods (8–20s) so the motion reads as hover, never vibration.
const FLOAT_AMP_Y = 0.16;      // vertical rise/fall
const FLOAT_AMP_Z = 0.07;      // depth breathe toward/away from the camera
const FLOAT_AMP_ROLL = 0.012;  // gentle roll (radians)
// Wake-in: the float starts from stillness and ramps to full over 2s after
// journeyLive first flips — the boot arrival tween settles the board at y:0
// right before that, so an un-ramped first write (sin of elapsed ≈ 6.85) would
// jump up to ±0.16 at the settle, the most-watched moment of the page. The
// smoothstep envelope makes the hover emerge imperceptibly from stillness.
const FLOAT_WAKE_SECONDS = 2;
/** @type {number} */
let floatWakeStart = -1; // elapsed snapshot of the first live tick
// Focus touchdown: when a chip is focused the probe is "on" the board — the
// hover damps toward 20% so the focused composition steadies under the fixed
// camera stop (focusProject glides to a captured position; the board must not
// drift out of that frame while the datasheet is read). Release resumes it.
// Lerped delta-scaled (lerpFactor) so the damp is identical at any frame rate.
/** @type {number} */
let focusDamp = 1;

/** @param {number} elapsed @param {THREE.Vector2} mouse @param {number} [delta] @param {string} [activeSecId] @param {boolean} [journeyLive] @param {boolean} [focusMode] @param {number} [distScale] */
export function updateBoardParallax(elapsed, mouse, delta, activeSecId, journeyLive, focusMode, distScale = 1) {
    if (!boardGroup) return;

    // Check if we're in journey mode (camera controlled by scroll)
    const isJourneyMode = document.body.classList.contains('full-journey');

    if (!isJourneyMode) {
        // Legacy: full board tilt + bob
        const targetRotX = -Math.PI / 10 - mouse.y * 0.08;
        const targetRotY = -Math.PI / 20 + mouse.x * 0.08;

        const bob = Math.sin(elapsed * 1.5) * 0.08;
        boardGroup.position.z = bob;

        boardGroup.rotation.x += (targetRotX - boardGroup.rotation.x) * lerpFactor(0.08, delta);
        boardGroup.rotation.y += (targetRotY - boardGroup.rotation.y) * lerpFactor(0.08, delta);
    } else {
        // Journey mode: the camera owns the view; the board gets only a subtle
        // parallax tilt toward the cursor, CAPPED so it never fights the scroll
        // camera. On About the tilt is boosted — still a small range (±1.7°)
        // — so the "move cursor to tilt board" affordance is actually felt.
        const boosted = activeSecId === 'sec-about';
        // About boost: ±1.7° (maxTilt 0.03) spread across the WHOLE canvas.
        // The scale sets the saturation point: 0.03 / 0.034 ≈ 0.88 — the tilt
        // responds proportionally from the canvas center out to ~88% and only
        // then pins at max, so the "move cursor to tilt board" affordance is
        // felt across the full left region. (mouse is canvas-relative since the
        // raycast-space fix; the old 0.05 saturated at |mouse| = 0.6, leaving
        // the outer ~40% of the canvas a dead zone pinned at max tilt.)
        const tiltScale = boosted ? 0.034 : 0.003;
        const maxTilt = boosted ? 0.03 : 0.004;
        const targetRotX = THREE.MathUtils.clamp(-mouse.y * tiltScale, -maxTilt, maxTilt);
        const targetRotY = THREE.MathUtils.clamp(mouse.x * tiltScale, -maxTilt, maxTilt);
        const k = boosted ? 0.05 : 0.035;
        boardGroup.rotation.x += (targetRotX - boardGroup.rotation.x) * lerpFactor(k, delta);
        boardGroup.rotation.y += (targetRotY - boardGroup.rotation.y) * lerpFactor(k, delta);

        // Levitation: the board hangs in the air, drifting slowly. The parallax
        // tilt (rotation.x/y) composes with the roll (rotation.z) — different
        // axes, so the hover and the cursor response never fight. Everything
        // parented to the group (traces, sweep, surge light) rides along, so
        // the whole board lives as one object. The wake-in envelope (011) and
        // the focus damp (012) compose on the amplitude; the sine phases stay
        // untouched.
        if (journeyLive && !motionPrefs.reduced) {
            if (floatWakeStart < 0) floatWakeStart = elapsed;
            const wakeT = Math.min(1, Math.max(0, (elapsed - floatWakeStart) / FLOAT_WAKE_SECONDS));
            const wake = wakeT * wakeT * (3 - 2 * wakeT); // smoothstep
            const focusTarget = focusMode ? 0.2 : 1;
            focusDamp += (focusTarget - focusDamp) * lerpFactor(0.06, delta);
            // distScale: the hero/contact cameras sit far back (z≈33) where a
            // world-unit of motion projects to a few pixels — the float would
            // read as static on the first screen. Scale the amplitudes up with
            // camera distance (main.js passes it) so the hover stays visible at
            // every framing; close stops already project large, so they're
            // clamped to ~1 and never amplified.
            boardGroup.position.y = Math.sin(elapsed * 0.55) * FLOAT_AMP_Y * wake * focusDamp * distScale;
            boardGroup.position.z = Math.cos(elapsed * 0.37) * FLOAT_AMP_Z * wake * focusDamp * distScale;
            boardGroup.rotation.z = Math.sin(elapsed * 0.31) * FLOAT_AMP_ROLL * wake * focusDamp * distScale;
        }
    }
}