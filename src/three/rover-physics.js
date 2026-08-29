// @ts-check
// ============================================================
// Nano-Rover Arcade Kinematics & Playground Controller
//
// 1. Arcade Vehicle Kinematics:
//    - Acceleration, reverse, braking, and spring steering.
//    - Drift physics with centrifugal lateral slip.
//    - Boundary clamping keeping the vehicle on the PCB board.
//
// 2. Interactive Systems:
//    - Trace Boost Rails: Driving over copper traces triggers speed boosts.
//    - Project Chip Docking: Parking at a project chip opens its datasheet.
//    - Prop Collisions: Knocks over solder pins & launches off jump ramps.
//    - Camera Tracking: Camera glides to follow the rover in 3D.
// ============================================================

import * as THREE from 'three';
import gsap from 'gsap';
import { roverGroup, updateRoverVisuals } from './rover.js';
import { checkPropCollisions, updatePlaygroundProps, resetPins } from './playground-props.js';
import { traceData } from './traces.js';
import { projectChips } from './project-chips.js';
import { camera } from './scene.js';
import { hoverBlip, clickBlip, switchClack } from '../utils/sound.js';
import { playSynthNote } from '../utils/synth.js';

let isActive = false;

// Kinematics State
const state = {
    pos: new THREE.Vector3(0, -5.5, 0.22),
    vel: new THREE.Vector3(),
    angle: Math.PI / 2, // Facing UP towards CPU
    speed: 0,
    steer: 0,
    pitch: 0,
    roll: 0,
    isDrifting: false,
    boost: 1.0,
    isBoosting: false,
    jumpZ: 0,
    jumpVelZ: 0
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
let chipDockCooldown = 0;

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

    if (roverGroup) roverGroup.visible = true;
    document.body.classList.add('rover-active');

    const roverBtn = document.getElementById('rover-toggle-btn');
    if (roverBtn) {
        roverBtn.setAttribute('aria-pressed', 'true');
        roverBtn.classList.add('active');
    }

    if (camera) {
        savedCameraPos.copy(camera.position);
    }

    // Reset rover position to bottom center
    state.pos.set(0, -5.5, 0.22);
    state.angle = Math.PI / 2;
    state.speed = 0;
    state.jumpZ = 0;
    state.jumpVelZ = 0;
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

    if (roverGroup) roverGroup.visible = false;
    document.body.classList.remove('rover-active');

    const roverBtn = document.getElementById('rover-toggle-btn');
    if (roverBtn) {
        roverBtn.setAttribute('aria-pressed', 'false');
        roverBtn.classList.remove('active');
    }

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
 * Update Rover kinematics, collisions, and camera per frame.
 * @param {number} delta Frame delta time in seconds
 * @param {(chipRef: string) => void} [onProjectDock]
 */
export function updateRoverPhysics(delta, onProjectDock) {
    if (!isActive) return;

    // 1. Acceleration & Braking
    const accel = 9.0;
    const maxSpeed = state.isBoosting ? 7.2 : 4.4;
    const revSpeed = -2.2;

    if (keys.forward) {
        state.speed = Math.min(maxSpeed, state.speed + accel * delta);
    } else if (keys.reverse) {
        state.speed = Math.max(revSpeed, state.speed - accel * 1.2 * delta);
    } else {
        // Friction / Coasting deceleration
        state.speed *= Math.pow(0.92, delta * 60);
        if (Math.abs(state.speed) < 0.02) state.speed = 0;
    }

    // 2. Steering & Drifting
    const maxSteerAngle = 0.55;
    let targetSteer = 0;
    if (keys.left) targetSteer += maxSteerAngle;
    if (keys.right) targetSteer -= maxSteerAngle;

    state.steer += (targetSteer - state.steer) * (1 - Math.pow(0.8, delta * 60));

    // Turn yaw angle proportional to speed
    if (Math.abs(state.speed) > 0.05) {
        const turnSpeed = state.steer * (state.speed > 0 ? 1 : -1) * 3.2;
        state.angle += turnSpeed * delta;
        state.isDrifting = keys.drift || (Math.abs(state.steer) > 0.4 && Math.abs(state.speed) > 2.5);
    } else {
        state.isDrifting = false;
    }

    // 3. Move Position along Heading Vector
    const moveX = -Math.sin(state.angle) * state.speed * delta;
    const moveY = Math.cos(state.angle) * state.speed * delta;
    state.pos.x += moveX;
    state.pos.y += moveY;

    // 4. Board Boundary Clamping
    const boundX = 5.0;
    const boundY = 6.8;
    if (Math.abs(state.pos.x) > boundX) {
        state.pos.x = Math.sign(state.pos.x) * boundX;
        state.speed *= -0.3; // bounce
    }
    if (Math.abs(state.pos.y) > boundY) {
        state.pos.y = Math.sign(state.pos.y) * boundY;
        state.speed *= -0.3;
    }

    // 5. Check Copper Trace Boost Rails
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

    if (nearTrace && Math.abs(state.speed) > 1.0) {
        if (!state.isBoosting) {
            state.isBoosting = true;
            playSynthNote(587.33, 0.15, 0.06); // High boost chime
        }
    } else {
        state.isBoosting = false;
    }

    // 6. Check Prop Collisions (Bowling Pins & Jump Ramps)
    const { jumped } = checkPropCollisions(state.pos, state.speed, state.angle);
    if (jumped && state.jumpZ <= 0) {
        state.jumpVelZ = 4.2;
        playSynthNote(523.25, 0.2, 0.08);
    }

    // Aerial jump gravity
    if (state.jumpVelZ !== 0 || state.jumpZ > 0) {
        state.jumpVelZ -= 14.0 * delta;
        state.jumpZ += state.jumpVelZ * delta;
        if (state.jumpZ <= 0) {
            state.jumpZ = 0;
            state.jumpVelZ = 0;
            clickBlip(); // landing thud
        }
    }
    state.pos.z = 0.22 + state.jumpZ;

    // Update playground props physics
    updatePlaygroundProps(delta);

    // 7. Suspension Pitch & Roll Calculations
    state.pitch = THREE.MathUtils.lerp(state.pitch, (keys.forward ? 0.06 : (keys.reverse ? -0.06 : 0)), 0.15);
    state.roll = THREE.MathUtils.lerp(state.roll, -state.steer * 0.15, 0.15);

    // 8. Project Chip Docking Detection
    if (chipDockCooldown > 0) chipDockCooldown -= delta;
    if (chipDockCooldown <= 0 && onProjectDock && Math.abs(state.speed) < 0.4) {
        for (const [ref, chip] of Object.entries(projectChips)) {
            const dist = Math.hypot(state.pos.x - chip.pos.x, state.pos.y - chip.pos.y);
            if (dist < 0.55) {
                chipDockCooldown = 4.0; // cooldown
                playSynthNote(659.25, 0.3, 0.1);
                onProjectDock(ref);
                break;
            }
        }
    }

    // Update 3D Rover Visuals
    updateRoverVisuals(state, delta);

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
