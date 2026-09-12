// @ts-check
// ============================================================
// 3D Project Storytelling Dioramas
// Dedicated, custom 3D animations and storytelling dioramas for each of
// Parameshwaran's 8 projects (FlyRank is classified as an Internship):
// 1. CrowdPulse (CP1): Holographic crossroads with walking pedestrians & CV boxes
// 2. Dialora (DL1): Living glowing voice orb with acoustic frequency ripple rings & EQ
// 3. Smart Parking (SP1): Multi-slot parking garage with red/green bays & docking car
// 4. BusIT (BT1): Curving neon transit highway with stations & cruising shuttle
// 5. Blue_Ground (AQD1): Dual solar panels with filtration chamber & levitating droplet
// 6. PawPal (PX1): Expressive 3D pet companion with wagging tail & beating vital heart
// 7. EcoMentor AI (EM1): Floating Earth globe with spinning wind turbine & eco particles
// 8. ML & Systems Reps (ML1): 3D binary search tree with algorithmic traversal waves
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { motionPrefs } from '../utils/motion-prefs.js';
import { disposableResources } from './scene.js';
import { projectChips } from './project-chips.js';

/** @type {THREE.Group | null} */
let hologramParentGroup = null;

// Individual project diorama groups
/** @type {THREE.Group | null} */
let crowdPulseGroup = null;
/** @type {THREE.Group | null} */
let dialoraGroup = null;
/** @type {THREE.Group | null} */
let smartParkingGroup = null;
/** @type {THREE.Group | null} */
let busItGroup = null;
/** @type {THREE.Group | null} */
let blueGroundGroup = null;
/** @type {THREE.Group | null} */
let pawPalGroup = null;
/** @type {THREE.Group | null} */
let ecoMentorGroup = null;
/** @type {THREE.Group | null} */
let mlDsaGroup = null;

// Sub-element animation handles
/** @type {THREE.Mesh[]} */
const pedestrianDots = [];
/** @type {THREE.Mesh[]} */
const pedestrianBoxes = [];
/** @type {THREE.Mesh | null} */
let scanConeMesh = null;

/** @type {THREE.Mesh | null} */
let voiceOrbMesh = null;
/** @type {THREE.Mesh[]} */
const soundRings = [];
/** @type {THREE.Mesh[]} */
const eqBars = [];

/** @type {THREE.Mesh | null} */
let parkingCarMesh = null;

/** @type {THREE.Mesh | null} */
let busMarkerMesh = null;

/** @type {THREE.Mesh | null} */
let solarDropletMesh = null;
/** @type {THREE.Mesh[]} */
const dropletRipples = [];

/** @type {THREE.Mesh | null} */
let pawTailMesh = null;
/** @type {THREE.Group | null} */
let pawHeadGroup = null;
/** @type {THREE.Mesh | null} */
let pawHeartMesh = null;

/** @type {THREE.Mesh | null} */
let ecoTurbineBlades = null;
/** @type {THREE.Mesh | null} */
let ecoGlobeMesh = null;
/** @type {THREE.Mesh[]} */
const ecoParticles = [];

/** @type {THREE.Mesh[]} */
const treeNodes = [];
/** @type {THREE.Mesh | null} */
let commitCubeMesh = null;

/** @type {Map<THREE.Group, THREE.Material[]>} */
const groupMaterialsMap = new Map();
/** @type {THREE.Material[]} */
const allHoloMaterials = [];
let activeHoloName = '';

/**
 * Helper to record material in group and disposables.
 * @param {THREE.Group | null} group
 * @param {THREE.Material} mat
 */
function trackMat(group, mat) {
    if (!group) return;
    disposableResources.materials.add(mat);
    allHoloMaterials.push(mat);
    let list = groupMaterialsMap.get(group);
    if (!list) {
        list = [];
        groupMaterialsMap.set(group, list);
    }
    list.push(mat);
}

/**
 * Creates a glowing vertical holographic light beam pedestal linking the chip to the floating diorama.
 * @param {THREE.Group | null} group
 * @param {number} colorHex
 */
function createHoloPedestal(group, colorHex) {
    if (!group) return;
    const geo = new THREE.CylinderGeometry(0.3, 0.45, 0.35, 16, 1, true);
    disposableResources.geometries.add(geo);
    const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.35,
        wireframe: true,
        blending: THREE.AdditiveBlending
    });
    trackMat(group, mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, 0.18);
    mesh.rotation.x = Math.PI / 2;
    group.add(mesh);
}

/**
 * Initialize all 8 custom 3D Project Dioramas.
 * @param {THREE.Group} boardGroup
 */
export function initProjectHolograms(boardGroup) {
    if (hologramParentGroup) return;

    hologramParentGroup = new THREE.Group();
    hologramParentGroup.name = 'ProjectHologramsGroup';
    boardGroup.add(hologramParentGroup);

    // =============================================================
    // 1. CrowdPulse (CP1): Holographic Street Crossroads & CV Tracking
    // =============================================================
    crowdPulseGroup = new THREE.Group();
    crowdPulseGroup.visible = false;
    hologramParentGroup.add(crowdPulseGroup);
    createHoloPedestal(crowdPulseGroup, 0x38bdf8);

    // Elevated crosswalk asphalt plane
    const roadPoints = [
        new THREE.Vector3(-0.35, -0.35, 0.32),
        new THREE.Vector3(0.35, -0.35, 0.32),
        new THREE.Vector3(0.35, 0.35, 0.32),
        new THREE.Vector3(-0.35, 0.35, 0.32),
        new THREE.Vector3(-0.35, -0.35, 0.32)
    ];
    const roadGeo = new THREE.BufferGeometry().setFromPoints(roadPoints);
    disposableResources.geometries.add(roadGeo);
    const roadMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
    });
    trackMat(crowdPulseGroup, roadMat);
    crowdPulseGroup.add(new THREE.Line(roadGeo, roadMat));

    // Zebra stripes
    for (let z = -0.25; z <= 0.25; z += 0.12) {
        const stripePoints = [new THREE.Vector3(-0.18, z, 0.325), new THREE.Vector3(0.18, z, 0.325)];
        const stripeGeo = new THREE.BufferGeometry().setFromPoints(stripePoints);
        disposableResources.geometries.add(stripeGeo);
        const stripeMat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.75 });
        trackMat(crowdPulseGroup, stripeMat);
        crowdPulseGroup.add(new THREE.Line(stripeGeo, stripeMat));
    }

    // Animated pedestrians with CV bounding boxes
    const dotGeo = new THREE.SphereGeometry(0.04, 10, 10);
    disposableResources.geometries.add(dotGeo);
    const dotMat1 = new THREE.MeshBasicMaterial({ color: 0x3ee6a0, transparent: true, opacity: 0.95 });
    const dotMat2 = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.95 });
    trackMat(crowdPulseGroup, dotMat1);
    trackMat(crowdPulseGroup, dotMat2);

    const boxGeo = new THREE.BoxGeometry(0.09, 0.09, 0.12);
    disposableResources.geometries.add(boxGeo);
    const boxMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.85
    });
    trackMat(crowdPulseGroup, boxMat);

    for (let i = 0; i < 5; i++) {
        const dot = new THREE.Mesh(dotGeo, i % 2 === 0 ? dotMat1 : dotMat2);
        dot.position.set(-0.28 + i * 0.14, (i % 2 === 0 ? 0.12 : -0.12), 0.38);
        crowdPulseGroup.add(dot);
        pedestrianDots.push(dot);

        const bbox = new THREE.Mesh(boxGeo, boxMat);
        bbox.position.copy(dot.position);
        crowdPulseGroup.add(bbox);
        pedestrianBoxes.push(bbox);
    }

    // Overhead vision camera scan cone
    const coneGeo = new THREE.ConeGeometry(0.32, 0.45, 4, 1, true);
    disposableResources.geometries.add(coneGeo);
    const coneMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending
    });
    trackMat(crowdPulseGroup, coneMat);
    scanConeMesh = new THREE.Mesh(coneGeo, coneMat);
    scanConeMesh.position.set(0, 0, 0.65);
    scanConeMesh.rotation.x = Math.PI;
    crowdPulseGroup.add(scanConeMesh);

    // =============================================================
    // 2. Dialora (DL1): Living Voice Orb & Soundwave Ripple Rings
    // =============================================================
    dialoraGroup = new THREE.Group();
    dialoraGroup.visible = false;
    hologramParentGroup.add(dialoraGroup);
    createHoloPedestal(dialoraGroup, 0xf97316);

    const voiceGeo = new THREE.IcosahedronGeometry(0.18, 2);
    disposableResources.geometries.add(voiceGeo);
    const voiceMat = new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xf97316,
        emissiveIntensity: 1.4,
        roughness: 0.15,
        metalness: 0.8,
        transparent: true,
        opacity: 0.95
    });
    trackMat(dialoraGroup, voiceMat);

    voiceOrbMesh = new THREE.Mesh(voiceGeo, voiceMat);
    voiceOrbMesh.position.set(0, 0, 0.42);
    dialoraGroup.add(voiceOrbMesh);

    // Concentric acoustic wave rings
    const ringGeo = new THREE.RingGeometry(0.24, 0.27, 32);
    disposableResources.geometries.add(ringGeo);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xfb923c,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    trackMat(dialoraGroup, ringMat);

    for (let r = 0; r < 3; r++) {
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, 0, 0.42);
        ring.scale.setScalar(0.6 + r * 0.4);
        dialoraGroup.add(ring);
        soundRings.push(ring);
    }

    // Dancing equalizer bars
    const eqGeo = new THREE.BoxGeometry(0.035, 0.035, 0.18);
    disposableResources.geometries.add(eqGeo);
    const eqMat = new THREE.MeshStandardMaterial({
        color: 0xfdba74,
        emissive: 0xf97316,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.95
    });
    trackMat(dialoraGroup, eqMat);

    for (let b = 0; b < 6; b++) {
        const bar = new THREE.Mesh(eqGeo, eqMat);
        bar.position.set(-0.25 + b * 0.1, -0.28, 0.38);
        dialoraGroup.add(bar);
        eqBars.push(bar);
    }

    // =============================================================
    // 3. Smart Parking (SP1): Multi-Level Garage with Docking Car
    // =============================================================
    smartParkingGroup = new THREE.Group();
    smartParkingGroup.visible = false;
    hologramParentGroup.add(smartParkingGroup);
    createHoloPedestal(smartParkingGroup, 0xeab308);

    // Parking garage deck
    const deckPoints = [
        new THREE.Vector3(-0.35, -0.25, 0.32),
        new THREE.Vector3(0.35, -0.25, 0.32),
        new THREE.Vector3(0.35, 0.25, 0.32),
        new THREE.Vector3(-0.35, 0.25, 0.32),
        new THREE.Vector3(-0.35, -0.25, 0.32)
    ];
    const deckGeo = new THREE.BufferGeometry().setFromPoints(deckPoints);
    disposableResources.geometries.add(deckGeo);
    const deckMat = new THREE.LineBasicMaterial({ color: 0xca8a04, transparent: true, opacity: 0.85 });
    trackMat(smartParkingGroup, deckMat);
    smartParkingGroup.add(new THREE.Line(deckGeo, deckMat));

    const bayGeo = new THREE.BoxGeometry(0.2, 0.14, 0.03);
    disposableResources.geometries.add(bayGeo);
    const redBayMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.9 });
    const greenBayMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.95 });
    trackMat(smartParkingGroup, redBayMat);
    trackMat(smartParkingGroup, greenBayMat);

    // 3 occupied red bays and 1 vacant green bay
    const bayConfigs = [
        { x: -0.18, y: 0.12, mat: redBayMat },
        { x: 0.18, y: 0.12, mat: redBayMat },
        { x: -0.18, y: -0.12, mat: redBayMat },
        { x: 0.18, y: -0.12, mat: greenBayMat }
    ];
    bayConfigs.forEach((cfg) => {
        const bay = new THREE.Mesh(bayGeo, cfg.mat);
        bay.position.set(cfg.x, cfg.y, 0.34);
        smartParkingGroup?.add(bay);
    });

    // Autonomous sports car with front headlights
    const carGeo = new THREE.BoxGeometry(0.16, 0.1, 0.07);
    disposableResources.geometries.add(carGeo);
    const carMat = new THREE.MeshStandardMaterial({
        color: 0xeab308,
        emissive: 0xca8a04,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.8,
        transparent: true,
        opacity: 0.95
    });
    trackMat(smartParkingGroup, carMat);

    parkingCarMesh = new THREE.Mesh(carGeo, carMat);
    parkingCarMesh.position.set(0.35, -0.12, 0.39);
    smartParkingGroup.add(parkingCarMesh);

    // =============================================================
    // 4. BusIT (BT1): Curving Transit Highway & Commuter Shuttle
    // =============================================================
    busItGroup = new THREE.Group();
    busItGroup.visible = false;
    hologramParentGroup.add(busItGroup);
    createHoloPedestal(busItGroup, 0x22c55e);

    const busRoute = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.38, -0.3, 0.34),
        new THREE.Vector3(0.0, 0.38, 0.34),
        new THREE.Vector3(0.38, -0.3, 0.34)
    );
    const busPoints = busRoute.getPoints(32);
    const busGeo = new THREE.BufferGeometry().setFromPoints(busPoints);
    disposableResources.geometries.add(busGeo);
    const busLineMat = new THREE.LineBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending
    });
    trackMat(busItGroup, busLineMat);
    busItGroup.add(new THREE.Line(busGeo, busLineMat));

    // Roadside transit station beacons
    const stationGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8);
    disposableResources.geometries.add(stationGeo);
    const stationMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.9 });
    trackMat(busItGroup, stationMat);
    const st1 = new THREE.Mesh(stationGeo, stationMat);
    st1.position.set(-0.35, -0.25, 0.42);
    st1.rotation.x = Math.PI / 2;
    busItGroup.add(st1);
    const st2 = new THREE.Mesh(stationGeo, stationMat);
    st2.position.set(0.35, -0.25, 0.42);
    st2.rotation.x = Math.PI / 2;
    busItGroup.add(st2);

    // Commuter transit shuttle
    const shuttleGeo = new THREE.BoxGeometry(0.16, 0.08, 0.07);
    disposableResources.geometries.add(shuttleGeo);
    const shuttleMat = new THREE.MeshStandardMaterial({
        color: 0x4ade80,
        emissive: 0x22c55e,
        emissiveIntensity: 0.8,
        roughness: 0.25,
        metalness: 0.7,
        transparent: true,
        opacity: 0.95
    });
    trackMat(busItGroup, shuttleMat);

    busMarkerMesh = new THREE.Mesh(shuttleGeo, shuttleMat);
    busMarkerMesh.position.set(-0.38, -0.3, 0.39);
    busItGroup.add(busMarkerMesh);

    // =============================================================
    // 5. Blue_Ground (AQD1): Solar Station & Purified Water Droplet
    // =============================================================
    blueGroundGroup = new THREE.Group();
    blueGroundGroup.visible = false;
    hologramParentGroup.add(blueGroundGroup);
    createHoloPedestal(blueGroundGroup, 0x0284c7);

    // Dual angled photovoltaic solar plates
    const solarGeo = new THREE.PlaneGeometry(0.42, 0.26);
    disposableResources.geometries.add(solarGeo);
    const solarMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0369a1,
        emissiveIntensity: 0.5,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide
    });
    trackMat(blueGroundGroup, solarMat);

    const solarMesh = new THREE.Mesh(solarGeo, solarMat);
    solarMesh.rotation.x = -0.4;
    solarMesh.position.set(0, -0.1, 0.32);
    blueGroundGroup.add(solarMesh);

    // Transparent water chamber cylinder
    const chamberGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.14, 16);
    disposableResources.geometries.add(chamberGeo);
    const chamberMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
        wireframe: true
    });
    trackMat(blueGroundGroup, chamberMat);
    const chamber = new THREE.Mesh(chamberGeo, chamberMat);
    chamber.position.set(0, 0.14, 0.38);
    chamber.rotation.x = Math.PI / 2;
    blueGroundGroup.add(chamber);

    // Levitating purified water drop
    const dropGeo = new THREE.SphereGeometry(0.11, 16, 12);
    disposableResources.geometries.add(dropGeo);
    const dropMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.9,
        roughness: 0.05,
        metalness: 0.2,
        transparent: true,
        opacity: 0.95
    });
    trackMat(blueGroundGroup, dropMat);

    solarDropletMesh = new THREE.Mesh(dropGeo, dropMat);
    solarDropletMesh.position.set(0, 0.14, 0.55);
    blueGroundGroup.add(solarDropletMesh);

    // Concentric purifying ripple rings
    const rippleGeo = new THREE.RingGeometry(0.12, 0.15, 24);
    disposableResources.geometries.add(rippleGeo);
    const rippleMat = new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending
    });
    trackMat(blueGroundGroup, rippleMat);
    for (let r = 0; r < 2; r++) {
        const rip = new THREE.Mesh(rippleGeo, rippleMat);
        rip.position.set(0, 0.14, 0.38);
        blueGroundGroup.add(rip);
        dropletRipples.push(rip);
    }

    // =============================================================
    // 6. PawPal (PX1): Expressive 3D Pet Companion with Gaze Tracking
    // =============================================================
    pawPalGroup = new THREE.Group();
    pawPalGroup.visible = false;
    hologramParentGroup.add(pawPalGroup);
    createHoloPedestal(pawPalGroup, 0xa855f7);

    const petMat = new THREE.MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0x9333ea,
        emissiveIntensity: 0.7,
        roughness: 0.35,
        metalness: 0.6,
        transparent: true,
        opacity: 0.95
    });
    trackMat(pawPalGroup, petMat);

    // Body
    const petBodyGeo = new THREE.BoxGeometry(0.2, 0.28, 0.16);
    disposableResources.geometries.add(petBodyGeo);
    const petBody = new THREE.Mesh(petBodyGeo, petMat);
    petBody.position.set(0, -0.06, 0.36);
    pawPalGroup.add(petBody);

    // Articulated head for gaze tracking
    pawHeadGroup = new THREE.Group();
    pawHeadGroup.position.set(0, 0.12, 0.44);
    pawPalGroup.add(pawHeadGroup);

    const headGeo = new THREE.BoxGeometry(0.16, 0.15, 0.14);
    disposableResources.geometries.add(headGeo);
    const headMesh = new THREE.Mesh(headGeo, petMat);
    pawHeadGroup.add(headMesh);

    // Ears
    const earGeo = new THREE.ConeGeometry(0.04, 0.08, 4);
    disposableResources.geometries.add(earGeo);
    const leftEar = new THREE.Mesh(earGeo, petMat);
    leftEar.position.set(-0.06, 0.09, 0.04);
    pawHeadGroup.add(leftEar);
    const rightEar = new THREE.Mesh(earGeo, petMat);
    rightEar.position.set(0.06, 0.09, 0.04);
    pawHeadGroup.add(rightEar);

    // Snout
    const snoutGeo = new THREE.BoxGeometry(0.07, 0.06, 0.06);
    disposableResources.geometries.add(snoutGeo);
    const snout = new THREE.Mesh(snoutGeo, petMat);
    snout.position.set(0, 0.09, -0.02);
    pawHeadGroup.add(snout);

    // Wagging tail
    const tailGeo = new THREE.BoxGeometry(0.04, 0.14, 0.04);
    disposableResources.geometries.add(tailGeo);
    pawTailMesh = new THREE.Mesh(tailGeo, petMat);
    pawTailMesh.position.set(0, -0.22, 0.38);
    pawPalGroup.add(pawTailMesh);

    // Floating pulsing medical heart / cross
    const heartGeo = new THREE.OctahedronGeometry(0.08, 0);
    disposableResources.geometries.add(heartGeo);
    const heartMat = new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0xf43f5e,
        emissiveIntensity: 1.8,
        transparent: true,
        opacity: 0.95
    });
    trackMat(pawPalGroup, heartMat);
    pawHeartMesh = new THREE.Mesh(heartGeo, heartMat);
    pawHeartMesh.position.set(0, 0.28, 0.58);
    pawPalGroup.add(pawHeartMesh);

    // =============================================================
    // 7. EcoMentor AI (EM1): Living Bio-Sphere & Wind Energy
    // =============================================================
    ecoMentorGroup = new THREE.Group();
    ecoMentorGroup.visible = false;
    hologramParentGroup.add(ecoMentorGroup);
    createHoloPedestal(ecoMentorGroup, 0x22c55e);

    // Floating Earth globe with wireframe
    const globeGeo = new THREE.SphereGeometry(0.18, 16, 16);
    disposableResources.geometries.add(globeGeo);
    const globeMat = new THREE.MeshStandardMaterial({
        color: 0x15803d,
        emissive: 0x16a34a,
        emissiveIntensity: 0.6,
        roughness: 0.4,
        metalness: 0.3,
        wireframe: true,
        transparent: true,
        opacity: 0.95
    });
    trackMat(ecoMentorGroup, globeMat);

    ecoGlobeMesh = new THREE.Mesh(globeGeo, globeMat);
    ecoGlobeMesh.position.set(-0.1, 0, 0.42);
    ecoMentorGroup.add(ecoGlobeMesh);

    // Turbine tower
    const towerGeo = new THREE.CylinderGeometry(0.02, 0.035, 0.32, 8);
    disposableResources.geometries.add(towerGeo);
    const towerMat = new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0.85 });
    trackMat(ecoMentorGroup, towerMat);
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.set(0.18, 0, 0.4);
    tower.rotation.x = Math.PI / 2;
    ecoMentorGroup.add(tower);

    // Spinning wind turbine blades
    const bladeGeo = new THREE.BoxGeometry(0.03, 0.36, 0.008);
    disposableResources.geometries.add(bladeGeo);
    const turbineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    trackMat(ecoMentorGroup, turbineMat);

    ecoTurbineBlades = new THREE.Mesh(bladeGeo, turbineMat);
    ecoTurbineBlades.position.set(0.18, 0, 0.58);
    ecoMentorGroup.add(ecoTurbineBlades);

    // Orbiting green eco particles
    const partGeo = new THREE.SphereGeometry(0.025, 6, 6);
    disposableResources.geometries.add(partGeo);
    const partMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.9 });
    trackMat(ecoMentorGroup, partMat);
    for (let p = 0; p < 4; p++) {
        const part = new THREE.Mesh(partGeo, partMat);
        ecoMentorGroup.add(part);
        ecoParticles.push(part);
    }

    // =============================================================
    // 8. ML & Systems Reps (ML1): 3D Binary Tree & Traversal Waves
    // =============================================================
    mlDsaGroup = new THREE.Group();
    mlDsaGroup.visible = false;
    hologramParentGroup.add(mlDsaGroup);
    createHoloPedestal(mlDsaGroup, 0xa3e635);

    const nodeGeo = new THREE.SphereGeometry(0.045, 10, 10);
    disposableResources.geometries.add(nodeGeo);
    const nodeMat = new THREE.MeshStandardMaterial({
        color: 0xa3e635,
        emissive: 0x84cc16,
        emissiveIntensity: 1.2,
        roughness: 0.2,
        metalness: 0.8,
        transparent: true,
        opacity: 0.95
    });
    trackMat(mlDsaGroup, nodeMat);

    // Binary search tree nodes (Root, L1, R1, L2a, L2b, R2a, R2b)
    const nodePositions = [
        new THREE.Vector3(0, 0.22, 0.48),      // Root
        new THREE.Vector3(-0.18, 0.08, 0.42),  // Left
        new THREE.Vector3(0.18, 0.08, 0.42),   // Right
        new THREE.Vector3(-0.28, -0.08, 0.36), // Left-Left
        new THREE.Vector3(-0.1, -0.08, 0.36),  // Left-Right
        new THREE.Vector3(0.1, -0.08, 0.36),   // Right-Left
        new THREE.Vector3(0.28, -0.08, 0.36)   // Right-Right
    ];

    nodePositions.forEach(pos => {
        const node = new THREE.Mesh(nodeGeo, nodeMat);
        node.position.copy(pos);
        mlDsaGroup?.add(node);
        treeNodes.push(node);
    });

    // Connecting branches
    const branchPairs = [
        [0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]
    ];
    branchPairs.forEach(([from, to]) => {
        const p1 = nodePositions[from];
        const p2 = nodePositions[to];
        const bPts = [p1, p2];
        const bGeo = new THREE.BufferGeometry().setFromPoints(bPts);
        disposableResources.geometries.add(bGeo);
        const bMat = new THREE.LineBasicMaterial({ color: 0xbef264, transparent: true, opacity: 0.8 });
        trackMat(mlDsaGroup, bMat);
        mlDsaGroup?.add(new THREE.Line(bGeo, bMat));
    });

    // Golden streak commit cube
    const cubeGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    disposableResources.geometries.add(cubeGeo);
    const cubeMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xeab308,
        emissiveIntensity: 1.0,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.95
    });
    trackMat(mlDsaGroup, cubeMat);

    commitCubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
    commitCubeMesh.position.set(0, 0.22, 0.65);
    mlDsaGroup.add(commitCubeMesh);
}

/**
 * Show the visual diorama corresponding to an inspected project.
 * @param {string} projectId e.g. 'crowd-pulse', 'dialora', 'smart-parking', etc.
 * @param {THREE.Vector3} [chipPos] Optional Position of the chip
 */
export function showProjectVisual(projectId, chipPos) {
    if (!hologramParentGroup) return;

    // Hide all dioramas first
    [crowdPulseGroup, dialoraGroup, smartParkingGroup, busItGroup, blueGroundGroup, pawPalGroup, ecoMentorGroup, mlDsaGroup].forEach(grp => {
        if (grp) grp.visible = false;
    });

    activeHoloName = projectId ? projectId.toLowerCase() : '';
    let targetGroup = null;

    if (activeHoloName.includes('crowd') || activeHoloName.includes('pulse') || activeHoloName === 'cp1') {
        targetGroup = crowdPulseGroup;
    } else if (activeHoloName.includes('dialora') || activeHoloName.includes('voice') || activeHoloName === 'dl1') {
        targetGroup = dialoraGroup;
    } else if (activeHoloName.includes('park') || activeHoloName === 'sp1') {
        targetGroup = smartParkingGroup;
    } else if (activeHoloName.includes('bus') || activeHoloName === 'bt1') {
        targetGroup = busItGroup;
    } else if (activeHoloName.includes('blue') || activeHoloName.includes('ground') || activeHoloName === 'aqd1') {
        targetGroup = blueGroundGroup;
    } else if (activeHoloName.includes('paw') || activeHoloName.includes('pet') || activeHoloName === 'px1') {
        targetGroup = pawPalGroup;
    } else if (activeHoloName.includes('eco') || activeHoloName.includes('mentor') || activeHoloName === 'em1') {
        targetGroup = ecoMentorGroup;
    } else if (activeHoloName.includes('ml') || activeHoloName.includes('dsa') || activeHoloName === 'ml1') {
        targetGroup = mlDsaGroup;
    }

    if (targetGroup) {
        // Position on top of the physical chip
        if (chipPos) {
            targetGroup.position.copy(chipPos);
        } else {
            // Find chip position from lookup if not explicitly passed
            const chip = Object.values(projectChips).find(c => 
                (c.data && c.data.id && c.data.id.toLowerCase() === activeHoloName) ||
                (c.data && c.data.ref && c.data.ref.toLowerCase() === activeHoloName)
            );
            if (chip && chip.pos) {
                targetGroup.position.copy(chip.pos);
            }
        }
        targetGroup.visible = true;

        // Ensure materials for this active group are visibly glowing
        const mats = groupMaterialsMap.get(targetGroup) || [];
        mats.forEach(m => {
            gsap.to(m, { opacity: 0.95, duration: 0.35, ease: 'power1.out', overwrite: 'auto' });
        });
    }
}

/**
 * Hide all active project dioramas.
 */
export function hideProjectVisuals() {
    allHoloMaterials.forEach(m => {
        gsap.to(m, { 
            opacity: 0, 
            duration: 0.25, 
            onComplete: () => {
                [crowdPulseGroup, dialoraGroup, smartParkingGroup, busItGroup, blueGroundGroup, pawPalGroup, ecoMentorGroup, mlDsaGroup].forEach(grp => {
                    if (grp) grp.visible = false;
                });
            }
        });
    });
}

/**
 * Update project visuals per frame (natural, physical movement).
 * @param {number} elapsed
 */
export function updateProjectHolograms(elapsed) {
    if (motionPrefs.reduced) return;

    // 1. CrowdPulse: Pedestrians walking across intersection + bounding boxes
    if (crowdPulseGroup && crowdPulseGroup.visible) {
        pedestrianDots.forEach((dot, idx) => {
            const cycle = (elapsed * 0.4 + idx * 0.22) % 1;
            dot.position.x = -0.28 + cycle * 0.56;
            dot.position.z = 0.38 + Math.abs(Math.sin(elapsed * 8 + idx)) * 0.02; // walking bob
            if (pedestrianBoxes[idx]) {
                pedestrianBoxes[idx].position.copy(dot.position);
            }
        });
        if (scanConeMesh) {
            scanConeMesh.rotation.z = elapsed * 1.2;
        }
    }

    // 2. Dialora: Living voice orb breathing & expanding acoustic rings + EQ bars
    if (dialoraGroup && dialoraGroup.visible) {
        if (voiceOrbMesh) {
            const pulse = 1.0 + Math.sin(elapsed * 5) * 0.1;
            voiceOrbMesh.scale.set(pulse, pulse, pulse);
            voiceOrbMesh.rotation.y = elapsed * 0.6;
        }
        soundRings.forEach((ring, idx) => {
            const scale = 0.5 + ((elapsed * 0.8 + idx * 0.3) % 1) * 0.9;
            ring.scale.set(scale, scale, scale);
        });
        eqBars.forEach((bar, idx) => {
            const barH = 0.4 + Math.abs(Math.sin(elapsed * 9 + idx * 1.3)) * 1.2;
            bar.scale.z = barH;
        });
    }

    // 3. Smart Parking: Mini sports car smoothly docking into bay
    if (parkingCarMesh && smartParkingGroup && smartParkingGroup.visible) {
        const t = (Math.sin(elapsed * 1.4) + 1) * 0.5; // 0..1
        parkingCarMesh.position.x = 0.35 - t * 0.17; // pulls into 0.18 bay
        parkingCarMesh.position.y = -0.12 - (1 - t) * 0.04;
    }

    // 4. BusIT: Electric shuttle cruising along GPS highway curve
    if (busMarkerMesh && busItGroup && busItGroup.visible) {
        const t = (elapsed * 0.25) % 1;
        const p0x = -0.38, p0y = -0.3;
        const p1x = 0.0, p1y = 0.38;
        const p2x = 0.38, p2y = -0.3;
        const inv = 1 - t;
        busMarkerMesh.position.x = inv * inv * p0x + 2 * inv * t * p1x + t * t * p2x;
        busMarkerMesh.position.y = inv * inv * p0y + 2 * inv * t * p1y + t * t * p2y;
        busMarkerMesh.rotation.z = Math.atan2(
            2 * (1 - t) * (p1y - p0y) + 2 * t * (p2y - p1y),
            2 * (1 - t) * (p1x - p0x) + 2 * t * (p2x - p1x)
        );
    }

    // 5. Blue_Ground: Levitating purified water droplet & ripples
    if (blueGroundGroup && blueGroundGroup.visible) {
        if (solarDropletMesh) {
            solarDropletMesh.position.z = 0.52 + Math.sin(elapsed * 3) * 0.03;
        }
        dropletRipples.forEach((rip, idx) => {
            const rScale = 0.6 + ((elapsed * 1.2 + idx * 0.5) % 1) * 1.2;
            rip.scale.set(rScale, rScale, rScale);
        });
    }

    // 6. PawPal: Expressive pet companion wagging tail & heart pulse
    if (pawPalGroup && pawPalGroup.visible) {
        if (pawTailMesh) pawTailMesh.rotation.z = Math.sin(elapsed * 12) * 0.45;
        if (pawHeadGroup) pawHeadGroup.rotation.y = Math.sin(elapsed * 2.2) * 0.3;
        if (pawHeartMesh) {
            const hPulse = 1.0 + Math.abs(Math.sin(elapsed * 6)) * 0.25;
            pawHeartMesh.scale.set(hPulse, hPulse, hPulse);
            pawHeartMesh.rotation.y = elapsed * 1.5;
        }
    }

    // 7. EcoMentor AI: Rotating wind turbine blades & floating eco-globe
    if (ecoMentorGroup && ecoMentorGroup.visible) {
        if (ecoTurbineBlades) ecoTurbineBlades.rotation.z = elapsed * 9;
        if (ecoGlobeMesh) ecoGlobeMesh.rotation.y = elapsed * 0.5;
        ecoParticles.forEach((part, idx) => {
            const angle = elapsed * 1.8 + idx * (Math.PI / 2);
            part.position.set(
                -0.1 + Math.cos(angle) * 0.28,
                Math.sin(angle) * 0.28,
                0.42 + Math.sin(angle * 2) * 0.08
            );
        });
    }

    // 8. ML & Systems Reps: Binary tree BFS wave pulse & rotating commit cube
    if (mlDsaGroup && mlDsaGroup.visible) {
        treeNodes.forEach((node, idx) => {
            const wave = Math.sin(elapsed * 6 - idx * 0.9);
            node.scale.setScalar(wave > 0.4 ? 1.35 : 1.0);
        });
        if (commitCubeMesh) {
            commitCubeMesh.rotation.x = elapsed * 1.4;
            commitCubeMesh.rotation.y = elapsed * 1.8;
        }
    }
}
