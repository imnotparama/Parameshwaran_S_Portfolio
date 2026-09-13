// @ts-check
import * as THREE from 'three';
import gsap from 'gsap';
import { disposableResources } from './scene.js';
import { beepBuzzer } from '../utils/buzzer.js';
import { motionPrefs } from '../utils/motion-prefs.js';
import { getSectionAmbient } from './ambient-tunings.js';
import { registerTeardownObject, LAYER_OFFSETS } from './teardown.js';
import { registerRvScrew } from './potentiometer.js';
import { switchClack } from '../utils/sound.js';

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

/**
 * @typedef {{
 *   group: THREE.Group,
 *   body: THREE.Mesh,
 *   coreMesh: THREE.Mesh,
 *   coreMat: THREE.MeshStandardMaterial,
 *   ringMesh: THREE.Mesh,
 *   ringMat: THREE.MeshBasicMaterial,
 *   vuLeds: THREE.Mesh[],
 *   baseColor: number,
 *   baseEmissive: number,
 *   boost: number,
 *   pos: THREE.Vector3
 * }} CapacitorBankItem
 */

/** @type {Record<string, CapacitorBankItem>} */
export const capacitorBanks = {};

/** @type {THREE.Line | null} */
let plasmaArcLine = null;
/** @type {THREE.LineBasicMaterial | null} */
let plasmaArcMat = null;
let plasmaArcTimer = 0;
const plasmaArcSourcePos = new THREE.Vector3();
const plasmaArcTargetPos = new THREE.Vector3();

/** @type {{ mesh: THREE.Mesh, capIndex: number, speed: number, seed: number }[]} */
const sparkMotes = [];
/** @type {THREE.Mesh | null} */
let voltmeterNeedle = null;
/** @type {THREE.Mesh | null} */
export let rfCoil1 = null;
/** @type {THREE.Mesh | null} */
export let rfCoil2 = null;
/** @type {THREE.Mesh | null} */
export let u3FlashChip = null;
/** @type {THREE.Mesh | null} */
export let u3LaserBeam = null;
/** @type {THREE.Mesh | null} */
export let u3ActivityLed = null;

/**
 * Trigger animated firmware burning sequence on U3 SPI Flash ROM.
 * @param {string} [_version]
 */
export function triggerFirmwareFlashAnim(_version = '2.3') {
    if (u3LaserBeam && u3LaserBeam.material) {
        const mat = /** @type {THREE.MeshBasicMaterial} */ (u3LaserBeam.material);
        u3LaserBeam.visible = true;
        gsap.killTweensOf(mat);
        gsap.killTweensOf(u3LaserBeam.scale);
        gsap.set(mat, { opacity: 0.95 });
        gsap.set(u3LaserBeam.scale, { x: 1.2, y: 1.2, z: 1.0 });
        gsap.to(mat, {
            opacity: 0,
            duration: 0.65,
            ease: 'power2.out',
            onComplete: () => {
                if (u3LaserBeam) u3LaserBeam.visible = false;
            }
        });
        gsap.to(u3LaserBeam.scale, {
            x: 0.8, y: 0.8, z: 1.4,
            duration: 0.65,
            ease: 'power2.out'
        });
    }

    if (u3ActivityLed && u3ActivityLed.material) {
        const mat = /** @type {THREE.MeshStandardMaterial} */ (u3ActivityLed.material);
        gsap.killTweensOf(mat);
        gsap.to(mat, {
            emissiveIntensity: 3.5,
            duration: 0.08,
            repeat: 7,
            yoyo: true,
            ease: 'steps(1)',
            onComplete: () => {
                mat.emissiveIntensity = 0.2;
            }
        });
    }

    if (u3FlashChip && u3FlashChip.scale) {
        gsap.killTweensOf(u3FlashChip.scale);
        gsap.fromTo(u3FlashChip.scale, { x: 1, y: 1, z: 1 }, {
            x: 1.1, y: 1.1, z: 1.1,
            duration: 0.15,
            repeat: 1,
            yoyo: true,
            ease: 'power2.out'
        });
    }

    // Piezo buzzer acoustic chime confirmation
    pulseBuzzer();
}

/**
 * Trigger full capacitor bank overdrive mode: all banks flash and surge in sequence.
 */
export function triggerCapacitorOverdrive() {
    Object.keys(capacitorBanks).forEach((k, i) => {
        setTimeout(() => {
            energizeCapacitor(k, 3.2);
        }, i * 70);
    });
}

/**
 * Energize a specific capacitor bank (e.g. 'C1', 'C2', 'C3', 'C4').
 * Fired when hovering skill cards in the UI or on section arrival.
 * @param {string} bankId
 * @param {number} [boost]
 */
export function energizeCapacitor(bankId, boost = 1.8) {
    const bank = capacitorBanks[bankId];
    if (!bank) return;
    bank.boost = Math.max(bank.boost, boost);

    // Dynamic lightning arc between active capacitor and motherboard power bus
    if (plasmaArcLine && plasmaArcMat) {
        plasmaArcSourcePos.copy(bank.pos).setZ(0.4);
        plasmaArcTargetPos.set(1.2, 3.6, 0.15);
        plasmaArcTimer = 0.45;
        plasmaArcMat.color.setHex(bank.baseColor);
        plasmaArcLine.visible = true;
    }
}

/**
 * Per-frame animation for high-tech capacitor banks (holographic rings, plasma cores, VU LEDs, sparks, dial gauge).
 * @param {number} elapsed
 * @param {number} delta
 */
export function updateCapacitorBanks(elapsed, delta) {
    const isReduced = motionPrefs.reduced;
    let maxBoost = 1.0;

    Object.keys(capacitorBanks).forEach((key, idx) => {
        const b = capacitorBanks[key];
        if (!b) return;

        // Decay boost back to rest
        if (b.boost > 1.0) {
            b.boost = Math.max(1.0, b.boost - delta * 1.8);
        }
        if (b.boost > maxBoost) maxBoost = b.boost;

        // Holographic ring rotation & levitation
        if (!isReduced && b.ringMesh) {
            b.ringMesh.rotation.z += delta * (0.9 + idx * 0.2);
            b.ringMesh.rotation.x = Math.sin(elapsed * 1.6 + idx) * 0.15;
            b.ringMesh.position.z = 0.88 + Math.sin(elapsed * 2.4 + idx * 1.2) * 0.035;
        }

        // Core breathing emission
        const pulse = isReduced ? 1.0 : (0.85 + Math.sin(elapsed * 3.2 + idx * 1.5) * 0.25);
        b.coreMat.emissiveIntensity = b.baseEmissive * pulse * b.boost;

        // Micro VU meter LEDs
        b.vuLeds.forEach((led, lIdx) => {
            const ledMat = /** @type {THREE.MeshStandardMaterial} */ (led.material);
            if (ledMat) {
                const threshold = (lIdx + 1) * 0.33;
                const active = (b.boost - 1.0) * 1.5 + 0.35 > threshold;
                ledMat.emissiveIntensity = active ? 1.5 : 0.12;
            }
        });
    });

    // 1. Counter-rotate the dual inductors in Crystalline Substation
    if (!isReduced && rfCoil1 && rfCoil2) {
        rfCoil1.rotation.z += delta * 1.6;
        rfCoil2.rotation.z -= delta * 1.6;
    }

    // 2. Animate floating golden electron sparks above capacitors
    if (!isReduced && sparkMotes.length > 0) {
        const capXs = [2.3, 2.9, 3.5, 4.1];
        sparkMotes.forEach((sp) => {
            sp.mesh.position.z += delta * sp.speed;
            sp.mesh.position.x += Math.sin(elapsed * 2.5 + sp.seed) * 0.003;
            sp.mesh.position.y += Math.cos(elapsed * 2.0 + sp.seed) * 0.003;

            // Fade opacity with height
            const mat = /** @type {THREE.MeshBasicMaterial} */ (sp.mesh.material);
            if (mat) {
                const frac = (sp.mesh.position.z - 0.4) / 1.0;
                mat.opacity = Math.max(0, 0.9 * (1.0 - frac));
            }

            // Recycle spark once it floats high enough
            if (sp.mesh.position.z > 1.4) {
                sp.mesh.position.z = 0.4 + Math.random() * 0.1;
                sp.capIndex = Math.floor(Math.random() * 4);
                sp.mesh.position.x = capXs[sp.capIndex] + (Math.random() - 0.5) * 0.16;
                sp.mesh.position.y = 4.5 + (Math.random() - 0.5) * 0.16;
            }
        });
    }

    // 3. Voltmeter needle rotation tracking system charge
    if (voltmeterNeedle) {
        const targetAngle = -0.55 + (maxBoost - 1.0) * 0.85 + Math.sin(elapsed * 2.2) * 0.04;
        voltmeterNeedle.rotation.z = THREE.MathUtils.lerp(voltmeterNeedle.rotation.z, targetAngle, delta * 7);
    }

    // 4. Animate plasma lightning arc
    if (plasmaArcLine && plasmaArcMat) {
        if (plasmaArcTimer > 0) {
            plasmaArcTimer -= delta;
            plasmaArcMat.opacity = Math.min(1.0, plasmaArcTimer / 0.15);

            const geo = /** @type {THREE.BufferGeometry} */ (plasmaArcLine.geometry);
            const posAttr = geo.getAttribute('position');
            const pts = 12;
            for (let i = 0; i < pts; i++) {
                const frac = i / (pts - 1);
                const px = THREE.MathUtils.lerp(plasmaArcSourcePos.x, plasmaArcTargetPos.x, frac);
                const py = THREE.MathUtils.lerp(plasmaArcSourcePos.y, plasmaArcTargetPos.y, frac);
                const pz = THREE.MathUtils.lerp(plasmaArcSourcePos.z, plasmaArcTargetPos.z, frac);

                const jitter = (i > 0 && i < pts - 1) ? (Math.random() - 0.5) * 0.18 : 0;
                const jitterZ = (i > 0 && i < pts - 1) ? (Math.random() - 0.5) * 0.12 : 0;
                posAttr.setXYZ(i, px + jitter, py + jitter, pz + jitterZ);
            }
            posAttr.needsUpdate = true;
        } else {
            plasmaArcLine.visible = false;
        }
    }
}

// ─── CPU radar sweep — the ring is an open arc that rotates like a
// radar line, with a gentle opacity pulse. Driven per-frame from
// elapsed time (procedural, deterministic).

// Decorative motion — respect prefers-reduced-motion: keep the arc static
// (motionPrefs from ../utils/motion-prefs.js — the single policy source).

/** @param {number} elapsed
 *  @param {{ celebrateFrac: number, dipFrac: number } | null} [fx] board FX
 *  from the LCD game (getBoardFx) — the death power-dip stutters the sweep */
export function updateRadarRing(elapsed, fx = null) {
    if (!cpuRadarRing) return;
    if (motionPrefs.reduced) return; // static arc for reduced-motion users
    const dip = fx && fx.dipFrac > 0 ? fx.dipFrac : 0;
    if (dip > 0) {
        // Power dip after a SIGNAL RUNNER death: the sweep stutters — the arc
        // jitters instead of rotating smoothly and fades toward the dim.
        cpuRadarRing.rotation.z = elapsed * 0.8 + Math.sin(elapsed * 40) * 0.3 * dip;
        const mat = cpuRadarRing.material;
        if (mat instanceof THREE.MeshBasicMaterial) {
            mat.opacity = 0.45 - 0.35 * dip;
        }
        return;
    }
    cpuRadarRing.rotation.z = elapsed * 0.8; // full revolution ≈ 7.8s
    // The ring is created with MeshBasicMaterial above — keep in sync if that
    // ever changes (instanceof narrows Material | Material[]; the old property
    // check couldn't).
    const mat = cpuRadarRing.material;
    if (mat instanceof THREE.MeshBasicMaterial) {
        mat.opacity = 0.45 + Math.sin(elapsed * 2.2) * 0.15;
    }

    // Subtle thermal breathing pulse on U1 silicon die
    if (siliconDieMesh && siliconDieMesh.material instanceof THREE.MeshBasicMaterial) {
        siliconDieMesh.material.opacity = 0.65 + Math.sin(elapsed * 2.8) * 0.12;
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

/** Per-frame LED array pulse. The active section's ambient signature tunes
 *  the tempo (ledFreq) and brightness (ledAmp) — the CPU core breathes fast
 *  and bright, the RF section stays calm and steady. Section id is optional:
 *  an unknown id falls back to the baseline tuning (original behavior).
 *  Board FX from the LCD game (getBoardFx) override the ambient pulse: a
 *  NEW RECORD celebration chases a bright front twice across the array, and
 *  a death power-dip dims the whole array toward near-blackout before it
 *  fades back. Reduced motion ignores the FX entirely (calm base only).
 *  @param {number} elapsed
 *  @param {string} [sectionId]
 *  @param {{ celebrateFrac: number, dipFrac: number } | null} [fx]
 *  @param {number} [selfTest] idle self-test fraction 0..1 (0 = not running)
 *  @param {number} [heartbeat] idle heartbeat flash fraction 0..1 (0 = off)
 *  @param {number} [audioPeak] audio visualizer peak 0..1 (0 = none) */
export function updateLedArray(elapsed, sectionId, fx = null, selfTest = 0, heartbeat = 0, audioPeak = 0) {
    const t = getSectionAmbient(sectionId);
    const celebrate = fx && fx.celebrateFrac > 0 ? fx.celebrateFrac : 0;
    const dip = fx && fx.dipFrac > 0 ? fx.dipFrac : 0;
    const n = ledPulseDrivers.length || 1;
    for (let i = 0; i < ledPulseDrivers.length; i++) {
        const d = ledPulseDrivers[i];
        if (motionPrefs.reduced) {
            d.mat.emissiveIntensity = LED_PULSE_BASE;
            continue;
        }
        if (celebrate > 0) {
            // The celebration sweeps the array twice (front travels 0→2n);
            // the front LED is brightest, the one behind half-lit, the rest
            // calm — a comet-tail chase. Peak 1.9 matches the arrival flash.
            const front = ((1 - celebrate) * 2 * n) % n;
            const pos = (front - i + n * 2) % n;
            const tail = Math.max(0, 1 - pos * 0.5);
            d.mat.emissiveIntensity = LED_PULSE_BASE + tail * 1.8;
            continue;
        }
        if (selfTest > 0) {
            // Idle self-test POST walk: diodes 0..front light UP one by one
            // and HOLD — a shift-register progress check, deliberately
            // distinct from the transient celebrate comet-tail. The front
            // advances with the run's fraction; when the run ends selfTest
            // drops to 0 and the array returns to the ambient pulse.
            const front = Math.min(n - 1, Math.floor(selfTest * n));
            d.mat.emissiveIntensity = i <= front ? LED_PULSE_BASE + 1.8 : LED_PULSE_BASE;
            continue;
        }
        if (heartbeat > 0) {
            // Idle heartbeat: ALL diodes flash bright simultaneously — a
            // brief "I'm still monitoring" pulse, deliberately distinct from
            // the self-test's sequential walk and the celebrate's chase.
            d.mat.emissiveIntensity = LED_PULSE_BASE + heartbeat * 1.4;
            continue;
        }
        if (audioPeak > 0) {
            // Audio-reactive VU meter: diodes light up sequentially with audio energy
            const vuFront = Math.floor(audioPeak * n);
            if (i <= vuFront) {
                d.mat.emissiveIntensity = LED_PULSE_BASE + 1.2 * (1.0 - (vuFront - i) * 0.15);
                continue;
            }
        }
        // Sharpened sine (n²·²): a slow rise with a brief bright peak reads as
        // a status pulse, not a sinusoid. Per-LED freq/phase desync the array;
        // the section's ledFreq/ledAmp multipliers shift the whole array's feel.
        const m = 0.5 + 0.5 * Math.sin(elapsed * d.freq * t.ledFreq * Math.PI * 2 + d.phase);
        const dim = dip > 0 ? Math.max(0.03, 1 - dip) : 1;
        d.mat.emissiveIntensity = (LED_PULSE_BASE + Math.pow(m, 2.2) * (LED_PULSE_AMP * t.ledAmp)) * dim;
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

    // Pin 1 index dot on U1 package top
    const u1DotGeo = new THREE.CircleGeometry(0.06, 16);
    const u1DotMat = new THREE.MeshBasicMaterial({ color: 0xd4af37 });
    disposableResources.geometries.add(u1DotGeo);
    disposableResources.materials.add(u1DotMat);
    const u1Dot = new THREE.Mesh(u1DotGeo, u1DotMat);
    u1Dot.position.set(-0.95, 0.95, 0.113);
    cpuGroup.add(u1Dot);

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

    // Package marking on U2's top — an etched identity (pin-1 dot, U2 ref,
    // faint die grid, gold inner seam) so the dark package reads as a real IC
    // at the Projects stop instead of a flat black slab (same "broken mesh"
    // illusion as J1's body — a flat box at close range, not a missing
    // texture). Same pattern as U1's silicon die: a thin textured plane
    // slightly proud of the body top (body top face is at surfaceZ+0.09).
    const gpuMarkCanvas = document.createElement('canvas');
    gpuMarkCanvas.width = 256;
    gpuMarkCanvas.height = 256;
    const gctx = /** @type {CanvasRenderingContext2D | null} */ (gpuMarkCanvas.getContext('2d'));
    if (gctx) {
        gctx.fillStyle = '#1b1c20';
        gctx.fillRect(0, 0, 256, 256);
        // Faint die grid under the markings
        gctx.strokeStyle = 'rgba(62, 230, 160, 0.08)';
        gctx.lineWidth = 1;
        for (let gi = 0; gi <= 8; gi++) {
            const gp = gi * 32;
            gctx.beginPath(); gctx.moveTo(gp, 0); gctx.lineTo(gp, 256); gctx.stroke();
            gctx.beginPath(); gctx.moveTo(0, gp); gctx.lineTo(256, gp); gctx.stroke();
        }
        // Pin-1 dot (top-left, silkscreen white)
        gctx.fillStyle = '#ece7d8';
        gctx.beginPath(); gctx.arc(30, 30, 8, 0, Math.PI * 2); gctx.fill();
        // U2 ref centered
        gctx.font = 'bold 46px monospace';
        gctx.textAlign = 'center';
        gctx.textBaseline = 'middle';
        gctx.fillStyle = 'rgba(236, 231, 216, 0.85)';
        gctx.fillText('U2', 128, 118);
        // Lot line under the ref
        gctx.font = '17px monospace';
        gctx.fillStyle = 'rgba(157, 180, 163, 0.7)';
        gctx.fillText('PARAMA-GPU-2026', 128, 168);
        // Gold inner seam (the package lid line)
        gctx.strokeStyle = 'rgba(201, 162, 75, 0.55)';
        gctx.lineWidth = 3;
        gctx.strokeRect(12, 12, 232, 232);
    }
    const gpuMarkTexture = new THREE.CanvasTexture(gpuMarkCanvas);
    gpuMarkTexture.colorSpace = THREE.SRGBColorSpace;
    disposableResources.textures.add(gpuMarkTexture);
    const gpuMarkGeo = new THREE.PlaneGeometry(1.62, 1.62);
    disposableResources.geometries.add(gpuMarkGeo);
    const gpuMarkMat = new THREE.MeshStandardMaterial({ map: gpuMarkTexture, roughness: 0.55, metalness: 0.35 });
    const gpuMarkMesh = new THREE.Mesh(gpuMarkGeo, gpuMarkMat);
    gpuMarkMesh.position.set(-3.2, 4.5, surfaceZ + 0.093);
    boardGroup.add(gpuMarkMesh);

    // -------------------------------------------------------------
    // COMPONENT 3 — High-Tech Neon Energy Capacitors (C1-C4) - Skills
    // -------------------------------------------------------------
    // Solder collar base
    const capBaseGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.04, 20);
    capBaseGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(capBaseGeo);

    // Slotted outer titanium body sleeve
    const capOuterGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.72, 24);
    capOuterGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(capOuterGeo);

    // Glowing plasma core
    const capCoreGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.66, 18);
    capCoreGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(capCoreGeo);

    // Anode top crown terminal
    const capTopCrownGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.045, 20);
    capTopCrownGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(capTopCrownGeo);

    // Floating holographic category ring
    const capRingGeo = new THREE.TorusGeometry(0.22, 0.012, 8, 28);
    disposableResources.geometries.add(capRingGeo);

    // Micro VU meter LED indicator
    const vuLedGeo = new THREE.BoxGeometry(0.035, 0.035, 0.02);
    disposableResources.geometries.add(vuLedGeo);

    const capOuterMat = new THREE.MeshStandardMaterial({
        color: 0x090d16,
        roughness: 0.35,
        metalness: 0.85
    });
    disposableResources.materials.add(capOuterMat);

    const capCrownMat = new THREE.MeshStandardMaterial({
        color: 0xe5e7eb,
        roughness: 0.2,
        metalness: 0.95
    });
    disposableResources.materials.add(capCrownMat);

    // 4 Bank Domain Configurations
    const CAP_CONFIGS = [
        { code: 'C1', label: 'AI & Computer Vision', color: 0xf59e0b, emissive: 0xd97706, x: 2.3 },
        { code: 'C2', label: 'Distributed Backend', color: 0x06b6d4, emissive: 0x0891b2, x: 2.9 },
        { code: 'C3', label: 'Interactive WebGL', color: 0x10b981, emissive: 0x059669, x: 3.5 },
        { code: 'C4', label: 'Embedded Systems', color: 0x8b5cf6, emissive: 0x7c3aed, x: 4.1 }
    ];

    // Reset capacitorBanks map
    for (const k in capacitorBanks) delete capacitorBanks[k];

    CAP_CONFIGS.forEach((cfg) => {
        const capGroup = new THREE.Group();
        capGroup.position.set(cfg.x, 4.5, surfaceZ);
        boardGroup.add(capGroup);

        // 1. Gold mounting solder base ring
        const base = new THREE.Mesh(capBaseGeo, goldMaterial);
        base.position.z = 0.02;
        capGroup.add(base);

        // 2. Pulsating plasma core (color-coded to skill category)
        const coreMat = new THREE.MeshStandardMaterial({
            color: cfg.color,
            emissive: cfg.emissive,
            emissiveIntensity: 0.85,
            roughness: 0.2,
            metalness: 0.1
        });
        disposableResources.materials.add(coreMat);
        const coreMesh = new THREE.Mesh(capCoreGeo, coreMat);
        coreMesh.position.z = 0.36;
        capGroup.add(coreMesh);

        // 3. Dark titanium protective sleeve (hit target)
        const body = new THREE.Mesh(capOuterGeo, capOuterMat);
        body.castShadow = true;
        body.position.z = 0.36;
        body.name = cfg.code;
        body.userData = {
            componentName: `Capacitor Bank ${cfg.code} (${cfg.label})`,
            type: 'CAP',
            bank: cfg.code
        };
        capGroup.add(body);
        interactiveObjects.push(body);

        // 4. Polished anode crown terminal
        const crown = new THREE.Mesh(capTopCrownGeo, capCrownMat);
        crown.position.z = 0.72;
        capGroup.add(crown);

        // 5. Floating holographic category ring
        const ringMat = new THREE.MeshBasicMaterial({
            color: cfg.color,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending
        });
        disposableResources.materials.add(ringMat);
        const ringMesh = new THREE.Mesh(capRingGeo, ringMat);
        ringMesh.position.z = 0.88;
        capGroup.add(ringMesh);

        // 6. Micro VU meter LEDs (Low, Med, High charge indicator beads)
        const vuLeds = [];
        for (let l = 0; l < 3; l++) {
            const vuMat = new THREE.MeshStandardMaterial({
                color: cfg.color,
                emissive: cfg.emissive,
                emissiveIntensity: 0.2,
                roughness: 0.3
            });
            disposableResources.materials.add(vuMat);
            const vu = new THREE.Mesh(vuLedGeo, vuMat);
            vu.position.set(0.24, -0.22 + l * 0.15, 0.15);
            capGroup.add(vu);
            vuLeds.push(vu);
        }

        capacitorBanks[cfg.code] = {
            group: capGroup,
            body,
            coreMesh,
            coreMat,
            ringMesh,
            ringMat,
            vuLeds,
            baseColor: cfg.color,
            baseEmissive: 0.85,
            boost: 1.0,
            pos: new THREE.Vector3(cfg.x, 4.5, surfaceZ)
        };
    });

    // Horizontal polished copper busbar linking all 4 capacitor banks at the base
    const busbarGeo = new THREE.BoxGeometry(2.2, 0.05, 0.018);
    disposableResources.geometries.add(busbarGeo);
    const busbarMesh = new THREE.Mesh(busbarGeo, goldMaterial);
    busbarMesh.position.set(3.2, 4.15, surfaceZ + 0.01);
    boardGroup.add(busbarMesh);

    // Procedural Lightning Plasma Arc mesh
    const arcPts = [];
    for (let p = 0; p < 12; p++) arcPts.push(new THREE.Vector3());
    const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPts);
    disposableResources.geometries.add(arcGeo);
    plasmaArcMat = new THREE.LineBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        linewidth: 2
    });
    disposableResources.materials.add(plasmaArcMat);
    plasmaArcLine = new THREE.Line(arcGeo, plasmaArcMat);
    plasmaArcLine.visible = false;
    boardGroup.add(plasmaArcLine);

    // 1. Floating golden/cyan electron spark motes above capacitor bank
    const sparkGeo = new THREE.OctahedronGeometry(0.025, 0);
    disposableResources.geometries.add(sparkGeo);
    const sparkMat = new THREE.MeshBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    disposableResources.materials.add(sparkMat);
    sparkMotes.length = 0;
    const capXs = [2.3, 2.9, 3.5, 4.1];
    for (let s = 0; s < 12; s++) {
        const sMesh = new THREE.Mesh(sparkGeo, sparkMat);
        const capIdx = s % 4;
        const startX = capXs[capIdx];
        sMesh.position.set(
            startX + (Math.random() - 0.5) * 0.18,
            4.5 + (Math.random() - 0.5) * 0.18,
            0.4 + Math.random() * 0.9
        );
        boardGroup.add(sMesh);
        sparkMotes.push({
            mesh: sMesh,
            capIndex: capIdx,
            speed: 0.35 + Math.random() * 0.4,
            seed: s * 1.7
        });
    }

    // 2. Analog Precision Galvanometer / Voltmeter Gauge at x: 1.65, y: 4.5
    const gaugeGroup = new THREE.Group();
    gaugeGroup.position.set(1.65, 4.5, surfaceZ);
    boardGroup.add(gaugeGroup);

    const gaugeRimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.04, 24);
    gaugeRimGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(gaugeRimGeo);
    const gaugeFaceGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.045, 24);
    gaugeFaceGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(gaugeFaceGeo);

    const gaugeRim = new THREE.Mesh(gaugeRimGeo, goldMaterial);
    gaugeRim.position.z = 0.02;
    gaugeGroup.add(gaugeRim);

    const gaugeFaceMat = new THREE.MeshStandardMaterial({
        color: 0x090d16,
        roughness: 0.75,
        metalness: 0.25
    });
    disposableResources.materials.add(gaugeFaceMat);
    const gaugeFace = new THREE.Mesh(gaugeFaceGeo, gaugeFaceMat);
    gaugeFace.position.z = 0.025;
    gaugeGroup.add(gaugeFace);

    // Voltmeter needle
    const needleGeo = new THREE.BoxGeometry(0.012, 0.16, 0.008);
    disposableResources.geometries.add(needleGeo);
    voltmeterNeedle = new THREE.Mesh(needleGeo, goldMaterial);
    voltmeterNeedle.position.set(0, 0.06, 0.05);
    voltmeterNeedle.rotation.z = -0.45;
    gaugeGroup.add(voltmeterNeedle);

    // 3. Substrate Translucent Ground Glow Patch beneath C1-C4
    const substrateGlowGeo = new THREE.PlaneGeometry(2.6, 1.2);
    disposableResources.geometries.add(substrateGlowGeo);
    const substrateGlowMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending
    });
    disposableResources.materials.add(substrateGlowMat);
    const substrateGlow = new THREE.Mesh(substrateGlowGeo, substrateGlowMat);
    substrateGlow.position.set(3.2, 4.5, surfaceZ + 0.002);
    boardGroup.add(substrateGlow);

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
    // The body alone is a featureless silver box — at a close camera stop
    // it reads as a flat gray slab (the recurring "broken mesh" complaint
    // was this framing, not a missing texture). Detail it like a real
    // connector: a dark recessed port opening on the front face with gold
    // contact blades inside, and two metal mounting ears with holes — so
    // it reads as a USB-A jack at ANY zoom, not just at the wide stops.
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

    // Front-face port opening (the dark slot) + gold contact blades inside.
    // The body is 0.32 deep centered at surfaceZ+0.06, so the front face sits
    // at surfaceZ+0.22; the slot and blades sit just proud of it.
    const portMat = new THREE.MeshStandardMaterial({ color: 0x0b0e12, roughness: 0.85, metalness: 0.1 });
    const portGeo = new THREE.BoxGeometry(0.56, 0.18, 0.02);
    disposableResources.geometries.add(portGeo);
    const port = new THREE.Mesh(portGeo, portMat);
    port.position.set(0, -7.3, surfaceZ + 0.23);
    boardGroup.add(port);

    const bladeGeo = new THREE.BoxGeometry(0.05, 0.1, 0.012);
    disposableResources.geometries.add(bladeGeo);
    for (let bi = 0; bi < 4; bi++) {
        const blade = new THREE.Mesh(bladeGeo, goldMaterial.clone());
        blade.position.set(-0.15 + bi * 0.1, -7.3, surfaceZ + 0.242);
        boardGroup.add(blade);
    }

    // Metal mounting ears wrapping the body sides, each with a dark hole on
    // top (the screw boss) — the classic USB-A silhouette.
    const earGeo = new THREE.BoxGeometry(0.16, 0.18, 0.3);
    disposableResources.geometries.add(earGeo);
    const holeGeo = new THREE.BoxGeometry(0.06, 0.08, 0.015);
    disposableResources.geometries.add(holeGeo);
    for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(earGeo, metalMaterial.clone());
        ear.position.set(side * 0.68, -7.3, surfaceZ + 0.04);
        boardGroup.add(ear);
        const hole = new THREE.Mesh(holeGeo, portMat);
        hole.position.set(side * 0.68, -7.3, surfaceZ + 0.195);
        boardGroup.add(hole);
    }

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
    // COMPONENT 9B — SPI NOR Flash Memory Chip (U3) - Firmware Storage
    // Winbond W25Q128 / 128Mb high-speed serial flash.
    // 8-pin SOIC package with gull-wing leads, pin 1 dot, and laser write-head.
    // -------------------------------------------------------------
    const u3Group = new THREE.Group();
    u3Group.position.set(0.9, -4.6, surfaceZ);
    boardGroup.add(u3Group);

    const u3BodyGeo = new THREE.BoxGeometry(0.72, 0.52, 0.14);
    disposableResources.geometries.add(u3BodyGeo);
    const u3Mat = chipMaterial.clone();
    u3Mat.color.setHex(0x111317);
    disposableResources.materials.add(u3Mat);
    const u3Mesh = new THREE.Mesh(u3BodyGeo, u3Mat);
    u3Mesh.position.z = 0.07;
    u3Mesh.castShadow = true;
    u3Mesh.name = 'U3';
    u3Mesh.userData = {
        componentName: 'SPI Flash ROM U3 (W25Q128 128Mb Firmware)',
        type: 'FLASH_ROM'
    };
    u3Group.add(u3Mesh);
    interactiveObjects.push(u3Mesh);
    u3FlashChip = u3Mesh;

    // Pin 1 orientation index dot
    const pin1Geo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12);
    pin1Geo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(pin1Geo);
    const pin1Mesh = new THREE.Mesh(pin1Geo, new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.8 }));
    pin1Mesh.position.set(-0.24, 0.16, 0.142);
    u3Group.add(pin1Mesh);

    // 8 Gull-wing solder pins (4 top, 4 bottom)
    const pinGeo = new THREE.BoxGeometry(0.07, 0.16, 0.02);
    disposableResources.geometries.add(pinGeo);
    const pinMat = metalMaterial.clone();
    disposableResources.materials.add(pinMat);
    for (let i = 0; i < 4; i++) {
        const px = -0.225 + i * 0.15;
        // Top pins
        const pTop = new THREE.Mesh(pinGeo, pinMat);
        pTop.position.set(px, 0.31, 0.02);
        u3Group.add(pTop);
        // Bottom pins
        const pBot = new THREE.Mesh(pinGeo, pinMat);
        pBot.position.set(px, -0.31, 0.02);
        u3Group.add(pBot);
    }

    // Holographic firmware write-beam / optic cone above U3
    const laserConeGeo = new THREE.CylinderGeometry(0.03, 0.18, 0.65, 16);
    laserConeGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(laserConeGeo);
    const laserConeMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    disposableResources.materials.add(laserConeMat);
    const laserBeam = new THREE.Mesh(laserConeGeo, laserConeMat);
    laserBeam.position.set(0, 0, 0.42);
    laserBeam.visible = false;
    u3Group.add(laserBeam);
    u3LaserBeam = laserBeam;

    // SPI Activity Micro-LED (D8 FL_ACT)
    const d8Geo = new THREE.BoxGeometry(0.06, 0.04, 0.03);
    disposableResources.geometries.add(d8Geo);
    const d8Mat = new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.2,
        roughness: 0.3
    });
    disposableResources.materials.add(d8Mat);
    const d8Mesh = new THREE.Mesh(d8Geo, d8Mat);
    d8Mesh.position.set(0.55, 0.0, 0.015);
    u3Group.add(d8Mesh);
    u3ActivityLed = d8Mesh;

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

    // Tactile push buttons — a row of three 6x6mm SMT buttons along the right edge.
    // The CAP is the interactive part (it's what you'd press).
    const btnBaseMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.75, metalness: 0.15 });
    const btnBracketMat = new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.28, metalness: 0.9 });
    const btnCapMats = [
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.15 }), // SW1: Ruby Red (PWR / Sleep)
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.15 }), // SW2: Amber Gold (Diagnostics)
        new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35, metalness: 0.15 })  // SW3: Cobalt Cyan (Module Stepper)
    ];
    const btnBaseGeo = new THREE.BoxGeometry(0.46, 0.46, 0.10);
    const btnBracketGeo = new THREE.BoxGeometry(0.44, 0.44, 0.015);
    const btnLegGeo = new THREE.BoxGeometry(0.08, 0.08, 0.02);
    const btnCapGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 18);
    btnCapGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(btnBaseGeo);
    disposableResources.geometries.add(btnBracketGeo);
    disposableResources.geometries.add(btnLegGeo);
    disposableResources.geometries.add(btnCapGeo);
    disposableResources.materials.add(btnBaseMat);
    disposableResources.materials.add(btnBracketMat);
    btnCapMats.forEach(m => disposableResources.materials.add(m));

    // -------------------------------------------------------------
    // RF1 — Crystalline Cyber Power Substation (Dual-Phase Converter)
    // -------------------------------------------------------------
    const rfBodyMat = new THREE.MeshStandardMaterial({
        color: 0x090d16, // Dark obsidian chassis
        roughness: 0.22,
        metalness: 0.92
    });
    const rfGlassMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7, // Sapphire crystalline viewport
        roughness: 0.1,
        metalness: 0.2,
        transparent: true,
        opacity: 0.52
    });
    const rfInductorMat = new THREE.MeshStandardMaterial({
        color: 0xd97706, // Glowing copper induction coil
        emissive: 0xb45309,
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.95
    });
    const rfBodyGeo = new THREE.BoxGeometry(1.65, 1.65, 0.26);
    const rfCornerGeo = new THREE.BoxGeometry(0.18, 0.18, 0.28);
    const rfGlassGeo = new THREE.PlaneGeometry(1.15, 1.15);
    const rfInductorGeo = new THREE.TorusGeometry(0.20, 0.055, 12, 24);
    const rfNameplateGeo = new THREE.BoxGeometry(1.2, 0.22, 0.015);
    const rfStatusLedGeo = new THREE.BoxGeometry(0.05, 0.05, 0.02);

    disposableResources.geometries.add(rfBodyGeo);
    disposableResources.geometries.add(rfCornerGeo);
    disposableResources.geometries.add(rfGlassGeo);
    disposableResources.geometries.add(rfInductorGeo);
    disposableResources.geometries.add(rfNameplateGeo);
    disposableResources.geometries.add(rfStatusLedGeo);
    disposableResources.materials.add(rfBodyMat);
    disposableResources.materials.add(rfGlassMat);
    disposableResources.materials.add(rfInductorMat);

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
        // High-temp nylon housing
        const base = new THREE.Mesh(btnBaseGeo, btnBaseMat);
        base.position.set(sx, sy, surfaceZ + 0.05);
        base.castShadow = true;
        boardGroup.add(base);

        // Stamped stainless steel retaining top bracket
        const bracket = new THREE.Mesh(btnBracketGeo, btnBracketMat);
        bracket.position.set(sx, sy, surfaceZ + 0.105);
        boardGroup.add(bracket);

        // 4 corner SMT solder tabs
        for (const dx of [-0.22, 0.22]) {
            for (const dy of [-0.22, 0.22]) {
                const leg = new THREE.Mesh(btnLegGeo, metalMaterial);
                leg.position.set(sx + dx, sy + dy, surfaceZ + 0.01);
                boardGroup.add(leg);
            }
        }

        // Mechanical actuator cap
        const cap = new THREE.Mesh(btnCapGeo, btnCapMats[i]);
        const capZ = surfaceZ + 0.135;
        cap.position.set(sx, sy, capZ);
        cap.castShadow = true;
        cap.name = `SW${i + 1}`;
        cap.userData = { componentName: `Tactile Switch SW${i + 1} (Front Panel)`, type: 'SWITCH' };
        boardGroup.add(cap);
        tactileButtons.push({ cap, baseZ: capZ });
        interactiveObjects.push(cap);
    });

    // RF1 — Crystalline Cyber Power Substation with sapphire viewport and toroidal inductors
    const rfMesh = new THREE.Mesh(rfBodyGeo, rfBodyMat);
    rfMesh.position.set(4.1, 6.0, surfaceZ + 0.13);
    rfMesh.castShadow = true;
    rfMesh.name = 'RF1';
    rfMesh.userData = { componentName: 'Power Substation RF1 (Dual-Phase Converter)', type: 'RF' };
    boardGroup.add(rfMesh);
    interactiveObjects.push(rfMesh);

    // 4 Polished Gold Corner Brackets
    for (const dx of [-0.72, 0.72]) {
        for (const dy of [-0.72, 0.72]) {
            const corner = new THREE.Mesh(rfCornerGeo, goldMaterial);
            corner.position.set(4.1 + dx, 6.0 + dy, surfaceZ + 0.14);
            boardGroup.add(corner);
        }
    }

    // Dual Glowing Copper Toroidal Inductors inside cavity
    const coil1 = new THREE.Mesh(rfInductorGeo, rfInductorMat);
    coil1.position.set(4.1 - 0.28, 6.0, surfaceZ + 0.18);
    coil1.rotation.x = 0.2;
    boardGroup.add(coil1);
    rfCoil1 = coil1;

    const coil2 = new THREE.Mesh(rfInductorGeo, rfInductorMat);
    coil2.position.set(4.1 + 0.28, 6.0, surfaceZ + 0.18);
    coil2.rotation.x = 0.2;
    boardGroup.add(coil2);
    rfCoil2 = coil2;

    // Sapphire Crystalline Glass Cover Window
    const glass = new THREE.Mesh(rfGlassGeo, rfGlassMat);
    glass.position.set(4.1, 6.0, surfaceZ + 0.261);
    boardGroup.add(glass);

    // Gold Laser-Etched Nameplate
    const nameplate = new THREE.Mesh(rfNameplateGeo, goldMaterial);
    nameplate.position.set(4.1, 5.34, surfaceZ + 0.262);
    boardGroup.add(nameplate);

    // 4 Top Status Micro LEDs (Emerald, Amber, Cyan, Emerald)
    const statusColors = [0x10b981, 0xf59e0b, 0x06b6d4, 0x10b981];
    statusColors.forEach((col, idx) => {
        const sMat = new THREE.MeshStandardMaterial({
            color: col,
            emissive: col,
            emissiveIntensity: 1.2
        });
        disposableResources.materials.add(sMat);
        const sLed = new THREE.Mesh(rfStatusLedGeo, sMat);
        sLed.position.set(4.1 - 0.36 + idx * 0.24, 6.66, surfaceZ + 0.262);
        boardGroup.add(sLed);
    });

    // Copper power feeding busbars leading down into the capacitor banks
    for (const bdx of [-0.25, 0.25]) {
        const feedGeo = new THREE.BoxGeometry(0.04, 0.7, 0.015);
        disposableResources.geometries.add(feedGeo);
        const feedMesh = new THREE.Mesh(feedGeo, goldMaterial);
        feedMesh.position.set(4.1 + bdx, 4.95, surfaceZ + 0.01);
        boardGroup.add(feedMesh);
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
    registerRvScrew(rvScrew);

    // Dynamic tagging of isInteractive = true and registering components for Teardown Layer
    interactiveObjects.forEach(obj => {
        if (!obj.userData) obj.userData = {};
        obj.userData.isInteractive = true;
        registerTeardownObject(obj, LAYER_OFFSETS.COMPONENTS);
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
/** @type {Array<{ cap: THREE.Mesh, baseZ?: number }>} */
const tactileButtons = [];

/** @param {string} name */
export function pressTactile(name) {
    const btn = tactileButtons.find((b) => b.cap.name === name);
    if (!btn) return;
    const baseZ = btn.baseZ !== undefined ? btn.baseZ : btn.cap.position.z;
    if (btn.baseZ === undefined) btn.baseZ = baseZ;
    gsap.killTweensOf(btn.cap.position);
    btn.cap.position.z = baseZ;
    switchClack();
    gsap.to(btn.cap.position, {
        z: baseZ - 0.045,
        duration: 0.08,
        ease: 'power2.in',
        yoyo: true,
        repeat: 1,
        overwrite: 'auto',
        onComplete: () => {
            btn.cap.position.z = baseZ;
        }
    });
}
