// ============================================================
// Hover Controller — raycasting, state wiring, interaction glue
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { showTooltip, hideTooltip } from '../ui/tooltip.js';
import { setHoveredTraceSpeedBoost } from '../three/particles.js';
import {
    interactiveObjects, insideInteractiveObjects, siliconDieMesh,
    cpuInsideGroup, gpuInsideGroup, oscInsideGroup, antInsideGroup,
    usbInsideGroup, vrInsideGroup
} from '../three/components.js';
import {
    viewState, activeComponentRef, ZOOM_CONFIG,
    initCameraControls, zoomToComponent, updateCamera, exitZoomView
} from './camera-states.js';
import {
    initHud, hideHud, renderComponentHUD, renderSubcoreHUD, renderZoomedDefaultHUD
} from '../ui/pcb-hud.js';

// ─── Exports ────────────────────────────────────────────────
export const mouse = new THREE.Vector2();

// ─── Internal State ─────────────────────────────────────────
let raycaster;
let activeCamera;
let activeScene;
let hoveredObject = null;
let currentHovered = null;
let frameCounter = 0;
let hoverLight = null;

// ─── PCB Hover Glow Color Map ───────────────────────────────
const PCB_GLOW_MAP = {
    'U1': 0x00ff88, 'U2': 0x00bfff, 'Y1': 0xaa44ff,
    'ANT1': 0x00ffff, 'J1': 0xff8800, 'VR1': 0xff4444,
    'RN1': 0x14b8a6, 'TP1': 0xffcc00, 'TP2': 0xffcc00
};

const SUB_CORE_GLOW_MAP = {
    core_alu: 0xf59e0b, core_npu: 0xef4444, core_cu: 0x3b82f6, core_io: 0x10b981
};

function getSubCoreGlowColor(name) {
    if (name.startsWith('proj_')) return 0x00bfff;
    if (name.startsWith('edu_')) return 0xaa44ff;
    if (name.startsWith('usb_')) return 0xff8800;
    if (name.startsWith('vr_')) return 0xff4444;
    return SUB_CORE_GLOW_MAP[name] || 0x00ff88;
}

// ─── Init ───────────────────────────────────────────────────

export function initHover(camera, scene) {
    activeCamera = camera;
    activeScene = scene;
    raycaster = new THREE.Raycaster();

    // Create moving PointLight for hovered component glow
    hoverLight = new THREE.PointLight(0xffffff, 0, 3);
    scene.add(hoverLight);

    // Initialize sub-systems
    initCameraControls(handleZoomExit);
    initHud();

    // Setup mouse/touch coordinate tracking
    const updateMouseCoords = (clientX, clientY) => {
        mouse.x = (clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    };

    window.addEventListener('mousemove', (e) => updateMouseCoords(e.clientX, e.clientY));

    // Touch support
    window.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) updateMouseCoords(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) updateMouseCoords(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    // Click handler for zoom-to-component
    window.addEventListener('click', (e) => {
        const backBtn = document.getElementById('btn-hud-back');
        if (backBtn && backBtn.contains(e.target)) return;

        if (viewState === 'PCB' && hoveredObject) {
            const ref = hoveredObject.name;
            if (ZOOM_CONFIG[ref]) {
                zoomToComponent(ref);
                toggleComponentShells(ref, false);
                hideHud();

                if (window.openSidePanel) window.openSidePanel(ref);
            }
        }
    });
}

// ─── Callback from camera-states on zoom exit ───────────────

function handleZoomExit() {
    hideHud();
    toggleComponentShells(activeComponentRef, true);
    if (window.closeSidePanel) window.closeSidePanel();
}

// ─── Component Shell Visibility Toggle ──────────────────────

function toggleComponentShells(ref, isVisible) {
    const comp = activeScene.getObjectByName(ref);
    if (comp) comp.visible = isVisible;

    const GROUP_MAP = {
        'U1': { shell: siliconDieMesh, inside: cpuInsideGroup },
        'U2': { inside: gpuInsideGroup },
        'Y1': { inside: oscInsideGroup },
        'ANT1': { inside: antInsideGroup },
        'J1': { inside: usbInsideGroup },
        'VR1': { inside: vrInsideGroup }
    };

    const entry = GROUP_MAP[ref];
    if (!entry) return;

    if (entry.shell) entry.shell.visible = isVisible;
    if (entry.inside) entry.inside.visible = !isVisible;
}

// ─── Per-frame Raycast Check ────────────────────────────

export function checkHover() {
    if (!raycaster || !activeCamera) return;

    // Camera LERP update (delegated to camera-states)
    updateCamera(activeCamera);

    frameCounter++;

    // Throttle raycasts to every 3rd frame
    if (frameCounter % 3 !== 0) return;

    const targets = viewState === 'PCB'
        ? interactiveObjects
        : viewState === 'ZOOMED_IN'
            ? insideInteractiveObjects
            : [];

    const filteredTargets = targets.filter(obj => obj.userData && obj.userData.isInteractive);
    raycaster.setFromCamera(mouse, activeCamera);
    const intersects = raycaster.intersectObjects(filteredTargets, false);

    if (intersects.length > 0) {
        const first = intersects[0].object;
        if (currentHovered !== first) {
            resetHoverMesh(currentHovered);
            currentHovered = first;
            hoveredObject = first;

            if (first instanceof THREE.Mesh) {
                handleHoverEnter(first);
            }
        }
    } else {
        if (currentHovered) {
            resetHoverMesh(currentHovered);
            currentHovered = null;
            hoveredObject = null;
            document.body.style.cursor = 'default';

            if (viewState === 'ZOOMED_IN') renderZoomedDefaultHUD();
        }
    }
}

// ─── Hover Enter Logic ────────────────────────────────────

function handleHoverEnter(mesh) {
    const mat = mesh.material;
    const name = mesh.name;

    if (viewState === 'PCB') {
        const glowColor = PCB_GLOW_MAP[name] || 0x00ff88;

        // Subtle glow only — this is a PREVIEW, not the full arrival
        if (mat.emissive) {
            mat.emissive.setHex(glowColor);
            gsap.to(mat, { emissiveIntensity: 0.5, duration: 0.2, overwrite: 'auto' });
        }

        // Subtle scale pulse — lighter than arrival zoom
        gsap.killTweensOf(mesh.scale);
        gsap.to(mesh.scale, { x: 1.04, y: 1.04, z: 1.04, duration: 0.2, ease: 'power1.out', overwrite: 'auto' });

        // Mini hover light — subtle preview glow only
        if (hoverLight) {
            hoverLight.color.setHex(glowColor);
            mesh.getWorldPosition(hoverLight.position);
            hoverLight.position.z += 0.3;
            gsap.to(hoverLight, { intensity: 0.6, duration: 0.2, overwrite: 'auto' });
        }

        // No tooltip, no HUD, no trace speed boost during hover in journey mode
        // These are reserved for the full scroll-arrival experience
        // Only show minimal tooltip if NOT in full-journey mode (legacy zoom mode)
        if (!document.body.classList.contains('full-journey')) {
            setHoveredTraceSpeedBoost(name, true);
            showTooltip(name, mesh.userData.componentName || 'SMD Module');
            renderComponentHUD(name);
        }

    } else if (viewState === 'ZOOMED_IN') {
        const glowColor = getSubCoreGlowColor(name);

        if (mat.emissive) {
            mat.emissive.setHex(glowColor);
            gsap.to(mat, { emissiveIntensity: 0.9, duration: 0.2, overwrite: 'auto' });
        }
        gsap.to(mesh.scale, { x: 1.08, y: 1.08, z: 1.08, duration: 0.2, overwrite: 'auto' });

        renderSubcoreHUD(name);
    }

    document.body.style.cursor = 'pointer';
}

// ─── Hover Exit Logic ────────────────────────────────────

function resetHoverMesh(obj) {
    if (!obj || !(obj instanceof THREE.Mesh)) return;

    const mat = obj.material;
    const name = obj.name;

    if (viewState === 'PCB') {
        // Only reset hover-only effects in journey mode
        if (!document.body.classList.contains('full-journey')) {
            setHoveredTraceSpeedBoost(name, false);
            hideTooltip();
            hideHud();
        }

        if (hoverLight) gsap.to(hoverLight, { intensity: 0, duration: 0.25, overwrite: 'auto' });
    }

    // Immediate emissive reset (no ghosting)
    if (mat.emissive) {
        mat.emissiveIntensity = 0.0;
        mat.emissive.setHex(0x000000);
    }

    gsap.killTweensOf(obj.scale);
    gsap.to(obj.scale, { x: 1, y: 1, z: 1, duration: 0.25, overwrite: 'auto' });
}

// ─── Navigation Bar Trigger ──────────────────────────────

export function triggerComponentAction(ref) {
    if (!activeScene) return;

    const comp = activeScene.getObjectByName(ref);
    if (comp) {
        // Visual pulse
        gsap.killTweensOf(comp.scale);
        gsap.fromTo(comp.scale,
            { x: 1, y: 1, z: 1 },
            { x: 1.15, y: 1.15, z: 1.15, duration: 0.15, yoyo: true, repeat: 1, ease: 'power1.out',
                onComplete: () => comp.scale.set(1, 1, 1)
            }
        );
    }

    if (zoomToComponent(ref)) {
        toggleComponentShells(ref, false);
        hideHud();
        if (window.openSidePanel) window.openSidePanel(ref);
    }
}