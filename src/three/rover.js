// @ts-check
// ============================================================
// 3D PCB Nano-Rover High-Fidelity Vehicle Model & Laser Scanner
//
// 1. SMD Nano-Rover Vehicle Model:
//    - Aerospace carbon-fiber tub with ENIG gold roll cage & front aero splitter.
//    - Independent front steering pivot spindles + rolling treaded tires with ENIG hubcaps.
//    - 360° rotating LiDAR turret on roof with green laser emitter lens.
//    - Dynamic 3D laser projection cone & scanning reticle on PCB surface.
//    - Dual forward projector headlights throwing illumination cones.
//    - Reactive rear LED brake/tail-lights (flares bright red on deceleration/reverse).
//    - Dual ceramic resistor boost exhaust thrusters with electric plasma flare.
//    - Cyan neon underglow casting dynamic illumination onto soldermask.
//
// 2. Drift Tire Skid Mark Decals:
//    - Lays decaying tire tracks on the soldermask when drifting.
// ============================================================

import * as THREE from 'three';
import { disposableResources } from './scene.js';

/** @type {THREE.Group | null} */
export let roverGroup = null;

// Steering Pivot Groups (to decouple steering yaw from wheel rolling pitch)
/** @type {THREE.Group | null} */
let flPivot = null;
/** @type {THREE.Group | null} */
let frPivot = null;

// Wheels
/** @type {THREE.Group | null} */
let flWheel = null;
/** @type {THREE.Group | null} */
let frWheel = null;
/** @type {THREE.Group | null} */
let blWheel = null;
/** @type {THREE.Group | null} */
let brWheel = null;

// Headlights & Tail-lights
/** @type {THREE.PointLight | null} */
let headlightL = null;
/** @type {THREE.PointLight | null} */
let headlightR = null;
/** @type {THREE.MeshStandardMaterial | null} */
let taillightMat = null;

// Boost Thrusters
/** @type {THREE.MeshBasicMaterial | null} */
let boostGlowMat = null;

// Rotating LiDAR Turret & Laser Scanner
/** @type {THREE.Group | null} */
let lidarTurret = null;
/** @type {THREE.Mesh | null} */
let laserBeamMesh = null;
/** @type {THREE.Group | null} */
let laserReticleGroup = null;
/** @type {THREE.Vector3 | null} */
let laserTargetWorldPos = null;
let isLaserLocked = false;

// Skid mark decal pool (64 tracks = 32 dual pairs)
const MAX_SKIDS = 64;
/** @type {THREE.InstancedMesh | null} */
let skidMesh = null;
/** @type {Array<{ pos: THREE.Vector3, rotZ: number, life: number }>} */
const skidDecals = [];
const dummySkid = new THREE.Object3D();
let skidIndex = 0;

// Ionized Wheel Friction Micro-Sparks Pool
const MAX_SPARKS = 32;
/** @type {THREE.InstancedMesh | null} */
let sparkMesh = null;
/** @type {Array<{ pos: THREE.Vector3, vel: THREE.Vector3, life: number, maxLife: number }>} */
const sparkParticles = [];
const dummySpark = new THREE.Object3D();
let sparkIndex = 0;

/**
 * Set the laser scanner target coordinates (e.g. over a PCB component).
 * @param {THREE.Vector3 | null} targetPos
 * @param {boolean} locked
 */
export function setRoverLaserTarget(targetPos, locked = false) {
    if (targetPos) {
        if (!laserTargetWorldPos) laserTargetWorldPos = new THREE.Vector3();
        laserTargetWorldPos.copy(targetPos);
        isLaserLocked = locked;
    } else {
        laserTargetWorldPos = null;
        isLaserLocked = false;
    }
}

/**
 * Construct the high-fidelity 3D Nano-Rover vehicle.
 * @param {THREE.Group} boardGroup
 * @returns {THREE.Group}
 */
export function createRover(boardGroup) {
    roverGroup = new THREE.Group();
    roverGroup.position.set(0, -5.5, 0.22); // Spawn near bottom center
    roverGroup.visible = false;

    // ─── 1. Main Carbon-Fiber Chassis Tub ────────────────────────
    const bodyGeo = new THREE.BoxGeometry(0.50, 0.74, 0.16);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x141418,
        metalness: 0.85,
        roughness: 0.25,
        emissive: 0x051008,
        emissiveIntensity: 0.3
    });
    disposableResources.geometries.add(bodyGeo);
    disposableResources.materials.add(bodyMat);

    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;
    roverGroup.add(bodyMesh);

    // Front Aero Splitter (ENIG Gold accented)
    const splitterGeo = new THREE.BoxGeometry(0.56, 0.12, 0.04);
    const goldMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.95,
        roughness: 0.15,
        emissive: 0x997a15,
        emissiveIntensity: 0.35
    });
    disposableResources.geometries.add(splitterGeo);
    disposableResources.materials.add(goldMat);

    const splitterMesh = new THREE.Mesh(splitterGeo, goldMat);
    splitterMesh.position.set(0, 0.38, -0.05);
    roverGroup.add(splitterMesh);

    // Rear Aero Diffuser
    const diffuserGeo = new THREE.BoxGeometry(0.48, 0.10, 0.06);
    disposableResources.geometries.add(diffuserGeo);
    const diffuserMesh = new THREE.Mesh(diffuserGeo, bodyMat);
    diffuserMesh.position.set(0, -0.38, -0.04);
    roverGroup.add(diffuserMesh);

    // Top Silicon Die / Gold Roof Accent
    const roofGeo = new THREE.PlaneGeometry(0.34, 0.46);
    disposableResources.geometries.add(roofGeo);
    const roofMesh = new THREE.Mesh(roofGeo, goldMat);
    roofMesh.position.z = 0.082;
    roverGroup.add(roofMesh);

    // ─── 2. ENIG Gold Roll Cage Exoskeleton ─────────────────────
    const cageBarMat = goldMat;
    const cageGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.48, 8);
    cageGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(cageGeo);

    const leftBar = new THREE.Mesh(cageGeo, cageBarMat);
    leftBar.position.set(-0.20, 0, 0.14);
    const rightBar = new THREE.Mesh(cageGeo, cageBarMat);
    rightBar.position.set(0.20, 0, 0.14);
    roverGroup.add(leftBar);
    roverGroup.add(rightBar);

    // Cross brace
    const crossGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.40, 8);
    crossGeo.rotateZ(Math.PI / 2);
    disposableResources.geometries.add(crossGeo);
    const crossBarF = new THREE.Mesh(crossGeo, cageBarMat);
    crossBarF.position.set(0, 0.22, 0.14);
    const crossBarR = new THREE.Mesh(crossGeo, cageBarMat);
    crossBarR.position.set(0, -0.22, 0.14);
    roverGroup.add(crossBarF);
    roverGroup.add(crossBarR);

    // ─── 3. Neon Cyan Underglow Mesh & Light ────────────────────
    const underglowGeo = new THREE.PlaneGeometry(0.54, 0.78);
    const underglowMat = new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    disposableResources.geometries.add(underglowGeo);
    disposableResources.materials.add(underglowMat);

    const underglowMesh = new THREE.Mesh(underglowGeo, underglowMat);
    underglowMesh.position.z = -0.075;
    roverGroup.add(underglowMesh);

    const underglowLight = new THREE.PointLight(0x00ffcc, 0.9, 1.8);
    underglowLight.position.set(0, 0, -0.06);
    roverGroup.add(underglowLight);

    // ─── 4. Treaded Wheels with ENIG Hubcaps ─────────────────────
    const tireGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.09, 16);
    tireGeo.rotateZ(Math.PI / 2);
    disposableResources.geometries.add(tireGeo);

    const tireMat = new THREE.MeshStandardMaterial({
        color: 0x09090b,
        metalness: 0.15,
        roughness: 0.85
    });
    disposableResources.materials.add(tireMat);

    const hubcapGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.095, 12);
    hubcapGeo.rotateZ(Math.PI / 2);
    disposableResources.geometries.add(hubcapGeo);

    /**
     * Create a compound wheel with tire + gold hubcap.
     * @returns {THREE.Group}
     */
    function createWheelAssembly() {
        const wGroup = new THREE.Group();
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.castShadow = true;
        const cap = new THREE.Mesh(hubcapGeo, goldMat);
        wGroup.add(tire);
        wGroup.add(cap);
        return wGroup;
    }

    // Front Steering Spindles (Pivots)
    flPivot = new THREE.Group();
    frPivot = new THREE.Group();
    flPivot.position.set(-0.29, 0.24, -0.02);
    frPivot.position.set(0.29, 0.24, -0.02);

    flWheel = createWheelAssembly();
    frWheel = createWheelAssembly();
    flPivot.add(flWheel);
    frPivot.add(frWheel);

    roverGroup.add(flPivot);
    roverGroup.add(frPivot);

    // Rear Wheels (Direct mount)
    blWheel = createWheelAssembly();
    brWheel = createWheelAssembly();
    blWheel.position.set(-0.29, -0.24, -0.02);
    brWheel.position.set(0.29, -0.24, -0.02);
    roverGroup.add(blWheel);
    roverGroup.add(brWheel);

    // ─── 5. Forward Projector Headlights ─────────────────────────
    const headMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const headGeo = new THREE.SphereGeometry(0.04, 8, 8);
    disposableResources.geometries.add(headGeo);
    disposableResources.materials.add(headMat);

    const hlMeshL = new THREE.Mesh(headGeo, headMat);
    const hlMeshR = new THREE.Mesh(headGeo, headMat);
    hlMeshL.position.set(-0.16, 0.38, 0.02);
    hlMeshR.position.set(0.16, 0.38, 0.02);
    roverGroup.add(hlMeshL);
    roverGroup.add(hlMeshR);

    headlightL = new THREE.PointLight(0x00ffff, 1.4, 3.8);
    headlightR = new THREE.PointLight(0x00ffff, 1.4, 3.8);
    headlightL.position.set(-0.16, 0.52, 0.06);
    headlightR.position.set(0.16, 0.52, 0.06);
    roverGroup.add(headlightL);
    roverGroup.add(headlightR);

    // ─── 6. Reactive Rear Brake & Tail-Lights ────────────────────
    taillightMat = new THREE.MeshStandardMaterial({
        color: 0x660011,
        metalness: 0.3,
        roughness: 0.2,
        emissive: 0xcc0022,
        emissiveIntensity: 0.6
    });
    disposableResources.materials.add(taillightMat);

    const tailGeo = new THREE.BoxGeometry(0.08, 0.03, 0.04);
    disposableResources.geometries.add(tailGeo);

    const tlMeshL = new THREE.Mesh(tailGeo, taillightMat);
    const tlMeshR = new THREE.Mesh(tailGeo, taillightMat);
    tlMeshL.position.set(-0.17, -0.38, 0.03);
    tlMeshR.position.set(0.17, -0.38, 0.03);
    roverGroup.add(tlMeshL);
    roverGroup.add(tlMeshR);

    // ─── 7. Resistor Boost Thrusters ────────────────────────────
    const boosterGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.09, 12);
    boosterGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(boosterGeo);

    const boosterMat = new THREE.MeshStandardMaterial({
        color: 0x222226,
        metalness: 0.8,
        roughness: 0.3
    });
    disposableResources.materials.add(boosterMat);

    boostGlowMat = new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.25
    });
    disposableResources.materials.add(boostGlowMat);

    const boosterL = new THREE.Mesh(boosterGeo, boosterMat);
    const boosterR = new THREE.Mesh(boosterGeo, boosterMat);
    boosterL.position.set(-0.10, -0.40, -0.02);
    boosterR.position.set(0.10, -0.40, -0.02);

    const boostGlowGeo = new THREE.ConeGeometry(0.04, 0.16, 8);
    boostGlowGeo.rotateX(-Math.PI / 2);
    disposableResources.geometries.add(boostGlowGeo);

    const boostFlareL = new THREE.Mesh(boostGlowGeo, boostGlowMat);
    const boostFlareR = new THREE.Mesh(boostGlowGeo, boostGlowMat);
    boostFlareL.position.set(0, -0.10, 0);
    boostFlareR.position.set(0, -0.10, 0);
    boosterL.add(boostFlareL);
    boosterR.add(boostFlareR);

    roverGroup.add(boosterL);
    roverGroup.add(boosterR);

    // ─── 8. 360° Rotating LiDAR Turret & 3D Laser Scanner ────────
    lidarTurret = new THREE.Group();
    lidarTurret.position.set(0, 0.04, 0.12);

    const turretBaseGeo = new THREE.CylinderGeometry(0.09, 0.10, 0.04, 16);
    turretBaseGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(turretBaseGeo);
    const turretBaseMat = new THREE.MeshStandardMaterial({
        color: 0x202024,
        metalness: 0.7,
        roughness: 0.3
    });
    disposableResources.materials.add(turretBaseMat);
    const turretBase = new THREE.Mesh(turretBaseGeo, turretBaseMat);
    lidarTurret.add(turretBase);

    // Rotating Dome
    const domeGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.05, 16);
    domeGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(domeGeo);
    const domeMat = new THREE.MeshStandardMaterial({
        color: 0x0d0d10,
        metalness: 0.9,
        roughness: 0.15
    });
    disposableResources.materials.add(domeMat);
    const domeMesh = new THREE.Mesh(domeGeo, domeMat);
    domeMesh.position.z = 0.03;
    lidarTurret.add(domeMesh);

    // Optical Lens Slit (Laser Emitter)
    const lensGeo = new THREE.BoxGeometry(0.04, 0.08, 0.02);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    disposableResources.geometries.add(lensGeo);
    disposableResources.materials.add(lensMat);
    const lensMesh = new THREE.Mesh(lensGeo, lensMat);
    lensMesh.position.set(0, 0.04, 0.035);
    lidarTurret.add(lensMesh);

    roverGroup.add(lidarTurret);

    // ─── 9. Dynamic 3D Laser Projection Cone & Surface Reticle ───
    const laserBeamGeo = new THREE.CylinderGeometry(0.02, 0.28, 0.36, 16, 1, true);
    laserBeamGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(laserBeamGeo);

    const laserBeamMat = new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
    disposableResources.materials.add(laserBeamMat);

    laserBeamMesh = new THREE.Mesh(laserBeamGeo, laserBeamMat);
    laserBeamMesh.position.set(0, 0, -0.16);
    lidarTurret.add(laserBeamMesh);

    // Laser Surface Targeting Reticle (flat on PCB surface)
    laserReticleGroup = new THREE.Group();
    laserReticleGroup.position.set(0, 0, -0.21);

    const ringOuterGeo = new THREE.RingGeometry(0.24, 0.27, 32);
    disposableResources.geometries.add(ringOuterGeo);
    const ringInnerGeo = new THREE.RingGeometry(0.06, 0.08, 16);
    disposableResources.geometries.add(ringInnerGeo);

    const reticleMat = new THREE.MeshBasicMaterial({
        color: 0x00ff88,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });
    disposableResources.materials.add(reticleMat);

    const ringOuter = new THREE.Mesh(ringOuterGeo, reticleMat);
    const ringInner = new THREE.Mesh(ringInnerGeo, reticleMat);
    laserReticleGroup.add(ringOuter);
    laserReticleGroup.add(ringInner);
    roverGroup.add(laserReticleGroup);

    boardGroup.add(roverGroup);

    // ─── 10. Dual Drift Skid Marks Decal Pool ───────────────────
    const skidGeo = new THREE.PlaneGeometry(0.05, 0.14);
    disposableResources.geometries.add(skidGeo);

    const skidMat = new THREE.MeshBasicMaterial({
        color: 0x020804,
        transparent: true,
        opacity: 0.55,
        depthWrite: false
    });
    disposableResources.materials.add(skidMat);

    skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, MAX_SKIDS);
    skidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    disposableResources.geometries.add(skidMesh.geometry);
    disposableResources.materials.add(skidMesh.material);

    skidDecals.length = 0;
    for (let i = 0; i < MAX_SKIDS; i++) {
        skidDecals.push({ pos: new THREE.Vector3(0, 0, -100), rotZ: 0, life: 0 });
    }
    boardGroup.add(skidMesh);

    // ─── 11. Ionized Wheel Friction Micro-Sparks Pool ───────────
    const sparkGeo = new THREE.PlaneGeometry(0.024, 0.024);
    disposableResources.geometries.add(sparkGeo);

    const sparkMat = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    disposableResources.materials.add(sparkMat);

    sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARKS);
    sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    disposableResources.geometries.add(sparkMesh.geometry);
    disposableResources.materials.add(sparkMesh.material);

    sparkParticles.length = 0;
    for (let i = 0; i < MAX_SPARKS; i++) {
        sparkParticles.push({
            pos: new THREE.Vector3(0, 0, -100),
            vel: new THREE.Vector3(0, 0, 0),
            life: 0,
            maxLife: 0.35
        });
    }
    boardGroup.add(sparkMesh);

    return roverGroup;
}

/**
 * Drop dual skid mark decals under left and right rear tires.
 * @param {number} leftX
 * @param {number} leftY
 * @param {number} rightX
 * @param {number} rightY
 * @param {number} rotZ
 */
export function addDualSkidMarks(leftX, leftY, rightX, rightY, rotZ) {
    if (!skidMesh) return;
    const s1 = skidDecals[skidIndex];
    s1.pos.set(leftX, leftY, 0.081);
    s1.rotZ = rotZ;
    s1.life = 1.0;
    skidIndex = (skidIndex + 1) % MAX_SKIDS;

    const s2 = skidDecals[skidIndex];
    s2.pos.set(rightX, rightY, 0.081);
    s2.rotZ = rotZ;
    s2.life = 1.0;
    skidIndex = (skidIndex + 1) % MAX_SKIDS;
}

/**
 * Emit ionized micro-spark particle at rear wheel contact point.
 * @param {number} x
 * @param {number} y
 */
export function addWheelSpark(x, y) {
    if (!sparkMesh) return;
    const sp = sparkParticles[sparkIndex];
    sp.pos.set(x + (Math.random() - 0.5) * 0.04, y + (Math.random() - 0.5) * 0.04, 0.10);
    sp.vel.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, 0.9 + Math.random() * 1.2);
    sp.life = 0.22 + Math.random() * 0.14;
    sp.maxLife = sp.life;
    sparkIndex = (sparkIndex + 1) % MAX_SPARKS;
}

/**
 * Drop a skid mark decal at current position during hard drift (backward compatibility).
 * @param {THREE.Vector3} pos
 * @param {number} rotZ
 */
export function addSkidMark(pos, rotZ) {
    if (!skidMesh) return;
    const skid = skidDecals[skidIndex];
    skid.pos.set(pos.x, pos.y, 0.081);
    skid.rotZ = rotZ;
    skid.life = 1.0;
    skidIndex = (skidIndex + 1) % MAX_SKIDS;
}

/**
 * Update wheel roll rotation, steering angle, suspension tilt, rotating LiDAR, and laser visuals.
 * @param {{ pos: THREE.Vector3, vel: THREE.Vector3, angle: number, steer: number, speed: number, pitch: number, roll: number, isDrifting: boolean, isBoosting?: boolean, jumpZ?: number, terrain?: { id: string } }} state
 * @param {number} delta
 */
export function updateRoverVisuals(state, delta) {
    if (!roverGroup || !roverGroup.visible) return;

    // 1. Apply Position & Yaw Angle
    roverGroup.position.set(state.pos.x, state.pos.y, state.pos.z);
    roverGroup.rotation.z = state.angle;

    // 2. Apply Suspension Pitch & Roll Tilts
    roverGroup.rotation.x = state.pitch;
    roverGroup.rotation.y = state.roll;

    // 3. Front Wheel Steering Angle (applied cleanly to pivot spindles)
    if (flPivot && frPivot) {
        flPivot.rotation.z = state.steer;
        frPivot.rotation.z = state.steer;
    }

    // 4. Wheel Rolling Rotation based on speed
    const wheelRotDelta = (state.speed * delta) / 0.12;
    if (flWheel && frWheel && blWheel && brWheel) {
        flWheel.rotation.x += wheelRotDelta;
        frWheel.rotation.x += wheelRotDelta;
        blWheel.rotation.x += wheelRotDelta;
        brWheel.rotation.x += wheelRotDelta;
    }

    // 5. 360° Rotating LiDAR Turret
    if (lidarTurret) {
        const spinRate = isLaserLocked ? 1.5 : (6.28 + Math.abs(state.speed) * 0.8);
        lidarTurret.rotation.z += delta * spinRate;
    }

    // 6. Laser Scanner Beam & Reticle Pulsing
    if (laserReticleGroup) {
        const pulse = 1.0 + Math.sin(Date.now() * 0.008) * 0.12;
        laserReticleGroup.scale.set(pulse, pulse, 1.0);
        laserReticleGroup.rotation.z += delta * 1.8;
    }

    // 7. Reactive Rear Brake & Tail-Lights
    if (taillightMat) {
        const isBrakingOrReversing = state.speed < -0.05 || (state.vel && state.vel.dot(new THREE.Vector3(0, 1, 0)) < 0);
        if (isBrakingOrReversing) {
            taillightMat.emissive.setHex(0xff0022);
            taillightMat.emissiveIntensity = 2.4;
        } else {
            taillightMat.emissive.setHex(0xcc0022);
            taillightMat.emissiveIntensity = 0.6;
        }
    }

    // 8. Resistor Boost Thrusters Glow
    if (boostGlowMat) {
        const targetOpacity = state.isBoosting ? 0.95 : 0.15;
        boostGlowMat.opacity += (targetOpacity - boostGlowMat.opacity) * Math.min(1.0, delta * 12);
    }

    // 9. Dual Rear Wheel Skid Marks & Ionized Sparks
    const isHardBraking = state.speed < -0.15;
    const isAirborne = (state.jumpZ || 0) > 0.06;
    const shouldSkid = (state.isDrifting || isHardBraking) && Math.abs(state.speed) > 1.2 && !isAirborne;

    if (shouldSkid && Math.random() < 0.65) {
        const cosA = Math.cos(state.angle);
        const sinA = Math.sin(state.angle);
        // Left rear wheel in rover local space: (-0.28, -0.36)
        const leftX = state.pos.x + (-0.28 * cosA - (-0.36) * sinA);
        const leftY = state.pos.y + (-0.28 * sinA + (-0.36) * cosA);
        // Right rear wheel in rover local space: (0.28, -0.36)
        const rightX = state.pos.x + (0.28 * cosA - (-0.36) * sinA);
        const rightY = state.pos.y + (0.28 * sinA + (-0.36) * cosA);

        addDualSkidMarks(leftX, leftY, rightX, rightY, state.angle);

        // Ionized copper friction sparks if on copper trace/plane
        if (state.terrain && state.terrain.id === 'copper' && Math.random() < 0.85) {
            addWheelSpark(leftX, leftY);
            addWheelSpark(rightX, rightY);
        }
    }

    // 10. Update Skid Marks Decals (Smooth fade over ~3.5s)
    const sm = skidMesh;
    if (sm) {
        skidDecals.forEach((skid, i) => {
            if (skid.life > 0) {
                skid.life -= delta * 0.28;
                dummySkid.position.copy(skid.pos);
                dummySkid.rotation.z = skid.rotZ;
                const scaleY = Math.max(0.01, Math.min(1.0, skid.life * 1.5));
                dummySkid.scale.set(1, scaleY, 1);
            } else {
                dummySkid.position.set(0, 0, -100);
            }
            dummySkid.updateMatrix();
            sm.setMatrixAt(i, dummySkid.matrix);
        });
        sm.instanceMatrix.needsUpdate = true;
    }

    // 11. Update Ionized Wheel Sparks
    const spm = sparkMesh;
    if (spm) {
        sparkParticles.forEach((sp, i) => {
            if (sp.life > 0) {
                sp.life -= delta;
                sp.pos.x += sp.vel.x * delta;
                sp.pos.y += sp.vel.y * delta;
                sp.pos.z += sp.vel.z * delta;
                sp.vel.z -= 6.5 * delta; // Gravity pull back to PCB surface
                dummySpark.position.copy(sp.pos);
                const progress = Math.max(0.01, sp.life / sp.maxLife);
                dummySpark.scale.setScalar(progress);
            } else {
                dummySpark.position.set(0, 0, -100);
            }
            dummySpark.updateMatrix();
            spm.setMatrixAt(i, dummySpark.matrix);
        });
        spm.instanceMatrix.needsUpdate = true;
    }
}
