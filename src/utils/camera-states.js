// ============================================================
// Camera State Machine — manages zoom transitions and LERP
// ============================================================
import * as THREE from 'three';

// ─── State & Exports ────────────────────────────────────────

export let viewState = 'PCB'; // 'PCB' | 'ZOOMING_IN' | 'ZOOMED_IN' | 'ZOOMING_OUT'
export let activeComponentRef = '';

export const defaultCamPos = new THREE.Vector3(0, -2, 17);
export const defaultLookAt = new THREE.Vector3(0, 0, 0);
export const targetCamPos = defaultCamPos.clone();
export const targetLookAt = defaultLookAt.clone();
export const currentLookAt = defaultLookAt.clone();

let btnBack = null;
let onExitCallback = null;

// ─── Zoom Configuration ─────────────────────────────────────

export const ZOOM_CONFIG = {
    'U1':     { pos: new THREE.Vector3(0, 1.0, 2.6),     look: new THREE.Vector3(0, 1.0, 0.08),    group: 'cpu' },
    'U2':     { pos: new THREE.Vector3(-3.2, 4.5, 2.2),  look: new THREE.Vector3(-3.2, 4.5, 0.08), group: 'gpu' },
    'Y1':     { pos: new THREE.Vector3(-3.5, 0.5, 1.8),  look: new THREE.Vector3(-3.5, 0.5, 0.08), group: 'osc' },
    'ANT1':   { pos: new THREE.Vector3(3.5, 0.5, 1.8),   look: new THREE.Vector3(3.5, 0.5, 0.08),  group: 'antenna' },
    'J1':     { pos: new THREE.Vector3(0, -7.3, 2.0),    look: new THREE.Vector3(0, -7.3, 0.08),   group: 'usb' },
    'D1-D7':  { pos: new THREE.Vector3(-3.5, -4.5, 2.4), look: new THREE.Vector3(-3.5, -4.5, 0.08),group: 'leds' },
    'VR1':    { pos: new THREE.Vector3(3.5, -4.5, 2.0),  look: new THREE.Vector3(3.5, -4.5, 0.08), group: 'vr' },
};

const ZOOM_LERP_FACTOR = 0.08;
const ZOOM_THRESHOLD = 0.12;
const LERP_FACTOR = 0.08;

// ─── Init ───────────────────────────────────────────────────

export function initCameraControls(onExit) {
    onExitCallback = onExit;

    btnBack = document.createElement('button');
    btnBack.id = 'btn-hud-back';
    btnBack.innerText = '[ ESCAPE COMPONENT VIEW ]';
    btnBack.className = 'btn-hud-control';
    btnBack.style.display = 'none';
    document.body.appendChild(btnBack);
    btnBack.addEventListener('click', exitZoomView);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && (viewState === 'ZOOMED_IN' || viewState === 'ZOOMING_IN')) {
            exitZoomView();
        }
    });
}

// ─── Zoom Actions ───────────────────────────────────────────

export function zoomToComponent(ref) {
    const config = ZOOM_CONFIG[ref];
    if (!config) return false;

    viewState = 'ZOOMING_IN';
    activeComponentRef = ref;
    targetCamPos.copy(config.pos);
    targetLookAt.copy(config.look);
    return true;
}

export function exitZoomView() {
    if (viewState !== 'ZOOMED_IN' && viewState !== 'ZOOMING_IN') return;

    viewState = 'ZOOMING_OUT';
    if (btnBack) btnBack.style.display = 'none';
    targetCamPos.copy(defaultCamPos);
    targetLookAt.copy(defaultLookAt);

    if (onExitCallback) onExitCallback();
}

// ─── Per-frame update ───────────────────────────────────────

export function updateCamera(camera) {
    if (!camera) return;

    // LERP camera position toward target
    camera.position.lerp(targetCamPos, LERP_FACTOR);
    currentLookAt.lerp(targetLookAt, LERP_FACTOR);
    camera.lookAt(currentLookAt);

    // Transition state boundaries
    if (viewState === 'ZOOMING_IN' && camera.position.distanceTo(targetCamPos) < ZOOM_THRESHOLD) {
        viewState = 'ZOOMED_IN';
        if (btnBack) btnBack.style.display = 'block';
    } else if (viewState === 'ZOOMING_OUT' && camera.position.distanceTo(targetCamPos) < ZOOM_THRESHOLD) {
        viewState = 'PCB';
        activeComponentRef = '';
    }
}

export function isZoomedIn() {
    return viewState === 'ZOOMED_IN';
}

export function isTransitioning() {
    return viewState === 'ZOOMING_IN' || viewState === 'ZOOMING_OUT';
}
