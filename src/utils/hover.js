// @ts-check
// ============================================================
// Hover Controller — raycast hover-glow on the interactive board.
// Single interaction model: the scroll journey owns the camera;
// this module only drives pointer parallax and hover feedback.
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { interactiveObjects, pressTactile } from '../three/components.js';
import { highlightTrace } from '../three/traces.js';
import { hoverBlip, clickBlip } from './sound.js';

// ─── Exports ────────────────────────────────────────────────
export const mouse = new THREE.Vector2();
// Module-private: instant (unlagged) pointer position — only main.js's parallax
// feeds from the smoothed `mouse`; nothing external imports targetMouse.
const targetMouse = new THREE.Vector2();

// Clamping helper for pointer bounds
const clamp = (/** @type {number} */ val, /** @type {number} */ min, /** @type {number} */ max) => Math.min(Math.max(val, min), max);

/** Wall-clock for the input-suppression window only (never scene state). */
const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();

// ─── Internal State ─────────────────────────────────────────
/** @type {THREE.Raycaster | null} */
let raycaster = null;
/** @type {THREE.Camera | null} */
let activeCamera = null;
// The canvas element — cached so pointer→NDC conversion measures the actual
// canvas region (NOT the window). On desktop the split pins the canvas to the
// left 58% of the viewport and the camera frustum matches the canvas, so a
// window-relative conversion misaims every raycast horizontally; on mobile
// the canvas is a 48vh strip, misaiming vertically. The canvas rect is the
// only correct space (threejs-interaction: "For specific canvas element").
/** @type {HTMLCanvasElement | null} */
let hoverCanvas = null;
/** @type {THREE.Object3D | null} */
let currentHovered = null;
let frameCounter = 0;
/** @type {THREE.PointLight | null} */
let hoverLight = null;
/** @type {((chipRef: string) => void) | null} */
let clickHandler = null;
/** @type {(() => void) | null} */
let buzzerHandler = null;
/** @type {((switchName: string) => void) | null} */
let switchHandler = null;
// Hover is a fine-pointer concept — touch has no hover state, so the per-frame
// raycast would burn cost for nothing and leave a glow stuck at the last tap
// point. The flag is live (same listener pattern as motionPrefs): a device
// gaining/losing a fine pointer mid-session applies without a reload. The
// parallax lerp is NOT gated — touch users keep the board tilt. Exported so
// probe.js can gate its tip raycast on the same single source (the probe is a
// fine-pointer/keyboard interaction).
export let finePointer = false;
// Hybrid-touch guard: on touchscreen laptops (pointer: fine) a tap fires
// touchstart → raycast glow, then touchend, then ~300ms later a SYNTHETIC
// mousemove at the tap point that would re-light the glow and stick it. The
// window gates BOTH the synthetic mousemove feed AND the per-frame raycast —
// the latter is essential: without it, the next checkHover tick re-lights the
// glow from the stale aim point even with the feed suppressed. Wall-clock is
// appropriate here — this is input debouncing, not scene state.
const HYBRID_TOUCH_WINDOW_MS = 600;
let suppressHoverUntil = 0;

// ─── PCB Hover Glow Color Map ───────────────────────────────
/** @type {Record<string, number>} */
const PCB_GLOW_MAP = {
    'U1': 0x3ee6a0, 'U2': 0x00bfff, 'Y1': 0xaa44ff,
    'ANT1': 0x00ffff, 'J1': 0xff8800, 'VR1': 0xff4444,
    'RN1': 0x14b8a6, 'TP1': 0xffcc00, 'TP2': 0xffcc00,
    'C5': 0x10b981, 'RF1': 0x00ffff, 'HDR1': 0xffcc00,
    'L1': 0x14b8a6, 'RV1': 0xff8800, 'SW1': 0x3ee6a0, 'SW2': 0x3ee6a0, 'SW3': 0x3ee6a0
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
    'BZ1':    { v: '3.3V',      f: '2.7kHz',    state: 'SILENT' },
    'C5':     { v: '16V',       f: '100µF',     state: 'BULK' },
    'RF1':    { v: '3.3V',      f: '2.4GHz',    state: 'RF SHIELD' },
    'HDR1':   { v: '5V',        f: '—',         state: 'BREAKOUT' },
    'L1':     { v: '—',         f: '10µH',      state: 'BUCK' },
    'RV1':    { v: '10kΩ',      f: '—',         state: 'ADJ' },
    'SW1':    { v: '3.3V',      f: '—',         state: 'MOMENTARY' },
    'SW2':    { v: '3.3V',      f: '—',         state: 'MOMENTARY' },
    'SW3':    { v: '3.3V',      f: '—',         state: 'MOMENTARY' }
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
    // Pointer→NDC is measured against the CANVAS rect, not the window: the
    // camera frustum spans the canvas region (58% split on desktop, 48vh
    // strip on mobile), so NDC must be canvas-relative or the raycast aims
    // ~21%-of-window left of the cursor on desktop (the cursor would have to
    // sit near the sidebar edge to hover the center of the board). Pointer
    // positions outside the canvas clamp to the frustum edge — correct, the
    // ray just stays at the edge of the board.
    hoverCanvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('threejs-canvas'));

    // Pointer capability: only run the hover raycast when the primary pointer
    // is fine (mouse/trackpad). On touch the raycast would fire every 3rd
    // frame for no hover state and leave sticky glows — gate it, keep parallax.
    const pointerQuery = window.matchMedia('(pointer: fine)');
    finePointer = pointerQuery.matches;
    const syncFinePointer = (/** @type {MediaQueryListEvent | MediaQueryList} */ e) => {
        finePointer = e.matches;
    };
    if (typeof pointerQuery.addEventListener === 'function') {
        pointerQuery.addEventListener('change', syncFinePointer);
    } else if (typeof pointerQuery.addListener === 'function') {
        pointerQuery.addListener(syncFinePointer);
    }

    const updateMouseCoords = (/** @type {number} */ clientX, /** @type {number} */ clientY) => {
        if (!hoverCanvas) return;
        const rect = hoverCanvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const rawX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const rawY = -((clientY - rect.top) / rect.height) * 2 + 1;
        targetMouse.x = clamp(rawX, -1.0, 1.0);
        targetMouse.y = clamp(rawY, -1.0, 1.0);
    };

    // Hybrid-touch guard: mousemove events inside the suppression window after
    // the last touch are the browser's synthetic tap events — skip them or the
    // just-cleared glow re-lights and sticks. Real mouse movement after the
    // window expires works normally.
    window.addEventListener('mousemove', (e) => {
        if (nowMs() < suppressHoverUntil) return;
        updateMouseCoords(e.clientX, e.clientY);
    });

    // Touch support — touchstart/touchmove keep feeding parallax (and, on
    // hybrids, the raycast while a finger is down), but ending the touch
    // clears the hover so no glow survives the lift, and starts the
    // synthetic-mousemove suppression window.
    window.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) updateMouseCoords(e.touches[0].clientX, e.touches[0].clientY);
        suppressHoverUntil = nowMs() + HYBRID_TOUCH_WINDOW_MS;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) updateMouseCoords(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    // A lifted/cancelled touch must not leave a hover glow behind — and the
    // synthetic mousemove + stale-aim raycast that follow must not re-light it.
    const endTouch = () => {
        suppressHoverUntil = nowMs() + HYBRID_TOUCH_WINDOW_MS;
        clearHover();
    };
    window.addEventListener('touchend', endTouch, { passive: true });
    window.addEventListener('touchcancel', endTouch, { passive: true });

    // Click-to-component: raycast the click against interactive objects and
    // forward PROJECT hits (the project chips) to the registered handler.
    // Listener is on the canvas element only — clicks on HUD/panels (higher
    // z-index) never reach it, so nav and panel interactions stay untouched.
    // Same canvas-rect NDC conversion as the hover path — a window-relative
    // click on the 58% split would hit the component ~21%-of-window left of
    // the cursor (or nothing, for chips near the right board edge).
    if (hoverCanvas) {
        // Local capture — checkJs can't narrow a module-level let across the
        // closure even though it was assigned above (same pattern as board.js).
        const canvas = hoverCanvas;
        canvas.addEventListener('click', (e) => {
            if (!clickHandler || !raycaster || !activeCamera) return;
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            const ndc = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1
            );
            raycaster.setFromCamera(ndc, activeCamera);
            const targets = interactiveObjects.filter((obj) => obj.userData && obj.userData.isInteractive);
            const hits = raycaster.intersectObjects(targets, false);
            if (hits.length > 0) {
                const obj = hits[0].object;
                if (obj.userData && obj.userData.type === 'PROJECT' && obj.name && clickHandler) {
                    // Picked — the instrument tick. (The buzzer branch plays
                    // its own horn via pulseBuzzer, so no double blip.)
                    clickBlip();
                    clickHandler(obj.name);
                } else if (obj.userData && obj.userData.type === 'BUZZER' && buzzerHandler) {
                    buzzerHandler();
                } else if (obj.userData && obj.userData.type === 'SWITCH' && obj.name) {
                    // Tactile switch — the cap dips and springs back, with a
                    // blip: a mechanical button press. The registered
                    // switchHandler then fires the switch's behavior (night
                    // bench / horn / nearest-chip focus — wired in main.js).
                    pressTactile(obj.name);
                    clickBlip();
                    if (switchHandler) switchHandler(obj.name);
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

/** Register the callback fired when a tactile switch (SW1-3) is clicked.
 *  Receives the switch name so one handler can route all three.
 * @param {(switchName: string) => void} fn */
export function setSwitchHandler(fn) {
    switchHandler = fn;
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

    // No hover state on touch — skip the raycast entirely (cost + sticky
    // glows). Also skip while the hybrid-touch suppression window is open:
    // the raycast would re-light the just-cleared glow from the stale aim
    // point. The click handler stays ungated so taps still MEASURE/focus.
    if (!finePointer || nowMs() < suppressHoverUntil) return;

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

    // Subtle scale pulse — lighter than arrival (~105% per the hover brief;
    // the same reaction the probe uses, so both probes feel identical).
    gsap.killTweensOf(mesh.scale);
    gsap.to(mesh.scale, { x: 1.05, y: 1.05, z: 1.05, duration: 0.2, ease: 'power1.out', overwrite: 'auto' });

    // The component's own voice: a quiet instrument tick on hover-in.
    hoverBlip();

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

    // Energize the copper feeding this component — the board answers the
    // probe through its traces (traces.js). 'U1' lights every route.
    highlightTrace(name, true);
}

// ─── Hover Exit Logic ────────────────────────────────────

/** @param {THREE.Object3D | null} obj */
function resetHoverMesh(obj) {
    if (!obj || !(obj instanceof THREE.Mesh)) return;

    // Release the copper feeding this component (no-op for refs without a
    // route — chips, buzzer, test points).
    if (obj.name) highlightTrace(obj.name, false);

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
