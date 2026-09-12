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
import { projectChips } from './project-chips.js';

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
        // Antenna wakes up with natural RF microwave waves
        setThermalLoad(42);
        hideProjectVisuals();
        triggerRfBurst();
    } else {
        // Hero / Skills / Experience: quiet steady state
        setThermalLoad(40);
        hideProjectVisuals();
    }
}

/**
 * Inspect a specific project chip (moves probe and shows 3D visual).
 * @param {string} ref Project reference ID e.g. 'PRJ1', 'crowdpulse', etc.
 */
export function inspectProject(ref) {
    if (!ref) return;

    const chip = projectChips[ref];
    if (chip && chip.pos) {
        flyProbeTo(chip.pos.x);
        const projectId = (chip.data && chip.data.id) || ref;
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
}
