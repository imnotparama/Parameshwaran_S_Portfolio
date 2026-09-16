// @ts-check
// ============================================================
// Contact Board Rotation Controller — Free 3D PCB Inspection
// Allows free 3D rotation of the motherboard ONLY on the last page
// (sec-contact). Features smooth inertial momentum, 360° yaw,
// bounded pitch (±83°), auto-realign when leaving the section,
// dynamic grab/grabbing cursors, and click suppression.
// ============================================================
import * as THREE from 'three';

const SENSITIVITY = 0.0055;
const MAX_PITCH = 1.45; // ~83° — allows inspecting top and bottom edges without gimbal inversion
const DRAG_THRESHOLD_PX = 6;

/**
 * Delta-scaled lerp factor for frame-rate independence
 * @param {number} k
 * @param {number} [delta]
 */
function lerpFactor(k, delta = 0.016) {
    return 1 - Math.exp(-k * delta * 60);
}

// ─── Module State ─────────────────────────────────────────────
let isDragging = false;
let lastX = 0;
let lastY = 0;
let dragDistance = 0;
let dragSuppressedUntil = 0;

let targetRotX = 0;
let targetRotY = 0;
let currentRotX = 0;
let currentRotY = 0;
let velX = 0;
let velY = 0;

/** @type {string} */
let currentSectionId = '';

const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();

/**
 * Returns true if a drag was recently performed (used to suppress raycast clicks).
 * @returns {boolean}
 */
export function wasContactBoardDragged() {
    return nowMs() < dragSuppressedUntil;
}

/**
 * Returns true if the user is actively dragging the board.
 * @returns {boolean}
 */
export function isContactBoardDragging() {
    return isDragging;
}

/**
 * Smoothly reset rotation back to standard frontal alignment (0, 0).
 */
export function resetContactBoardRotation() {
    targetRotX = 0;
    targetRotY = 0;
    velX = 0;
    velY = 0;
}

/**
 * Update and interpolate contact board rotation.
 * Called each frame from updateBoardParallax().
 * @param {number} delta Delta time in seconds
 * @param {string} [activeSecId] Active section ID
 * @returns {{ rotX: number, rotY: number, isRotating: boolean }}
 */
export function updateContactBoardRotation(delta, activeSecId) {
    currentSectionId = activeSecId || '';
    const isContact = currentSectionId === 'sec-contact';

    if (isContact) {
        // Apply inertia when not actively dragging
        if (!isDragging && (Math.abs(velX) > 1e-4 || Math.abs(velY) > 1e-4)) {
            targetRotY += velX;
            targetRotX = THREE.MathUtils.clamp(targetRotX + velY, -MAX_PITCH, MAX_PITCH);

            const decay = Math.pow(0.88, (delta || 0.016) * 60);
            velX *= decay;
            velY *= decay;

            if (Math.abs(velX) < 1e-5) velX = 0;
            if (Math.abs(velY) < 1e-5) velY = 0;
        }

        // Smoothly lerp towards target rotation
        currentRotX += (targetRotX - currentRotX) * lerpFactor(0.12, delta);
        currentRotY += (targetRotY - currentRotY) * lerpFactor(0.12, delta);
    } else {
        // Leaving sec-contact: reset targets and smoothly return board to zero
        targetRotX = 0;
        targetRotY = 0;
        velX = 0;
        velY = 0;

        currentRotX += (0 - currentRotX) * lerpFactor(0.1, delta);
        currentRotY += (0 - currentRotY) * lerpFactor(0.1, delta);

        if (Math.abs(currentRotX) < 1e-4 && Math.abs(currentRotY) < 1e-4) {
            currentRotX = 0;
            currentRotY = 0;
        }
    }

    const isRotating = isDragging || Math.abs(velX) > 1e-4 || Math.abs(velY) > 1e-4 ||
                       Math.abs(currentRotX) > 1e-3 || Math.abs(currentRotY) > 1e-3;

    return {
        rotX: currentRotX,
        rotY: currentRotY,
        isRotating
    };
}

/**
 * Initialize event listeners on the Three.js canvas.
 * @param {HTMLCanvasElement} canvas
 */
export function initContactBoardRotation(canvas) {
    if (!canvas) return;

    const onPointerDown = (/** @type {PointerEvent} */ e) => {
        // Only active on the contact page
        if (currentSectionId !== 'sec-contact') return;
        // Only primary mouse button or touch
        if (e.button !== 0 && e.pointerType === 'mouse') return;

        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        dragDistance = 0;
        velX = 0;
        velY = 0;

        if (canvas.setPointerCapture) {
            try {
                canvas.setPointerCapture(e.pointerId);
            } catch (_) {
                // Ignore if capture fails
            }
        }

        canvas.style.cursor = 'grabbing';
        document.body.classList.add('board-rotating');
    };

    const onPointerMove = (/** @type {PointerEvent} */ e) => {
        if (currentSectionId !== 'sec-contact') {
            if (isDragging) {
                isDragging = false;
                canvas.style.cursor = '';
                document.body.classList.remove('board-rotating');
            }
            return;
        }

        if (!isDragging) {
            // Hovering over canvas in contact section
            canvas.style.cursor = 'grab';
            return;
        }

        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;

        dragDistance += Math.hypot(dx, dy);

        // Turn right when dragging right, tilt top forward when dragging down
        targetRotY += dx * SENSITIVITY;
        targetRotX = THREE.MathUtils.clamp(targetRotX + dy * SENSITIVITY, -MAX_PITCH, MAX_PITCH);

        velX = dx * SENSITIVITY;
        velY = dy * SENSITIVITY;
    };

    const onPointerUp = (/** @type {PointerEvent} */ e) => {
        if (!isDragging) return;
        isDragging = false;

        if (canvas.releasePointerCapture) {
            try {
                canvas.releasePointerCapture(e.pointerId);
            } catch (_) {
                // Ignore
            }
        }

        if (dragDistance > DRAG_THRESHOLD_PX) {
            // Suppress accidental clicks on underlying components
            dragSuppressedUntil = nowMs() + 200;
        }

        canvas.style.cursor = currentSectionId === 'sec-contact' ? 'grab' : '';
        document.body.classList.remove('board-rotating');
    };

    const onDblClick = () => {
        if (currentSectionId === 'sec-contact') {
            resetContactBoardRotation();
        }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('dblclick', onDblClick);
}
