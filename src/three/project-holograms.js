// @ts-check
// ============================================================
// 3D Project Storytelling Dioramas
// Generates clear, universally recognizable 3D dioramas above active chips:
// 1. CrowdPulse: Mini street intersection with animated pedestrian dots
// 2. Dialora: Living glowing voice orb with acoustic wave pulses
// 3. Smart Parking: Transparent parking bay with green/red slots & car
// 4. BusIT: Curving neon route with cruising transit shuttle
// 5. Blue_Ground: Clean solar panel with purified water droplet & ripples
// 6. PawPal: Cute low-poly 3D pet companion that wags tail & looks around
// 7. FlyRank: Ascending ranking pillars with upward star chevron
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { motionPrefs } from '../utils/motion-prefs.js';
import { disposableResources } from './scene.js';

/** @type {THREE.Group | null} */
let hologramParentGroup = null;

// Individual visual groups
/** @type {THREE.Group | null} */
let cvBoxGroup = null;
/** @type {THREE.Group | null} */
let voiceWaveGroup = null;
/** @type {THREE.Group | null} */
let smartParkingGroup = null;
/** @type {THREE.Group | null} */
let busItGroup = null;
/** @type {THREE.Group | null} */
let solarWaterGroup = null;
/** @type {THREE.Group | null} */
let pawPalGroup = null;
/** @type {THREE.Group | null} */
let searchRankGroup = null;

// Animated sub-elements
/** @type {THREE.Mesh[]} */
const pedestrianDots = [];
/** @type {THREE.Mesh | null} */
let voiceOrbMesh = null;
/** @type {THREE.Mesh | null} */
let parkingCarMesh = null;
/** @type {THREE.Mesh | null} */
let busMarkerMesh = null;
/** @type {THREE.Mesh | null} */
let pawTailMesh = null;
/** @type {THREE.Group | null} */
let pawHeadGroup = null;
/** @type {THREE.Mesh | null} */
let solarDropletMesh = null;

/** @type {THREE.Material[]} */
const allHoloMaterials = [];
let activeHoloName = '';

/**
 * Initialize 3D Project Dioramas.
 * @param {THREE.Group} boardGroup
 */
export function initProjectHolograms(boardGroup) {
    if (hologramParentGroup) return;

    hologramParentGroup = new THREE.Group();
    hologramParentGroup.name = 'ProjectHologramsGroup';
    boardGroup.add(hologramParentGroup);

    // -------------------------------------------------------------
    // 1. CrowdPulse: Mini Street Map with Pedestrian Walking Dots
    // -------------------------------------------------------------
    cvBoxGroup = new THREE.Group();
    cvBoxGroup.visible = false;
    hologramParentGroup.add(cvBoxGroup);

    // Crosswalk grid lines
    const roadPoints = [
        new THREE.Vector3(-0.25, -0.25, 0.05),
        new THREE.Vector3(0.25, -0.25, 0.05),
        new THREE.Vector3(0.25, 0.25, 0.05),
        new THREE.Vector3(-0.25, 0.25, 0.05),
        new THREE.Vector3(-0.25, -0.25, 0.05)
    ];
    const roadGeo = new THREE.BufferGeometry().setFromPoints(roadPoints);
    disposableResources.geometries.add(roadGeo);
    const roadMat = new THREE.LineBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending
    });
    disposableResources.materials.add(roadMat);
    allHoloMaterials.push(roadMat);
    cvBoxGroup.add(new THREE.Line(roadGeo, roadMat));

    // Pedestrian walking dots (green & amber)
    const dotGeo = new THREE.SphereGeometry(0.025, 8, 8);
    disposableResources.geometries.add(dotGeo);
    const dotMat1 = new THREE.MeshBasicMaterial({ color: 0x3ee6a0, transparent: true, opacity: 0 });
    const dotMat2 = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0 });
    disposableResources.materials.add(dotMat1);
    disposableResources.materials.add(dotMat2);
    allHoloMaterials.push(dotMat1, dotMat2);

    for (let i = 0; i < 4; i++) {
        const pDot = new THREE.Mesh(dotGeo, i % 2 === 0 ? dotMat1 : dotMat2);
        pDot.position.set(-0.2 + i * 0.12, (i % 2 === 0 ? 0.1 : -0.1), 0.07);
        cvBoxGroup.add(pDot);
        pedestrianDots.push(pDot);
    }

    // -------------------------------------------------------------
    // 2. Dialora: Pulsing Living Voice Orb & Soundwaves
    // -------------------------------------------------------------
    voiceWaveGroup = new THREE.Group();
    voiceWaveGroup.visible = false;
    hologramParentGroup.add(voiceWaveGroup);

    const orbGeo = new THREE.IcosahedronGeometry(0.1, 2);
    disposableResources.geometries.add(orbGeo);
    const orbMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 1.2,
        roughness: 0.15,
        metalness: 0.8,
        transparent: true,
        opacity: 0
    });
    disposableResources.materials.add(orbMat);
    allHoloMaterials.push(orbMat);

    voiceOrbMesh = new THREE.Mesh(orbGeo, orbMat);
    voiceOrbMesh.position.set(0, 0, 0.18);
    voiceWaveGroup.add(voiceOrbMesh);

    // -------------------------------------------------------------
    // 3. Smart Parking: Mini Garage Bay with Green/Red Slots & Car
    // -------------------------------------------------------------
    smartParkingGroup = new THREE.Group();
    smartParkingGroup.visible = false;
    hologramParentGroup.add(smartParkingGroup);

    // 3 occupied (red) slots and 1 vacant (green) slot
    const slotGeo = new THREE.BoxGeometry(0.12, 0.08, 0.02);
    disposableResources.geometries.add(slotGeo);
    const redSlotMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0 });
    const greenSlotMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0 });
    disposableResources.materials.add(redSlotMat);
    disposableResources.materials.add(greenSlotMat);
    allHoloMaterials.push(redSlotMat, greenSlotMat);

    const slotOffsets = [
        { x: -0.12, y: 0.1, mat: redSlotMat },
        { x: 0.12, y: 0.1, mat: redSlotMat },
        { x: -0.12, y: -0.1, mat: redSlotMat },
        { x: 0.12, y: -0.1, mat: greenSlotMat } // Vacant target slot
    ];
    slotOffsets.forEach(s => {
        const slotMesh = new THREE.Mesh(slotGeo, s.mat);
        slotMesh.position.set(s.x, s.y, 0.08);
        smartParkingGroup?.add(slotMesh);
    });

    // Animated miniature car
    const carGeo = new THREE.BoxGeometry(0.1, 0.06, 0.04);
    disposableResources.geometries.add(carGeo);
    const carMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.7, transparent: true, opacity: 0 });
    disposableResources.materials.add(carMat);
    allHoloMaterials.push(carMat);

    parkingCarMesh = new THREE.Mesh(carGeo, carMat);
    parkingCarMesh.position.set(0.24, -0.1, 0.11);
    smartParkingGroup.add(parkingCarMesh);

    // -------------------------------------------------------------
    // 4. BusIT: Curving Neon Route & Commuter Shuttle
    // -------------------------------------------------------------
    busItGroup = new THREE.Group();
    busItGroup.visible = false;
    hologramParentGroup.add(busItGroup);

    const routeCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.25, -0.2, 0.08),
        new THREE.Vector3(0.0, 0.25, 0.08),
        new THREE.Vector3(0.25, -0.2, 0.08)
    );
    const routePoints = routeCurve.getPoints(24);
    const routeGeo = new THREE.BufferGeometry().setFromPoints(routePoints);
    disposableResources.geometries.add(routeGeo);

    const routeMat = new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0 });
    disposableResources.materials.add(routeMat);
    allHoloMaterials.push(routeMat);
    busItGroup.add(new THREE.Line(routeGeo, routeMat));

    // Commuter shuttle marker
    const busGeo = new THREE.BoxGeometry(0.08, 0.04, 0.035);
    disposableResources.geometries.add(busGeo);
    const busMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3, metalness: 0.8, transparent: true, opacity: 0 });
    disposableResources.materials.add(busMat);
    allHoloMaterials.push(busMat);

    busMarkerMesh = new THREE.Mesh(busGeo, busMat);
    busMarkerMesh.position.set(-0.25, -0.2, 0.11);
    busItGroup.add(busMarkerMesh);

    // -------------------------------------------------------------
    // 5. Blue_Ground: Clean Solar Panel with Purified Water Droplet
    // -------------------------------------------------------------
    solarWaterGroup = new THREE.Group();
    solarWaterGroup.visible = false;
    hologramParentGroup.add(solarWaterGroup);

    // Angled mini solar plate
    const solarGeo = new THREE.PlaneGeometry(0.3, 0.2);
    disposableResources.geometries.add(solarGeo);
    const solarMat = new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        roughness: 0.1,
        metalness: 0.85,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
    });
    disposableResources.materials.add(solarMat);
    allHoloMaterials.push(solarMat);

    const solarMesh = new THREE.Mesh(solarGeo, solarMat);
    solarMesh.rotation.x = -0.4;
    solarMesh.position.set(0, 0, 0.12);
    solarWaterGroup.add(solarMesh);

    // Levitating purified water drop
    const dropGeo = new THREE.SphereGeometry(0.06, 16, 12);
    disposableResources.geometries.add(dropGeo);
    const dropMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.05,
        metalness: 0.2,
        transparent: true,
        opacity: 0
    });
    disposableResources.materials.add(dropMat);
    allHoloMaterials.push(dropMat);

    solarDropletMesh = new THREE.Mesh(dropGeo, dropMat);
    solarDropletMesh.position.set(0, 0.04, 0.24);
    solarWaterGroup.add(solarDropletMesh);

    // -------------------------------------------------------------
    // 6. PawPal: Cute Low-Poly Holographic Pet Companion
    // -------------------------------------------------------------
    pawPalGroup = new THREE.Group();
    pawPalGroup.visible = false;
    hologramParentGroup.add(pawPalGroup);

    const petMat = new THREE.MeshStandardMaterial({
        color: 0xc084fc,
        roughness: 0.3,
        metalness: 0.6,
        transparent: true,
        opacity: 0
    });
    disposableResources.materials.add(petMat);
    allHoloMaterials.push(petMat);

    // Body
    const petBodyGeo = new THREE.BoxGeometry(0.12, 0.16, 0.1);
    disposableResources.geometries.add(petBodyGeo);
    const petBody = new THREE.Mesh(petBodyGeo, petMat);
    petBody.position.set(0, -0.04, 0.14);
    pawPalGroup.add(petBody);

    // Head group (tilts to look at mouse)
    pawHeadGroup = new THREE.Group();
    pawHeadGroup.position.set(0, 0.07, 0.2);
    pawPalGroup.add(pawHeadGroup);

    const headGeo = new THREE.BoxGeometry(0.1, 0.09, 0.09);
    disposableResources.geometries.add(headGeo);
    const headMesh = new THREE.Mesh(headGeo, petMat);
    pawHeadGroup.add(headMesh);

    // Snout
    const snoutGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
    disposableResources.geometries.add(snoutGeo);
    const snoutMesh = new THREE.Mesh(snoutGeo, petMat);
    snoutMesh.position.set(0, 0.06, -0.01);
    pawHeadGroup.add(snoutMesh);

    // Wagging tail
    const tailGeo = new THREE.BoxGeometry(0.025, 0.08, 0.025);
    disposableResources.geometries.add(tailGeo);
    pawTailMesh = new THREE.Mesh(tailGeo, petMat);
    pawTailMesh.position.set(0, -0.14, 0.16);
    pawPalGroup.add(pawTailMesh);

    // -------------------------------------------------------------
    // 7. FlyRank: Upward Ranking Columns & Star Chevron
    // -------------------------------------------------------------
    searchRankGroup = new THREE.Group();
    searchRankGroup.visible = false;
    hologramParentGroup.add(searchRankGroup);

    const colGeo = new THREE.BoxGeometry(0.05, 0.05, 0.2);
    disposableResources.geometries.add(colGeo);
    const rankMat = new THREE.MeshStandardMaterial({
        color: 0xc9a24b,
        emissive: 0xc9a24b,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.8,
        transparent: true,
        opacity: 0
    });
    disposableResources.materials.add(rankMat);
    allHoloMaterials.push(rankMat);

    [-0.08, 0, 0.08].forEach((xOffset, idx) => {
        const colMesh = new THREE.Mesh(colGeo, rankMat);
        colMesh.scale.set(1, 1, 0.6 + idx * 0.4);
        colMesh.position.set(xOffset, 0, 0.14);
        searchRankGroup?.add(colMesh);
    });
}

/**
 * Show the visual diorama corresponding to a specific project.
 * @param {string} projectId e.g. 'crowd-pulse', 'dialora', 'smart-parking', etc.
 * @param {THREE.Vector3} chipPos Position of the chip
 */
export function showProjectVisual(projectId, chipPos) {
    if (!hologramParentGroup) return;

    // Hide all first smoothly
    [cvBoxGroup, voiceWaveGroup, smartParkingGroup, busItGroup, solarWaterGroup, pawPalGroup, searchRankGroup].forEach(grp => {
        if (grp) grp.visible = false;
    });

    activeHoloName = projectId ? projectId.toLowerCase() : '';
    let targetGroup = null;

    if (activeHoloName.includes('crowd') || activeHoloName.includes('pulse')) {
        targetGroup = cvBoxGroup;
    } else if (activeHoloName.includes('dialora') || activeHoloName.includes('voice')) {
        targetGroup = voiceWaveGroup;
    } else if (activeHoloName.includes('park')) {
        targetGroup = smartParkingGroup;
    } else if (activeHoloName.includes('bus')) {
        targetGroup = busItGroup;
    } else if (activeHoloName.includes('blue') || activeHoloName.includes('ground')) {
        targetGroup = solarWaterGroup;
    } else if (activeHoloName.includes('paw') || activeHoloName.includes('pet')) {
        targetGroup = pawPalGroup;
    } else if (activeHoloName.includes('flyrank') || activeHoloName.includes('rank')) {
        targetGroup = searchRankGroup;
    }

    if (targetGroup) {
        targetGroup.position.copy(chipPos);
        targetGroup.visible = true;

        // Smooth fade-in
        allHoloMaterials.forEach(m => {
            gsap.to(m, { opacity: 0.88, duration: 0.4, ease: 'power1.out' });
        });
    }
}

/**
 * Hide active visuals.
 */
export function hideProjectVisuals() {
    allHoloMaterials.forEach(m => {
        gsap.to(m, { 
            opacity: 0, 
            duration: 0.3, 
            onComplete: () => {
                [cvBoxGroup, voiceWaveGroup, smartParkingGroup, busItGroup, solarWaterGroup, pawPalGroup, searchRankGroup].forEach(grp => {
                    if (grp) grp.visible = false;
                });
            }
        });
    });
}

/**
 * Update project visuals per frame (natural, gentle movement).
 * @param {number} elapsed
 */
export function updateProjectHolograms(elapsed) {
    if (motionPrefs.reduced) return;

    // 1. CrowdPulse pedestrian dots smoothly walk across
    if (cvBoxGroup && cvBoxGroup.visible) {
        pedestrianDots.forEach((dot, idx) => {
            const cycle = (elapsed * 0.4 + idx * 0.25) % 1;
            dot.position.x = -0.22 + cycle * 0.44;
        });
    }

    // 2. Dialora living voice orb breathes & squishes rhythmically
    if (voiceOrbMesh && voiceWaveGroup && voiceWaveGroup.visible) {
        const pulse = 1.0 + Math.sin(elapsed * 5) * 0.08;
        voiceOrbMesh.scale.set(pulse, pulse, pulse);
        voiceOrbMesh.position.z = 0.18 + Math.sin(elapsed * 2.5) * 0.02;
    }

    // 3. Smart Parking mini car smoothly glides into vacant bay
    if (parkingCarMesh && smartParkingGroup && smartParkingGroup.visible) {
        const t = (Math.sin(elapsed * 1.5) + 1) * 0.5; // 0..1
        parkingCarMesh.position.x = 0.22 - t * 0.1; // pulls into 0.12
    }

    // 4. BusIT transit shuttle cruises along route curve
    if (busMarkerMesh && busItGroup && busItGroup.visible) {
        const t = (elapsed * 0.3) % 1;
        // Quadratic bezier interpolation: P(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
        const p0x = -0.25, p0y = -0.2;
        const p1x = 0.0, p1y = 0.25;
        const p2x = 0.25, p2y = -0.2;
        const inv = 1 - t;
        busMarkerMesh.position.x = inv * inv * p0x + 2 * inv * t * p1x + t * t * p2x;
        busMarkerMesh.position.y = inv * inv * p0y + 2 * inv * t * p1y + t * t * p2y;
    }

    // 5. Blue_Ground solar water droplet levitates & ripples
    if (solarDropletMesh && solarWaterGroup && solarWaterGroup.visible) {
        solarDropletMesh.position.z = 0.24 + Math.sin(elapsed * 3) * 0.015;
    }

    // 6. PawPal cute pet wags tail & tilts head
    if (pawPalGroup && pawPalGroup.visible) {
        if (pawTailMesh) pawTailMesh.rotation.z = Math.sin(elapsed * 10) * 0.35; // enthusiastic tail wag!
        if (pawHeadGroup) pawHeadGroup.rotation.y = Math.sin(elapsed * 2) * 0.2;
    }

    // 7. FlyRank columns float gently
    if (searchRankGroup && searchRankGroup.visible) {
        searchRankGroup.position.z += Math.sin(elapsed * 3) * 0.0005;
    }
}
