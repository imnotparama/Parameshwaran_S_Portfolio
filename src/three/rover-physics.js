// @ts-check
// ============================================================
// Nano-Rover Arcade Kinematics & Proximity Scanner Engine
//
// 1. Arcade Vehicle Kinematics:
//    - Acceleration, reverse, progressive braking, and spring steering.
//    - Drift physics with centrifugal lateral slip.
//    - Boundary clamping keeping the vehicle on the PCB board.
//
// 2. Interactive Systems:
//    - Trace Boost Rails: Driving over copper traces triggers speed boosts.
//    - Real-World Component Proximity Engine:
//        Detects when rover drives over motherboard components and displays
//        rich developer details in a floating Dossier HUD card (no raw component names).
//    - 3D Laser Turret Lock:
//        Aims the rover's 3D laser scanner beam at the target component.
//    - Prop Collisions: Knocks over solder pins & launches off jump ramps.
//    - Camera Tracking: Camera glides to follow the rover in 3D.
// ============================================================

import * as THREE from 'three';
import gsap from 'gsap';
import { roverGroup, updateRoverVisuals, setRoverLaserTarget } from './rover.js';
import { checkPropCollisions, updatePlaygroundProps, resetPins } from './playground-props.js';
import { traceData, energizeTraceAtPoint } from './traces.js';
import { camera } from './scene.js';
import { hoverBlip, switchClack, clickBlip, updateRoverMotorSound, stopRoverMotorSound } from '../utils/sound.js';
import { playSynthNote } from '../utils/synth.js';
import { findNearbyRoverComponent } from '../data/rover-dossier.js';
import { triggerLedRunwayChase, triggerCapacitorOverdrive, pulseBuzzer } from './components.js';
import { showProjectVisual, hideProjectVisuals } from './project-holograms.js';
import { initRoverTouch, showRoverTouchControls, hideRoverTouchControls } from '../ui/rover-touch.js';

export const TERRAIN_TYPES = {
    COPPER: {
        id: 'copper',
        name: 'COPPER BUS / ENIG',
        shortName: 'COPPER RAIL',
        grip: 0.72,
        accelMult: 1.35,
        maxSpeedMult: 1.25,
        friction: 0.96,
        color: '#f59e0b'
    },
    SOLDERMASK: {
        id: 'soldermask',
        name: 'SOLDERMASK (LPI)',
        shortName: 'SOLDERMASK',
        grip: 1.0,
        accelMult: 1.0,
        maxSpeedMult: 1.0,
        friction: 0.92,
        color: '#3ee6a0'
    },
    SUBSTRATE: {
        id: 'substrate',
        name: 'FR-4 SUBSTRATE',
        shortName: 'SUBSTRATE',
        grip: 1.25,
        accelMult: 0.82,
        maxSpeedMult: 0.85,
        friction: 0.85,
        color: '#94a3b8'
    }
};

/**
 * Determine the motherboard surface material under coordinates (x, y).
 * @param {number} x
 * @param {number} y
 * @returns {typeof TERRAIN_TYPES[keyof typeof TERRAIN_TYPES]}
 */
export function getRoverTerrainAt(x, y) {
    // 1. CPU ground pour or copper traces
    if (Math.abs(x) < 1.7 && Math.abs(y - 2.5) < 1.7) {
        return TERRAIN_TYPES.COPPER;
    }
    for (let r = 0; r < traceData.length; r++) {
        const route = traceData[r];
        for (let i = 0; i < route.points.length; i++) {
            const p = route.points[i];
            if (Math.hypot(x - p.x, y - p.y) < 0.38) {
                return TERRAIN_TYPES.COPPER;
            }
        }
    }
    // 2. PCB edge bevels / mounting hole corners
    if (Math.abs(x) > 4.1 || Math.abs(y) > 5.8) {
        return TERRAIN_TYPES.SUBSTRATE;
    }
    // 3. Central soldermask
    return TERRAIN_TYPES.SOLDERMASK;
}

let isActive = false;

// Kinematics State
const state = {
    pos: new THREE.Vector3(0, -5.5, 0.22),
    vel: new THREE.Vector3(),
    angle: 0, // Facing UP towards CPU
    speed: 0,
    steer: 0,
    pitch: 0,
    roll: 0,
    isDrifting: false,
    boost: 1.0,
    isBoosting: false,
    jumpZ: 0,
    jumpVelZ: 0,
    terrain: TERRAIN_TYPES.SOLDERMASK
};

// Input state
const keys = {
    forward: false,
    reverse: false,
    left: false,
    right: false,
    drift: false
};

// Saved camera state
const savedCameraPos = new THREE.Vector3();

/** @type {import('../data/rover-dossier.js').RoverDossierItem | null} */
let activeDossierItem = null;
let lastDossierId = '';
/** @type {((item: import('../data/rover-dossier.js').RoverDossierItem) => void) | null} */
let roverActionHandler = null;

// DOM Element Caches
/** @type {HTMLElement | null} */
let roverHudEl = null;
/** @type {HTMLElement | null} */
let inspectCardEl = null;
/** @type {HTMLElement | null} */
let speedValEl = null;
/** @type {HTMLElement | null} */
let headingValEl = null;
/** @type {HTMLElement | null} */
let boostValEl = null;
/** @type {HTMLElement | null} */
let surfaceValEl = null;
/** @type {HTMLElement | null} */
let dossierBadgeEl = null;
/** @type {HTMLElement | null} */
let dossierTitleEl = null;
/** @type {HTMLElement | null} */
let dossierDescEl = null;
/** @type {HTMLElement | null} */
let dossierMetricsEl = null;
/** @type {HTMLElement | null} */
let dossierActionTextEl = null;

let isHudBound = false;

/**
 * Bind HUD DOM buttons once on document availability.
 */
function bindHudEvents() {
    if (isHudBound || typeof document === 'undefined') return;
    isHudBound = true;

    roverHudEl = document.getElementById('rover-hud');
    inspectCardEl = document.getElementById('rover-inspect-card');
    speedValEl = document.getElementById('rover-val-speed');
    headingValEl = document.getElementById('rover-val-heading');
    boostValEl = document.getElementById('rover-val-boost');
    surfaceValEl = document.getElementById('rover-val-surface');
    dossierBadgeEl = document.getElementById('dossier-badge');
    dossierTitleEl = document.getElementById('dossier-title');
    dossierDescEl = document.getElementById('dossier-desc');
    dossierMetricsEl = document.getElementById('dossier-metrics');
    dossierActionTextEl = document.getElementById('dossier-action-text');

    const exitBtn = document.getElementById('rover-exit-btn');
    if (exitBtn) {
        exitBtn.addEventListener('click', () => {
            deactivateRover();
        });
    }

    const actionBtn = document.getElementById('dossier-action-btn');
    if (actionBtn) {
        actionBtn.addEventListener('click', () => {
            triggerDossierAction();
        });
    }
}

/**
 * Register external handler for rover dossier actions (navigation, project inspection).
 * @param {(item: import('../data/rover-dossier.js').RoverDossierItem) => void} handler
 */
export function setRoverActionHandler(handler) {
    roverActionHandler = handler;
}

/**
 * Execute the currently focused component dossier action.
 */
export function triggerDossierAction() {
    if (!activeDossierItem) return;
    playSynthNote(659.25, 0.25, 0.08);
    hoverBlip();
    if (roverActionHandler) {
        roverActionHandler(activeDossierItem);
    }
}

/**
 * Check if Rover drive mode is currently active.
 * @returns {boolean}
 */
export function isRoverModeActive() {
    return isActive;
}

/**
 * Activate the Nano-Rover drive mode.
 */
export function activateRover() {
    if (isActive) return;
    isActive = true;

    switchClack();
    hoverBlip();
    bindHudEvents();

    if (roverGroup) roverGroup.visible = true;
    if (typeof document !== 'undefined') {
        document.body.classList.add('rover-active');
        const roverBtn = document.getElementById('rover-toggle-btn');
        if (roverBtn) {
            roverBtn.setAttribute('aria-pressed', 'true');
            roverBtn.classList.add('active');
        }
        if (roverHudEl) roverHudEl.removeAttribute('hidden');
    }

    if (camera) {
        savedCameraPos.copy(camera.position);
    }

    // Initialize and display mobile virtual touch controls if touch device
    initRoverTouch(
        (forward, reverse, left, right) => {
            keys.forward = forward;
            keys.reverse = reverse;
            keys.left = left;
            keys.right = right;
        },
        () => {
            // Jump button handler
            if (state.jumpZ <= 0) {
                state.jumpVelZ = 4.6;
                state.isBoosting = true;
                playSynthNote(523.25, 0.22, 0.09);
            }
        },
        () => {
            // Inspect button handler
            triggerDossierAction();
        },
        () => {
            // Horn button handler
            pulseBuzzer();
            playSynthNote(880, 0.15, 0.08);
        },
        () => {
            // Exit button handler
            deactivateRover();
        }
    );
    showRoverTouchControls();

    // Reset rover position to bottom center
    state.pos.set(0, -5.5, 0.22);
    state.angle = 0; // Facing UP (+Y) directly towards CPU
    state.speed = 0;
    state.jumpZ = 0;
    state.jumpVelZ = 0;
    activeDossierItem = null;
    lastDossierId = '';
    setRoverLaserTarget(null, false);
    resetPins();
}

/**
 * Deactivate the Nano-Rover drive mode.
 * @param {() => void} [onRestore]
 */
export function deactivateRover(onRestore) {
    if (!isActive) return;
    isActive = false;

    switchClack();
    stopRoverMotorSound();
    hideRoverTouchControls();

    if (roverGroup) roverGroup.visible = false;
    if (typeof document !== 'undefined') {
        document.body.classList.remove('rover-active');
        const roverBtn = document.getElementById('rover-toggle-btn');
        if (roverBtn) {
            roverBtn.setAttribute('aria-pressed', 'false');
            roverBtn.classList.remove('active');
        }
        if (roverHudEl) roverHudEl.setAttribute('hidden', '');
        if (inspectCardEl) inspectCardEl.setAttribute('hidden', '');
    }

    activeDossierItem = null;
    lastDossierId = '';
    setRoverLaserTarget(null, false);
    hideProjectVisuals();

    if (onRestore) {
        onRestore();
    } else if (camera) {
        gsap.to(camera.position, {
            x: savedCameraPos.x,
            y: savedCameraPos.y,
            z: savedCameraPos.z,
            duration: 1.0,
            ease: 'power3.inOut'
        });
    }
}

/**
 * Toggle Rover Drive Mode.
 * @param {() => void} [onRestore]
 */
export function toggleRover(onRestore) {
    if (isActive) deactivateRover(onRestore);
    else activateRover();
}

/**
 * Handle keydown for rover controls.
 * @param {string} key
 */
export function handleRoverKeyDown(key) {
    const k = key.toLowerCase();
    if (k === 'w' || key === 'ArrowUp') keys.forward = true;
    if (k === 's' || key === 'ArrowDown') keys.reverse = true;
    if (k === 'a' || key === 'ArrowLeft') keys.left = true;
    if (k === 'd' || key === 'ArrowRight') keys.right = true;
    if (key === ' ' || key === 'Shift') keys.drift = true;

    // Spacebar Aerial Jump Thruster
    if (key === ' ' && state.jumpZ <= 0) {
        state.jumpVelZ = 4.6;
        state.isBoosting = true;
        playSynthNote(523.25, 0.22, 0.09); // Aerial thruster surge
    }

    if (key === 'Enter') {
        triggerDossierAction();
    }
}

/**
 * Handle keyup for rover controls.
 * @param {string} key
 */
export function handleRoverKeyUp(key) {
    const k = key.toLowerCase();
    if (k === 'w' || key === 'ArrowUp') keys.forward = false;
    if (k === 's' || key === 'ArrowDown') keys.reverse = false;
    if (k === 'a' || key === 'ArrowLeft') keys.left = false;
    if (k === 'd' || key === 'ArrowRight') keys.right = false;
    if (key === ' ' || key === 'Shift') keys.drift = false;
}

/**
 * Update Rover kinematics, collisions, proximity scanning, and camera per frame.
 * @param {number} delta Frame delta time in seconds
 * @param {(chipRef: string) => void} [_onProjectDock] Legacy dock hook
 */
export function updateRoverPhysics(delta, _onProjectDock) {
    if (!isActive) return;

    // Detect Current Motherboard Terrain Surface
    const terrain = getRoverTerrainAt(state.pos.x, state.pos.y);
    state.terrain = terrain;

    // 1. Acceleration & Progressive Braking (scaled by surface traction)
    const baseAccel = 9.2 * terrain.accelMult;
    const maxSpeed = (state.isBoosting ? 7.5 : 4.6) * terrain.maxSpeedMult;
    const revSpeed = -2.4;

    if (keys.forward) {
        state.speed = Math.min(maxSpeed, state.speed + baseAccel * delta);
    } else if (keys.reverse) {
        state.speed = Math.max(revSpeed, state.speed - baseAccel * 1.3 * delta);
    } else {
        // Natural rolling resistance adjusted by surface friction
        state.speed *= Math.pow(terrain.friction, delta * 60);
        if (Math.abs(state.speed) < 0.02) state.speed = 0;
    }

    // 2. Progressive Steering with Lateral Drift Slip Physics
    const speedRatio = Math.min(1.0, Math.abs(state.speed) / 4.0);
    const maxSteerAngle = 0.58 - speedRatio * 0.12; // High-speed steering stability
    let targetSteer = 0;
    if (keys.left) targetSteer += maxSteerAngle;
    if (keys.right) targetSteer -= maxSteerAngle;

    state.steer += (targetSteer - state.steer) * (1 - Math.pow(0.78, delta * 60));

    // Turn yaw angle with drift slip (copper has lower grip, enabling slick drift curves)
    if (Math.abs(state.speed) > 0.05) {
        const driftThreshold = 0.38 * terrain.grip;
        const turnSpeed = state.steer * (state.speed > 0 ? 1 : -1) * (3.4 - speedRatio * 0.4);
        state.angle += turnSpeed * delta;
        state.isDrifting = keys.drift || (Math.abs(state.steer) > driftThreshold && Math.abs(state.speed) > 2.0);
    } else {
        state.isDrifting = false;
    }

    // 3. Move Position along Heading Vector with Drift Slip
    const forwardX = -Math.sin(state.angle) * state.speed * delta;
    const forwardY = Math.cos(state.angle) * state.speed * delta;
    state.pos.x += forwardX;
    state.pos.y += forwardY;

    // 4. Board Boundary Clamping & Laser Perimeter Forcefield
    const boundX = 4.85;
    const boundY = 6.65;
    if (Math.abs(state.pos.x) > boundX) {
        state.pos.x = Math.sign(state.pos.x) * boundX;
        state.speed *= -0.42; // Elastic forcefield rebound
        playSynthNote(220.0, 0.12, 0.04);
    }
    if (Math.abs(state.pos.y) > boundY) {
        state.pos.y = Math.sign(state.pos.y) * boundY;
        state.speed *= -0.42; // Elastic forcefield rebound
        playSynthNote(220.0, 0.12, 0.04);
    }

    // 5. Check Copper Trace Boost Rails & Conduction Lighting
    let nearTrace = false;
    traceData.forEach(route => {
        for (let i = 0; i < route.points.length - 1; i++) {
            const p = route.points[i];
            const dist = Math.hypot(state.pos.x - p.x, state.pos.y - p.y);
            if (dist < 0.35) {
                nearTrace = true;
                break;
            }
        }
    });

    // Dynamic Copper Conduction Lighting under Wheels
    if (Math.abs(state.speed) > 0.25) {
        energizeTraceAtPoint(state.pos, 0.65);
    }

    if (nearTrace && Math.abs(state.speed) > 1.0) {
        if (!state.isBoosting) {
            state.isBoosting = true;
            playSynthNote(587.33, 0.15, 0.06); // High boost chime
        }
    } else {
        state.isBoosting = false;
    }

    // 6. Check Prop Collisions & Jump Ramps
    const { jumped } = checkPropCollisions(state.pos, state.speed, state.angle);
    if (jumped && state.jumpZ <= 0) {
        state.jumpVelZ = 4.4;
        playSynthNote(523.25, 0.2, 0.08);
    }

    // Aerial Jump Thrusters & Gravity Simulation
    if (state.jumpVelZ !== 0 || state.jumpZ > 0) {
        state.jumpVelZ -= 14.5 * delta;
        state.jumpZ += state.jumpVelZ * delta;
        if (state.jumpZ <= 0) {
            state.jumpZ = 0;
            state.jumpVelZ = 0;
            state.pitch = -0.09; // Landing suspension bounce
            clickBlip();
            energizeTraceAtPoint(state.pos, 1.1); // Landing electrical shockwave
        }
    }
    state.pos.z = 0.22 + state.jumpZ;

    // Update playground props physics
    updatePlaygroundProps(delta);

    // 7. Suspension Pitch & Roll Calculations
    state.pitch = THREE.MathUtils.lerp(state.pitch, (keys.forward ? 0.06 : (keys.reverse ? -0.06 : 0)), 0.15);
    state.roll = THREE.MathUtils.lerp(state.roll, -state.steer * 0.15, 0.15);

    // 8. Motherboard Component Proximity Scanner & Interactive Reactions
    const nearby = findNearbyRoverComponent(state.pos.x, state.pos.y);
    if (nearby) {
        activeDossierItem = nearby.item;
        const targetPos = new THREE.Vector3(nearby.item.pos.x, nearby.item.pos.y, nearby.item.pos.z || 0.1);
        setRoverLaserTarget(targetPos, true);

        // Project 3D Hologram Diorama over project chips
        if (nearby.item.actionType === 'project') {
            showProjectVisual(nearby.item.actionTarget, targetPos);
        } else {
            hideProjectVisuals();
        }

        // Hardware Subsystem Proximity Reactions
        if (nearby.item.id === 'D1-D7') {
            triggerLedRunwayChase();
        } else if (nearby.item.id === 'C1-C4') {
            triggerCapacitorOverdrive();
        } else if (nearby.item.id === 'BZ1' && Math.abs(state.speed) > 1.2) {
            pulseBuzzer();
        }

        // Update Dossier card DOM if changing targets
        if (nearby.item.id !== lastDossierId) {
            lastDossierId = nearby.item.id;
            playSynthNote(784.0, 0.08, 0.04); // Sonar scan blip

            if (dossierBadgeEl) dossierBadgeEl.textContent = nearby.item.badge;
            if (dossierTitleEl) dossierTitleEl.textContent = nearby.item.title;
            if (dossierDescEl) dossierDescEl.textContent = nearby.item.summary;
            if (dossierActionTextEl) dossierActionTextEl.textContent = nearby.item.actionLabel;

            const metricsEl = dossierMetricsEl;
            if (metricsEl) {
                metricsEl.innerHTML = '';
                nearby.item.metrics.forEach(m => {
                    const pill = document.createElement('span');
                    pill.className = 'dossier-metric-pill';
                    pill.textContent = m;
                    metricsEl.appendChild(pill);
                });
            }

            if (inspectCardEl) inspectCardEl.removeAttribute('hidden');
        }
    } else {
        if (activeDossierItem) {
            activeDossierItem = null;
            lastDossierId = '';
            setRoverLaserTarget(null, false);
            hideProjectVisuals();
            if (inspectCardEl) inspectCardEl.setAttribute('hidden', '');
        }
    }

    // Update HUD Telemetry Gauges
    if (speedValEl) speedValEl.textContent = `${Math.abs(state.speed * 8.5).toFixed(1)} U/S`;
    if (headingValEl) headingValEl.textContent = `${Math.round(((state.angle * 180) / Math.PI + 360) % 360)}°`;
    if (boostValEl) {
        boostValEl.textContent = state.isBoosting ? 'SUPERCHARGED' : (state.isDrifting ? 'DRIFT CHARGE' : 'READY');
        boostValEl.style.color = state.isBoosting ? '#3ee6a0' : (state.isDrifting ? '#f59e0b' : '#38bdf8');
    }
    if (surfaceValEl) {
        surfaceValEl.textContent = terrain.shortName;
        surfaceValEl.style.color = terrain.color;
    }

    // Update 3D Rover Visuals
    updateRoverVisuals(state, delta);

    // Dynamic Brushless EV Motor Audio Synthesis
    updateRoverMotorSound(state.speed, state.isBoosting, state.speed < -0.05);

    // 9. Camera Smooth Tracking
    if (camera) {
        const targetCamX = state.pos.x * 0.6;
        const targetCamY = state.pos.y * 0.6 - 4.2;
        const targetCamZ = 12.5;

        camera.position.x += (targetCamX - camera.position.x) * (1 - Math.pow(0.85, delta * 60));
        camera.position.y += (targetCamY - camera.position.y) * (1 - Math.pow(0.85, delta * 60));
        camera.position.z += (targetCamZ - camera.position.z) * (1 - Math.pow(0.85, delta * 60));
    }
}
