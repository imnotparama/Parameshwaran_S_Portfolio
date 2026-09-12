// @ts-check
// ============================================================
// Simple & Intuitive 3D Project Visuals
// Generates clear, universally recognizable 3D visuals above active chips:
// - Camera detection boxes for CrowdPulse (Computer Vision)
// - Gentle audio sound waves for Dialora (Voice AI)
// - Upward ranking streams for FlyRank (AI Search)
// - Clean solar & water ripples for Blue_Ground (IoT)
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
let searchRankGroup = null;
/** @type {THREE.Group | null} */
let solarWaterGroup = null;

/** @type {THREE.Material[]} */
const allHoloMaterials = [];
let activeHoloName = '';

/**
 * Initialize 3D Project Visuals.
 * @param {THREE.Group} boardGroup
 */
export function initProjectHolograms(boardGroup) {
    if (hologramParentGroup) return;

    hologramParentGroup = new THREE.Group();
    hologramParentGroup.name = 'ProjectHologramsGroup';
    boardGroup.add(hologramParentGroup);

    // -------------------------------------------------------------
    // 1. CrowdPulse: Glowing Camera Detection Bounding Box
    // Clean wireframe box + corner brackets (instantly recognizable as CV)
    // -------------------------------------------------------------
    cvBoxGroup = new THREE.Group();
    cvBoxGroup.visible = false;
    hologramParentGroup.add(cvBoxGroup);

    const boxGeo = new THREE.BoxGeometry(0.38, 0.38, 0.25);
    disposableResources.geometries.add(boxGeo);
    const boxEdges = new THREE.EdgesGeometry(boxGeo);
    disposableResources.geometries.add(boxEdges);

    const cvMat = new THREE.LineBasicMaterial({
        color: 0x3ee6a0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending
    });
    disposableResources.materials.add(cvMat);
    allHoloMaterials.push(cvMat);

    const boxMesh = new THREE.LineSegments(boxEdges, cvMat);
    boxMesh.position.set(0, 0, 0.22);
    cvBoxGroup.add(boxMesh);

    // -------------------------------------------------------------
    // 2. Dialora: Smooth Audio Sound Wave Bars
    // Three gentle equalizer bars (instantly recognizable as Voice/Audio)
    // -------------------------------------------------------------
    voiceWaveGroup = new THREE.Group();
    voiceWaveGroup.visible = false;
    hologramParentGroup.add(voiceWaveGroup);

    const barGeo = new THREE.BoxGeometry(0.04, 0.04, 0.28);
    disposableResources.geometries.add(barGeo);

    const voiceMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending
    });
    disposableResources.materials.add(voiceMat);
    allHoloMaterials.push(voiceMat);

    [-0.08, 0, 0.08].forEach((xOffset) => {
        const barMesh = new THREE.Mesh(barGeo, voiceMat);
        barMesh.position.set(xOffset, 0, 0.2);
        voiceWaveGroup?.add(barMesh);
    });

    // -------------------------------------------------------------
    // 3. FlyRank: Upward Ranking Chevrons (AI Search & Rank)
    // -------------------------------------------------------------
    searchRankGroup = new THREE.Group();
    searchRankGroup.visible = false;
    hologramParentGroup.add(searchRankGroup);

    const chevronPoints = [
        new THREE.Vector3(-0.15, 0, 0.1),
        new THREE.Vector3(0, 0, 0.25),
        new THREE.Vector3(0.15, 0, 0.1)
    ];
    const chevronGeo = new THREE.BufferGeometry().setFromPoints(chevronPoints);
    disposableResources.geometries.add(chevronGeo);

    const rankMat = new THREE.LineBasicMaterial({
        color: 0xc9a24b, // Gold rank arrow
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending
    });
    disposableResources.materials.add(rankMat);
    allHoloMaterials.push(rankMat);

    const chevronMesh = new THREE.Line(chevronGeo, rankMat);
    searchRankGroup.add(chevronMesh);

    // -------------------------------------------------------------
    // 4. Blue_Ground: Clean Solar Panel & Water Ripple (IoT)
    // -------------------------------------------------------------
    solarWaterGroup = new THREE.Group();
    solarWaterGroup.visible = false;
    hologramParentGroup.add(solarWaterGroup);

    // Angled mini solar plate
    const solarGeo = new THREE.PlaneGeometry(0.3, 0.2);
    disposableResources.geometries.add(solarGeo);
    const solarMat = new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
    });
    disposableResources.materials.add(solarMat);
    allHoloMaterials.push(solarMat);

    const solarMesh = new THREE.Mesh(solarGeo, solarMat);
    solarMesh.rotation.x = -0.4;
    solarMesh.position.set(0, 0, 0.2);
    solarWaterGroup.add(solarMesh);
}

/**
 * Show the visual corresponding to a specific project.
 * @param {string} projectId e.g. 'crowdpulse', 'dialora', 'flyrank', 'blue-ground'
 * @param {THREE.Vector3} chipPos Position of the chip
 */
export function showProjectVisual(projectId, chipPos) {
    if (!hologramParentGroup) return;

    // Hide all first smoothly
    [cvBoxGroup, voiceWaveGroup, searchRankGroup, solarWaterGroup].forEach(grp => {
        if (grp) grp.visible = false;
    });

    activeHoloName = projectId ? projectId.toLowerCase() : '';
    let targetGroup = null;

    if (activeHoloName.includes('crowd') || activeHoloName.includes('pulse')) {
        targetGroup = cvBoxGroup;
    } else if (activeHoloName.includes('dialora') || activeHoloName.includes('voice')) {
        targetGroup = voiceWaveGroup;
    } else if (activeHoloName.includes('flyrank') || activeHoloName.includes('rank')) {
        targetGroup = searchRankGroup;
    } else if (activeHoloName.includes('blue') || activeHoloName.includes('ground')) {
        targetGroup = solarWaterGroup;
    }

    if (targetGroup) {
        targetGroup.position.copy(chipPos);
        targetGroup.visible = true;

        // Smooth fade-in
        allHoloMaterials.forEach(m => {
            gsap.to(m, { opacity: 0.85, duration: 0.4, ease: 'power1.out' });
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
                [cvBoxGroup, voiceWaveGroup, searchRankGroup, solarWaterGroup].forEach(grp => {
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

    // Dialora audio wave bars bounce smoothly
    if (voiceWaveGroup && voiceWaveGroup.visible) {
        voiceWaveGroup.children.forEach((bar, idx) => {
            const h = 0.8 + Math.sin(elapsed * 8 + idx * 1.5) * 0.4;
            bar.scale.set(1, 1, Math.max(0.2, h));
        });
    }

    // CrowdPulse detection box breathes gently
    if (cvBoxGroup && cvBoxGroup.visible) {
        const pulse = 1.0 + Math.sin(elapsed * 4) * 0.05;
        cvBoxGroup.scale.set(pulse, pulse, pulse);
    }

    // FlyRank arrow floats gently up and down
    if (searchRankGroup && searchRankGroup.visible) {
        searchRankGroup.position.z += Math.sin(elapsed * 3) * 0.001;
    }
}
