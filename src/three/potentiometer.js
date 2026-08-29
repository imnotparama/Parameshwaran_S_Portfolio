// @ts-check
// ============================================================
// Interactive Trimmer Potentiometer (RV1) & Hardware Themes
//
// 1. RV1 Rotary Interaction:
//    - Dragging RV1 in 3D rotates its screw rotor with angle clamping [0..270°].
//    - Real-time modulation of Board Clock Frequency (20.000MHz - 100.000MHz).
//    - Modulates live bloom exposure, CRT sweep speed, and audio hum tone.
//
// 2. DIP Hardware Theme System:
//    - ENIG_GOLD: Classic fab shop green + gold ENIG plating.
//    - MAGIC_24K: 24K mirror gold substrate + high specular sheen (Bruno Mars funk).
//    - CYBERPUNK: Deep violet soldermask + neon hot-magenta/cyan glow.
//    - STEALTH: Matte obsidian black PCB + ultraviolet glow.
// ============================================================

import * as THREE from 'three';
import gsap from 'gsap';
import { hoverBlip } from '../utils/sound.js';

/** @type {THREE.Mesh | null} */
let rvScrewMesh = null;

// Clock frequency state (MHz)
let currentClockFreq = 27.0;
let currentPotAngle = 0.45; // 0..1 normalized (approx 27MHz at 0.1)

// Theme Palettes
/** @type {Record<string, { name: string, boardColor: number, soldermaskColor: number, traceColor: number, glowColor: number, metalRoughness: number, metalness: number }>} */
export const THEMES = {
    ENIG_GOLD: {
        name: 'ENIG Gold',
        boardColor: 0x0a2b0a,
        soldermaskColor: 0x1e4d33,
        traceColor: 0xc9a24b,
        glowColor: 0x3ee6a0,
        metalRoughness: 0.35,
        metalness: 0.8
    },
    MAGIC_24K: {
        name: '24K Magic',
        boardColor: 0x221a05,
        soldermaskColor: 0xd4af37,
        traceColor: 0xffe066,
        glowColor: 0xffd700,
        metalRoughness: 0.1,
        metalness: 0.95
    },
    CYBERPUNK: {
        name: 'Cyber Neon',
        boardColor: 0x120422,
        soldermaskColor: 0x2b0d4f,
        traceColor: 0xf43f5e,
        glowColor: 0x00ffff,
        metalRoughness: 0.25,
        metalness: 0.7
    },
    STEALTH: {
        name: 'Stealth Dark',
        boardColor: 0x050505,
        soldermaskColor: 0x111115,
        traceColor: 0x6366f1,
        glowColor: 0xa855f7,
        metalRoughness: 0.5,
        metalness: 0.6
    }
};

let activeThemeKey = 'ENIG_GOLD';

// Registry of themed materials
/** @type {Array<{ mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial, prop: string, type: 'board' | 'soldermask' | 'trace' | 'glow' }>} */
const themeMaterials = [];

/**
 * Register the 3D screw rotor mesh of RV1.
 * @param {THREE.Mesh} mesh
 */
export function registerRvScrew(mesh) {
    rvScrewMesh = mesh;
    rvScrewMesh.rotation.z = currentPotAngle * Math.PI * 1.5;
}

/**
 * Register a material for dynamic theme palette swaps.
 * @param {THREE.MeshStandardMaterial | THREE.MeshBasicMaterial} mat
 * @param {'board' | 'soldermask' | 'trace' | 'glow'} type
 * @param {string} [prop='color']
 */
export function registerThemeMaterial(mat, type, prop = 'color') {
    themeMaterials.push({ mat, type, prop });
}

/**
 * Update the potentiometer rotation angle from mouse drag delta.
 * @param {number} delta Normalized delta (-1 to 1)
 */
export function rotatePotentiometer(delta) {
    currentPotAngle = Math.max(0, Math.min(1, currentPotAngle + delta));

    if (rvScrewMesh) {
        rvScrewMesh.rotation.z = currentPotAngle * Math.PI * 1.5;
    }

    // Map 0..1 to 20.000MHz .. 100.000MHz
    currentClockFreq = 20.0 + currentPotAngle * 80.0;

    // Small tactile click sound
    hoverBlip();

    // Update HUD scope clock readout if available
    const scopeRef = document.getElementById('hud-scope-val');
    if (scopeRef && document.body.dataset.hoverRef === 'RV1') {
        scopeRef.textContent = `TUNE · ${currentClockFreq.toFixed(3)}MHz · CLK`;
    }
}

/**
 * Get current system clock frequency modulated by RV1.
 * @returns {number} Frequency in MHz
 */
export function getClockFrequency() {
    return currentClockFreq;
}

/**
 * Get normalized potentiometer position (0..1).
 * @returns {number}
 */
export function getPotNormalized() {
    return currentPotAngle;
}

/**
 * Cycle to the next hardware theme palette.
 * @returns {string} Theme Name
 */
export function cycleTheme() {
    const keys = Object.keys(THEMES);
    const nextIdx = (keys.indexOf(activeThemeKey) + 1) % keys.length;
    setTheme(keys[nextIdx]);
    return THEMES[keys[nextIdx]].name;
}

/**
 * Set the active board theme palette.
 * @param {string} themeKey
 */
export function setTheme(themeKey) {
    if (!THEMES[themeKey]) return;
    activeThemeKey = themeKey;
    const t = THEMES[themeKey];

    // Animate material color shifts smoothly
    themeMaterials.forEach(({ mat, type, prop }) => {
        let targetColor = t.boardColor;
        if (type === 'soldermask') targetColor = t.soldermaskColor;
        else if (type === 'trace') targetColor = t.traceColor;
        else if (type === 'glow') targetColor = t.glowColor;

        if (prop === 'color' && 'color' in mat) {
            gsap.to(mat.color, {
                r: ((targetColor >> 16) & 255) / 255,
                g: ((targetColor >> 8) & 255) / 255,
                b: (targetColor & 255) / 255,
                duration: 0.8,
                overwrite: 'auto'
            });
        } else if (prop === 'emissive' && 'emissive' in mat) {
            gsap.to(mat.emissive, {
                r: ((targetColor >> 16) & 255) / 255,
                g: ((targetColor >> 8) & 255) / 255,
                b: (targetColor & 255) / 255,
                duration: 0.8,
                overwrite: 'auto'
            });
        }
    });

    // Update body theme class
    document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim();
    document.body.classList.add(`theme-${themeKey.toLowerCase().replace('_', '-')}`);
}
