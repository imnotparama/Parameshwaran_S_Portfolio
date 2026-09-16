// @ts-check
// ============================================================
// Scroll Journey — camera physically moves toward each component
// as its section becomes active. Panels are positioned in screen
// space near the component, connected by a visible trace line.
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { cpuRadarRing, siliconDieMesh, energizeCapacitor } from '../three/components.js';
import { traceData, energizeTraceForSection, energizeTraceAtPoint } from '../three/traces.js';
import { projectChips } from '../three/project-chips.js';
import { LCD_LOCAL_POS, focusLcd, exitLcd, setLcdExitHandler } from '../three/lcd.js';
import { getCanvasViewportSize, setSectionRimColor, disposableResources } from '../three/scene.js';
import { motionPrefs } from '../utils/motion-prefs.js';
import { currentSurgeTone, moduleTouchdown, relayClick, clickBlip } from '../utils/sound.js';
import { onSectionChanged, inspectProject } from '../three/hardware-orchestrator.js';
import { hideProjectVisuals } from '../three/project-holograms.js';
import { syncLiveBenchToProject } from '../ui/live-bench.js';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

// LCD1 (the SIGNAL SNAKE display) releases its keyboard + camera focus
// through the same clearFocus path as the project chips: Esc in the game
// glides the camera back to the current section's stop.
setLcdExitHandler(() => clearFocus(true));

document.fonts?.ready?.then(() => {
  ScrollTrigger.refresh(); // font swap can change section heights
});
window.addEventListener('load', () => ScrollTrigger.refresh());

// ─── Camera offsets for component-based sections ─────
// Elevated + pulled back: the old (0, 0, 1.915) sat the camera horizontally at
// component height, viewing the board edge-on so chips read as thin slivers.
// This 3/4 angle (~31°) shows each component's top surface and silkscreen.
const CAMERA_OFFSET = new THREE.Vector3(0, 2.6, 4.2);
const LOOK_AT_OFFSET = new THREE.Vector3(0, 0.15, 0);

// Click-to-component focus framing: a chip is small (0.42u), so a focused
// stop sits closer than the section stops — ~2.8u back at a 28° elevation
// frames the chip with one or two neighbors either side (0.68u spacing).
const CHIP_FOCUS_OFFSET = new THREE.Vector3(0, 1.5, 2.8);

// Boot→hero arrival glide duration (seconds) — a short repositioning beat so
// the boot's establishing shot reads as one continuous motion, not a cut.
const ARRIVAL_GLIDE_DURATION = 1.0;

// Fixed camera configurations for non-component sections (hero, contact).
// Hero starts in an intimate, dramatic macro surface perspective (z ≈ 5.8),
// viewing glowing traces and central core up close without exposing the outer
// board boundaries. Contact (the grand finale) pulls all the way back to
// getFullBoardFramingZ() (z ≈ 23) to reveal the entire motherboard operating as one.
/** @type {Record<string, { pos: THREE.Vector3, look: THREE.Vector3 }>} */
const FIXED_CAMERAS = {
  'sec-hero': {
    pos: new THREE.Vector3(0, -1.8, 5.8),
    look: new THREE.Vector3(0, 0.4, 0.085)
  },
  'sec-contact': {
    pos: new THREE.Vector3(0, -5.2, 23),
    look: new THREE.Vector3(0, 0.1, 0)
  }
};

// Component world positions (in boardGroup LOCAL space)
/** @type {Record<string, THREE.Vector3>} */
const COMPONENT_WORLD = {
  'sec-about':      new THREE.Vector3(0, 1.0, 0.085),
  'sec-projects':   new THREE.Vector3(-3.2, 4.5, 0.085),
  'sec-skills':     new THREE.Vector3(3.2, 4.5, 0.085),
  'sec-experience': new THREE.Vector3(0, -7.3, 0.085),
};

// Per-section camera OVERRIDES — sections whose default component framing
// (COMPONENT_WORLD + CAMERA_OFFSET) doesn't frame its part well get an
// explicit pose instead. Experience (J1): the default stop looked at the
// board face a third of a unit above J1, where the bottom silkscreen band
// ("PARAMA-DEV-BOARD-v1.0") and the board's darkest region fill the frame
// instead of the connector. A too-close pose (z 2.4, the first fix) put J1's
// featureless silver body across most of the frame — which reads as a flat
// gray slab, the recurring "broken mesh" report. This pose pulls back to
// frame the whole Experience neighborhood: J1 center-low, RN1 above, BZ1
// and the D1-D7 array as context, board bottom edge below (verified against
// the rendered framebuffer at the 58% canvas: J1 at NDC (0,-0.15), RN1 at
// 0.84, BZ1 at (-0.37,0.31)). The trace ride still ends here because
// rideCamera's dstCfg comes from this function.
/** @type {Record<string, { pos: THREE.Vector3, look: THREE.Vector3 }>} */
const CUSTOM_CAMERAS = {
  'sec-skills': {
    pos: new THREE.Vector3(1.6, 6.4, 5.6),
    look: new THREE.Vector3(3.2, 4.8, 0.1)
  },
  'sec-experience': {
    pos: new THREE.Vector3(0, -4.0, 9.0),
    look: new THREE.Vector3(0, -5.2, 0.08)
  }
};

// ─── Path definition: stops (section IDs) and via points (hardcoded) ─────
/** @type {Array<{ stop?: string, via?: boolean, pos?: [number, number, number], look?: [number, number, number] }>} */
const PATH = [
  { stop: 'sec-hero' },
  // Smooth macro-to-component via point: glides along the board surface directly into U1
  { via: true, pos: [0, 0.6, 4.8], look: [0, 0.7, 0.085] },
  { stop: 'sec-about' },
  { via: true, pos: [-1.6, 5.4, 4.2], look: [-2.0, 4.2, 0.05] },
  { stop: 'sec-projects' },
  { via: true, pos: [0, 7.1, 4.4], look: [0.5, 4.6, 0.1] },
  { stop: 'sec-skills' },
  { via: true, pos: [1.6, 1.2, 4.6], look: [0.5, -3.2, 0.05] },
  { stop: 'sec-experience' },
  // Grand finale pull-back via point: sweeps up and back into full-board reveal
  { via: true, pos: [-0.8, -4.8, 15.0], look: [-0.1, -1.5, 0.05] },
  { stop: 'sec-contact' }
];

/** @type {THREE.CatmullRomCurve3 | null} */
let posCurve = null;
/** @type {THREE.CatmullRomCurve3 | null} */
let lookCurve = null;
/** @type {Record<string, number>} */
let stopTs = {};
/** @type {string[]} */
let stopOrder = [];

// ─── Ride-the-trace legs & Current Wavefront ──────────────────
// Every transition moves along the physical copper trace on the board surface (z = 0.088).
// legSurfaceCurves[i] = board-surface trace polyline (current wavefront travels here)
// ridePosCurves[i]    = camera flight trajectory elevated above the current
// rideLookCurves[i]   = camera look-at trajectory tracking the current on the board
/** @type {Array<THREE.CatmullRomCurve3 | null>} */
let ridePosCurves = [];
/** @type {Array<THREE.CatmullRomCurve3 | null>} */
let rideLookCurves = [];
/** @type {Array<THREE.CatmullRomCurve3 | null>} */
let legSurfaceCurves = [];
/** @type {THREE.Group | null} */
let currentWavefrontGroup = null;
/** @type {THREE.Mesh | null} */
let wavefrontCore = null;
/** @type {THREE.Mesh | null} */
let wavefrontHalo = null;
/** @type {THREE.Mesh | null} */
let wavefrontContact = null;
/** @type {THREE.Mesh[]} */
let wavefrontSparks = [];
/** @type {THREE.PointLight | null} */
let wavefrontLight = null;
/** @type {number} */
let lastTouchdownLeg = -1;
/** @type {string | null} */
let activePanelId = null;
/** @type {THREE.PerspectiveCamera | null} */
let cameraRef = null;
/** @type {HTMLElement | null} */
let vignetteEl = null;
/** @type {SVGSVGElement | null} */
let connectorLine = null;
/** @type {gsap.core.Timeline | null} */
let arrivalGlide = null;
const curLook = new THREE.Vector3();
const worldPos = new THREE.Vector3();
const screenPos = new THREE.Vector3();

// Module-scoped scratch vectors designed to avoid unnecessary allocations during render/scroll loop
const _sparkTarget = new THREE.Vector3();
const _surfacePosTarget = new THREE.Vector3();
const _tangentTarget = new THREE.Vector3();
const _camPosTarget = new THREE.Vector3();

// ─── Scroll-leg state — the source of truth for panel activation ──
// The camera position is a pure function of scroll progress inside the
// current leg, so the active section is too: no distance scanning, no
// frame-counting cooldowns, no flicker. currentSectionId defaults to the
// hero so the top of the page (before any leg is active) keeps the hero.
let currentSectionId = 'sec-hero';
let currentLegProgress = 0;
// updateJourneyEffects must not touch panels until initJourney has run — the
// boot sequence owns the hero panel's opacity/visibility via GSAP inline
// styles, and toggling panel-active mid-boot re-triggers frozen transitions.
let journeyReady = false;

// ─── Click-to-component focus state ────────────────────────
// When a project chip is clicked, the camera glides to the chip (same arrival
// language as the section stops) and the focused datasheet panel is anchored
// near it. Any scroll releases focus — the scrub owns the camera again.
/** @type {{ ref: string, localPos: THREE.Vector3, data: any } | null} */
let focusedChip = null;

// ─── Build CatmullRom curves from PATH ─────────────────────
function buildCurves() {
  // Reset accumulated state so re-initializing (HMR, re-entry) can't
  // duplicate stops or leave stale t-mappings behind.
  stopOrder.length = 0;
  for (const k in stopTs) delete stopTs[k];

  /** @type {THREE.Vector3[]} */
  const posPoints = [];
  /** @type {THREE.Vector3[]} */
  const lookPoints = [];
  PATH.forEach((p) => {
    // Every PATH entry assigns below (stop config or via tuple); the initializer
    // satisfies TS definite-assignment without changing behavior.
    /** @type {THREE.Vector3} */
    let pos = new THREE.Vector3();
    /** @type {THREE.Vector3} */
    let look = new THREE.Vector3();
    if (p.stop) {
      // Get camera config for stop
      const config = getCameraConfigForStop(p.stop);
      pos = config.pos.clone();
      look = config.look.clone();
      if (p.stop) stopOrder.push(p.stop);
    } else if (p.via && p.pos && p.look) {
      pos = new THREE.Vector3(...p.pos);
      look = new THREE.Vector3(...p.look);
    }
    posPoints.push(pos);
    lookPoints.push(look);
  });
  posCurve = new THREE.CatmullRomCurve3(posPoints, false, 'catmullrom', 0.4);
  lookCurve = new THREE.CatmullRomCurve3(lookPoints, false, 'catmullrom', 0.4);
  // Build stopTs mapping
  PATH.forEach((p, i) => {
    if (p.stop) {
      stopTs[p.stop] = i / (PATH.length - 1);
    }
  });

  // ─── Physical Circuit Current Wavefront & Ride-the-trace Curves ─────
  // Every journey transition travels along the physical copper traces on the board surface (z = 0.088).
  // legSurfaceCurves[i] = board-surface trace polyline (current wavefront travels here)
  // ridePosCurves[i]    = camera flight trajectory following the current at inspection altitude
  // rideLookCurves[i]   = camera look-at trajectory tracking the current on the board
  ridePosCurves = [];
  rideLookCurves = [];
  legSurfaceCurves = [];

  for (let i = 1; i < stopOrder.length; i++) {
    const fromSec = stopOrder[i - 1];
    const toSec = stopOrder[i];
    const srcCfg = getCameraConfigForStop(fromSec);
    const dstCfg = getCameraConfigForStop(toSec);

    /** @type {THREE.Vector3[]} */
    let surfacePts = [];
    /** @type {THREE.Vector3[]} */
    let posPts = [];
    /** @type {THREE.Vector3[]} */
    let lookPts = [];

    if (fromSec === 'sec-hero' && toSec === 'sec-about') {
      // Leg 1: Hero Macro Power Rail -> Central Processing Core U1
      surfacePts = [
        new THREE.Vector3(0, -1.8, 0.088),
        new THREE.Vector3(0, -0.8, 0.088),
        new THREE.Vector3(0, 0.2, 0.088),
        new THREE.Vector3(0, 1.0, 0.088)
      ];
      posPts = [
        srcCfg.pos.clone(),
        new THREE.Vector3(0, 0.6, 4.8),
        dstCfg.pos.clone()
      ];
      lookPts = [
        srcCfg.look.clone(),
        new THREE.Vector3(0, 0.7, 0.085),
        dstCfg.look.clone()
      ];
    } else if (fromSec === 'sec-about' && toSec === 'sec-projects') {
      // Leg 2: Central Core U1 -> Hardware AI / GPU Array U2 & Project Bus
      surfacePts = [
        new THREE.Vector3(0, 1.0, 0.088),
        new THREE.Vector3(-0.6, 2.2, 0.088),
        new THREE.Vector3(-0.6, 3.2, 0.088),
        new THREE.Vector3(-1.9, 3.2, 0.088),
        new THREE.Vector3(-3.2, 4.5, 0.088)
      ];
      posPts = [srcCfg.pos.clone()];
      lookPts = [srcCfg.look.clone()];
      for (const p of surfacePts) {
        posPts.push(new THREE.Vector3(p.x, p.y + 2.6, 4.2));
        lookPts.push(new THREE.Vector3(p.x, p.y + 0.15, 0.085));
      }
      posPts.push(dstCfg.pos.clone());
      lookPts.push(dstCfg.look.clone());
    } else if (fromSec === 'sec-projects' && toSec === 'sec-skills') {
      // Leg 3: Projects Array -> Tantalum Capacitor Bank C1-C4
      surfacePts = [
        new THREE.Vector3(-3.2, 4.5, 0.088),
        new THREE.Vector3(-1.9, 3.2, 0.088),
        new THREE.Vector3(-0.6, 3.2, 0.088),
        new THREE.Vector3(0.2, 3.0, 0.088),
        new THREE.Vector3(1.0, 3.8, 0.088),
        new THREE.Vector3(2.3, 3.8, 0.088),
        new THREE.Vector3(3.2, 4.5, 0.088)
      ];
      posPts = [srcCfg.pos.clone()];
      lookPts = [srcCfg.look.clone()];
      for (const p of surfacePts) {
        posPts.push(new THREE.Vector3(p.x, p.y + 2.6, 4.2));
        lookPts.push(new THREE.Vector3(p.x, p.y + 0.15, 0.085));
      }
      posPts.push(dstCfg.pos.clone());
      lookPts.push(dstCfg.look.clone());
    } else if (fromSec === 'sec-skills' && toSec === 'sec-experience') {
      // Leg 4: Capacitor Bank C1-C4 -> I/O & Telemetry Bus J1
      surfacePts = [
        new THREE.Vector3(3.2, 4.5, 0.088),
        new THREE.Vector3(2.3, 3.8, 0.088),
        new THREE.Vector3(1.0, 3.8, 0.088),
        new THREE.Vector3(0.2, 2.2, 0.088),
        new THREE.Vector3(0, 1.0, 0.088),
        new THREE.Vector3(0, -0.2, 0.088),
        new THREE.Vector3(0, -3.5, 0.088),
        new THREE.Vector3(0, -5.5, 0.088),
        new THREE.Vector3(0, -7.0, 0.088)
      ];
      posPts = [srcCfg.pos.clone()];
      lookPts = [srcCfg.look.clone()];
      const n4 = surfacePts.length;
      for (let k = 0; k < n4; k++) {
        const p = surfacePts[k];
        const frac = k / (n4 - 1);
        const zAlt = THREE.MathUtils.lerp(4.2, 8.5, frac);
        posPts.push(new THREE.Vector3(p.x, p.y + THREE.MathUtils.lerp(2.6, 1.2, frac), zAlt));
        lookPts.push(new THREE.Vector3(p.x, THREE.MathUtils.lerp(p.y + 0.15, -4.5, frac), 0.085));
      }
      posPts.push(dstCfg.pos.clone());
      lookPts.push(dstCfg.look.clone());
    } else if (fromSec === 'sec-experience' && toSec === 'sec-contact') {
      // Leg 5: Telemetry Port J1 -> Circumferential Antenna Bus & Full Board Grand Reveal
      surfacePts = [
        new THREE.Vector3(0, -7.0, 0.088),
        new THREE.Vector3(0.6, -6.9, 0.088),
        new THREE.Vector3(1.9, -5.8, 0.088),
        new THREE.Vector3(3.5, -4.5, 0.088),
        new THREE.Vector3(3.0, 0.5, 0.088),
        new THREE.Vector3(4.5, 0.5, 0.088),
        new THREE.Vector3(4.5, 5.5, 0.088),
        new THREE.Vector3(2.0, 6.6, 0.088),
        new THREE.Vector3(-2.0, 6.6, 0.088),
        new THREE.Vector3(-4.5, 5.5, 0.088)
      ];
      posPts = [
        srcCfg.pos.clone(),
        new THREE.Vector3(-0.8, -4.8, 15.0),
        dstCfg.pos.clone()
      ];
      lookPts = [
        srcCfg.look.clone(),
        new THREE.Vector3(-0.1, -1.5, 0.05),
        dstCfg.look.clone()
      ];
    }

    if (surfacePts.length > 1 && posPts.length > 1 && lookPts.length > 1) {
      legSurfaceCurves[i] = new THREE.CatmullRomCurve3(surfacePts, false, 'catmullrom', 0.35);
      ridePosCurves[i] = new THREE.CatmullRomCurve3(posPts, false, 'catmullrom', 0.35);
      rideLookCurves[i] = new THREE.CatmullRomCurve3(lookPts, false, 'catmullrom', 0.35);
    }
  }
}

// Full-board framing z: fit the 15-unit board in BOTH the 45° vertical FOV
// and the (narrower, aspect-dependent) horizontal FOV of the left-58% canvas.
// Used for the grand finale reveal at sec-contact.
// halfExtent = 7.5 (board half-height, y ∈ ±7.5) + 2 units of margin; the
// vertical axis alone needs z ≈ 23, but on the split layout the horizontal
// axis is usually the binding constraint.
function getFullBoardFramingZ() {
  const { w, h } = getCanvasViewportSize();
  const aspect = h > 0 ? w / h : 1.6;
  const tanHalfV = Math.tan(THREE.MathUtils.degToRad(45) / 2);
  const halfExtent = 7.5 + 2;
  return Math.max(halfExtent / tanHalfV, halfExtent / (tanHalfV * Math.max(aspect, 0.4)));
}

// Get camera position and lookat for a section ID (exported for the headless
// smoke test, which asserts the hero pose lands the board center on the
// panel's center line).
/** @param {string} sectionId */
export function getCameraConfigForStop(sectionId) {
  // Explicit override wins — sections whose default framing is wrong for
  // their part (Experience/J1) declare their own pose here.
  const custom = CUSTOM_CAMERAS[sectionId];
  if (custom) {
    return { pos: custom.pos.clone(), look: custom.look.clone() };
  }
  if (COMPONENT_WORLD[sectionId]) {
    const compPos = COMPONENT_WORLD[sectionId].clone();
    return {
      pos: compPos.clone().add(CAMERA_OFFSET),
      look: compPos.clone().add(LOOK_AT_OFFSET)
    };
  }
  // Fallback to fixed configurations (hero, contact)
  const cfg = FIXED_CAMERAS[sectionId];
  if (!cfg) return { pos: new THREE.Vector3(0, 0, 0), look: new THREE.Vector3(0, 0, 0) };
  const pos = cfg.pos.clone();
  const look = cfg.look.clone();
  if (sectionId === 'sec-contact') {
    // Grand Finale: Camera pulls back to fit the entire operating motherboard
    pos.z = getFullBoardFramingZ();
    alignHeroToPanel(pos, look);
  } else if (sectionId === 'sec-hero') {
    // Macro opening: Fine vertical alignment to hero text panel
    alignHeroToPanel(pos, look);
  }
  return { pos, look };
}

// The datasheet sidebar is pinned below the HUD (top: 84px, bottom: 24px), so
// its vertical center sits 30px BELOW the viewport center — while the hero
// camera centers the board on the full canvas. Without a correction the board
// reads ~19px high next to the panel (and the gap flips sign with aspect), so
// the two columns never share a center line. Shift the hero/contact pose
// (pos + look together — pure translation, the 3/4 view angle is preserved)
// until the board's projected center lands on the panel's center line.
// Computed per-viewport because the required shift changes with aspect (the
// framing z is aspect-dependent). One Newton step: the projection is
// essentially linear for the small shifts involved.
/** @param {THREE.Vector3} pos @param {THREE.Vector3} look */
function alignHeroToPanel(pos, look) {
  const { w, h } = getCanvasViewportSize();
  if (!w || !h) return;
  // On mobile screens (< 768px), canvas owns the top half, so center the board nicely in the canvas viewport
  if (typeof window !== 'undefined' && window.innerWidth < 768) return;
  const panelCenterPx = h / 2 + 30; // (84 + (h - 108) / 2) = h/2 + 30
  // Project the board center with a throwaway camera at the candidate pose.
  const cam = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  cam.position.copy(pos);
  cam.lookAt(look);
  cam.updateMatrixWorld(true);
  const boardCenter = new THREE.Vector3(0, 0, 0.085).project(cam);
  const boardCenterPx = ((-boardCenter.y + 1) / 2) * h;
  const shiftPx = panelCenterPx - boardCenterPx;
  if (Math.abs(shiftPx) < 1) return;
  const tanHalfV = Math.tan(THREE.MathUtils.degToRad(45) / 2);
  const pxPerWorld = h / (2 * pos.z * tanHalfV);
  const dy = shiftPx / pxPerWorld;
  pos.y += dy;
  look.y += dy;
}

/** @param {number} t */
function setCameraAtT(t) {
  if (!posCurve || !lookCurve || !cameraRef) return;
  // Scroll scrubbing always wins: any user scroll releases chip focus (no
  // glide back — the scrub takes the camera from here), and kills a settling
  // arrival glide so the scrub and the tween never fight.
  if (focusedChip) clearFocus(false);
  killArrivalGlide();
  const clamped = Math.min(Math.max(t, 0), 1);
  posCurve.getPoint(clamped, _camPosTarget);
  lookCurve.getPoint(clamped, curLook);
  cameraRef.position.copy(_camPosTarget);
  cameraRef.lookAt(curLook);
}

/**
 * Construct the board-surface Current Wavefront (plasma core + additive halo + trailing spark motes + localized point light).
 * Added to boardGroup so it automatically rides board transforms/float at z = 0.088.
 * @param {THREE.Group} boardGroup
 */
function initCurrentWavefront(boardGroup) {
  if (currentWavefrontGroup) return;

  currentWavefrontGroup = new THREE.Group();
  currentWavefrontGroup.name = 'current-wavefront';
  currentWavefrontGroup.visible = false;

  // 1. High-intensity emissive plasma core
  const coreGeo = new THREE.SphereGeometry(0.09, 16, 16);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x3ee6a0,
    emissiveIntensity: 3.8,
    roughness: 0.1,
    metalness: 0.8
  });
  wavefrontCore = new THREE.Mesh(coreGeo, coreMat);
  currentWavefrontGroup.add(wavefrontCore);

  // 2. Additive corona / bloom halo
  const haloGeo = new THREE.SphereGeometry(0.24, 16, 16);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending
  });
  wavefrontHalo = new THREE.Mesh(haloGeo, haloMat);
  currentWavefrontGroup.add(wavefrontHalo);

  // 3. Solder-trace contact patch ring (luminous footprint on the copper line)
  const patchGeo = new THREE.RingGeometry(0.04, 0.16, 24);
  const patchMat = new THREE.MeshBasicMaterial({
    color: 0x66ffcc,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  wavefrontContact = new THREE.Mesh(patchGeo, patchMat);
  wavefrontContact.position.z = 0.002;
  currentWavefrontGroup.add(wavefrontContact);

  // 4. Trailing electron spark motes
  wavefrontSparks = [];
  const sparkGeo = new THREE.SphereGeometry(0.045, 8, 8);
  for (let k = 0; k < 4; k++) {
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0x3ee6a0,
      transparent: true,
      opacity: 0.8 - k * 0.16,
      blending: THREE.AdditiveBlending
    });
    const sparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
    sparkMesh.name = `wavefront-spark-${k}`;
    currentWavefrontGroup.add(sparkMesh);
    wavefrontSparks.push(sparkMesh);
    disposableResources.materials.add(sparkMat);
  }

  // 5. Dynamic local point light casting real-time sheen on board components
  wavefrontLight = new THREE.PointLight(0x3ee6a0, 2.2, 3.2, 2);
  currentWavefrontGroup.add(wavefrontLight);

  disposableResources.geometries.add(coreGeo);
  disposableResources.geometries.add(haloGeo);
  disposableResources.geometries.add(patchGeo);
  disposableResources.geometries.add(sparkGeo);
  disposableResources.materials.add(coreMat);
  disposableResources.materials.add(haloMat);
  disposableResources.materials.add(patchMat);

  boardGroup.add(currentWavefrontGroup);
}

/**
 * Update positions of the trailing spark motes behind the wavefront core.
 * @param {THREE.CatmullRomCurve3} curve
 * @param {number} p
 * @param {THREE.Vector3} currentPos
 */
function updateWavefrontSparks(curve, p, currentPos) {
  const tNow = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.006;
  curve.getTangent(p, _tangentTarget);
  for (let k = 0; k < wavefrontSparks.length; k++) {
    const lagP = Math.max(0, p - (k + 1) * 0.016);
    curve.getPoint(lagP, _sparkTarget);
    const jitterX = Math.sin(tNow + k * 1.7) * 0.028;
    const jitterY = Math.cos(tNow + k * 2.3) * 0.028;
    wavefrontSparks[k].position.set(
      _sparkTarget.x - currentPos.x + jitterX,
      _sparkTarget.y - currentPos.y + jitterY,
      _sparkTarget.z - currentPos.z
    );
  }
}

/**
 * Power-up event upon current touchdown at module solder pads.
 * @param {string} secId
 */
function triggerModuleTouchdown(secId) {
  moduleTouchdown();
  pulseArrival(secId);
  if (wavefrontCore) {
    gsap.fromTo(wavefrontCore.scale, { x: 1, y: 1, z: 1 }, {
      x: 2.8, y: 2.8, z: 2.8,
      duration: 0.28,
      ease: 'power2.out',
      yoyo: true,
      repeat: 1
    });
  }
  if (wavefrontHalo) {
    gsap.fromTo(wavefrontHalo.scale, { x: 1, y: 1, z: 1 }, {
      x: 3.2, y: 3.2, z: 3.2,
      duration: 0.32,
      ease: 'power2.out',
      yoyo: true,
      repeat: 1
    });
  }
  if (wavefrontContact) {
    gsap.fromTo(wavefrontContact.scale, { x: 1, y: 1, z: 1 }, {
      x: 3.8, y: 3.8, z: 1,
      duration: 0.38,
      ease: 'power2.out',
      yoyo: true,
      repeat: 1
    });
  }
  if (wavefrontLight) {
    gsap.fromTo(wavefrontLight, { intensity: 4.8 }, {
      intensity: 2.2,
      duration: 0.4,
      ease: 'power2.out'
    });
  }
}

// ─── Ride-the-trace camera & Current Wavefront ────────────────
// Guides the camera along the trace trajectory while driving the physical
// Current Wavefront along the copper surface (z = 0.088).
/** @param {number} legIndex @param {number} p leg progress 0..1 (eased) */
function rideCamera(legIndex, p) {
  const posCurve = ridePosCurves[legIndex];
  const lookCurve = rideLookCurves[legIndex];
  const surfaceCurve = legSurfaceCurves[legIndex];
  if (!posCurve || !lookCurve || !cameraRef) return false;

  posCurve.getPoint(p, _camPosTarget);
  lookCurve.getPoint(p, curLook);
  cameraRef.position.copy(_camPosTarget);
  cameraRef.lookAt(curLook);

  // Surface Current Wavefront on the board copper
  if (currentWavefrontGroup && surfaceCurve) {
    const isTraversing = p > 0.005 && p < 0.995;
    currentWavefrontGroup.visible = isTraversing && !motionPrefs.reduced;
    if (isTraversing) {
      surfaceCurve.getPoint(p, _surfacePosTarget);
      currentWavefrontGroup.position.copy(_surfacePosTarget);
      updateWavefrontSparks(surfaceCurve, p, _surfacePosTarget);
      energizeTraceAtPoint(_surfacePosTarget, 0.85);
      currentSurgeTone(p);
    }
  }

  // Arrival touchdown event at destination component
  if (p >= 0.99 && lastTouchdownLeg !== legIndex) {
    lastTouchdownLeg = legIndex;
    triggerModuleTouchdown(stopOrder[legIndex]);
  } else if (p < 0.90 && lastTouchdownLeg === legIndex) {
    lastTouchdownLeg = -1;
  }

  return true;
}

// ─── Boot→hero arrival glide ───────────────────────────────
// The boot sequence animates only the board — the camera sits at its initScene
// pose (0, -2, 17) the whole time. initJourney previously called setCameraAtT(0)
// which SNAPPED the camera to the hero stop (0, -5.2, 13): a hard cut on every
// load, most jarring on the skip-boot path. Instead, glide position + lookAt
// into the hero framing (power2.inOut repositioning, transform-space only —
// 3D vectors, no layout properties). The glide endpoint equals the path's
// t=0 pose (both derive from FIXED_CAMERAS['sec-hero']), so after settle the
// camera is exactly where setCameraAtT(0) would have put it — zero drift.
// Interruptible: setCameraAtT kills it on the first scroll scrub.
function killArrivalGlide() {
  if (arrivalGlide) {
    arrivalGlide.kill();
    arrivalGlide = null;
  }
}

/** Glide camera position + lookAt to a pose (power2.inOut repositioning —
 *  transform-space only). Interruptible: the next scroll scrub kills it.
 * @param {THREE.Vector3} pos
 * @param {THREE.Vector3} look
 * @param {number} [duration] */
function glideCameraTo(pos, look, duration = ARRIVAL_GLIDE_DURATION) {
  if (!cameraRef) return;
  killArrivalGlide();
  arrivalGlide = gsap.timeline({
    onComplete: () => { arrivalGlide = null; }
  });
  arrivalGlide.to(cameraRef.position, {
    x: pos.x,
    y: pos.y,
    z: pos.z,
    duration,
    ease: 'power2.inOut',
    overwrite: 'auto'
  }, 0);
  arrivalGlide.to(curLook, {
    x: look.x,
    y: look.y,
    z: look.z,
    duration,
    ease: 'power2.inOut',
    onUpdate: () => { if (cameraRef) cameraRef.lookAt(curLook); }
  }, 0);
}

function glideToHero() {
  if (!cameraRef) return;
  const cfg = getCameraConfigForStop('sec-hero');
  glideCameraTo(cfg.pos, cfg.look);
}

// ─── Focus mode: chip click → camera glide + detail datasheet ──

/** @type {ReturnType<typeof setTimeout>[]} */
let handshakeTimers = [];

/** Clear any in-flight handshake timers */
function clearHandshakeTimers() {
  handshakeTimers.forEach((t) => clearTimeout(t));
  handshakeTimers = [];
}

/** Stagger reveal of datasheet sections (Header ➔ Meta ➔ Overview ➔ I/O ➔ Specs ➔ Tech ➔ Footer)
 *  @param {HTMLElement} panel */
function staggerDatasheetFields(panel) {
  const blocks = panel.querySelectorAll('.ds-header-block, .ds-divider, .ds-section-block, .ds-footer-bar');
  if (motionPrefs.reduced) {
    blocks.forEach((el) => {
      const htmlEl = /** @type {HTMLElement} */ (el);
      htmlEl.style.opacity = '1';
      htmlEl.style.transform = 'none';
    });
    return;
  }
  gsap.killTweensOf(blocks);
  gsap.fromTo(blocks,
    { opacity: 0, y: 8 },
    {
      opacity: 1,
      y: 0,
      duration: 0.28,
      stagger: 0.08,
      ease: 'power2.out',
      clearProps: 'transform'
    }
  );
}

/** Fill the focused-project panel from portfolio data (textContent only —
 *  no HTML injection). @param {any} proj */
function fillProjectDetailPanel(proj) {
  const q = (/** @type {string} */ id) => document.getElementById(id);
  const panel = q('panel-project-detail');
  if (!panel) return;

  const refEl = q('pdetail-ref');
  const statusLed = q('pdetail-status-led');
  const statusText = q('pdetail-status-text');
  const railBusEl = q('pdetail-rail-bus');
  const titleEl = q('pdetail-title');
  const titleTwinEl = q('pdetail-title-twin');
  const functionEl = q('pdetail-function');
  const problemEl = q('pdetail-problem');
  const stateEl = q('pdetail-state');
  const inputsEl = q('pdetail-inputs');
  const outputsEl = q('pdetail-outputs');
  const tagsEl = q('pdetail-tags');
  const linkEl = /** @type {HTMLAnchorElement | null} */ (q('pdetail-link'));
  const specEl = q('pdetail-spec');

  const stepEl = q('pdetail-handshake-step');
  const progEl = q('pdetail-handshake-progress');
  const dividerScan = q('pdetail-divider-scan');

  if (refEl) refEl.textContent = `MODULE // ${proj.ref}`;
  const isOnline = proj.status !== 'building';
  if (statusLed) {
    statusLed.className = 'ds-status-led ' + (isOnline ? 'status-online' : 'status-building');
  }
  if (statusText) {
    statusText.textContent = proj.statusText || (isOnline ? 'ONLINE' : 'IN BUILD / LAB');
  }
  if (railBusEl) {
    railBusEl.textContent = `${proj.rail || '+3.3V CORE'} · ${proj.bus || 'PCIe BUS'}`;
  }

  const title = `// ${proj.title}`;
  if (titleEl) titleEl.textContent = title;
  if (titleTwinEl) titleTwinEl.textContent = title;
  if (functionEl) functionEl.textContent = proj.function || proj.theme || 'HARDWARE SUBSYSTEM';
  if (problemEl) problemEl.textContent = proj.problem;
  if (stateEl) stateEl.textContent = proj.state;
  if (inputsEl) inputsEl.textContent = proj.inputs || 'System Bus Commands';
  if (outputsEl) outputsEl.textContent = proj.outputs || 'Telemetry Stream';

  if (specEl) {
    specEl.textContent = '';
    (proj.spec || []).forEach((/** @type {string} */ s) => {
      const li = document.createElement('li');
      li.textContent = s;
      specEl.appendChild(li);
    });
  }

  if (tagsEl) {
    tagsEl.textContent = '';
    (proj.tags || []).forEach((/** @type {string} */ t) => {
      const pill = document.createElement('span');
      pill.className = 'skill-pill';
      pill.textContent = t;
      tagsEl.appendChild(pill);
    });
  }

  if (linkEl) {
    linkEl.href = proj.link || '#';
    linkEl.textContent = proj.linkLabel || 'INSPECT REPOSITORY →';
  }

  // Trigger one-shot hairline divider scan
  if (dividerScan) {
    dividerScan.classList.remove('active');
    void dividerScan.offsetWidth; // force DOM reflow
    dividerScan.classList.add('active');
  }

  // Progressive engineering handshake sequence
  clearHandshakeTimers();
  if (stepEl && progEl) {
    stepEl.textContent = `INIT // MODULE SELECTED [${proj.ref}]`;
    progEl.textContent = '[░░░░░░░░░░░░]';

    if (!motionPrefs.reduced) {
      handshakeTimers.push(setTimeout(() => {
        if (stepEl && progEl) {
          stepEl.textContent = 'AUTHENTICATING EEPROM SIGNATURE...';
          progEl.textContent = '[████░░░░░░░░]';
        }
      }, 70));

      handshakeTimers.push(setTimeout(() => {
        if (stepEl && progEl) {
          stepEl.textContent = 'LOADING SUBSYSTEM TELEMETRY...';
          progEl.textContent = '[████████░░░░]';
        }
      }, 140));

      handshakeTimers.push(setTimeout(() => {
        if (stepEl && progEl) {
          stepEl.textContent = `DATASHEET COMPILED · STATUS ${isOnline ? 'ONLINE' : 'ACTIVE'}`;
          progEl.textContent = '[████████████]';
        }
      }, 210));
    } else {
      stepEl.textContent = `DATASHEET COMPILED · STATUS ${isOnline ? 'ONLINE' : 'ACTIVE'}`;
      progEl.textContent = '[████████████]';
    }
  }

  // Stagger element reveals
  staggerDatasheetFields(panel);

  // Sync Live Simulation Bench to this project module
  syncLiveBenchToProject(proj.ref);
}

/** Release focus. With glideBack, the camera returns to the current
 *  section's stop pose (Esc / close button); on scroll the scrub owns the
 *  camera instead, so no glide. @param {boolean} [glideBack] */
function clearFocus(glideBack = false) {
  if (!focusedChip) return;
  clearHandshakeTimers();
  // LCD1's game owns the keyboard while focused — releasing the focus
  // (Esc, re-click, scroll, or a chip click) must hand the keys back.
  if (focusedChip.ref === 'LCD1') exitLcd();
  focusedChip = null;
  if (glideBack && cameraRef) {
    const cfg = getCameraConfigForStop(currentSectionId);
    glideCameraTo(cfg.pos, cfg.look, 0.65);
  }
  if (currentSectionId === 'sec-projects') {
    inspectProject('CP1');
  } else {
    hideProjectVisuals();
  }
}

/** Click-to-component entry: glide the camera to the clicked chip, flash
 *  its LED, and anchor the focused datasheet panel near it. Clicking the
 *  same chip again (or Esc / close) releases. @param {string} ref */
export function focusProject(ref) {
  if (!cameraRef || !journeyReady) return;
  const chip = projectChips[ref];
  if (!chip) return;
  // Toggle: clicking the already-focused chip closes the focus view.
  if (focusedChip && focusedChip.ref === ref) {
    clearFocus(true);
    return;
  }
  // A focused LCD1 game yields its keyboard + camera to the chip click.
  if (focusedChip && focusedChip.ref === 'LCD1') exitLcd();
  focusedChip = { ref, localPos: chip.pos, data: chip.data };

  // Tactile acoustic feedback: crisp relay throw + instrument tick
  relayClick();
  clickBlip();

  fillProjectDetailPanel(chip.data);
  setActivePanel('panel-project-detail');
  inspectProject(ref);
  // Switching chips while the detail panel is ALREADY active: setActivePanel
  // early-returns (same id), so the fresh problem/state text types explicitly.
  // Idempotent — reset-then-type — so the normal path is unaffected.
  typewritePanel(document.getElementById('panel-project-detail'));

  // Flash the chip's status LED — same "if it glows, it's live" language
  // as pulseArrival, but the chip's own light.
  gsap.killTweensOf(chip.ledMat);
  gsap.fromTo(chip.ledMat, { emissiveIntensity: 0.15 }, {
    emissiveIntensity: 1.9,
    duration: 0.3,
    yoyo: true,
    repeat: 1,
    ease: 'power1.out',
    overwrite: 'auto'
  });
  // The socket gem reacts with its own pulse — the gem brightening is what
  // reads as "this module is now active" on the board, in sync with the
  // camera arriving at the chip (same tween shape, brighter peak so the
  // category stone visibly lights up).
  if (chip.gemMat) {
    gsap.killTweensOf(chip.gemMat);
    gsap.fromTo(chip.gemMat, { emissiveIntensity: 0.25 }, {
      emissiveIntensity: 2.8,
      duration: 0.3,
      yoyo: true,
      repeat: 1,
      ease: 'power1.out',
      overwrite: 'auto'
    });
  }

  // Conduct trace power directly to chip on arrival
  energizeTraceAtPoint(chip.pos, 1.2);

  const look = chip.pos.clone().add(new THREE.Vector3(0, 0.05, 0));
  const pos = chip.pos.clone().add(CHIP_FOCUS_OFFSET);
  glideCameraTo(pos, look, 0.65);
}

/** Public release (close button / Esc wiring). */
export function exitFocusMode() {
  clearFocus(true);
}

/** Click-to-component entry for LCD1: glide the camera to the display and
 *  hand the keyboard to the SIGNAL SNAKE game (lcd.js). Clicking the
 *  display again (or Esc / scroll / a chip click) releases — the same
 *  toggle + clearFocus contract as the project chips, but no datasheet
 *  panel (the game IS the content, rendered on the screen quad). */
export function focusLcdCamera(replayBoot = false) {
  if (!cameraRef || !journeyReady) return;
  if (focusedChip && focusedChip.ref === 'LCD1') {
    clearFocus(true);
    return;
  }
  if (focusedChip) clearFocus(false); // a chip focus yields to the LCD
  focusedChip = { ref: 'LCD1', localPos: LCD_LOCAL_POS.clone(), data: null };
  const look = LCD_LOCAL_POS.clone().add(new THREE.Vector3(0, 0.05, 0));
  const pos = LCD_LOCAL_POS.clone().add(CHIP_FOCUS_OFFSET);
  glideCameraTo(pos, look, 0.65);
  // The #/lcd deep link passes replayBoot so the display powers on with a
  // fresh POST; the plain click path (no arg) shows the ready screen.
  focusLcd(replayBoot);
}

// ─── Leg state: which section is active given where the scroll is ──
// Each ScrollTrigger leg drives the camera from `source` to `destination`.
// We switch to the destination once we're over halfway through the leg
// (0.55), and only fall back to the source below 0.5 — a 0.05 boundary
// band so parking the scroll on a leg boundary can't toggle the panel.
/** @param {string} destination @param {string} source @param {number} progress */
function setLegState(destination, source, progress) {
  currentLegProgress = progress;
  if (progress >= 0.55) {
    if (currentSectionId !== destination) {
      currentSectionId = destination;
      pulseArrival(destination);
    }
  } else if (progress < 0.5) {
    if (currentSectionId !== source) {
      currentSectionId = source;
      pulseArrival(source);
    }
  }
}

// ─── Arrival micro-moment: the component (or its signal trace)
// lights up when the camera reaches its section. Same language as
// the boot sequence's trace flash — "if it glows, it's live".
/** @type {Record<string, string>} */
const ARRIVAL_TRACE = { 'sec-projects': 'U2', 'sec-skills': 'C1', 'sec-experience': 'J1', 'sec-contact': 'ANT1' };
/** @param {string} secId */
export function pulseArrival(secId) {
    if (!secId) return;
    onSectionChanged(secId);
    if (secId === 'sec-about') {
        // U1: radar sweep + silicon die flash bright, then settle
        if (cpuRadarRing && cpuRadarRing.material) {
            gsap.fromTo(cpuRadarRing.material, { opacity: 0.6 }, { opacity: 1, duration: 0.4, yoyo: true, repeat: 1, ease: 'power1.out', overwrite: 'auto' });
        }
        if (siliconDieMesh && siliconDieMesh.material) {
            gsap.fromTo(siliconDieMesh.material, { opacity: 0.65 }, { opacity: 1, duration: 0.4, yoyo: true, repeat: 1, ease: 'power1.out', overwrite: 'auto' });
        }
        return;
    }
    if (secId === 'sec-projects') {
        // Energize expansion bus: flash socket LEDs across installed hardware modules
        Object.values(projectChips).forEach((chip) => {
            if (chip.ledMat) {
                gsap.fromTo(chip.ledMat, { emissiveIntensity: chip.ledBase }, {
                    emissiveIntensity: chip.ledBase * 1.8,
                    duration: 0.35,
                    yoyo: true,
                    repeat: 1,
                    ease: 'power1.out',
                    overwrite: 'auto'
                });
            }
        });
    }
    if (secId === 'sec-skills') {
        // Energize capacitor banks: cascade charge flash across C1-C4
        ['C1', 'C2', 'C3', 'C4'].forEach((cid, i) => {
            setTimeout(() => energizeCapacitor(cid, 2.2), i * 90);
        });
    }
    const ref = ARRIVAL_TRACE[secId];
    if (!ref) return;
    traceData.forEach(t => {
        if (t.component !== ref) return;
        t.meshes.forEach(m => {
            // Trace segments always use a MeshStandardMaterial with emissive —
            // instanceof narrows the Material | Material[] union for checkJs.
            const mat = m.material;
            if (mat instanceof THREE.MeshStandardMaterial) {
                gsap.fromTo(mat, { emissiveIntensity: 0.4 }, { emissiveIntensity: 1.3, duration: 0.35, yoyo: true, repeat: 1, ease: 'power1.out', delay: 0.05, overwrite: 'auto' });
            }
        });
    });
}

// ─── Typewriter body reveal ──────────────────────────────────
// When a panel activates, its narrative copy (.ds-body) reveals
// character-by-character at ~16ms/char (TYPE_CHAR_MS) — the terminal
// boot-sequence aesthetic extended to the datasheets — instead of arriving
// only with the block cascade. Non-destructive: the char spans are collapsed
// back to plain text on reset (textContent is lossless — the spans hold the
// same characters), so data renderers (fillProjectDetailPanel) and repeated
// activations both stay safe. Skipped entirely under reduced motion — the
// block cascade (plain fade) owns the reveal there.
const TYPE_CHAR_MS = 16;        // per-char stagger — the "~15-20ms/char" brief
const TYPE_CHAR_DURATION = 0.05; // per-char fade, short so the cadence reads

/** Collapse any in-flight typewriter back to plain text and kill its tweens.
 *  @param {HTMLElement} panel */
function resetTypewriter(panel) {
  /** @type {HTMLElement[]} */
  const actives = [...panel.querySelectorAll('.typer-active')].filter((el) => el instanceof HTMLElement);
  actives.forEach((el) => {
    gsap.killTweensOf(el.querySelectorAll('.typer-char'));
    el.textContent = el.textContent; // spans hold the same chars — lossless collapse
    el.classList.remove('typer-active');
  });
}

/** Type the panel's .ds-body copy in, char by char. Idempotent: resets first.
 *  @param {HTMLElement | null} panel */
function typewritePanel(panel) {
  if (!panel || !document.body.classList.contains('full-journey')) return;
  if (motionPrefs.reduced) return;
  resetTypewriter(panel);
  /** @type {HTMLElement[]} */
  const bodies = [...panel.querySelectorAll('.ds-body')].filter((el) => el instanceof HTMLElement);
  bodies.forEach((el) => {
    const text = el.textContent;
    if (!text) return;
    el.textContent = '';
    const frag = document.createDocumentFragment();
    /** @type {HTMLElement[]} */
    const chars = [];
    for (const ch of text) {
      const span = document.createElement('span');
      span.className = 'typer-char';
      span.textContent = ch;
      frag.appendChild(span);
      chars.push(span);
    }
    el.appendChild(frag);
    el.classList.add('typer-active');
    gsap.fromTo(chars, { autoAlpha: 0 }, {
      autoAlpha: 1,
      duration: TYPE_CHAR_DURATION,
      stagger: { each: TYPE_CHAR_MS / 1000, from: 'start' },
      ease: 'none'
    });
  });
}

/**
 * Smoothly position the glowing sliding pill indicator in the mobile dock.
 */
export function updateMobileDockIndicator() {
  const dock = document.getElementById('hud-mobile-dock');
  const indicator = document.getElementById('dock-indicator');
  if (!dock || !indicator) return;
  const activeBtn = /** @type {HTMLElement | null} */ (dock.querySelector('.mobile-dock-btn.nav-active'));
  if (activeBtn) {
    const dockRect = dock.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    indicator.style.opacity = '1';
    indicator.style.transform = `translateX(${btnRect.left - dockRect.left}px)`;
    indicator.style.width = `${btnRect.width}px`;
  } else {
    indicator.style.opacity = '0';
  }
}

// ─── Panel + nav activation ─────────────────────────────────
/** @param {string | null} panelId */
function setActivePanel(panelId) {
  if (activePanelId === panelId) return;
  const prevPanelId = activePanelId;
  // Leave the panel behind: kill any in-flight typewriter so its chars don't
  // keep animating off-screen (they collapse instantly — the panel is hidden).
  if (prevPanelId) {
    const prevPanel = document.getElementById(prevPanelId);
    if (prevPanel) {
      resetTypewriter(prevPanel);
      // Kill any in-flight headline-twin sweep on the departing panel so
      // the gradient twin doesn't linger at opacity > 0 (the "duplicate
      // header" bug — the twin was stuck visible from an interrupted sweep).
      const staleTwin = prevPanel.querySelector('.headline-twin');
      if (staleTwin) {
        gsap.killTweensOf(staleTwin);
        gsap.set(staleTwin, { opacity: 0, clearProps: 'backgroundPosition' });
      }
    }
  }
  activePanelId = panelId;
  document.querySelectorAll('.ds-panel').forEach((el) => {
    el.classList.toggle('panel-active', el.id === panelId);
  });
  const secId = panelId ? panelId.replace('panel-', 'sec-') : '';
  // Exactly ONE LinkedIn CTA per section: hide the HUD button whenever the
  // active panel carries its own CTA (hero, about, contact all do).
  const activePanelEl = panelId ? document.getElementById(panelId) : null;
  const panelHasOwnCta = !!(activePanelEl && activePanelEl.querySelector('.cta-linkedin'));
  document.body.classList.toggle('hud-cta-hidden', !!panelId && panelHasOwnCta);
  document.querySelectorAll('.hud-nav .nav-btn, .mobile-dock-btn').forEach((btn) => {
    btn.classList.toggle('nav-active', btn.getAttribute('data-section') === secId);
  });
  updateMobileDockIndicator();
  // One-shot gold sweep on the activated panel's datasheet title
  // (gradient-text-sweep — same background-clip:text twin mechanism as the
  // boot's hero sweep: raised, backgroundPosition 100%→0% (left→right
  // travel), then faded back so the solid silkscreen title owns the rest
  // state). The hero panel is excluded — boot.js owns its twin, and
  // initJourney's setActivePanel('panel-hero') would otherwise re-sweep it
  // right after boot.
  if (panelId && panelId !== 'panel-hero' && activePanelEl) {
    const titleTwin = activePanelEl.querySelector('.headline-twin');
    if (titleTwin) {
      gsap.killTweensOf(titleTwin);
      // Reset the twin to hidden first — ensures no stale twin from a
      // previous interrupted sweep is visible before the new sweep starts.
      gsap.set(titleTwin, { opacity: 0, backgroundPosition: '100% 50%' });
      // One-shot gold sweep: gradient travels left→right,
      // then the twin fades back to opacity 0 so only the solid
      // silkscreen h2 owns the rest state.
      gsap.fromTo(titleTwin,
        { backgroundPosition: '100% 50%' },
        { backgroundPosition: '0% 50%', duration: 1.2, ease: 'none' }
      );
      gsap.to(titleTwin, {
        opacity: 0,
        duration: 0.4,
        ease: 'power1.out',
        delay: 1.2,
        clearProps: 'backgroundPosition'
      });
    }
  }

  // Power-on micro-moment for the section's component
  pulseArrival(secId);

  // Dynamic Studio Rim Light tint per section
  /** @type {Record<string, number>} */
  const SECTION_RIM_COLORS = {
    'sec-hero': 0x3ee6a0,
    'sec-about': 0x22d3ee,
    'sec-projects': 0x38bdf8,
    'sec-skills': 0xf59e0b,
    'sec-experience': 0xa855f7,
    'sec-contact': 0x10b981
  };
  if (secId && SECTION_RIM_COLORS[secId]) {
    setSectionRimColor(SECTION_RIM_COLORS[secId]);
  }

  // Active trace routing: the section's copper energizes on arrival (surge
  // pulse) and the previous section's trace releases back to its base glow.
  // Hero has no trace ('' in SECTION_TRACE) so both calls no-op there.
  if (prevPanelId) energizeTraceForSection(prevPanelId.replace('panel-', 'sec-'), false);
  if (panelId) energizeTraceForSection(secId, true);

  // Content cascade: the panel's inner blocks reveal in sequence (ref →
  // title → body rows) instead of appearing with the flat cross-fade — one
  // orchestrated arrival beat on the house power2.out curve. The hidden
  // .headline-twin is excluded (the sweep above owns it); the panel's own
  // .cta-linkedin is excluded too (plan 005) so the CTA appears instantly
  // with the panel — the cascade must never delay the conversion moment.
  // Lite mode stays static (panels are in document flow, not toggled).
  if (panelId && activePanelEl && document.body.classList.contains('full-journey')) {
    const blocks = /** @type {HTMLElement[]} */ ([...activePanelEl.children].filter(
      (el) => el instanceof HTMLElement
        && !el.classList.contains('headline-twin')
        && !el.classList.contains('cta-linkedin')
    ));
    if (blocks.length > 1) {
      gsap.killTweensOf(blocks);
      gsap.fromTo(blocks,
        { autoAlpha: 0, y: 10 },
        {
          autoAlpha: 1, y: 0, duration: 0.3,
          stagger: { each: 0.04, from: 'start' },
          ease: 'power2.out',
          clearProps: 'transform'
        }
      );
    }
  }

  // Typewriter body reveal — the narrative copy types in (~16ms/char, the
  // terminal boot aesthetic) instead of arriving with the cascade alone.
  // Skipped under reduced motion (the cascade fade above owns the reveal).
  typewritePanel(activePanelEl);

  // Show/hide connector
  if (connectorLine) {
    const showConnector = panelId && panelId !== 'panel-hero' && panelId !== 'panel-contact';
    connectorLine.style.display = showConnector ? 'block' : 'none';
  }
}

// ─── Create connector SVG overlay ───────────────────────────
function createConnector() {
  // Idempotent: a re-init (HMR re-entry, double module graph in dev) must
  // never stack a second fixed overlay on the page.
  document.querySelectorAll('#connector-line').forEach((el) => el.remove());
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'connector-line';
  svg.setAttribute('class', 'connector-svg');
  svg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:29;pointer-events:none;overflow:visible;';
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('class', 'connector-path');
  line.setAttribute('stroke', 'rgba(0,255,136,0.45)');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-dasharray', '4 4');
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('class', 'connector-dot');
  dot.setAttribute('r', '3');
  dot.setAttribute('fill', '#00ff88');
  dot.setAttribute('opacity', '0.6');
  svg.appendChild(line);
  svg.appendChild(dot);
  document.body.appendChild(svg);
  connectorLine = svg;
}

/** Draw the signal trace from a projected screen point (component dot) to the
 *  left edge of the fixed datasheet sidebar — the trace "connects" the board
 *  component to its datasheet. The sidebar never moves, so only the component
 *  end travels with the camera; the sidebar end is the panel's left edge.
 *  @param {number} cx @param {number} cy */
function drawConnector(cx, cy) {
  if (!connectorLine) return;
  if (window.innerWidth < 900 || document.body.classList.contains('lite-mode')) {
    connectorLine.style.display = 'none';
    return;
  }
  const line = connectorLine.querySelector('line');
  const dot = connectorLine.querySelector('circle');
  if (!line || !dot) return;
  const sideX = Math.round(window.innerWidth * 0.58) + 24; // sidebar panel left edge
  const sideY = Math.max(90, Math.min(cy, window.innerHeight - 24));
  line.setAttribute('x1', cx.toFixed(1));
  line.setAttribute('y1', cy.toFixed(1));
  line.setAttribute('x2', sideX.toFixed(1));
  line.setAttribute('y2', sideY.toFixed(1));
  dot.setAttribute('cx', cx.toFixed(1));
  dot.setAttribute('cy', cy.toFixed(1));
  connectorLine.style.display = 'block';
}

// ─── Per-frame update: screen-space panels + connector + vignette ──
// Panel activation is NOT computed here — it's a pure function of the
// current scroll leg (setLegState runs in the ScrollTrigger onUpdate),
// except while a chip is focused: then the detail panel is active.
// This function only handles the per-frame visual work.
/** @param {THREE.PerspectiveCamera} camera @param {THREE.Group} boardGroup */
export function updateJourneyEffects(camera, boardGroup) {
  if (!camera || !boardGroup || !journeyReady) return;

  if (!currentWavefrontGroup) {
    initCurrentWavefront(boardGroup);
  }

  // 1. Apply the leg-derived panel state (idempotent thanks to the
  //    activePanelId early-return in setActivePanel). Skipped while a chip
  //    is focused — the detail panel owns activation until release.
  if (focusedChip && currentWavefrontGroup) currentWavefrontGroup.visible = false;
  if (!focusedChip) {
    const panelId = currentSectionId ? currentSectionId.replace('sec-', 'panel-') : null;
    if (panelId && activePanelId !== panelId) {
      setActivePanel(panelId);
    } else if (!panelId && activePanelId !== null) {
      setActivePanel(null);
    }
  }

  // 2. Signal trace: the active component (or focused chip) → the fixed
  //    datasheet sidebar's left edge. The sidebar itself never moves — only
  //    the component end of the trace travels with the camera.
  const activeSecId = activePanelId ? activePanelId.replace('panel-', 'sec-') : null;
  // Trace source: the focused chip takes precedence, else the active
  // component section's board-local position.
  /** @type {THREE.Vector3 | null} */
  let traceLocalPos = focusedChip ? focusedChip.localPos : null;
  if (!traceLocalPos && activeSecId) {
    traceLocalPos = COMPONENT_WORLD[activeSecId] || null;
  }
  if (traceLocalPos) {
    worldPos.copy(traceLocalPos);
    boardGroup.localToWorld(worldPos);
    screenPos.copy(worldPos).project(camera);

    const cx = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const cy = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
    drawConnector(cx, cy);
  } else if (connectorLine) {
    connectorLine.style.display = 'none';
  }

  // 3. Vignette driven by leg progress toward the active component
  //    (0.35 at the far end of the leg ramping to 0.6 on arrival — soft
  //    depth; the ceiling stays low so screen edges never read as dead
  //    space against the fab-bench backdrop).
  if (!vignetteEl) vignetteEl = /** @type {HTMLElement | null} */ (document.querySelector('.vignette-overlay'));
  if (vignetteEl) {
    // Vignette ramps from 0.35 to 0.6 on arrival — soft depth, never so dark
    // the screen edges read as dead space (the old 0.85 ceiling blacked the
    // outer half of the viewport during component zooms).
    let intensity = 0.35;
    if (activeSecId && COMPONENT_WORLD[activeSecId] && currentLegProgress >= 0.5) {
      const t = Math.min(1, (currentLegProgress - 0.5) / 0.5);
      intensity = 0.35 + t * 0.25;
    }
    vignetteEl.style.opacity = String(intensity);
  }
}

// ─── Init ───────────────────────────────────────────────────
/** @param {THREE.PerspectiveCamera} camera @param {THREE.Group} [boardGroup] */
export function initJourney(camera, boardGroup) {
  cameraRef = camera;
  buildCurves();
  createConnector();

  if (boardGroup) {
    initCurrentWavefront(boardGroup);
  }

  const sections = /** @type {HTMLElement[]} */ (stopOrder
    .map((id) => document.getElementById(id))
    .filter(Boolean));

  if (sections.length < 2) {
    console.warn('Journey: not enough sections found for scroll path');
    return;
  }

  // Glide from the boot pose into the hero framing — replacing the old
  // instant setCameraAtT(0) snap (a visible camera cut after every boot).
  glideToHero();
  setActivePanel('panel-hero');
  if (vignetteEl) vignetteEl.style.opacity = '0.35';

  const totalScrollHeight = sections.reduce((sum, sec) => sum + sec.offsetHeight, 0);
  if (totalScrollHeight < window.innerHeight * 2) {
    document.body.style.minHeight = '400vh';
  }

  // One scrubbed trigger per travel leg. The window spans exactly one screen
  // of scroll per leg ('top bottom' → 'top top' = 100vh regardless of section
  // height), so the camera arrives at the stop exactly when the section fills
  // the viewport, then parks for the remaining 20vh of the section's 120vh
  // track while the next section enters. The old 'top 95% → top 5%' windows
  // consumed only 0.9vh of scroll per leg — with a FIXED sidebar there's no
  // full-screen overlay to park, so the rest of each 180–300vh section was
  // pure dead road.
  for (let i = 1; i < sections.length; i++) {
    const prevT = stopTs[stopOrder[i - 1]];
    const thisT = stopTs[stopOrder[i]];
    ScrollTrigger.create({
      trigger: sections[i],
      start: 'top bottom',
      end: 'top top',
      scrub: 0.5,
      onUpdate: (self) => {
        // ANY user scroll releases chip/LCD focus — the scrub owns the
        // camera from here (and LCD1's exclusive keyboard must hand back
        // before the page keeps scrolling).
        if (focusedChip) clearFocus(false);
        // Using self.progress directly eliminates double-compounding ease distortion,
        // so the camera flight is 1-to-1 smoothly governed by the window scroll ease.
        const progress = self.progress;
        if (!rideCamera(i, progress)) {
          setCameraAtT(prevT + (thisT - prevT) * progress);
        }
        // Panel activation follows the scroll, not camera distance
        setLegState(stopOrder[i], stopOrder[i - 1], self.progress);
      }
    });
  }

  requestAnimationFrame(() => {
    ScrollTrigger.refresh();
  });

  // Smooth scroll layer: wheel input below the step threshold scrolls
  // natively (follows the finger); deliberate input (two notches / a flick)
  // glides section to section with the unified power2.inOut ease. Keyboard
  // and nav share the same queue (see the layer block at the bottom).
  wireSmoothScroll();

  // Esc releases chip focus (close button lives in the panel; scroll does
  // it implicitly via setCameraAtT). Ignored while typing in a field.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (focusedChip) clearFocus(true);
  });

  // Rebuild curves on resize: the hero/contact framing z is aspect-dependent
  // (the board must fit the left-58% canvas in BOTH FOV axes), so a resize
  // that changes the canvas aspect needs fresh camera stops. main.js drives
  // this through resizeJourney() in a DEFINED order (scene sync → curves →
  // ScrollTrigger.refresh) — this debounced listener is a resilience net for
  // HMR/re-entry cases, not the primary path.
  let curveResizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(curveResizeTimer);
    curveResizeTimer = setTimeout(() => {
      resizeJourney();
    }, 200);
  }, { passive: true });

  // Panels are now safe to drive (boot sequence is done)
  journeyReady = true;
}

/** Coordinated resize: rebuild the camera curves (framing z is
 *  aspect-dependent) AND refresh ScrollTrigger so the leg windows re-measure
 *  against the new layout. main.js calls this AFTER scene.syncCanvasSize() so
 *  the curves read the fresh canvas size — ordering between the two was
 *  previously luck (two independent debounced listeners could race, leaving
 *  the hero/contact framing z stale until the next resize). No-op until
 *  initJourney has run (journeyReady gate, same as the legacy listener). */
export function resizeJourney() {
  if (!journeyReady) return;
  buildCurves();
  requestAnimationFrame(() => {
    ScrollTrigger.refresh();
  });
}

/** The section the current scroll leg has activated — exported so
 *  cross-module consumers (e.g. board parallax gating) read the source of
 *  truth instead of re-deriving it from DOM classes. */
export function getActiveSectionId() {
  return currentSectionId;
}

/** True while a chip focus view is active (clicked chip / Esc releases) —
 *  board.js damps the levitation to 20% while this is true so the focused
 *  composition steadies under the fixed camera stop (probe touchdown). */
export function isFocusMode() {
  return !!focusedChip;
}

// ─── Direct navigation ──────────────────────────────────────
/** @param {string} sectionId */
export function scrollToSection(sectionId) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  // Land exactly on the section's stop pose: with the one-screen-per-leg
  // geometry the camera arrives when the section fills the viewport (its top
  // hits the viewport top), so the target is the section's offsetTop — the
  // old offsetTop + 0.45h aimed into the dead park zone of the old 180–300vh
  // legs, which no longer exists.
  const y = sectionId === 'sec-hero'
    ? 0
    : el.offsetTop;
  // A wheel/snap glide in flight is superseded by direct navigation (the
  // overwrite kills it; a killed tween never fires onComplete, so the snap
  // layer is reset explicitly here — otherwise a nav click mid-glide would
  // leave glideActive stuck and the wheel snapping dead). The nav tween then
  // CLAIMS glideActive for its own flight: with the flag set, competing
  // wheel/key/settle input QUEUES through pumpGlide (or is dropped by the
  // navGlideActive guard) instead of starting a second tween that kills the
  // nav mid-flight. Before this, a single wheel tick during the 1.2s nav
  // glide redirected the page to a neighbor section — clicking [MODULES]
  // and landing on About or Skills, never staying on the clicked section.
  glideActive = true;
  navGlideActive = true;
  glideQueued = 0;
  wheelAccum = 0;
  wheelCooldownUntil = Date.now() + Math.round(SECTION_TRANSITION_DURATION * 1000) + 180;
  gsap.to(window, {
    scrollTo: { y },
    duration: SECTION_TRANSITION_DURATION,
    ease: 'power2.inOut',
    overwrite: 'auto',
    onComplete: () => {
      glideActive = false;
      navGlideActive = false;
      // One gesture = one section: clear any residual queue so keyboard
      // steps queued during the nav glide don't auto-chain past the
      // target. The user must make a fresh gesture to advance again.
      glideQueued = 0;
      wheelAccum = 0;
      wheelCooldownUntil = Date.now() + 180;
      pumpGlide();
    }
  });
}

// ─── Smooth scroll layer ──────────────────────────────────────
export const WHEEL_STEP_PX = 240;
export const MAX_QUEUED_STEPS = 3;
// Section-transition duration — tuned to snappy 0.85s (user never waits)
export const SECTION_TRANSITION_DURATION = 0.85;
let wheelAccum = 0;
let glideQueued = 0;
let glideActive = false;
let navGlideActive = false;
let smoothScrollWired = false;
let wheelCooldownUntil = 0;
let lastWheelTime = 0;

/** Document-scroll Y of every section stop, read live so resize/reflow is
 *  always current. */
function getStopScrolls() {
  return stopOrder.map((id) => {
    if (id === 'sec-hero') return 0;
    const el = document.getElementById(id);
    return el ? el.offsetTop : 0;
  });
}

/** Nearest section stop strictly beyond the current scroll in `dir`.
 *  @param {number} dir */
function directionalStop(dir) {
  return computeDirectionalStop(getStopScrolls(), window.scrollY, dir);
}

/** Pure direction math for the snap layer: the nearest stop strictly beyond
 *  the current scroll in `dir`, with a 2px tolerance so a glide that lands
 *  exactly ON a stop doesn't re-target itself. Clamped to the journey's
 *  ends. Exported for the headless smoke test.
 *  @param {number[]} stops sorted section stop scroll-Ys
 *  @param {number} y current scroll position
 *  @param {number} dir +1 forward, −1 backward */
export function computeDirectionalStop(stops, y, dir) {
  if (dir > 0) {
    for (const s of stops) if (s > y + 2) return s;
    return stops[stops.length - 1] ?? 0;
  }
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i] < y - 2) return stops[i];
  }
  return 0;
}

/** Pure wheel→queue math: how many section steps a delta contributes (with
 *  the sub-threshold remainder carried in the accumulator), capped to ±max.
 *  Exported for the headless smoke test.
 *  @param {number} delta raw wheel delta (px, deltaMode-normalized)
 *  @param {number} [accum] carried sub-threshold delta
 *  @param {number} [stepPx] default WHEEL_STEP_PX
 *  @param {number} [maxSteps] default MAX_QUEUED_STEPS */
export function wheelStepQueue(delta, accum = 0, stepPx = WHEEL_STEP_PX, maxSteps = MAX_QUEUED_STEPS) {
  let a = accum + delta;
  let steps = 0;
  while (a >= stepPx) { a -= stepPx; steps++; }
  while (a <= -stepPx) { a += stepPx; steps--; }
  return { queue: Math.max(-maxSteps, Math.min(maxSteps, steps)), accum: a };
}

/** Pure queue-state math shared by wheel and keyboard stepping: the queue
 *  after adding `dir` steps, clamped to the burst bound. Exported for the
 *  headless smoke test.
 *  @param {number} queue current queued steps (signed)
 *  @param {number} dir +1 forward, −1 backward (or ±N from a wheel delta)
 *  @param {number} [cap] default MAX_QUEUED_STEPS */
export function stepQueue(queue, dir, cap = MAX_QUEUED_STEPS) {
  return Math.max(-cap, Math.min(cap, queue + dir));
}

/** Queue one section step in a direction
 *  @param {number} dir */
/** @param {number} dir */
export function queueStep(dir) {
  glideQueued = stepQueue(glideQueued, dir);
  pumpGlide();
}

/** Glide the page to a scroll Y with the site's unified transition
 *  @param {number} y */
function glideToY(y) {
  if (Math.abs(window.scrollY - y) < 2) {
    glideActive = false;
    glideQueued = 0;
    wheelAccum = 0;
    wheelCooldownUntil = Date.now() + 150;
    return;
  }
  glideActive = true;
  gsap.to(window, {
    scrollTo: { y, autoKill: false },
    duration: SECTION_TRANSITION_DURATION,
    ease: 'power2.inOut',
    overwrite: 'auto',
    onComplete: () => {
      glideActive = false;
      glideQueued = 0;
      wheelAccum = 0;
      wheelCooldownUntil = Date.now() + 180; // soak up trackpad momentum
    }
  });
}

/** Consume queued steps one glide at a time */
function pumpGlide() {
  if (glideActive || glideQueued === 0 || !journeyReady) return;
  glideActive = true;
  glideToY(directionalStop(Math.sign(glideQueued)));
}

/** Get current section index based on current scroll position or currentSectionId */
function getCurrentSectionIndex() {
  const currentId = currentSectionId || 'sec-hero';
  const idx = stopOrder.indexOf(currentId);
  if (idx !== -1) return idx;
  const stops = getStopScrolls();
  const y = window.scrollY;
  let closestIdx = 0;
  let minDiff = Infinity;
  stops.forEach((s, i) => {
    const diff = Math.abs(s - y);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  });
  return closestIdx;
}

/** Glide directly to target section index */
/** @param {number} targetIdx */
function glideToSectionIndex(targetIdx) {
  const stops = getStopScrolls();
  const clampedIdx = Math.max(0, Math.min(stops.length - 1, targetIdx));
  const targetY = stops[clampedIdx];
  glideToY(targetY);
}

/** Wheel = one deliberate scroll gesture smoothly navigates to the next/prev section.
 *  Never gets stuck in between sections, and never skips modules on trackpad inertia.
 *  @param {WheelEvent} e */
function onJourneyWheel(e) {
  if (!journeyReady || motionPrefs.reduced || isFocusMode() || e.ctrlKey || e.metaKey) return;

  const now = Date.now();
  const timeSinceLast = now - lastWheelTime;
  lastWheelTime = now;

  // While a section glide is actively in flight or in post-glide cooldown, swallow all wheel events
  if (navGlideActive || glideActive || now < wheelCooldownUntil) {
    e.preventDefault();
    return;
  }

  // If events arrive in a continuous rapid stream (<200ms apart), this is residual inertia
  // from the preceding scroll stroke. Require a brief rest before initiating another section step.
  if (timeSinceLast < 200) {
    e.preventDefault();
    return;
  }

  let d = e.deltaY;
  if (e.deltaMode === 1) d *= 40;       // lines → px
  else if (e.deltaMode === 2) d *= 100; // pages → px

  // Require an intentional scroll notch or deliberate trackpad flick (ignore hairline micro-jitters)
  if (Math.abs(d) < 16) return;

  // Check if mouse is hovering over an active panel that has scrollable content (e.g. #panel-projects)
  const activePanel = document.querySelector('.ds-panel.panel-active');
  const isOverActivePanel = activePanel && (e.target === activePanel || activePanel.contains(/** @type {Node} */ (e.target)));

  if (isOverActivePanel && activePanel.scrollHeight > activePanel.clientHeight + 10) {
    const atTop = activePanel.scrollTop <= 6;
    const atBottom = activePanel.scrollTop + activePanel.clientHeight >= activePanel.scrollHeight - 6;

    if (d > 0 && !atBottom) {
      // User is scrolling down inside panel and more content exists below:
      // Allow the panel to scroll down naturally
      return;
    }
    if (d < 0 && !atTop) {
      // User is scrolling up inside panel and panel is scrolled down:
      // Allow the panel to scroll up naturally
      return;
    }
  }

  // Otherwise, user wants to navigate cleanly to the next/previous section:
  e.preventDefault();

  const dir = d > 0 ? 1 : -1;
  const curIdx = getCurrentSectionIndex();
  const targetIdx = curIdx + dir;
  
  if (targetIdx >= 0 && targetIdx < stopOrder.length) {
    wheelCooldownUntil = now + Math.round(SECTION_TRANSITION_DURATION * 1000) + 180;
    glideToSectionIndex(targetIdx);
  }
}

/** Touch swipe handling for mobile / touch devices */
let touchStartY = 0;
let touchStartX = 0;
let touchStartTime = 0;

/** @param {TouchEvent} e */
function onJourneyTouchStart(e) {
  if (!journeyReady || motionPrefs.reduced || isFocusMode() || e.touches.length !== 1) return;
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
  touchStartTime = Date.now();
}

/** @param {TouchEvent} e */
function onJourneyTouchEnd(e) {
  if (!journeyReady || motionPrefs.reduced || isFocusMode() || e.changedTouches.length !== 1) return;
  if (glideActive || navGlideActive || Date.now() < wheelCooldownUntil) return;

  const dy = touchStartY - e.changedTouches[0].clientY;
  const dx = touchStartX - e.changedTouches[0].clientX;
  const dt = Date.now() - touchStartTime;

  // Vertical swipe check: at least 35px delta, predominantly vertical, within 800ms
  if (Math.abs(dy) > 35 && Math.abs(dy) > Math.abs(dx) * 1.1 && dt < 800) {
    const activePanel = document.querySelector('.ds-panel.panel-active');
    const isOverActivePanel = activePanel && (e.target === activePanel || activePanel.contains(/** @type {Node} */ (e.target)));

    if (isOverActivePanel && activePanel.scrollHeight > activePanel.clientHeight + 10) {
      const atTop = activePanel.scrollTop <= 6;
      const atBottom = activePanel.scrollTop + activePanel.clientHeight >= activePanel.scrollHeight - 6;
      if (dy > 0 && !atBottom) return;
      if (dy < 0 && !atTop) return;
    }

    const dir = dy > 0 ? 1 : -1;
    const curIdx = getCurrentSectionIndex();
    const targetIdx = curIdx + dir;
    if (targetIdx >= 0 && targetIdx < stopOrder.length) {
      wheelCooldownUntil = Date.now() + Math.round(SECTION_TRANSITION_DURATION * 1000) + 180;
      glideToSectionIndex(targetIdx);
    }
  }
}

/** Keyboard section-stepping — ArrowDown/PageDown/Space advance one section,
 *  ArrowUp/PageUp go back, Home/End go to start/finish
 *  @param {KeyboardEvent} e */
function onJourneyKeydown(e) {
  if (!journeyReady || motionPrefs.reduced) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.body.classList.contains('probe-flying')) return;
  if (document.body.classList.contains('lcd-active')) return;
  if (document.body.classList.contains('rover-active')) return;
  const ae = /** @type {HTMLElement | null} */ (document.activeElement);
  const tag = (ae && ae.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (ae && ae.isContentEditable)) return;

  let dir = 0;
  if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') dir = 1;
  else if (e.key === 'ArrowUp' || e.key === 'PageUp') dir = -1;
  else if (e.key === 'Home') {
    e.preventDefault();
    glideToSectionIndex(0);
    return;
  } else if (e.key === 'End') {
    e.preventDefault();
    glideToSectionIndex(stopOrder.length - 1);
    return;
  } else return;

  e.preventDefault();
  if (isFocusMode()) clearFocus(false);
  if (glideActive || navGlideActive) return;
  
  const curIdx = getCurrentSectionIndex();
  const targetIdx = curIdx + dir;
  if (targetIdx >= 0 && targetIdx < stopOrder.length) {
    wheelCooldownUntil = Date.now() + Math.round(SECTION_TRANSITION_DURATION * 1000) + 180;
    glideToSectionIndex(targetIdx);
  }
}

/** Register the smooth-scroll listeners once */
function wireSmoothScroll() {
  if (smoothScrollWired) return;
  smoothScrollWired = true;
  window.addEventListener('wheel', onJourneyWheel, { passive: false });
  window.addEventListener('keydown', onJourneyKeydown);
  window.addEventListener('touchstart', onJourneyTouchStart, { passive: true });
  window.addEventListener('touchend', onJourneyTouchEnd, { passive: true });
  window.addEventListener('scroll', () => {
    if (!glideActive && !navGlideActive && (glideQueued !== 0 || wheelAccum !== 0)) {
      glideQueued = 0;
      wheelAccum = 0;
    }
  }, { passive: true });
}
