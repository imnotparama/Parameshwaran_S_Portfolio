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
import { cpuRadarRing, siliconDieMesh } from '../three/components.js';
import { traceData } from '../three/traces.js';
import { projectChips } from '../three/project-chips.js';
import { getCanvasViewportSize } from '../three/scene.js';
import { motionPrefs } from '../utils/motion-prefs.js';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

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
// The z here is a placeholder — on the split layout the canvas is the left
// 58% (a NARROWER aspect than full-screen), so full-board framing must fit
// the 15-unit board in BOTH the 45° vertical FOV and the aspect-dependent
// horizontal FOV. getHeroFramingZ() computes the binding z at build/glide
// time and getCameraConfigForStop applies it. Camera sits below the lookAt
// for the same 3/4 upward angle the component stops use.
/** @type {Record<string, { pos: THREE.Vector3, look: THREE.Vector3 }>} */
const FIXED_CAMERAS = {
  'sec-hero': {
    pos: new THREE.Vector3(0, -5.4, 23),
    look: new THREE.Vector3(0, 0.2, 0)
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

// ─── Path definition: stops (section IDs) and via points (hardcoded) ─────
/** @type {Array<{ stop?: string, via?: boolean, pos?: [number, number, number], look?: [number, number, number] }>} */
const PATH = [
  { stop: 'sec-hero' },
  // Via points now sit at the same z depth as the elevated component stops
  // (~4.2) so travel speed is consistent instead of zooming in/out per leg.
  { via: true, pos: [0, -2.6, 8.5], look: [0.5, 0.9, 0] },
  { stop: 'sec-about' },
  { via: true, pos: [-1.6, 5.4, 4.2], look: [-2.0, 4.2, 0.05] },
  { stop: 'sec-projects' },
  { via: true, pos: [0, 7.1, 4.4], look: [0.5, 4.6, 0.1] },
  { stop: 'sec-skills' },
  { via: true, pos: [1.6, 1.2, 4.6], look: [0.5, -3.2, 0.05] },
  { stop: 'sec-experience' },
  { via: true, pos: [-1.5, -4.8, 8.5], look: [-0.3, -2.0, 0] },
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

// ─── Ride-the-trace legs ─────────────────────────────────────
// Component→component legs travel along the ACTUAL copper (traceData
// polylines, elevated to the stops' cruise altitude) instead of the straight
// glide — navigation is the wiring. Hero/contact legs have no trace and keep
// the glide. ridePosCurves[i] / rideLookCurves[i] are per-leg (1-based, same
// index as the ScrollTrigger loop), null when the leg glides.
/** @type {Array<THREE.CatmullRomCurve3 | null>} */
let ridePosCurves = [];
/** @type {Array<THREE.CatmullRomCurve3 | null>} */
let rideLookCurves = [];
/** @type {THREE.Mesh | null} */
let rideGlow = null;
/** How far ahead of the camera the current-flow glow rides (in leg t). */
const RIDE_GLOW_LEAD = 0.06;
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

  // Ride-the-trace: resolve a copper route for each component→component leg.
  // Every traceData route is U1→X (the board is a star around the CPU), so a
  // non-U1 pair rides back to U1 then out to the next component — the camera
  // literally follows the bus. Hero/contact legs (no component) keep the glide.
  /** @type {Record<string, string>} */
  const SECTION_COMPONENT = {
    'sec-about': 'U1', 'sec-projects': 'U2', 'sec-skills': 'C1', 'sec-experience': 'J1'
  };
  ridePosCurves = [];
  rideLookCurves = [];
  const tracePolyline = (/** @type {string} */ ref) => {
    const route = traceData.find((r) => r.component === ref);
    return route ? route.points : null;
  };
  for (let i = 1; i < stopOrder.length; i++) {
    const fromSec = stopOrder[i - 1];
    const toSec = stopOrder[i];
    ridePosCurves[i] = null;
    rideLookCurves[i] = null;
    const fromComp = SECTION_COMPONENT[fromSec];
    const toComp = SECTION_COMPONENT[toSec];
    if (!fromComp || !toComp) continue; // hero/contact legs glide
    const traceTo = tracePolyline(toComp);
    const traceFrom = fromComp !== 'U1' ? tracePolyline(fromComp) : null;
    if (!traceTo) continue;
    // Concatenate: (U1→fromComp reversed = fromComp→U1) + (U1→toComp)
    /** @type {THREE.Vector3[]} */
    const pts = [];
    if (traceFrom) {
      for (const p of traceFrom.slice().reverse()) pts.push(p);
    }
    for (const p of traceTo) pts.push(p);
    // Ride pose: source stop → copper (elevated to the stops' cruise z, same
    // altitude as every component stop) → dest stop. The look follows the
    // copper at board level, snapping to the stops' look targets at both ends.
    const srcCfg = getCameraConfigForStop(fromSec);
    const dstCfg = getCameraConfigForStop(toSec);
    const cruiseZ = srcCfg.pos.z;
    const lookZ = COMPONENT_WORLD[fromSec].z + LOOK_AT_OFFSET.z;
    const posPts = [new THREE.Vector3(srcCfg.pos.x, srcCfg.pos.y, cruiseZ)];
    const lookPts = [srcCfg.look.clone()];
    for (const p of pts) {
      posPts.push(new THREE.Vector3(p.x, p.y, cruiseZ));
      lookPts.push(new THREE.Vector3(p.x, p.y, lookZ));
    }
    posPts.push(new THREE.Vector3(dstCfg.pos.x, dstCfg.pos.y, cruiseZ));
    lookPts.push(dstCfg.look.clone());
    ridePosCurves[i] = new THREE.CatmullRomCurve3(posPts, false, 'catmullrom', 0.4);
    rideLookCurves[i] = new THREE.CatmullRomCurve3(lookPts, false, 'catmullrom', 0.4);
  }
}

// Full-board framing z: fit the 15-unit board in BOTH the 45° vertical FOV
// and the (narrower, aspect-dependent) horizontal FOV of the left-58% canvas.
// halfExtent = 7.5 (board half-height, y ∈ ±7.5) + 2 units of margin; the
// vertical axis alone needs z ≈ 23, but on the split layout the horizontal
// axis is usually the binding constraint (the old hardcoded z=23 clipped the
// board's sides once the canvas narrowed to 58%).
function getHeroFramingZ() {
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
  if (COMPONENT_WORLD[sectionId]) {
    const compPos = COMPONENT_WORLD[sectionId].clone();
    return {
      pos: compPos.clone().add(CAMERA_OFFSET),
      look: compPos.clone().add(LOOK_AT_OFFSET)
    };
  }
  // Fallback to fixed configurations (hero, contact) — hero/contact z is
  // aspect-aware so the whole board fits the narrower left-region canvas.
  const cfg = FIXED_CAMERAS[sectionId];
  if (!cfg) return { pos: new THREE.Vector3(0, 0, 0), look: new THREE.Vector3(0, 0, 0) };
  const pos = cfg.pos.clone();
  const look = cfg.look.clone();
  if (sectionId === 'sec-hero' || sectionId === 'sec-contact') {
    pos.z = getHeroFramingZ();
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
  const p = posCurve.getPoint(clamped);
  lookCurve.getPoint(clamped, curLook);
  cameraRef.position.copy(p);
  cameraRef.lookAt(curLook);
}

// ─── Ride-the-trace camera ───────────────────────────────────
// Sample a component leg's copper-ride curve (source stop → trace → dest
// stop) and push the current-flow glow ahead of the camera along the same
// curve. Returns false when the leg has no ride (hero/contact) so the caller
// falls back to the straight glide. The glow hides at the leg's extremes
// (progress 0/1 — the stops own the frame there).
/** @param {number} legIndex @param {number} p leg progress 0..1 (eased) */
function rideCamera(legIndex, p) {
  const posCurve = ridePosCurves[legIndex];
  const lookCurve = rideLookCurves[legIndex];
  if (!posCurve || !lookCurve || !cameraRef) return false;
  const pos = posCurve.getPoint(p);
  lookCurve.getPoint(p, curLook);
  cameraRef.position.copy(pos);
  cameraRef.lookAt(curLook);
  if (rideGlow) {
    rideGlow.visible = p > 0.001 && p < 0.999;
    if (rideGlow.visible) {
      posCurve.getPoint(Math.min(p + RIDE_GLOW_LEAD, 1), rideGlow.position);
    }
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
/** Fill the focused-project panel from portfolio data (textContent only —
 *  no HTML injection). @param {any} proj */
function fillProjectDetailPanel(proj) {
  const q = (/** @type {string} */ id) => document.getElementById(id);
  const refEl = q('pdetail-ref');
  const titleEl = q('pdetail-title');
  const titleTwinEl = q('pdetail-title-twin');
  const problemEl = q('pdetail-problem');
  const stateEl = q('pdetail-state');
  const tagsEl = q('pdetail-tags');
  const linkEl = /** @type {HTMLAnchorElement | null} */ (q('pdetail-link'));
  if (refEl) refEl.textContent = `${proj.ref} — ${proj.status === 'building' ? 'BREADBOARD (IN BUILD)' : 'SOLDERED (SHIPPED)'}`;
  const title = `// PROJECT: ${proj.title}`;
  // The sweep twin mirrors the title glyphs — fill it with the same text.
  if (titleEl) titleEl.textContent = title;
  if (titleTwinEl) titleTwinEl.textContent = title;
  if (problemEl) problemEl.textContent = proj.problem;
  if (stateEl) stateEl.textContent = proj.state;
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
    linkEl.textContent = proj.linkLabel || 'VIEW PROJECT →';
  }
}

/** Release focus. With glideBack, the camera returns to the current
 *  section's stop pose (Esc / close button); on scroll the scrub owns the
 *  camera instead, so no glide. @param {boolean} [glideBack] */
function clearFocus(glideBack = false) {
  if (!focusedChip) return;
  focusedChip = null;
  if (glideBack && cameraRef) {
    const cfg = getCameraConfigForStop(currentSectionId);
    glideCameraTo(cfg.pos, cfg.look, 0.7);
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
  focusedChip = { ref, localPos: chip.pos, data: chip.data };

  fillProjectDetailPanel(chip.data);
  setActivePanel('panel-project-detail');
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

  const look = chip.pos.clone().add(new THREE.Vector3(0, 0.05, 0));
  const pos = chip.pos.clone().add(CHIP_FOCUS_OFFSET);
  glideCameraTo(pos, look, 1.2);
}

/** Public release (close button / Esc wiring). */
export function exitFocusMode() {
  clearFocus(true);
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
    currentSectionId = destination;
  } else if (progress < 0.5) {
    currentSectionId = source;
  }
}

// ─── Arrival micro-moment: the component (or its signal trace)
// lights up when the camera reaches its section. Same language as
// the boot sequence's trace flash — "if it glows, it's live".
/** @type {Record<string, string>} */
const ARRIVAL_TRACE = { 'sec-projects': 'U2', 'sec-skills': 'C1', 'sec-experience': 'J1' };
/** @param {string} secId */
function pulseArrival(secId) {
    if (!secId) return;
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

// ─── Panel + nav activation ─────────────────────────────────
/** @param {string | null} panelId */
function setActivePanel(panelId) {
  if (activePanelId === panelId) return;
  // Leave the panel behind: kill any in-flight typewriter so its chars don't
  // keep animating off-screen (they collapse instantly — the panel is hidden).
  if (activePanelId) {
    const prevPanel = document.getElementById(activePanelId);
    if (prevPanel) resetTypewriter(prevPanel);
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
  document.querySelectorAll('.hud-nav .nav-btn').forEach((btn) => {
    btn.classList.toggle('nav-active', btn.getAttribute('data-section') === secId);
  });
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
      gsap.set(titleTwin, { backgroundPosition: '100% 50%', opacity: 1 });
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

  // 1. Apply the leg-derived panel state (idempotent thanks to the
  //    activePanelId early-return in setActivePanel). Skipped while a chip
  //    is focused — the detail panel owns activation until release.
  if (focusedChip && rideGlow) rideGlow.visible = false;
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
/** @param {THREE.PerspectiveCamera} camera */
export function initJourney(camera) {
  cameraRef = camera;
  buildCurves();
  createConnector();

  const sections = /** @type {HTMLElement[]} */ (stopOrder
    .map((id) => document.getElementById(id))
    .filter(Boolean));

  if (sections.length < 2) {
    console.warn('Journey: not enough sections found for scroll path');
    return;
  }

  // Ride-the-trace glow: the current-flow dot that runs ahead of the camera
  // during copper legs. The camera is a direct child of the scene (initScene
  // does scene.add(camera)), so camera.parent IS the scene — no new wiring.
  if (!rideGlow && cameraRef && cameraRef.parent) {
    rideGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x03160d, emissive: 0x3ee6a0, emissiveIntensity: 2.5 })
    );
    rideGlow.name = 'ride-glow';
    rideGlow.visible = false;
    cameraRef.parent.add(rideGlow);
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
      scrub: 0.6,
      onUpdate: (self) => {
        const eased = gsap.parseEase('power2.out')(self.progress);
        // Component legs ride the actual copper (rideCamera returns false for
        // hero/contact legs, which keep the straight glide). The ride ends at
        // the stop pose by leg end — same invariant as the glide.
        if (!rideCamera(i, eased)) {
          setCameraAtT(prevT + (thisT - prevT) * eased);
        }
        // Panel activation follows the scroll, not camera distance
        setLegState(stopOrder[i], stopOrder[i - 1], self.progress);
      }
    });
  }

  requestAnimationFrame(() => {
    ScrollTrigger.refresh();
  });

  // Smooth scroll-snap layer: wheel = one section per notch with the unified
  // power2.inOut glide, settle-snap aligns trackpad/touch/keyboard rests to
  // the nearest section stop (see the layer block at the bottom of the file).
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
  // A wheel/snap glide in flight is superseded by direct navigation. Killed
  // tweens never fire onComplete, so reset the snap layer explicitly here —
  // otherwise a nav click mid-glide would leave glideActive stuck and the
  // wheel snapping dead.
  glideActive = false;
  glideQueued = 0;
  wheelAccum = 0;
  gsap.to(window, {
    scrollTo: { y },
    duration: SECTION_TRANSITION_DURATION,
    ease: 'power2.inOut',
    overwrite: 'auto'
  });
}

// ─── Smooth scroll-snap layer ─────────────────────────────────
// The journey used to be a pure pulley: the camera followed the scrollbar
// 1:1 (scrub 0.6) and a wheel notch was a hard yank. This layer replaces
// that feel with page-to-page motion:
//   - Wheel (journey mode): deltas accumulate into section steps — one
//     notch = one section, glided with the site's unified power2.inOut.
//     Rapid input chains up to MAX_QUEUED_STEPS glides.
//   - Settle-snap: any other scroll input (trackpad momentum, touch,
//     keyboard, scrollbar) that rests between stops glides to the nearest
//     section — the page always lands ON a stop.
// Skipped under reduced motion (native scroll, no hijack) and while wheeling
// inside a nested scrollable (the fixed datasheet panel scrolls itself).
const WHEEL_STEP_PX = 120;   // accumulated wheel px per section step
// Bounds a whole burst (the in-flight glide counts too): a trackpad flick or
// a fast wheel roll can chain at most 3 glides per gesture, then drops input
// until the queue drains — 3 covers half the 6-section journey in one flick.
const MAX_QUEUED_STEPS = 3;
// Section-transition duration — the site's ONE page-to-page glide, shared by
// the wheel/snap glides AND direct nav (scrollToSection) so every section
// change moves at the same pace. Tuned 1.6s → 1.2s: still a slow-start/slow-
// end power2.inOut (never a yank), but the chained page-to-page flow no
// longer drags; revert is this single number.
const SECTION_TRANSITION_DURATION = 1.2;
const SNAP_SETTLE_MS = 280;  // scroll-idle before the settle-snap fires
let wheelAccum = 0;
let glideQueued = 0;
let glideActive = false;
let settleTimer = 0;
let smoothScrollWired = false;

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
 *  ends. Exported for the headless smoke test (the DOM wheel path isn't
 *  headless-testable).
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

/** Queue one section step in a direction — shared by wheel and keyboard so
 *  both chain through the same burst-capped queue; if a glide is in flight
 *  the step runs when it completes.
 *  @param {number} dir */
function queueStep(dir) {
  glideQueued = stepQueue(glideQueued, dir);
  pumpGlide();
}

/** Glide the page to a scroll Y with the site's unified transition, then
 *  chain any queued step.
 *  @param {number} y */
function glideToY(y) {
  if (Math.abs(window.scrollY - y) < 2) {
    glideActive = false;
    glideQueued -= Math.sign(glideQueued);
    pumpGlide();
    return;
  }
  gsap.to(window, {
    scrollTo: { y },
    duration: SECTION_TRANSITION_DURATION,
    ease: 'power2.inOut',
    overwrite: 'auto',
    onComplete: () => {
      glideActive = false;
      // Consume the step on COMPLETION, not at start: the queue counts the
      // in-flight step too, so MAX_QUEUED_STEPS bounds a whole burst.
      glideQueued -= Math.sign(glideQueued);
      pumpGlide();
    }
  });
}

/** Consume queued steps one glide at a time so rapid input chains instead
 *  of stacking tweens. */
function pumpGlide() {
  if (glideActive || glideQueued === 0 || !journeyReady) return;
  glideActive = true;
  glideToY(directionalStop(Math.sign(glideQueued)));
}

/** Wheel = one section per accumulated notch. Never fights the datasheet
 *  panel's own scroll, ctrl+wheel browser zoom, or chip-focus scroll release
 *  (focused → native scroll scrubs the camera and clears focus, exactly as
 *  before).
 *  @param {WheelEvent} e */
function onJourneyWheel(e) {
  if (!journeyReady || motionPrefs.reduced || isFocusMode() || e.ctrlKey || e.metaKey) return;
  let el = /** @type {HTMLElement | null} */ (e.target);
  while (el && el !== document.body) {
    if (el.scrollHeight > el.clientHeight + 4) return; // nested scrollable
    el = el.parentElement;
  }
  e.preventDefault();
  let d = e.deltaY;
  if (e.deltaMode === 1) d *= 40;      // lines → px
  else if (e.deltaMode === 2) d *= 100; // pages → px
  const r = wheelStepQueue(d, wheelAccum);
  wheelAccum = r.accum;
  queueStep(r.queue);
}

/** Any scroll that isn't one of our glides (trackpad momentum, touch,
 *  keyboard, scrollbar) gets aligned to the nearest stop after it rests. */
function onJourneyScroll() {
  if (!journeyReady || motionPrefs.reduced || glideActive) return;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    if (!journeyReady || motionPrefs.reduced || glideActive || isFocusMode()) return;
    const stops = getStopScrolls();
    const y = window.scrollY;
    let best = stops[0];
    let bestD = Infinity;
    for (const s of stops) {
      const d = Math.abs(s - y);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (bestD > 4) glideToY(best);
  }, SNAP_SETTLE_MS);
}

/** Keyboard section-stepping — ArrowDown/PageDown advance one section,
 *  ArrowUp/PageUp go back, glided with the same SECTION_TRANSITION_DURATION
 *  as the wheel (both share the snap queue, so a fast keypress chain behaves
 *  exactly like a wheel burst and holding the key keeps advancing). Never
 *  fires while the flying scope probe is active (arrows belong to the probe
 *  then — it flags itself with the `probe-flying` body class), while typing
 *  in a field, or under reduced motion (native scroll instead). Focus
 *  release matches the wheel: a step key while a chip is focused drops the
 *  focus view first.
 *  @param {KeyboardEvent} e */
function onJourneyKeydown(e) {
  if (!journeyReady || motionPrefs.reduced) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.body.classList.contains('probe-flying')) return;
  const ae = /** @type {HTMLElement | null} */ (document.activeElement);
  const tag = (ae && ae.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (ae && ae.isContentEditable)) return;
  let dir = 0;
  if (e.key === 'ArrowDown' || e.key === 'PageDown') dir = 1;
  else if (e.key === 'ArrowUp' || e.key === 'PageUp') dir = -1;
  else return;
  e.preventDefault();
  if (isFocusMode()) clearFocus(false);
  queueStep(dir);
}

/** Register the smooth-scroll listeners once (initJourney re-runs on HMR;
 *  the handlers read live module state, so re-wiring would double-fire). */
function wireSmoothScroll() {
  if (smoothScrollWired) return;
  smoothScrollWired = true;
  window.addEventListener('wheel', onJourneyWheel, { passive: false });
  window.addEventListener('scroll', onJourneyScroll, { passive: true });
  window.addEventListener('keydown', onJourneyKeydown);
}