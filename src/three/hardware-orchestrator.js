// @ts-check
// ============================================================
// Unified Hardware Orchestrator
// Coordinates all 3D physical systems (Robotic Probe, Project Visuals,
// Thermal Conduction, RF Antenna Waves, Laser Sweeps) into one
// synchronized, living machine that reacts automatically to user scrolling.
// ============================================================
import * as THREE from 'three';
import { initFlyingProbe, flyProbeTo, updateFlyingProbe } from './flying-probe.js';
import { initProjectHolograms, showProjectVisual, hideProjectVisuals, updateProjectHolograms } from './project-holograms.js';
import { initThermalMode, updateThermal, setThermalLoad } from './thermal.js';
import { initRfWavefront, updateRfWavefront, triggerRfBurst } from './rf-wavefront.js';
import { initLaserScanner, triggerLaserScan } from './laser-scan.js';
import { initWaterDroplets, updateWaterDroplets, disturbDroplets } from './water-droplets.js';
import { initInspectionDrone, setDroneTarget, updateInspectionDrone } from './drone.js';
import { initPaperAirplane, launchPaperAirplane } from './paper-airplane.js';
import { initCornerSparks, triggerCornerSparks, updateCornerSparks } from './corner-sparks.js';
import { projectChips } from './project-chips.js';

export { disturbDroplets, setDroneTarget, launchPaperAirplane, triggerCornerSparks };

let currentSection = '';

/**
 * Initialize the full unified hardware orchestrator.
 * @param {THREE.Group} boardGroup
 */
export function initHardwareOrchestrator(boardGroup) {
    initFlyingProbe(boardGroup);
    initProjectHolograms(boardGroup);
    initThermalMode(boardGroup);
    initRfWavefront(boardGroup);
    initLaserScanner(boardGroup);
    initWaterDroplets(boardGroup);
    initInspectionDrone(boardGroup);
    initPaperAirplane(boardGroup);
    initCornerSparks(boardGroup);
}

/**
 * Handle section transitions naturally (called on scroll).
 * @param {string} sectionId e.g. 'sec-about', 'sec-projects', 'sec-contact'
 */
export function onSectionChanged(sectionId) {
    if (sectionId === currentSection) return;
    currentSection = sectionId;

    // 1. Natural Laser Inspection Sweep on every section arrival
    triggerLaserScan();

    // 2. Section-specific natural hardware behaviors
    if (sectionId === 'sec-about') {
        // CPU focus: mild natural thermal warmth on U1
        setThermalLoad(48);
        hideProjectVisuals();
    } else if (sectionId === 'sec-projects') {
        // Expansion Bus: probe inspects the first project chip automatically
        setThermalLoad(60);
        inspectFirstProject();
    } else if (sectionId === 'sec-contact') {
        // Antenna wakes up with natural RF microwave waves + corner celebration sparks
        setThermalLoad(42);
        hideProjectVisuals();
        triggerRfBurst();
        triggerCornerSparks();
    } else {
        // Hero / Skills / Experience: quiet steady state
        setThermalLoad(40);
        hideProjectVisuals();
    }
}

/**
 * Inspect a specific project chip (moves probe and shows 3D visual).
 * Supports direct ref ('CP1'), lowercase ref ('cp1'), or project id ('crowd-pulse').
 * @param {string} refOrId Project reference ID e.g. 'CP1', 'crowd-pulse', etc.
 */
export function inspectProject(refOrId) {
    if (!refOrId) return;

    /** @type {any} */
    let chip = projectChips[refOrId];
    if (!chip) {
        const lower = String(refOrId).toLowerCase();
        chip = Object.values(projectChips).find(c => 
            (c.data && c.data.ref && c.data.ref.toLowerCase() === lower) ||
            (c.data && c.data.id && c.data.id.toLowerCase() === lower)
        );
    }
    if (chip && chip.pos) {
        flyProbeTo(chip.pos.x);
        setDroneTarget(chip.pos.x, chip.pos.y);
        const projectId = (chip.data && chip.data.id) || refOrId;
        showProjectVisual(projectId, chip.pos);
        setThermalLoad(62);
    }
}

/**
 * Automatically inspect the first project when entering the Projects section.
 */
function inspectFirstProject() {
    const chipKeys = Object.keys(projectChips);
    if (chipKeys.length > 0) {
        inspectProject(chipKeys[0]);
    }
}

/**
 * Main animation loop update for all orchestrator subsystems.
 * @param {number} elapsed
 * @param {number} delta
 */
export function updateHardwareOrchestrator(elapsed, delta) {
    updateFlyingProbe(elapsed);
    updateProjectHolograms(elapsed);
    updateThermal(elapsed, delta);
    updateRfWavefront(elapsed, delta);
    updateWaterDroplets(elapsed);
    updateInspectionDrone(elapsed, delta);
    updateCornerSparks(delta);
}
