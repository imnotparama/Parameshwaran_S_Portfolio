// @ts-check
// ============================================================
// 3D PCB Nano-Rover Virtual Touch Joystick & Mobile Controller
//
// 1. Analog Thumbstick (Bottom-Left):
//    - Real-time touch vector calculation for steering and throttle.
//    - Smooth thumbstick knob spring centering on touch release.
//
// 2. Action Cluster (Bottom-Right):
//    - BOOST / JUMP button (aerial thrusters).
//    - INSPECT button (component proximity datasheet trigger).
//    - HORN button (piezo transducer pulse).
//    - EXIT button (return to scroll journey).
//
// 3. Web Haptics Integration:
//    - Micro-vibration ticks and clicks on tactile interactions.
// ============================================================

import { hapticTick, hapticClick } from '../utils/haptics.js';

/** @type {HTMLElement | null} */
let touchContainer = null;
/** @type {HTMLElement | null} */
let stickBase = null;
/** @type {HTMLElement | null} */
let stickKnob = null;

let isTouchActive = false;
let touchId = -1;
let stickCenterX = 0;
let stickCenterY = 0;
const STICK_MAX_RADIUS = 48; // Max thumb travel radius in px

// Virtual vector outputs (-1.0 to 1.0)
let steerX = 0;
let throttleY = 0;

/** @type {((forward: boolean, reverse: boolean, left: boolean, right: boolean) => void) | null} */
let steerCallback = null;
/** @type {(() => void) | null} */
let jumpCallback = null;
/** @type {(() => void) | null} */
let inspectCallback = null;
/** @type {(() => void) | null} */
let hornCallback = null;
/** @type {(() => void) | null} */
let exitCallback = null;

let isInitialized = false;

/**
 * Initialize mobile virtual touch controls for rover drive mode.
 * @param {(forward: boolean, reverse: boolean, left: boolean, right: boolean) => void} onSteer
 * @param {() => void} onJump
 * @param {() => void} onInspect
 * @param {() => void} onHorn
 * @param {() => void} onExit
 */
export function initRoverTouch(onSteer, onJump, onInspect, onHorn, onExit) {
    if (isInitialized || typeof document === 'undefined' || !document.body || typeof document.body.appendChild !== 'function') return;
    isInitialized = true;

    steerCallback = onSteer;
    jumpCallback = onJump;
    inspectCallback = onInspect;
    hornCallback = onHorn;
    exitCallback = onExit;

    // Create Virtual Touch Overlay
    touchContainer = document.createElement('div');
    touchContainer.id = 'rover-touch-overlay';
    touchContainer.className = 'rover-touch-overlay';
    if (typeof touchContainer.setAttribute === 'function') {
        touchContainer.setAttribute('hidden', '');
        touchContainer.setAttribute('aria-hidden', 'true');
    }

    touchContainer.innerHTML = `
        <!-- Analog Thumbstick -->
        <div class="rover-stick-zone" id="rover-stick-zone">
            <div class="rover-stick-base" id="rover-stick-base">
                <div class="rover-stick-crosshair"></div>
                <div class="rover-stick-knob" id="rover-stick-knob"></div>
            </div>
            <span class="rover-stick-label">STEER / DRIVE</span>
        </div>

        <!-- Touch Action Buttons Cluster -->
        <div class="rover-touch-actions">
            <button type="button" class="rover-action-touch-btn btn-jump" id="touch-btn-jump" aria-label="Jump & Boost">
                <span class="touch-btn-icon">⚡</span>
                <span class="touch-btn-tag">JUMP</span>
            </button>
            <button type="button" class="rover-action-touch-btn btn-inspect" id="touch-btn-inspect" aria-label="Inspect Component">
                <span class="touch-btn-icon">🔍</span>
                <span class="touch-btn-tag">INSPECT</span>
            </button>
            <button type="button" class="rover-action-touch-btn btn-horn" id="touch-btn-horn" aria-label="Sound Horn">
                <span class="touch-btn-icon">🔊</span>
                <span class="touch-btn-tag">HORN</span>
            </button>
            <button type="button" class="rover-action-touch-btn btn-exit" id="touch-btn-exit" aria-label="Exit Rover Mode">
                <span class="touch-btn-icon">✕</span>
                <span class="touch-btn-tag">EXIT</span>
            </button>
        </div>
    `;

    document.body.appendChild(touchContainer);

    stickBase = document.getElementById('rover-stick-base');
    stickKnob = document.getElementById('rover-stick-knob');
    const stickZone = document.getElementById('rover-stick-zone');

    // ─── Analog Thumbstick Touch Handlers ────────────────────────
    if (stickZone && stickBase && stickKnob) {
        stickZone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (isTouchActive) return;
            const touch = e.changedTouches[0];
            touchId = touch.identifier;
            isTouchActive = true;
            hapticTick();

            if (stickBase) {
                const rect = stickBase.getBoundingClientRect();
                stickCenterX = rect.left + rect.width / 2;
                stickCenterY = rect.top + rect.height / 2;
                handleThumbMove(touch.clientX, touch.clientY);
            }
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (!isTouchActive) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                if (touch.identifier === touchId) {
                    e.preventDefault();
                    handleThumbMove(touch.clientX, touch.clientY);
                    break;
                }
            }
        }, { passive: false });

        /** @param {TouchEvent} e */
        const resetStick = (e) => {
            if (!isTouchActive) return;
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === touchId) {
                    isTouchActive = false;
                    touchId = -1;
                    steerX = 0;
                    throttleY = 0;
                    if (stickKnob) {
                        stickKnob.style.transform = 'translate(0px, 0px)';
                    }
                    if (steerCallback) {
                        steerCallback(false, false, false, false);
                    }
                    break;
                }
            }
        };

        window.addEventListener('touchend', resetStick, { passive: true });
        window.addEventListener('touchcancel', resetStick, { passive: true });
    }

    // ─── Action Buttons Handlers ────────────────────────────────
    const btnJump = document.getElementById('touch-btn-jump');
    if (btnJump) {
        btnJump.addEventListener('touchstart', (e) => {
            e.preventDefault();
            hapticClick();
            if (jumpCallback) jumpCallback();
        }, { passive: false });
    }

    const btnInspect = document.getElementById('touch-btn-inspect');
    if (btnInspect) {
        btnInspect.addEventListener('touchstart', (e) => {
            e.preventDefault();
            hapticClick();
            if (inspectCallback) inspectCallback();
        }, { passive: false });
    }

    const btnHorn = document.getElementById('touch-btn-horn');
    if (btnHorn) {
        btnHorn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            hapticClick();
            if (hornCallback) hornCallback();
        }, { passive: false });
    }

    const btnExit = document.getElementById('touch-btn-exit');
    if (btnExit) {
        btnExit.addEventListener('touchstart', (e) => {
            e.preventDefault();
            hapticClick();
            if (exitCallback) exitCallback();
        }, { passive: false });
    }
}

/**
 * Handle touch point offset calculation relative to stick center.
 * @param {number} clientX
 * @param {number} clientY
 */
function handleThumbMove(clientX, clientY) {
    const dx = clientX - stickCenterX;
    const dy = clientY - stickCenterY;
    const dist = Math.hypot(dx, dy);

    let normX = dx;
    let normY = dy;
    if (dist > STICK_MAX_RADIUS) {
        const angle = Math.atan2(dy, dx);
        normX = Math.cos(angle) * STICK_MAX_RADIUS;
        normY = Math.sin(angle) * STICK_MAX_RADIUS;
    }

    if (stickKnob) {
        stickKnob.style.transform = `translate(${normX.toFixed(1)}px, ${normY.toFixed(1)}px)`;
    }

    // Convert to normalized vector
    steerX = normX / STICK_MAX_RADIUS;
    throttleY = -normY / STICK_MAX_RADIUS; // Up is positive forward

    const forward = throttleY > 0.25;
    const reverse = throttleY < -0.25;
    const left = steerX < -0.25;
    const right = steerX > 0.25;

    if (steerCallback) {
        steerCallback(forward, reverse, left, right);
    }
}

/**
 * Show mobile touch overlay if on touch-capable device.
 */
export function showRoverTouchControls() {
    if (!touchContainer || typeof touchContainer.removeAttribute !== 'function') return;
    const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (isTouchDevice || (typeof window !== 'undefined' && window.innerWidth <= 1024)) {
        touchContainer.removeAttribute('hidden');
        if (typeof touchContainer.setAttribute === 'function') {
            touchContainer.setAttribute('aria-hidden', 'false');
        }
    }
}

/**
 * Hide mobile touch overlay.
 */
export function hideRoverTouchControls() {
    if (!touchContainer || typeof touchContainer.setAttribute !== 'function') return;
    touchContainer.setAttribute('hidden', '');
    touchContainer.setAttribute('aria-hidden', 'true');
    isTouchActive = false;
    touchId = -1;
    if (stickKnob) {
        stickKnob.style.transform = 'translate(0px, 0px)';
    }
}
