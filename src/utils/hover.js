// @ts-check
// ============================================================
// Hover Controller — raycast hover-glow on the interactive board.
// Single interaction model: the scroll journey owns the camera;
// this module only drives pointer parallax and hover feedback.
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { interactiveObjects } from '../three/components.js';

// ─── Exports ────────────────────────────────────────────────
export const mouse = new THREE.Vector2();
// Module-private: instant (unlagged) pointer position — only main.js's parallax
// feeds from the smoothed `mouse`; nothing external imports targetMouse.
const targetMouse = new THREE.Vector2();

// Clamping helper for pointer bounds
const clamp = (/** @type {number} */ val, /** @type {number} */ min, /** @type {number} */ max) => Math.min(Math.max(val, min), max);

// ─── Internal State ─────────────────────────────────────────
/** @type {THREE.Raycaster | null} */
let raycaster = null;
/** @type {THREE.Camera | null} */
let activeCamera = null;
/** @type {THREE.Object3D | null} */
let currentHovered = null;
let frameCounter = 0;
/** @type {THREE.PointLight | null} */
let hoverLight = null;
/** @type {((chipRef: string) => void) | null} */
let clickHandler = null;
/** @type {(() => void) | null} */
let buzzerHandler = null;

// ─── PCB Hover Glow Color Map ───────────────────────────────
/** @type {Record<string, number>} */
const PCB_GLOW_MAP = {
    'U1': 0x3ee6a0, 'U2': 0x00bfff, 'Y1': 0xaa44ff,
    'ANT1': 0x00ffff, 'J1': 0xff8800, 'VR1': 0xff4444,
    'RN1': 0x14b8a6, 'TP1': 0xffcc00, 'TP2': 0xffcc00
};

// ─── Live scope readout data ─────────────────────────────────
// Per-component instrument values for the HUD scope chip (hover.js fills
// #hud-scope while the probe is over a component). The voice matches the
// rest of the board: refs, voltages, frequencies, states — a live datasheet.
/** @typedef {{ v: string, f: string, state: string }} ScopeReading */
/** @type {Record<string, ScopeReading>} */
const SCOPE_MAP = {
    'U1':     { v: '3.3V',      f: '27MHz',     state: 'RUNNING' },
    'U2':     { v: '1.1V',      f: '16MHz',     state: 'ACCEL' },
    'C1':     { v: '3.3V',      f: '100nF',     state: 'DECOUPLE' },
    'C2':     { v: '3.3V',      f: '100nF',     state: 'DECOUPLE' },
    'C3':     { v: '3.3V',      f: '10µF',      state: 'BULK' },
    'C4':     { v: '3.3V',      f: '10µF',      state: 'BULK' },
    'Y1':     { v: '—',         f: '27.000MHz', state: 'OSC' },
    'ANT1':   { v: '—',         f: '2.4GHz',    state: 'TX/RX' },
    'J1':     { v: '5V',        f: '480Mbps',   state: 'LINK' },
    'VR1':    { v: '5V→3.3V',   f: '—',         state: 'REG' },
    'D1-D7':  { v: '2.0V',      f: '20mA',      state: 'LIT' },
    'RN1':    { v: '4.7kΩ',     f: '—',         state: 'PULL-UP' },
    'TP1':    { v: '5V',        f: '—',         state: 'REF' },
    'TP2':    { v: 'GND',       f: '—',         state: 'REF' },
    'BZ1':    { v: '3.3V',      f: '2.7kHz',    state: 'SILENT' }
};

/** @type {HTMLElement | null} */
let scopeRefEl = null;
/** @type {HTMLElement | null} */
let scopeValEl = null;

/** Fill the HUD scope readout with a component's measurement.
 *  @param {string} name Ref designator (mesh.name)
 *  @param {any} userData The mesh's userData (type + componentName) */
export function setScopeReadout(name, userData) {
    if (!scopeRefEl || !scopeValEl) {
        scopeRefEl = document.getElementById('hud-scope-ref');
        scopeValEl = document.getElementById('hud-scope-val');
        if (!scopeRefEl || !scopeValEl) return;
    }
    const type = userData && userData.type;
    /** @type {ScopeReading} */
    let reading = { v: '—', f: '—', state: '—' };
    if (type === 'PROJECT') {
        // The chip's status lives in its componentName ("TITLE — SOLDERED (SHIPPED)").
        const status = String(userData && userData.componentName || '').split('—').pop();
        reading = { v: '3.3V', f: '—', state: (status || '—').trim() };
    } else if (SCOPE_MAP[name]) {
        reading = SCOPE_MAP[name];
    }
    scopeRefEl.textContent = name || '? ';
    scopeValEl.textContent = `${reading.v} · ${reading.f} · ${reading.state}`;
    document.body.classList.add('hud-scope-live');
}

/** Return the HUD scope chip to its idle state. */
export function clearScopeReadout() {
    if (scopeRefEl) scopeRefEl.textContent = 'SCOPE';
    if (scopeValEl) scopeValEl.textContent = 'AWAIT PROBE';
    document.body.classList.remove('hud-scope-live');
}

/** Clear the active mouse hover (glow, cursor state, scope readout) — used
 *  when the flying scope probe (probe.js) takes over: one probe at a time. */
export function clearHover() {
    if (!currentHovered) {
        clearScopeReadout();
        return;
    }
    resetHoverMesh(currentHovered);
    currentHovered = null;
    document.body.style.cursor = 'default';
    document.body.classList.remove('probe-target');
    delete document.body.dataset.hoverType;
    delete document.body.dataset.hoverRef;
    clearScopeReadout();
}

// ─── Init ───────────────────────────────────────────────────

/** @param {THREE.Camera} camera @param {THREE.Scene} scene */
export function initHover(camera, scene) {
    activeCamera = camera;
    raycaster = new THREE.Raycaster();

    // Create moving PointLight for hovered component glow
    hoverLight = new THREE.PointLight(0xffffff, 0, 3);
    scene.add(hoverLight);

    // Setup mouse/touch coordinate tracking with bounded clamp & smooth target
    const updateMouseCoords = (/** @type {number} */ clientX, /** @type {number} */ clientY) => {
        const hw = window.innerWidth / 2;
        const hh = window.innerHeight / 2;
        const rawX = (clientX - hw) / hw;
        const rawY = -(clientY - hh) / hh;
        targetMouse.x = clamp(rawX, -1.0, 1.0);
        targetMouse.y = clamp(rawY, -1.0, 1.0);
    };

    window.addEventListener('mousemove', (e) => updateMouseCoords(e.clientX, e.clientY));

    // Touch support
    window.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) updateMouseCoords(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) updateMouseCoords(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    // Click-to-component: raycast the click against interactive objects and
    // forward PROJECT hits (the project chips) to the registered handler.
    // Listener is on the canvas element only — clicks on HUD/panels (higher
    // z-index) never reach it, so nav and panel interactions stay untouched.
    const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('threejs-canvas'));
    if (canvas) {
        canvas.addEventListener('click', (e) => {
            if (!clickHandler || !raycaster || !activeCamera) return;
            const hw = window.innerWidth / 2;
            const hh = window.innerHeight / 2;
            const ndc = new THREE.Vector2((e.clientX - hw) / hw, -(e.clientY - hh) / hh);
            raycaster.setFromCamera(ndc, activeCamera);
            const targets = interactiveObjects.filter((obj) => obj.userData && obj.userData.isInteractive);
            const hits = raycaster.intersectObjects(targets, false);
            if (hits.length > 0) {
                const obj = hits[0].object;
                if (obj.userData && obj.userData.type === 'PROJECT' && obj.name && clickHandler) {
                    clickHandler(obj.name);
                } else if (obj.userData && obj.userData.type === 'BUZZER' && buzzerHandler) {
                    buzzerHandler();
                }
            }
        });
    }
}

/** Register the callback fired when a project chip is clicked on the board.
 * @param {(chipRef: string) => void} fn */
export function setBoardClickHandler(fn) {
    clickHandler = fn;
}

/** Register the callback fired when the piezo buzzer (BZ1) is clicked.
 * @param {() => void} fn */
export function setBuzzerHandler(fn) {
    buzzerHandler = fn;
}

// ─── Per-frame Raycast Check ────────────────────────────

export function checkHover(delta = 1 / 60) {
    if (!raycaster || !activeCamera) return;

    // Smooth target mouse LERP — gives parallax a 500ms spring-decay feel.
    // Delta-scaled so the feel is identical at any frame rate (a fixed
    // 0.08/frame would smooth only half as fast at 30fps). At 60fps the
    // factor is exactly 0.08, matching the original behavior.
    const lerpFactor = 1 - Math.pow(0.92, delta * 60);
    mouse.x += (targetMouse.x - mouse.x) * lerpFactor;
    mouse.y += (targetMouse.y - mouse.y) * lerpFactor;

    frameCounter++;

    // Throttle raycasts to every 3rd frame
    if (frameCounter % 3 !== 0) return;

    // components.js is now in the checked set — interactiveObjects is typed
    // THREE.Mesh[], so the filter callback narrows without a cast.
    const targets = interactiveObjects.filter((obj) => obj.userData && obj.userData.isInteractive);
    // Use targetMouse (instant, unlagged) for accurate raycasting — smoothed mouse
    // is only used for parallax board tilt via updateBoardParallax()
    raycaster.setFromCamera(targetMouse, activeCamera);
    const intersects = raycaster.intersectObjects(targets, false);

    if (intersects.length > 0) {
        const first = intersects[0].object;
        if (currentHovered !== first) {
            resetHoverMesh(currentHovered);
            currentHovered = first;
            if (first instanceof THREE.Mesh) {
                handleHoverEnter(first);
            }
        }
    } else if (currentHovered) {
        // Same cleanup as clearHover (the pointer left the component).
        clearHover();
    }
}

// ─── Hover Enter Logic ────────────────────────────────────

/** @param {THREE.Mesh} mesh */
function handleHoverEnter(mesh) {
    // Materials are heterogeneous across component types (Standard/Basic/Phong) —
    // hover only touches .emissive/.emissiveIntensity, which all share.
    const mat = /** @type {any} */ (mesh.material);
    const name = mesh.name;
    const glowColor = PCB_GLOW_MAP[name] || 0x3ee6a0;

    // Subtle glow — a preview, not the full arrival moment
    if (mat.emissive) {
        mat.emissive.setHex(glowColor);
        gsap.to(mat, { emissiveIntensity: 0.5, duration: 0.2, overwrite: 'auto' });
    }

    // Subtle scale pulse — lighter than arrival
    gsap.killTweensOf(mesh.scale);
    gsap.to(mesh.scale, { x: 1.04, y: 1.04, z: 1.04, duration: 0.2, ease: 'power1.out', overwrite: 'auto' });

    // Mini hover light — subtle preview glow only
    if (hoverLight) {
        hoverLight.color.setHex(glowColor);
        mesh.getWorldPosition(hoverLight.position);
        hoverLight.position.z += 0.3;
        gsap.to(hoverLight, { intensity: 0.6, duration: 0.2, overwrite: 'auto' });
    }

    document.body.style.cursor = 'pointer';
    // The custom scope-probe cursor reads this class to enter its
    // "measuring" state (cursor.js) — the pointer is ON a board component.
    document.body.classList.add('probe-target');
    // The hovered component's type + ref let the cursor readout specialize
    // (BEEP over the buzzer, MEASURE over a project chip, the ref elsewhere)
    // and the HUD scope chip shows the live measurement.
    document.body.dataset.hoverType = String(mesh.userData && mesh.userData.type || '');
    document.body.dataset.hoverRef = name;
    setScopeReadout(name, mesh.userData);
}

// ─── Hover Exit Logic ────────────────────────────────────

/** @param {THREE.Object3D | null} obj */
function resetHoverMesh(obj) {
    if (!obj || !(obj instanceof THREE.Mesh)) return;

    const mat = /** @type {any} */ (obj.material);

    if (hoverLight) gsap.to(hoverLight, { intensity: 0, duration: 0.25, overwrite: 'auto' });

    // Immediate emissive reset (no ghosting)
    if (mat.emissive) {
        mat.emissiveIntensity = 0.0;
        mat.emissive.setHex(0x000000);
    }

    gsap.killTweensOf(obj.scale);
    gsap.to(obj.scale, { x: 1, y: 1, z: 1, duration: 0.25, overwrite: 'auto' });
}
