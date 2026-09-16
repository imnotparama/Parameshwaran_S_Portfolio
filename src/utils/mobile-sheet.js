// @ts-check
// ============================================================
// Mobile Bottom Sheet Engine — 3-State Cyber Datasheet Controller
// States:
//   'peek':     14dvh height (3D board playground, 86% viewport)
//   'split':    45dvh height (balanced 3D hardware + active specs)
//   'expanded': 88dvh height (full reading mode for deep specs)
// ============================================================
import { hapticTick, hapticClick } from './haptics.js';
import { clickBlip } from './sound.js';
import { syncCanvasSize } from '../three/scene.js';

/** @typedef {'peek' | 'split' | 'expanded'} MobileSheetState */

/** @type {MobileSheetState} */
let currentState = 'split';

/** @type {boolean} */
let isInitialized = false;

/** @type {number} */
let touchStartY = 0;
/** @type {number} */
let touchCurrentY = 0;
/** @type {number} */
let touchStartTime = 0;
/** @type {boolean} */
let isDragging = false;

/**
 * Get current sheet state.
 * @returns {MobileSheetState}
 */
export function getMobileSheetState() {
    return currentState;
}

/**
 * Set the mobile sheet state and update body classes & FAB cues.
 * @param {MobileSheetState} state
 * @param {boolean} [silent]
 */
export function setMobileSheetState(state, silent = false) {
    if (state !== 'peek' && state !== 'split' && state !== 'expanded') return;
    currentState = state;

    document.body.classList.remove('mobile-sheet-peek', 'mobile-sheet-split', 'mobile-sheet-expanded');
    document.body.classList.add(`mobile-sheet-${state}`);

    // Update floating mode toggle FAB if present
    const toggleBtn = document.getElementById('mobile-mode-toggle');
    if (toggleBtn) {
        const modeText = toggleBtn.querySelector('.mode-text');
        const modeIcon = toggleBtn.querySelector('.mode-icon');
        if (state === 'peek') {
            if (modeText) modeText.textContent = 'SPECS';
            if (modeIcon) modeIcon.textContent = '📄';
            toggleBtn.setAttribute('title', 'Open Datasheet');
        } else {
            if (modeText) modeText.textContent = '3D PCB';
            if (modeIcon) modeIcon.textContent = '⚡';
            toggleBtn.setAttribute('title', 'Open 3D Board Playground');
        }
    }

    // Update drag cue text on all handles
    document.querySelectorAll('.sheet-drag-cue').forEach((el) => {
        if (state === 'peek') {
            el.textContent = '▲ 3D BOARD PLAYGROUND · TAP FOR SPECS';
        } else if (state === 'split') {
            el.textContent = '▲ DRAG UP FOR FULL SPECS · TAP FOR 3D';
        } else {
            el.textContent = '▼ DRAG DOWN TO PEEK 3D BOARD';
        }
    });

    if (!silent) {
        hapticTick();
    }

    // Allow CSS transition to begin, then re-sync Three.js canvas size
    setTimeout(() => {
        syncCanvasSize();
    }, 50);
    setTimeout(() => {
        syncCanvasSize();
    }, 320);
}

/**
 * Toggle sheet between 3D playground (peek) and specs (split/expanded).
 */
export function toggleMobileSheet() {
    clickBlip();
    hapticClick();
    if (currentState === 'peek') {
        setMobileSheetState('split');
    } else if (currentState === 'split') {
        setMobileSheetState('expanded');
    } else {
        setMobileSheetState('peek');
    }
}

/**
 * Initialize dynamic bottom sheet listeners and gestures.
 */
export function initMobileSheet() {
    if (isInitialized) return;
    isInitialized = true;

    // Apply default initial state (split)
    setMobileSheetState('split', true);

    // Floating Mode Toggle FAB button
    const toggleBtn = document.getElementById('mobile-mode-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentState === 'peek') {
                setMobileSheetState('split');
            } else {
                setMobileSheetState('peek');
            }
        });
    }

    // Touch gesture handler for drag handles and upper sheet edge
    document.addEventListener('touchstart', (e) => {
        if (window.innerWidth >= 768) return;
        const target = /** @type {HTMLElement} */ (e.target);
        const handle = target.closest('.mobile-sheet-drag-handle, .ds-panel');
        if (!handle) return;

        // If touching inside .ds-panel, only allow drag if near the top edge (< 48px)
        // or directly on .mobile-sheet-drag-handle
        const isDirectHandle = !!target.closest('.mobile-sheet-drag-handle');
        const panel = target.closest('.ds-panel');
        if (!isDirectHandle && panel) {
            const rect = panel.getBoundingClientRect();
            if (e.touches[0].clientY - rect.top > 54) {
                // User is scrolling inside panel content, don't hijack
                return;
            }
        }

        isDragging = true;
        touchStartY = e.touches[0].clientY;
        touchCurrentY = touchStartY;
        touchStartTime = Date.now();
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isDragging || window.innerWidth >= 768) return;
        touchCurrentY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', () => {
        if (!isDragging || window.innerWidth >= 768) return;
        isDragging = false;

        const deltaY = touchCurrentY - touchStartY;
        const duration = Math.max(1, Date.now() - touchStartTime);
        const velocityY = deltaY / duration; // px per ms

        // Tap detected (small movement and short duration)
        if (Math.abs(deltaY) < 10 && duration < 300) {
            if (currentState === 'peek') {
                setMobileSheetState('split');
            } else if (currentState === 'split') {
                setMobileSheetState('expanded');
            } else {
                setMobileSheetState('split');
            }
            return;
        }

        // Fast swipe down (negative velocity) or swipe up
        if (velocityY > 0.45 || deltaY > 60) {
            // Dragged down
            if (currentState === 'expanded') {
                setMobileSheetState('split');
            } else if (currentState === 'split') {
                setMobileSheetState('peek');
            }
        } else if (velocityY < -0.45 || deltaY < -60) {
            // Dragged up
            if (currentState === 'peek') {
                setMobileSheetState('split');
            } else if (currentState === 'split') {
                setMobileSheetState('expanded');
            }
        }
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
        isDragging = false;
    }, { passive: true });
}
