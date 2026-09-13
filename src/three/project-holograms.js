// @ts-check
// ============================================================
// 3D Realistic Project Storytelling Dioramas
// Dedicated, rich, physical 3D models and realistic animations for
// each of Parameshwaran's 8 projects (FlyRank is classified as an Internship):
// 1. CrowdPulse (CP1): Realistic crosswalk with 5 articulated walking pedestrians & CV scanner
// 2. Dialora (DL1): Studio broadcast microphone with 16-bar circular audio spectrum & acoustic waves
// 3. Smart Parking (SP1): Multi-stall garage with opening boom barrier, red/green bays & docking sports car
// 4. BusIT (BT1): Curving highway with transit station, articulated shuttle bus & GPS satellite beacon
// 5. Blue_Ground (AQD1): Dual-axis tracking solar array, multi-stage acrylic filter & dripping water physics
// 6. PawPal (PX1): Articulated robotic pet companion with gaze tracking, breathing, wagging tail & vital heart
// 7. EcoMentor AI (EM1): Eco-island with spinning 3-blade wind turbine, dual-layer Earth globe & photon orbits
// 8. ML & Systems Reps (ML1): 3-tier deep neural network lattice with forward propagation waves & golden streak cube
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

// ─── Sub-element animation handles ──────────────────────────

// 1. CrowdPulse handles
/** @typedef {{ group: THREE.Group, body: THREE.Mesh, head: THREE.Mesh, armL: THREE.Mesh, armR: THREE.Mesh, legL: THREE.Mesh, legR: THREE.Mesh, bbox: THREE.Mesh, tag: THREE.Mesh, speed: number, phase: number }} Pedestrian */
/** @type {Pedestrian[]} */
const pedestrians = [];
/** @type {THREE.Mesh | null} */
let cctvBeamMesh = null;
/** @type {THREE.Group | null} */
let cctvCameraHead = null;

// 2. Dialora handles
/** @type {THREE.Group | null} */
let studioMicGroup = null;
/** @type {THREE.Mesh[]} */
const soundRings = [];
/** @type {THREE.Mesh[]} */
const eqBars = [];
/** @type {THREE.Mesh | null} */
let micStatusRing = null;

// 3. Smart Parking handles
/** @type {THREE.Group | null} */
let parkingCarGroup = null;
/** @type {THREE.Mesh[]} */
const carWheels = [];
/** @type {THREE.Group | null} */
let barrierGateArm = null;
/** @type {THREE.Mesh | null} */
let vacantBayLight = null;

// 4. BusIT handles
/** @type {THREE.Group | null} */
let shuttleBusGroup = null;
/** @type {THREE.Mesh[]} */
const busWheels = [];
/** @type {THREE.Mesh[]} */
const gpsBeacons = [];

// 5. Blue_Ground handles
/** @type {THREE.Group | null} */
let solarTrackerGroup = null;
/** @type {THREE.Mesh | null} */
let waterDropMesh = null;
/** @type {THREE.Mesh[]} */
const dropletRipples = [];
/** @type {THREE.Mesh[]} */
const waterProbes = [];

// 6. PawPal handles
/** @type {THREE.Group | null} */
let roboPupGroup = null;
/** @type {THREE.Mesh | null} */
let pawBodyMesh = null;
/** @type {THREE.Group | null} */
let pawHeadGroup = null;
/** @type {THREE.Mesh | null} */
let pawTailMesh = null;
/** @type {THREE.Mesh[]} */
const pawLegs = [];
/** @type {THREE.Mesh | null} */
let pawHeartMesh = null;
/** @type {THREE.Mesh[]} */
const medicalCrosses = [];

// 7. EcoMentor handles
/** @type {THREE.Group | null} */
let ecoTurbineBlades = null;
/** @type {THREE.Group | null} */
let ecoGlobeGroup = null;
/** @type {THREE.Mesh | null} */
let ecoAtmoMesh = null;
/** @type {THREE.Mesh[]} */
const ecoParticles = [];

// 8. ML Reps handles
/** @type {Array<{ mesh: THREE.Mesh, mat: THREE.MeshStandardMaterial, layer: number }>} */
const neuralNodes = [];
/** @type {THREE.Line[]} */
const neuralSynapses = [];
/** @type {THREE.Mesh | null} */
let commitCubeMesh = null;
/** @type {THREE.Points | null} */
let commitSparks = null;

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
    const geo = new THREE.CylinderGeometry(0.35, 0.48, 0.35, 16, 1, true);
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
    // 1. CrowdPulse (CP1): Realistic Crosswalk Plaza & CV Detection
    // =============================================================
    crowdPulseGroup = new THREE.Group();
    crowdPulseGroup.visible = false;
    hologramParentGroup.add(crowdPulseGroup);
    createHoloPedestal(crowdPulseGroup, 0x38bdf8);

    // Realistic Asphalt Road Slab
    const roadPlazaGeo = new THREE.BoxGeometry(0.85, 0.75, 0.04);
    disposableResources.geometries.add(roadPlazaGeo);
    const roadPlazaMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.85,
        metalness: 0.1,
        transparent: true,
        opacity: 0.95
    });
    trackMat(crowdPulseGroup, roadPlazaMat);
    const roadPlaza = new THREE.Mesh(roadPlazaGeo, roadPlazaMat);
    roadPlaza.position.set(0, 0, 0.3);
    crowdPulseGroup.add(roadPlaza);

    // Sidewalk Curbs
    const curbGeo = new THREE.BoxGeometry(0.85, 0.12, 0.06);
    disposableResources.geometries.add(curbGeo);
    const curbMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.7,
        metalness: 0.2,
        transparent: true,
        opacity: 0.95
    });
    trackMat(crowdPulseGroup, curbMat);
    const curbTop = new THREE.Mesh(curbGeo, curbMat);
    curbTop.position.set(0, 0.34, 0.32);
    const curbBottom = new THREE.Mesh(curbGeo, curbMat);
    curbBottom.position.set(0, -0.34, 0.32);
    crowdPulseGroup.add(curbTop, curbBottom);

    // High-visibility zebra crossing lines
    const zebraGeo = new THREE.BoxGeometry(0.08, 0.44, 0.005);
    disposableResources.geometries.add(zebraGeo);
    const zebraMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.4,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.95
    });
    trackMat(crowdPulseGroup, zebraMat);
    for (let x = -0.32; x <= 0.32; x += 0.16) {
        const stripe = new THREE.Mesh(zebraGeo, zebraMat);
        stripe.position.set(x, 0, 0.325);
        crowdPulseGroup.add(stripe);
    }

    // Traffic light pole & CCTV security camera
    const poleGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.48, 8);
    disposableResources.geometries.add(poleGeo);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.8, transparent: true, opacity: 0.95 });
    trackMat(crowdPulseGroup, poleMat);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0.36, 0.28, 0.48);
    pole.rotation.x = Math.PI / 2;
    crowdPulseGroup.add(pole);

    cctvCameraHead = new THREE.Group();
    cctvCameraHead.position.set(0.36, 0.28, 0.72);
    crowdPulseGroup.add(cctvCameraHead);

    const camBodyGeo = new THREE.BoxGeometry(0.08, 0.05, 0.05);
    disposableResources.geometries.add(camBodyGeo);
    const camBody = new THREE.Mesh(camBodyGeo, poleMat);
    cctvCameraHead.add(camBody);

    // Sweeping volumetric CCTV scan cone
    const cctvConeGeo = new THREE.ConeGeometry(0.35, 0.55, 16, 1, true);
    disposableResources.geometries.add(cctvConeGeo);
    const cctvBeamMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending
    });
    trackMat(crowdPulseGroup, cctvBeamMat);
    cctvBeamMesh = new THREE.Mesh(cctvConeGeo, cctvBeamMat);
    cctvBeamMesh.rotation.x = -Math.PI * 0.7;
    cctvBeamMesh.position.set(0, -0.2, -0.25);
    cctvCameraHead.add(cctvBeamMesh);

    // 5 Articulated walking 3D pedestrians with bounding boxes & tags
    const torsoGeo = new THREE.BoxGeometry(0.05, 0.035, 0.08);
    const headGeo = new THREE.SphereGeometry(0.026, 8, 8);
    const limbGeo = new THREE.CylinderGeometry(0.009, 0.008, 0.07, 6);
    limbGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(torsoGeo);
    disposableResources.geometries.add(headGeo);
    disposableResources.geometries.add(limbGeo);

    const pColors = [0x0ea5e9, 0xf59e0b, 0x10b981, 0xa855f7, 0xec4899];
    const bboxGeo = new THREE.BoxGeometry(0.12, 0.09, 0.19);
    disposableResources.geometries.add(bboxGeo);
    const tagGeo = new THREE.SphereGeometry(0.016, 6, 6);
    disposableResources.geometries.add(tagGeo);

    const bboxMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.85 });
    const tagMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.95 });
    trackMat(crowdPulseGroup, bboxMat);
    trackMat(crowdPulseGroup, tagMat);

    for (let i = 0; i < 5; i++) {
        const pMat = new THREE.MeshStandardMaterial({
            color: pColors[i],
            roughness: 0.4,
            metalness: 0.2,
            transparent: true,
            opacity: 0.95
        });
        trackMat(crowdPulseGroup, pMat);

        const pGroup = new THREE.Group();
        const body = new THREE.Mesh(torsoGeo, pMat);
        body.position.set(0, 0, 0.09);
        const head = new THREE.Mesh(headGeo, pMat);
        head.position.set(0, 0, 0.16);

        const armL = new THREE.Mesh(limbGeo, pMat);
        armL.position.set(-0.035, 0, 0.09);
        const armR = new THREE.Mesh(limbGeo, pMat);
        armR.position.set(0.035, 0, 0.09);

        const legL = new THREE.Mesh(limbGeo, pMat);
        legL.position.set(-0.02, 0, 0.035);
        const legR = new THREE.Mesh(limbGeo, pMat);
        legR.position.set(0.02, 0, 0.035);

        const bbox = new THREE.Mesh(bboxGeo, bboxMat);
        bbox.position.set(0, 0, 0.1);

        const tag = new THREE.Mesh(tagGeo, tagMat);
        tag.position.set(0, 0, 0.22);

        pGroup.add(body, head, armL, armR, legL, legR, bbox, tag);
        pGroup.position.set(-0.35 + i * 0.16, (i % 2 === 0 ? 0.08 : -0.08), 0.32);
        crowdPulseGroup.add(pGroup);

        pedestrians.push({
            group: pGroup,
            body,
            head,
            armL,
            armR,
            legL,
            legR,
            bbox,
            tag,
            speed: 0.35 + (i % 3) * 0.12,
            phase: i * 1.4
        });
    }

    // =============================================================
    // 2. Dialora (DL1): Studio Broadcast Mic & Circular 3D Spectrum
    // =============================================================
    dialoraGroup = new THREE.Group();
    dialoraGroup.visible = false;
    hologramParentGroup.add(dialoraGroup);
    createHoloPedestal(dialoraGroup, 0xf97316);

    // Studio Microphone Stand
    studioMicGroup = new THREE.Group();
    studioMicGroup.position.set(0, 0, 0.35);
    dialoraGroup.add(studioMicGroup);

    // Cast metal base
    const micBaseGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.025, 16);
    disposableResources.geometries.add(micBaseGeo);
    const micMetalMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        roughness: 0.2,
        metalness: 0.9,
        transparent: true,
        opacity: 0.95
    });
    trackMat(dialoraGroup, micMetalMat);
    const micBase = new THREE.Mesh(micBaseGeo, micMetalMat);
    micBase.rotation.x = Math.PI / 2;
    studioMicGroup.add(micBase);

    // Chrome stem & shockmount
    const micStemGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.22, 10);
    disposableResources.geometries.add(micStemGeo);
    const micStem = new THREE.Mesh(micStemGeo, micMetalMat);
    micStem.position.set(0, 0, 0.12);
    micStem.rotation.x = Math.PI / 2;
    studioMicGroup.add(micStem);

    // Mic Capsule with glowing wire-mesh acoustic grille
    const micCapsuleGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.14, 16);
    disposableResources.geometries.add(micCapsuleGeo);
    const micGrilleMat = new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xf97316,
        emissiveIntensity: 1.2,
        roughness: 0.3,
        metalness: 0.7,
        wireframe: true,
        transparent: true,
        opacity: 0.95
    });
    trackMat(dialoraGroup, micGrilleMat);
    const micCapsule = new THREE.Mesh(micCapsuleGeo, micGrilleMat);
    micCapsule.position.set(0, 0, 0.28);
    micCapsule.rotation.x = Math.PI / 2;
    studioMicGroup.add(micCapsule);

    // Mic voice status ring
    const statusRingGeo = new THREE.RingGeometry(0.06, 0.08, 24);
    disposableResources.geometries.add(statusRingGeo);
    const statusRingMat = new THREE.MeshBasicMaterial({ color: 0xfdba74, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    trackMat(dialoraGroup, statusRingMat);
    micStatusRing = new THREE.Mesh(statusRingGeo, statusRingMat);
    micStatusRing.position.set(0, 0, 0.21);
    studioMicGroup.add(micStatusRing);

    // 16-Bar Circular Stadium Equalizer Visualizer
    const barGeo = new THREE.BoxGeometry(0.025, 0.025, 0.2);
    disposableResources.geometries.add(barGeo);
    const barMat = new THREE.MeshStandardMaterial({
        color: 0xfb923c,
        emissive: 0xf97316,
        emissiveIntensity: 1.1,
        transparent: true,
        opacity: 0.95
    });
    trackMat(dialoraGroup, barMat);

    const eqRadius = 0.32;
    for (let b = 0; b < 16; b++) {
        const theta = (b / 16) * Math.PI * 2;
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.set(Math.cos(theta) * eqRadius, Math.sin(theta) * eqRadius, 0.38);
        dialoraGroup.add(bar);
        eqBars.push(bar);
    }

    // Expanding spherical acoustic wavefront rings
    const acousticGeo = new THREE.RingGeometry(0.18, 0.22, 32);
    disposableResources.geometries.add(acousticGeo);
    const acousticMat = new THREE.MeshBasicMaterial({
        color: 0xfd8a36,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending
    });
    trackMat(dialoraGroup, acousticMat);
    for (let r = 0; r < 3; r++) {
        const ring = new THREE.Mesh(acousticGeo, acousticMat);
        ring.position.set(0, 0, 0.5);
        dialoraGroup.add(ring);
        soundRings.push(ring);
    }

    // =============================================================
    // 3. Smart Parking (SP1): Multi-Bay Garage with Opening Barrier
    // =============================================================
    smartParkingGroup = new THREE.Group();
    smartParkingGroup.visible = false;
    hologramParentGroup.add(smartParkingGroup);
    createHoloPedestal(smartParkingGroup, 0xeab308);

    // Concrete Parking Deck Slab with access lane
    const deckGeo = new THREE.BoxGeometry(0.85, 0.65, 0.04);
    disposableResources.geometries.add(deckGeo);
    const deckMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.7,
        metalness: 0.2,
        transparent: true,
        opacity: 0.95
    });
    trackMat(smartParkingGroup, deckMat);
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.position.set(0, 0, 0.3);
    smartParkingGroup.add(deckMesh);

    // Barrier arm pedestal
    const barrierBaseGeo = new THREE.BoxGeometry(0.06, 0.06, 0.16);
    disposableResources.geometries.add(barrierBaseGeo);
    const barrierBaseMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3, metalness: 0.5, transparent: true, opacity: 0.95 });
    trackMat(smartParkingGroup, barrierBaseMat);
    const barrierBase = new THREE.Mesh(barrierBaseGeo, barrierBaseMat);
    barrierBase.position.set(0.35, -0.26, 0.38);
    smartParkingGroup.add(barrierBase);

    // Articulated Barrier Arm that raises and lowers
    barrierGateArm = new THREE.Group();
    barrierGateArm.position.set(0.35, -0.26, 0.44);
    smartParkingGroup.add(barrierGateArm);

    const armBarGeo = new THREE.BoxGeometry(0.24, 0.015, 0.02);
    disposableResources.geometries.add(armBarGeo);
    const armBarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xef4444, emissiveIntensity: 0.6, transparent: true, opacity: 0.95 });
    trackMat(smartParkingGroup, armBarMat);
    const armBar = new THREE.Mesh(armBarGeo, armBarMat);
    armBar.position.set(-0.12, 0, 0);
    barrierGateArm.add(armBar);

    // 4 Numbered Parking Bays: 3 red (occupied), 1 green (vacant)
    const bayTileGeo = new THREE.BoxGeometry(0.18, 0.26, 0.01);
    disposableResources.geometries.add(bayTileGeo);
    const redOccupiedMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 });
    const greenVacantMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x16a34a, emissiveIntensity: 0.9, transparent: true, opacity: 0.95 });
    trackMat(smartParkingGroup, redOccupiedMat);
    trackMat(smartParkingGroup, greenVacantMat);

    // Bays 1, 2, 3: occupied with mini parked silhouette blocks
    const parkedCarGeo = new THREE.BoxGeometry(0.14, 0.22, 0.07);
    disposableResources.geometries.add(parkedCarGeo);
    const parkedCarMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4, metalness: 0.6, transparent: true, opacity: 0.9 });
    trackMat(smartParkingGroup, parkedCarMat);

    const bayCoords = [
        { x: -0.28, y: 0.16, occupied: true },
        { x: -0.08, y: 0.16, occupied: true },
        { x: 0.12, y: 0.16, occupied: true },
        { x: -0.28, y: -0.16, occupied: false } // Open bay where sports car parks
    ];

    bayCoords.forEach(c => {
        const tile = new THREE.Mesh(bayTileGeo, c.occupied ? redOccupiedMat : greenVacantMat);
        tile.position.set(c.x, c.y, 0.325);
        smartParkingGroup?.add(tile);
        if (c.occupied) {
            const parked = new THREE.Mesh(parkedCarGeo, parkedCarMat);
            parked.position.set(c.x, c.y, 0.365);
            smartParkingGroup?.add(parked);
        } else {
            vacantBayLight = tile;
        }
    });

    // Highly-detailed 3D Autonomous Sports Car
    parkingCarGroup = new THREE.Group();
    parkingCarGroup.position.set(0.35, -0.16, 0.36);
    smartParkingGroup.add(parkingCarGroup);

    const carChassisGeo = new THREE.BoxGeometry(0.18, 0.11, 0.045);
    disposableResources.geometries.add(carChassisGeo);
    const carPaintMat = new THREE.MeshStandardMaterial({
        color: 0xeab308,
        emissive: 0xca8a04,
        emissiveIntensity: 0.5,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.95
    });
    trackMat(smartParkingGroup, carPaintMat);
    const carChassis = new THREE.Mesh(carChassisGeo, carPaintMat);
    carChassis.position.set(0, 0, 0.025);
    parkingCarGroup.add(carChassis);

    // Tinted windshield greenhouse
    const carRoofGeo = new THREE.BoxGeometry(0.1, 0.08, 0.035);
    disposableResources.geometries.add(carRoofGeo);
    const carGlassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.9 });
    trackMat(smartParkingGroup, carGlassMat);
    const carRoof = new THREE.Mesh(carRoofGeo, carGlassMat);
    carRoof.position.set(-0.02, 0, 0.06);
    parkingCarGroup.add(carRoof);

    // 4 Spinning wheels
    const wheelGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10);
    wheelGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(wheelGeo);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8, transparent: true, opacity: 0.95 });
    trackMat(smartParkingGroup, wheelMat);

    const wheelOffsets = [
        { x: -0.06, y: -0.055 },
        { x: 0.06, y: -0.055 },
        { x: -0.06, y: 0.055 },
        { x: 0.06, y: 0.055 }
    ];
    wheelOffsets.forEach(w => {
        const wh = new THREE.Mesh(wheelGeo, wheelMat);
        wh.position.set(w.x, w.y, 0.015);
        parkingCarGroup?.add(wh);
        carWheels.push(wh);
    });

    // Glowing front LED headlights
    const lightGeo = new THREE.SphereGeometry(0.012, 6, 6);
    disposableResources.geometries.add(lightGeo);
    const headLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    trackMat(smartParkingGroup, headLightMat);
    const hl1 = new THREE.Mesh(lightGeo, headLightMat);
    hl1.position.set(0.09, -0.035, 0.03);
    const hl2 = new THREE.Mesh(lightGeo, headLightMat);
    hl2.position.set(0.09, 0.035, 0.03);
    parkingCarGroup.add(hl1, hl2);

    // =============================================================
    // 4. BusIT (BT1): Curving Transit Highway & Electric Shuttle Bus
    // =============================================================
    busItGroup = new THREE.Group();
    busItGroup.visible = false;
    hologramParentGroup.add(busItGroup);
    createHoloPedestal(busItGroup, 0x22c55e);

    // 3D Curved Double-Lane Highway Route
    const highwayCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.4, -0.32, 0.34),
        new THREE.Vector3(0.0, 0.42, 0.34),
        new THREE.Vector3(0.4, -0.32, 0.34)
    );
    const hPoints = highwayCurve.getPoints(40);
    const highwayGeo = new THREE.BufferGeometry().setFromPoints(hPoints);
    disposableResources.geometries.add(highwayGeo);
    const highwayMat = new THREE.LineBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending
    });
    trackMat(busItGroup, highwayMat);
    busItGroup.add(new THREE.Line(highwayGeo, highwayMat));

    // Outer guardrail
    const outerCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.45, -0.34, 0.36),
        new THREE.Vector3(0.0, 0.47, 0.36),
        new THREE.Vector3(0.45, -0.34, 0.36)
    );
    const outGeo = new THREE.BufferGeometry().setFromPoints(outerCurve.getPoints(40));
    disposableResources.geometries.add(outGeo);
    const guardMat = new THREE.LineBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.65 });
    trackMat(busItGroup, guardMat);
    busItGroup.add(new THREE.Line(outGeo, guardMat));

    // Modern glass canopy transit station
    const stationGroup = new THREE.Group();
    stationGroup.position.set(0.0, 0.32, 0.34);
    busItGroup.add(stationGroup);

    const shelterPillarGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8);
    disposableResources.geometries.add(shelterPillarGeo);
    const shelterMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.2, metalness: 0.8, transparent: true, opacity: 0.95 });
    trackMat(busItGroup, shelterMat);
    const pL = new THREE.Mesh(shelterPillarGeo, shelterMat);
    pL.position.set(-0.1, 0, 0.08);
    pL.rotation.x = Math.PI / 2;
    const pR = new THREE.Mesh(shelterPillarGeo, shelterMat);
    pR.position.set(0.1, 0, 0.08);
    pR.rotation.x = Math.PI / 2;
    stationGroup.add(pL, pR);

    const canopyGeo = new THREE.BoxGeometry(0.25, 0.1, 0.01);
    disposableResources.geometries.add(canopyGeo);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.1, transparent: true, opacity: 0.75 });
    trackMat(busItGroup, canopyMat);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0, 0.16);
    stationGroup.add(canopy);

    // Highly-detailed Mini Campus Electric Shuttle Bus
    shuttleBusGroup = new THREE.Group();
    busItGroup.add(shuttleBusGroup);

    const busBodyGeo = new THREE.BoxGeometry(0.19, 0.09, 0.08);
    disposableResources.geometries.add(busBodyGeo);
    const busBodyMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.2,
        metalness: 0.5,
        transparent: true,
        opacity: 0.95
    });
    trackMat(busItGroup, busBodyMat);
    const busBody = new THREE.Mesh(busBodyGeo, busBodyMat);
    busBody.position.set(0, 0, 0.04);
    shuttleBusGroup.add(busBody);

    // Panoramic side and front windows
    const busGlassGeo = new THREE.BoxGeometry(0.16, 0.094, 0.035);
    disposableResources.geometries.add(busGlassGeo);
    const busGlassMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.85 });
    trackMat(busItGroup, busGlassMat);
    const busGlass = new THREE.Mesh(busGlassGeo, busGlassMat);
    busGlass.position.set(0.01, 0, 0.055);
    shuttleBusGroup.add(busGlass);

    // Rooftop GPS dome
    const gpsDomeGeo = new THREE.SphereGeometry(0.022, 8, 8);
    disposableResources.geometries.add(gpsDomeGeo);
    const gpsDomeMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.95 });
    trackMat(busItGroup, gpsDomeMat);
    const gpsDome = new THREE.Mesh(gpsDomeGeo, gpsDomeMat);
    gpsDome.position.set(0, 0, 0.09);
    shuttleBusGroup.add(gpsDome);

    // GPS Telemetry beacon rings radiating upward
    const beaconGeo = new THREE.RingGeometry(0.04, 0.06, 16);
    disposableResources.geometries.add(beaconGeo);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    trackMat(busItGroup, beaconMat);
    for (let k = 0; k < 2; k++) {
        const bRing = new THREE.Mesh(beaconGeo, beaconMat);
        bRing.position.set(0, 0, 0.1 + k * 0.05);
        shuttleBusGroup.add(bRing);
        gpsBeacons.push(bRing);
    }

    // Bus wheels
    for (let i = 0; i < 4; i++) {
        const bWheel = new THREE.Mesh(wheelGeo, wheelMat);
        const wx = i % 2 === 0 ? -0.06 : 0.06;
        const wy = i < 2 ? -0.048 : 0.048;
        bWheel.position.set(wx, wy, 0.015);
        shuttleBusGroup.add(bWheel);
        busWheels.push(bWheel);
    }

    // =============================================================
    // 5. Blue_Ground (AQD1): Solar IoT Purification & Dripping Fluid
    // =============================================================
    blueGroundGroup = new THREE.Group();
    blueGroundGroup.visible = false;
    hologramParentGroup.add(blueGroundGroup);
    createHoloPedestal(blueGroundGroup, 0x0284c7);

    // Dual-axis articulated photovoltaic solar array
    solarTrackerGroup = new THREE.Group();
    solarTrackerGroup.position.set(-0.18, 0, 0.42);
    blueGroundGroup.add(solarTrackerGroup);

    const panelGeo = new THREE.BoxGeometry(0.35, 0.22, 0.015);
    disposableResources.geometries.add(panelGeo);
    const panelMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0369a1,
        emissiveIntensity: 0.6,
        roughness: 0.15,
        metalness: 0.9,
        transparent: true,
        opacity: 0.95
    });
    trackMat(blueGroundGroup, panelMat);
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.rotation.x = -0.35;
    solarTrackerGroup.add(panel);

    // Multi-stage acrylic filtration cylinder
    const vesselGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.32, 16);
    disposableResources.geometries.add(vesselGeo);
    const vesselMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.05,
        metalness: 0.1,
        transparent: true,
        opacity: 0.45,
        wireframe: false
    });
    trackMat(blueGroundGroup, vesselMat);
    const vessel = new THREE.Mesh(vesselGeo, vesselMat);
    vessel.position.set(0.22, 0, 0.48);
    vessel.rotation.x = Math.PI / 2;
    blueGroundGroup.add(vessel);

    // Layered filter media (gravel, carbon, membrane)
    const mediaGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 16);
    disposableResources.geometries.add(mediaGeo);
    const carbonMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8, transparent: true, opacity: 0.85 });
    trackMat(blueGroundGroup, carbonMat);
    const carbonLayer = new THREE.Mesh(mediaGeo, carbonMat);
    carbonLayer.position.set(0.22, 0, 0.42);
    carbonLayer.rotation.x = Math.PI / 2;
    blueGroundGroup.add(carbonLayer);

    // Purified water droplet (falls with gravity acceleration)
    const dropGeo = new THREE.SphereGeometry(0.038, 12, 12);
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
    waterDropMesh = new THREE.Mesh(dropGeo, dropMat);
    waterDropMesh.position.set(0.22, 0, 0.65);
    blueGroundGroup.add(waterDropMesh);

    // Concentric expanding impact ripple rings
    const ripGeo = new THREE.RingGeometry(0.05, 0.08, 20);
    disposableResources.geometries.add(ripGeo);
    const ripMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, side: THREE.DoubleSide, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    trackMat(blueGroundGroup, ripMat);
    for (let r = 0; r < 2; r++) {
        const rip = new THREE.Mesh(ripGeo, ripMat);
        rip.position.set(0.22, 0, 0.35);
        blueGroundGroup.add(rip);
        dropletRipples.push(rip);
    }

    // 5 IoT telemetry ADC sensor probes
    const probeGeo = new THREE.SphereGeometry(0.016, 6, 6);
    disposableResources.geometries.add(probeGeo);
    const probeMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.95 });
    trackMat(blueGroundGroup, probeMat);
    for (let p = 0; p < 5; p++) {
        const pr = new THREE.Mesh(probeGeo, probeMat);
        pr.position.set(0.35, -0.12 + p * 0.06, 0.46);
        blueGroundGroup.add(pr);
        waterProbes.push(pr);
    }

    // =============================================================
    // 6. PawPal (PX1): Articulated Robotic Pet Companion & Heart HUD
    // =============================================================
    pawPalGroup = new THREE.Group();
    pawPalGroup.visible = false;
    hologramParentGroup.add(pawPalGroup);
    createHoloPedestal(pawPalGroup, 0xa855f7);

    roboPupGroup = new THREE.Group();
    roboPupGroup.position.set(0, 0, 0.32);
    pawPalGroup.add(roboPupGroup);

    const roboMat = new THREE.MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0x7e22ce,
        emissiveIntensity: 0.6,
        roughness: 0.3,
        metalness: 0.7,
        transparent: true,
        opacity: 0.95
    });
    trackMat(pawPalGroup, roboMat);

    // Torso body
    const pupBodyGeo = new THREE.BoxGeometry(0.18, 0.26, 0.14);
    disposableResources.geometries.add(pupBodyGeo);
    pawBodyMesh = new THREE.Mesh(pupBodyGeo, roboMat);
    pawBodyMesh.position.set(0, 0, 0.1);
    roboPupGroup.add(pawBodyMesh);

    // Articulated neck & head
    pawHeadGroup = new THREE.Group();
    pawHeadGroup.position.set(0, 0.14, 0.2);
    roboPupGroup.add(pawHeadGroup);

    const pupHeadGeo = new THREE.BoxGeometry(0.14, 0.13, 0.12);
    disposableResources.geometries.add(pupHeadGeo);
    const pupHead = new THREE.Mesh(pupHeadGeo, roboMat);
    pawHeadGroup.add(pupHead);

    // Cute ears
    const earGeo = new THREE.ConeGeometry(0.035, 0.09, 4);
    disposableResources.geometries.add(earGeo);
    const eL = new THREE.Mesh(earGeo, roboMat);
    eL.position.set(-0.06, 0.04, 0.08);
    const eR = new THREE.Mesh(earGeo, roboMat);
    eR.position.set(0.06, 0.04, 0.08);
    pawHeadGroup.add(eL, eR);

    // OLED digital eyes display faceplate
    const eyeDisplayGeo = new THREE.BoxGeometry(0.1, 0.02, 0.04);
    disposableResources.geometries.add(eyeDisplayGeo);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.95 });
    trackMat(pawPalGroup, eyeMat);
    const eyes = new THREE.Mesh(eyeDisplayGeo, eyeMat);
    eyes.position.set(0, 0.07, 0.01);
    pawHeadGroup.add(eyes);

    // 4 Articulated legs
    const legGeo = new THREE.CylinderGeometry(0.02, 0.016, 0.11, 8);
    legGeo.rotateX(Math.PI / 2);
    disposableResources.geometries.add(legGeo);

    const legPositions = [
        { x: -0.07, y: 0.09 },
        { x: 0.07, y: 0.09 },
        { x: -0.07, y: -0.09 },
        { x: 0.07, y: -0.09 }
    ];
    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeo, roboMat);
        leg.position.set(pos.x, pos.y, 0.04);
        roboPupGroup?.add(leg);
        pawLegs.push(leg);
    });

    // Wagging tail
    const tailGeo = new THREE.BoxGeometry(0.03, 0.12, 0.03);
    disposableResources.geometries.add(tailGeo);
    pawTailMesh = new THREE.Mesh(tailGeo, roboMat);
    pawTailMesh.position.set(0, -0.16, 0.12);
    roboPupGroup.add(pawTailMesh);

    // 3D Beating holographic medical heart
    const heartGeo = new THREE.OctahedronGeometry(0.085, 0);
    disposableResources.geometries.add(heartGeo);
    const heartMat = new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0xe11d48,
        emissiveIntensity: 1.8,
        roughness: 0.2,
        metalness: 0.6,
        transparent: true,
        opacity: 0.95
    });
    trackMat(pawPalGroup, heartMat);
    pawHeartMesh = new THREE.Mesh(heartGeo, heartMat);
    pawHeartMesh.position.set(0, 0.22, 0.58);
    pawPalGroup.add(pawHeartMesh);

    // Floating healthcare cross badges
    const crossGeo = new THREE.BoxGeometry(0.02, 0.06, 0.01);
    disposableResources.geometries.add(crossGeo);
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
    trackMat(pawPalGroup, crossMat);
    for (let c = 0; c < 2; c++) {
        const cr = new THREE.Mesh(crossGeo, crossMat);
        cr.position.set(c === 0 ? -0.22 : 0.22, 0.15, 0.52);
        pawPalGroup.add(cr);
        medicalCrosses.push(cr);
    }

    // =============================================================
    // 7. EcoMentor AI (EM1): Living Eco-Isle, Turbine & Dual Globe
    // =============================================================
    ecoMentorGroup = new THREE.Group();
    ecoMentorGroup.visible = false;
    hologramParentGroup.add(ecoMentorGroup);
    createHoloPedestal(ecoMentorGroup, 0x22c55e);

    // Miniature Eco-Isle Terrain Base
    const islandGeo = new THREE.CylinderGeometry(0.38, 0.45, 0.05, 12);
    disposableResources.geometries.add(islandGeo);
    const islandMat = new THREE.MeshStandardMaterial({
        color: 0x14532d,
        roughness: 0.8,
        metalness: 0.1,
        transparent: true,
        opacity: 0.95
    });
    trackMat(ecoMentorGroup, islandMat);
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.set(0, 0, 0.3);
    island.rotation.x = Math.PI / 2;
    ecoMentorGroup.add(island);

    // Realistic Industrial Wind Turbine
    const turbineGroup = new THREE.Group();
    turbineGroup.position.set(0.18, 0, 0.32);
    ecoMentorGroup.add(turbineGroup);

    // Tapered tower
    const towerGeo = new THREE.CylinderGeometry(0.016, 0.028, 0.38, 10);
    disposableResources.geometries.add(towerGeo);
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2, metalness: 0.4, transparent: true, opacity: 0.95 });
    trackMat(ecoMentorGroup, whiteMat);
    const tower = new THREE.Mesh(towerGeo, whiteMat);
    tower.position.set(0, 0, 0.19);
    tower.rotation.x = Math.PI / 2;
    turbineGroup.add(tower);

    // Nacelle generator
    const nacelleGeo = new THREE.BoxGeometry(0.07, 0.04, 0.04);
    disposableResources.geometries.add(nacelleGeo);
    const nacelle = new THREE.Mesh(nacelleGeo, whiteMat);
    nacelle.position.set(0, 0, 0.38);
    turbineGroup.add(nacelle);

    // 3 Aerodynamic Airfoil Rotor Blades
    ecoTurbineBlades = new THREE.Group();
    ecoTurbineBlades.position.set(-0.04, 0, 0.38);
    turbineGroup.add(ecoTurbineBlades);

    const bladeGeo = new THREE.BoxGeometry(0.015, 0.34, 0.006);
    disposableResources.geometries.add(bladeGeo);
    for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(bladeGeo, whiteMat);
        blade.rotation.z = (b / 3) * Math.PI * 2;
        ecoTurbineBlades.add(blade);
    }

    // Floating Dual-Layer Earth Globe
    ecoGlobeGroup = new THREE.Group();
    ecoGlobeGroup.position.set(-0.16, 0, 0.52);
    ecoMentorGroup.add(ecoGlobeGroup);

    const earthCoreGeo = new THREE.SphereGeometry(0.14, 16, 16);
    disposableResources.geometries.add(earthCoreGeo);
    const earthMat = new THREE.MeshStandardMaterial({
        color: 0x15803d,
        emissive: 0x166534,
        emissiveIntensity: 0.5,
        roughness: 0.4,
        metalness: 0.3,
        transparent: true,
        opacity: 0.95
    });
    trackMat(ecoMentorGroup, earthMat);
    const earthCore = new THREE.Mesh(earthCoreGeo, earthMat);
    ecoGlobeGroup.add(earthCore);

    // Outer atmospheric cage
    const atmoGeo = new THREE.IcosahedronGeometry(0.17, 1);
    disposableResources.geometries.add(atmoGeo);
    const atmoMat = new THREE.MeshBasicMaterial({
        color: 0x4ade80,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending
    });
    trackMat(ecoMentorGroup, atmoMat);
    ecoAtmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    ecoGlobeGroup.add(ecoAtmoMesh);

    // Orbiting clean energy photon particles
    const photonGeo = new THREE.SphereGeometry(0.02, 6, 6);
    disposableResources.geometries.add(photonGeo);
    const photonMat = new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0.9 });
    trackMat(ecoMentorGroup, photonMat);
    for (let p = 0; p < 4; p++) {
        const ph = new THREE.Mesh(photonGeo, photonMat);
        ecoGlobeGroup.add(ph);
        ecoParticles.push(ph);
    }

    // =============================================================
    // 8. ML & Systems Reps (ML1): 3-Tier Neural Net & Golden Cube
    // =============================================================
    mlDsaGroup = new THREE.Group();
    mlDsaGroup.visible = false;
    hologramParentGroup.add(mlDsaGroup);
    createHoloPedestal(mlDsaGroup, 0xa3e635);

    // 10 Crystalline neuron nodes in a 3-tier deep neural network lattice
    // Layer 0 (Inputs: 3), Layer 1 (Hidden: 4), Layer 2 (Outputs: 3)
    const nodeConfigs = [
        // Inputs (Layer 0)
        { pos: new THREE.Vector3(-0.25, 0.22, 0.4), layer: 0 },
        { pos: new THREE.Vector3(0, 0.22, 0.4), layer: 0 },
        { pos: new THREE.Vector3(0.25, 0.22, 0.4), layer: 0 },
        // Hidden (Layer 1)
        { pos: new THREE.Vector3(-0.32, 0.0, 0.45), layer: 1 },
        { pos: new THREE.Vector3(-0.1, 0.0, 0.45), layer: 1 },
        { pos: new THREE.Vector3(0.1, 0.0, 0.45), layer: 1 },
        { pos: new THREE.Vector3(0.32, 0.0, 0.45), layer: 1 },
        // Outputs (Layer 2)
        { pos: new THREE.Vector3(-0.2, -0.22, 0.5), layer: 2 },
        { pos: new THREE.Vector3(0, -0.22, 0.5), layer: 2 },
        { pos: new THREE.Vector3(0.2, -0.22, 0.5), layer: 2 }
    ];

    const nGeo = new THREE.SphereGeometry(0.038, 10, 10);
    disposableResources.geometries.add(nGeo);

    nodeConfigs.forEach(cfg => {
        const mat = new THREE.MeshStandardMaterial({
            color: 0xa3e635,
            emissive: 0x65a30d,
            emissiveIntensity: 0.9,
            roughness: 0.2,
            metalness: 0.8,
            transparent: true,
            opacity: 0.95
        });
        trackMat(mlDsaGroup, mat);
        const nodeMesh = new THREE.Mesh(nGeo, mat);
        nodeMesh.position.copy(cfg.pos);
        mlDsaGroup?.add(nodeMesh);
        neuralNodes.push({ mesh: nodeMesh, mat, layer: cfg.layer });
    });

    // Synaptic fiber-optic conduits linking layers
    const synapseConnections = [
        // Layer 0 -> Layer 1
        [0, 3], [0, 4], [1, 4], [1, 5], [2, 5], [2, 6],
        // Layer 1 -> Layer 2
        [3, 7], [4, 7], [4, 8], [5, 8], [5, 9], [6, 9]
    ];

    synapseConnections.forEach(([from, to]) => {
        const pts = [nodeConfigs[from].pos, nodeConfigs[to].pos];
        const synGeo = new THREE.BufferGeometry().setFromPoints(pts);
        disposableResources.geometries.add(synGeo);
        const synMat = new THREE.LineBasicMaterial({
            color: 0xbef264,
            transparent: true,
            opacity: 0.65,
            blending: THREE.AdditiveBlending
        });
        trackMat(mlDsaGroup, synMat);
        const synLine = new THREE.Line(synGeo, synMat);
        mlDsaGroup?.add(synLine);
        neuralSynapses.push(synLine);
    });

    // Monolithic golden GitHub commit cube
    const goldCubeGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    disposableResources.geometries.add(goldCubeGeo);
    const goldMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xca8a04,
        emissiveIntensity: 0.8,
        roughness: 0.15,
        metalness: 0.95,
        transparent: true,
        opacity: 0.95
    });
    trackMat(mlDsaGroup, goldMat);
    commitCubeMesh = new THREE.Mesh(goldCubeGeo, goldMat);
    commitCubeMesh.position.set(0, 0, 0.72);
    mlDsaGroup.add(commitCubeMesh);

    // Green contribution streak spark particles
    const sparkCount = 12;
    const sparkPos = new Float32Array(sparkCount * 3);
    for (let s = 0; s < sparkCount; s++) {
        sparkPos[s * 3] = (Math.random() - 0.5) * 0.25;
        sparkPos[s * 3 + 1] = (Math.random() - 0.5) * 0.25;
        sparkPos[s * 3 + 2] = 0.72 + (Math.random() - 0.5) * 0.15;
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    disposableResources.geometries.add(sparkGeo);
    const sparkMat = new THREE.PointsMaterial({
        color: 0x4ade80,
        size: 0.04,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending
    });
    trackMat(mlDsaGroup, sparkMat);
    commitSparks = new THREE.Points(sparkGeo, sparkMat);
    mlDsaGroup.add(commitSparks);
}

/**
 * Show the visual diorama corresponding to an inspected project.
 * @param {string} projectId e.g. 'crowd-pulse', 'dialora', 'smart-parking', etc.
 * @param {THREE.Vector3} [chipPos] Optional Position of the chip
 */
export function showProjectVisual(projectId, chipPos) {
    if (!hologramParentGroup) return;

    activeHoloName = projectId ? projectId.toLowerCase() : '';
    let targetGroup = null;
    let targetRef = 'CP1';

    if (activeHoloName.includes('crowd') || activeHoloName.includes('pulse') || activeHoloName === 'cp1') {
        targetGroup = crowdPulseGroup;
        targetRef = 'CP1';
    } else if (activeHoloName.includes('dialora') || activeHoloName.includes('voice') || activeHoloName === 'dl1') {
        targetGroup = dialoraGroup;
        targetRef = 'DL1';
    } else if (activeHoloName.includes('park') || activeHoloName === 'sp1') {
        targetGroup = smartParkingGroup;
        targetRef = 'SP1';
    } else if (activeHoloName.includes('bus') || activeHoloName === 'bt1') {
        targetGroup = busItGroup;
        targetRef = 'BT1';
    } else if (activeHoloName.includes('blue') || activeHoloName.includes('ground') || activeHoloName === 'aqd1') {
        targetGroup = blueGroundGroup;
        targetRef = 'AQD1';
    } else if (activeHoloName.includes('paw') || activeHoloName.includes('pet') || activeHoloName === 'px1') {
        targetGroup = pawPalGroup;
        targetRef = 'PX1';
    } else if (activeHoloName.includes('eco') || activeHoloName.includes('mentor') || activeHoloName === 'em1') {
        targetGroup = ecoMentorGroup;
        targetRef = 'EM1';
    } else if (activeHoloName.includes('ml') || activeHoloName.includes('dsa') || activeHoloName === 'ml1') {
        targetGroup = mlDsaGroup;
        targetRef = 'ML1';
    }

    // Hide any group that is NOT the target
    [crowdPulseGroup, dialoraGroup, smartParkingGroup, busItGroup, blueGroundGroup, pawPalGroup, ecoMentorGroup, mlDsaGroup].forEach(grp => {
        if (grp && grp !== targetGroup) grp.visible = false;
    });

    // Zero out opacity of non-target materials
    const activeMats = targetGroup ? (groupMaterialsMap.get(targetGroup) || []) : [];
    allHoloMaterials.forEach(m => {
        if (!activeMats.includes(m)) {
            gsap.killTweensOf(m);
            m.opacity = 0;
        }
    });

    if (targetGroup) {
        let pos = chipPos;
        if (!pos) {
            const chip = projectChips[targetRef];
            if (chip && chip.pos) pos = chip.pos;
        }
        if (pos) {
            targetGroup.position.copy(pos);
        }
        targetGroup.visible = true;

        // Ensure materials for this active group are visibly glowing
        activeMats.forEach(m => {
            gsap.killTweensOf(m);
            gsap.to(m, { opacity: 0.95, duration: 0.35, ease: 'power1.out', overwrite: 'auto' });
        });
    }
}

/**
 * Hide all active project dioramas.
 */
export function hideProjectVisuals() {
    activeHoloName = '';
    allHoloMaterials.forEach(m => {
        gsap.killTweensOf(m);
        gsap.to(m, { opacity: 0, duration: 0.25, overwrite: 'auto' });
    });
    gsap.delayedCall(0.25, () => {
        if (!activeHoloName) {
            [crowdPulseGroup, dialoraGroup, smartParkingGroup, busItGroup, blueGroundGroup, pawPalGroup, ecoMentorGroup, mlDsaGroup].forEach(grp => {
                if (grp) grp.visible = false;
            });
        }
    });
}

/**
 * Update project visuals per frame (natural, physical movement).
 * @param {number} elapsed
 */
export function updateProjectHolograms(elapsed) {
    if (motionPrefs.reduced) return;

    // 1. CrowdPulse: 5 articulated walking pedestrians with arm/leg swings & CV CCTV beam
    if (crowdPulseGroup && crowdPulseGroup.visible) {
        pedestrians.forEach(p => {
            const cycle = (elapsed * p.speed + p.phase) % 1;
            p.group.position.x = -0.36 + cycle * 0.72;

            // Human walking gait: natural opposite leg & arm swings
            const walkSwing = Math.sin(elapsed * 10 * p.speed + p.phase) * 0.45;
            p.legL.rotation.x = walkSwing;
            p.legR.rotation.x = -walkSwing;
            p.armL.rotation.x = -walkSwing * 0.8;
            p.armR.rotation.x = walkSwing * 0.8;

            // Natural vertical walking bob
            p.group.position.z = 0.32 + Math.abs(Math.sin(elapsed * 10 * p.speed + p.phase)) * 0.018;

            // Pulse CV tracking tags
            p.tag.scale.setScalar(1.0 + Math.sin(elapsed * 8 + p.phase) * 0.2);
        });

        // CCTV camera sweeps across the crossing
        if (cctvCameraHead) {
            cctvCameraHead.rotation.z = Math.sin(elapsed * 1.4) * 0.35;
        }
        if (cctvBeamMesh) {
            cctvBeamMesh.rotation.z = elapsed * 1.5;
        }
    }

    // 2. Dialora: Studio microphone pulsation, circular stadium EQ bars & acoustic wavefronts
    if (dialoraGroup && dialoraGroup.visible) {
        if (studioMicGroup) {
            studioMicGroup.rotation.z = Math.sin(elapsed * 1.2) * 0.08;
        }
        if (micStatusRing) {
            const pulse = 0.8 + Math.abs(Math.sin(elapsed * 6)) * 0.35;
            micStatusRing.scale.set(pulse, pulse, pulse);
        }
        eqBars.forEach((bar, idx) => {
            // Harmonic equalizer dancing bands
            const freqH = 0.35 + Math.abs(Math.sin(elapsed * 10 + idx * 0.8)) * 1.1 + Math.cos(elapsed * 4 + idx * 1.5) * 0.3;
            bar.scale.z = Math.max(0.2, freqH);
        });
        soundRings.forEach((ring, idx) => {
            const ringPhase = (elapsed * 0.7 + idx * 0.33) % 1;
            const rScale = 0.5 + ringPhase * 1.2;
            ring.scale.set(rScale, rScale, rScale);
            ring.position.z = 0.5 + ringPhase * 0.12;
        });
    }

    // 3. Smart Parking: Sports car drives, barrier lifts, car parks in vacant bay, bay switches to red
    if (smartParkingGroup && smartParkingGroup.visible) {
        // Complete autonomous parking loop: 0..1 over 6 seconds
        const parkTime = (elapsed * 0.22) % 1;

        if (parkingCarGroup) {
            if (parkTime < 0.35) {
                // Phase 1: Driving down access lane
                const t = parkTime / 0.35;
                parkingCarGroup.position.x = 0.35 - t * 0.5;
                parkingCarGroup.position.y = -0.16;
                parkingCarGroup.rotation.z = 0;
            } else if (parkTime < 0.55) {
                // Phase 2: Steer and park into vacant bay (-0.28, -0.16)
                const t = (parkTime - 0.35) / 0.2;
                parkingCarGroup.position.x = -0.15 - t * 0.13;
                parkingCarGroup.position.y = -0.16;
                parkingCarGroup.rotation.z = Math.sin(t * Math.PI) * 0.25;
            } else if (parkTime < 0.85) {
                // Phase 3: Docked inside bay
                parkingCarGroup.position.x = -0.28;
                parkingCarGroup.position.y = -0.16;
                parkingCarGroup.rotation.z = 0;
            } else {
                // Phase 4: Departing
                const t = (parkTime - 0.85) / 0.15;
                parkingCarGroup.position.x = -0.28 + t * 0.63;
                parkingCarGroup.position.y = -0.16;
            }

            // Spin wheels while driving
            carWheels.forEach(w => {
                w.rotation.x += 0.35;
            });
        }

        // Barrier gate arm lifts when car approaches
        if (barrierGateArm) {
            const isArmOpen = parkTime < 0.25 || parkTime > 0.88;
            barrierGateArm.rotation.y = isArmOpen ? -Math.PI * 0.45 : 0;
        }

        // Vacant bay turns red when car is docked
        if (vacantBayLight) {
            const isDocked = parkTime >= 0.5 && parkTime <= 0.85;
            /** @type {any} */ (vacantBayLight.material).color.setHex(isDocked ? 0xef4444 : 0x22c55e);
        }
    }

    // 4. BusIT: Electric shuttle bus cruises curved highway, tilts into turns & pulses GPS beacons
    if (busItGroup && busItGroup.visible && shuttleBusGroup) {
        const busT = (elapsed * 0.2) % 1;
        const p0x = -0.4, p0y = -0.32;
        const p1x = 0.0, p1y = 0.42;
        const p2x = 0.4, p2y = -0.32;
        const inv = 1 - busT;

        shuttleBusGroup.position.x = inv * inv * p0x + 2 * inv * busT * p1x + busT * busT * p2x;
        shuttleBusGroup.position.y = inv * inv * p0y + 2 * inv * busT * p1y + busT * busT * p2y;

        const tangentY = 2 * (1 - busT) * (p1y - p0y) + 2 * busT * (p2y - p1y);
        const tangentX = 2 * (1 - busT) * (p1x - p0x) + 2 * busT * (p2x - p1x);
        shuttleBusGroup.rotation.z = Math.atan2(tangentY, tangentX);

        // Centripetal banking tilt into the curve
        shuttleBusGroup.rotation.y = (busT - 0.5) * 0.25;

        // Spin wheels
        busWheels.forEach(w => {
            w.rotation.x += 0.4;
        });

        // GPS satellite uplink beacons
        gpsBeacons.forEach((b, idx) => {
            const bScale = 0.6 + ((elapsed * 1.2 + idx * 0.5) % 1) * 1.4;
            b.scale.set(bScale, bScale, bScale);
        });
    }

    // 5. Blue_Ground: Photovoltaic panels tilt, water droplet falls with gravity & creates ripples
    if (blueGroundGroup && blueGroundGroup.visible) {
        if (solarTrackerGroup) {
            solarTrackerGroup.rotation.z = Math.sin(elapsed * 0.8) * 0.15;
        }

        // Realistic gravity drop: nozzle at z = 0.65 -> water level at z = 0.35
        if (waterDropMesh) {
            const dropCycle = (elapsed * 1.8) % 1;
            const dropZ = 0.65 - (dropCycle * dropCycle) * 0.3; // y = -1/2 * g * t^2
            waterDropMesh.position.z = dropZ;
            waterDropMesh.scale.setScalar(dropCycle < 0.85 ? 1.0 : (1.0 - (dropCycle - 0.85) * 6));
        }

        dropletRipples.forEach((rip, idx) => {
            const rCycle = (elapsed * 1.8 + idx * 0.5) % 1;
            const rScale = 0.5 + rCycle * 1.4;
            rip.scale.set(rScale, rScale, rScale);
        });

        waterProbes.forEach((pr, idx) => {
            const probePulse = 0.8 + Math.sin(elapsed * 7 + idx * 1.2) * 0.3;
            pr.scale.setScalar(probePulse);
        });
    }

    // 6. PawPal: Articulated robot puppy breathes, head gazes around, tail wags & dual-pump heart
    if (pawPalGroup && pawPalGroup.visible) {
        if (pawBodyMesh) {
            // Natural breathing cycle
            const breath = 1.0 + Math.sin(elapsed * 3) * 0.04;
            pawBodyMesh.scale.set(breath, breath, 1.0);
        }
        if (pawHeadGroup) {
            // Curious head tilts & gaze tracking
            pawHeadGroup.rotation.z = Math.sin(elapsed * 2.2) * 0.25;
            pawHeadGroup.rotation.y = Math.cos(elapsed * 1.6) * 0.2;
        }
        if (pawTailMesh) {
            // Expressive excited tail wagging
            pawTailMesh.rotation.z = Math.sin(elapsed * 14) * 0.55;
        }
        pawLegs.forEach((leg, idx) => {
            // Gentle stepping shift
            leg.position.z = 0.04 + Math.abs(Math.sin(elapsed * 5 + idx * 1.5)) * 0.015;
        });
        if (pawHeartMesh) {
            // Dual-pump systolic & diastolic heartbeat rhythm
            const hPhase = (elapsed * 2.4) % 1;
            const beat = (hPhase < 0.15) ? (1.0 + Math.sin(hPhase * Math.PI * 6.6) * 0.35) :
                         (hPhase < 0.35) ? (1.0 + Math.sin((hPhase - 0.15) * Math.PI * 5) * 0.2) : 1.0;
            pawHeartMesh.scale.set(beat, beat, beat);
            pawHeartMesh.rotation.y = elapsed * 1.2;
        }
        medicalCrosses.forEach((cr, idx) => {
            cr.rotation.z = elapsed * (idx === 0 ? 1.5 : -1.5);
            cr.position.z = 0.52 + Math.sin(elapsed * 3 + idx) * 0.03;
        });
    }

    // 7. EcoMentor AI: Industrial 3-blade wind turbine spins, Earth globe & atmosphere rotate, photons orbit
    if (ecoMentorGroup && ecoMentorGroup.visible) {
        if (ecoTurbineBlades) {
            ecoTurbineBlades.rotation.z = elapsed * 8.5; // Smooth wind rotation
        }
        if (ecoGlobeGroup) {
            ecoGlobeGroup.rotation.y = elapsed * 0.4;
        }
        if (ecoAtmoMesh) {
            ecoAtmoMesh.rotation.x = elapsed * 0.25;
            ecoAtmoMesh.rotation.z = elapsed * 0.15;
        }
        ecoParticles.forEach((ph, idx) => {
            // Helical photon orbit
            const theta = elapsed * 2.5 + idx * (Math.PI / 2);
            ph.position.set(
                Math.cos(theta) * 0.25,
                Math.sin(theta) * 0.25,
                Math.sin(theta * 2) * 0.08
            );
        });
    }

    // 8. ML & Systems Reps: Forward propagation BFS light wave through neural net & spinning gold cube
    if (mlDsaGroup && mlDsaGroup.visible) {
        // Forward propagation electrical pulse (Layer 0 -> Layer 1 -> Layer 2)
        const waveTime = (elapsed * 2.0) % 3; // 0..3 cycle
        neuralNodes.forEach(node => {
            const isFiring = Math.abs(node.layer - waveTime) < 0.6;
            const flash = isFiring ? 1.8 : 0.8;
            node.mat.emissiveIntensity = flash;
            node.mesh.scale.setScalar(isFiring ? 1.3 : 1.0);
        });

        if (commitCubeMesh) {
            commitCubeMesh.rotation.x = elapsed * 1.2;
            commitCubeMesh.rotation.y = elapsed * 1.6;
        }
        if (commitSparks) {
            commitSparks.rotation.z = elapsed * 0.8;
        }
    }
}
