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

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

document.fonts?.ready?.then(() => {
  invalidatePanelSizeCache(); // font swap can change panel heights
  ScrollTrigger.refresh();
});
window.addEventListener('load', () => ScrollTrigger.refresh());

// ─── Camera offsets for component-based sections ─────
// Elevated + pulled back: the old (0, 0, 1.915) sat the camera horizontally at
// component height, viewing the board edge-on so chips read as thin slivers.
// This 3/4 angle (~31°) shows each component's top surface and silkscreen.
const CAMERA_OFFSET = new THREE.Vector3(0, 2.6, 4.2);
const LOOK_AT_OFFSET = new THREE.Vector3(0, 0.15, 0);

// Boot→hero arrival glide duration (seconds) — a short repositioning beat so
// the boot's establishing shot reads as one continuous motion, not a cut.
const ARRIVAL_GLIDE_DURATION = 1.0;

// Fixed camera configurations for non-component sections (hero, contact).
// z is computed so the WHOLE 15-unit board fits inside the 45° vertical FOV
// with margin: visible half-height at the board plane is z * tan(22.5°) ≈
// z * 0.414; z = 23 gives ±9.5 units — the board (y ∈ [-7.5, 7.5]) keeps
// ~2 units of breathing room top and bottom even on short desktop viewports.
// The old z=13 clipped the board's bottom edge outside the frustum (the board
// rendered "only half" on shorter viewports). Camera sits below the lookAt
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

// ─── Pre-calculated panel dimensions ────────────────────────
// Panel width/height are static per panel (only viewport media queries and
// font loading change them), so measure ONCE per panel per resize and reuse —
// reading offsetWidth/offsetHeight in updateJourneyEffects every frame forced
// layout during the scroll scrub (hyperframes-animation: pre-calculated layout
// constants, never tween/measure-time getBoundingClientRect).
/** @type {Record<string, { w: number, h: number }>} */
const panelSizeCache = {};

/** @param {string} panelId */
function getPanelSize(panelId) {
  const cached = panelSizeCache[panelId];
  if (cached) return cached;
  const panel = document.getElementById(panelId);
  const size = {
    w: (panel && panel.offsetWidth) || Math.min(480, window.innerWidth - 40),
    h: (panel && panel.offsetHeight) || Math.min(300, window.innerHeight * 0.5)
  };
  panelSizeCache[panelId] = size;
  return size;
}

function invalidatePanelSizeCache() {
  for (const k in panelSizeCache) delete panelSizeCache[k];
}
window.addEventListener('resize', invalidatePanelSizeCache, { passive: true });

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
}

// Get camera position and lookat for a section ID for a given section ID
/** @param {string} sectionId */
function getCameraConfigForStop(sectionId) {
  if (COMPONENT_WORLD[sectionId]) {
    const compPos = COMPONENT_WORLD[sectionId].clone();
    return {
      pos: compPos.clone().add(CAMERA_OFFSET),
      look: compPos.clone().add(LOOK_AT_OFFSET)
    };
  }
  // Fallback to fixed configurations (hero, contact)
  return FIXED_CAMERAS[sectionId] || {
    pos: new THREE.Vector3(0, 0, 0),
    look: new THREE.Vector3(0, 0, 0)
  };
}

/** @param {number} t */
function setCameraAtT(t) {
  if (!posCurve || !lookCurve || !cameraRef) return;
  // Scroll scrubbing always wins: if an arrival glide is still settling, kill
  // it the moment the user scrolls so the scrub and the tween never fight.
  killArrivalGlide();
  const clamped = Math.min(Math.max(t, 0), 1);
  const p = posCurve.getPoint(clamped);
  lookCurve.getPoint(clamped, curLook);
  cameraRef.position.copy(p);
  cameraRef.lookAt(curLook);
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

function glideToHero() {
  if (!cameraRef) return;
  killArrivalGlide();
  const cfg = getCameraConfigForStop('sec-hero');
  arrivalGlide = gsap.timeline({
    onComplete: () => { arrivalGlide = null; }
  });
  arrivalGlide.to(cameraRef.position, {
    x: cfg.pos.x,
    y: cfg.pos.y,
    z: cfg.pos.z,
    duration: ARRIVAL_GLIDE_DURATION,
    ease: 'power2.inOut',
    overwrite: 'auto'
  }, 0);
  arrivalGlide.to(curLook, {
    x: cfg.look.x,
    y: cfg.look.y,
    z: cfg.look.z,
    duration: ARRIVAL_GLIDE_DURATION,
    ease: 'power2.inOut',
    onUpdate: () => { if (cameraRef) cameraRef.lookAt(curLook); }
  }, 0);
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

// ─── Panel + nav activation ─────────────────────────────────
/** @param {string | null} panelId */
function setActivePanel(panelId) {
  if (activePanelId === panelId) return;
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
  // Power-on micro-moment for the section's component
  pulseArrival(secId);
  // Show/hide connector
  if (connectorLine) {
    const showConnector = panelId && panelId !== 'panel-hero' && panelId !== 'panel-contact';
    connectorLine.style.display = showConnector ? 'block' : 'none';
  }
}

// ─── Create connector SVG overlay ───────────────────────────
function createConnector() {
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

// ─── Per-frame update: screen-space panels + connector + vignette ──
// Panel activation is NOT computed here — it's a pure function of the
// current scroll leg (setLegState runs in the ScrollTrigger onUpdate).
// This function only handles the per-frame visual work.
/** @param {THREE.PerspectiveCamera} camera @param {THREE.Group} boardGroup */
export function updateJourneyEffects(camera, boardGroup) {
  if (!camera || !boardGroup || !journeyReady) return;

  // 1. Apply the leg-derived panel state (idempotent thanks to the
  //    activePanelId early-return in setActivePanel).
  const panelId = currentSectionId ? currentSectionId.replace('sec-', 'panel-') : null;
  if (panelId && activePanelId !== panelId) {
    setActivePanel(panelId);
  } else if (!panelId && activePanelId !== null) {
    setActivePanel(null);
  }

  // 2. Screen-space panel positioning + connector line for active
  //    component sections (hero/contact are centered by CSS).
  const activeSecId = activePanelId ? activePanelId.replace('panel-', 'sec-') : null;
  if (activeSecId && COMPONENT_WORLD[activeSecId]) {
    const localPos = COMPONENT_WORLD[activeSecId];
    worldPos.copy(localPos);
    boardGroup.localToWorld(worldPos);
    screenPos.copy(worldPos).project(camera);

    const cx = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const cy = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

    const panel = activePanelId ? document.getElementById(activePanelId) : null;
    if (activePanelId && panel && connectorLine) {
      // Pre-calculated layout constants — measured once per panel per resize.
      // #panel-projects is .ds-panel-wide (up to 980px); hardcoding 480 would
      // shove it off-screen.
      const { w: panelW, h: panelH } = getPanelSize(activePanelId);
      const margin = 24;

      // Decide which side: place panel on left when component is on right half, and vice versa
      const placeLeft = cx < window.innerWidth * 0.55;

      let panelLeft, panelRight;
      if (placeLeft) {
        // Anchor left edge of panel just to the right of the component dot
        const rawLeft = cx + 50;
        // Clamp so panel doesn't go off right edge
        panelLeft = Math.min(rawLeft, window.innerWidth - panelW - margin);
        panelLeft = Math.max(margin, panelLeft);
        panelRight = 'auto';
      } else {
        // Anchor right edge of panel just to the left of the component dot
        const rawRight = window.innerWidth - cx + 50;
        panelRight = Math.min(rawRight, window.innerWidth - panelW - margin);
        panelRight = Math.max(margin, panelRight);
        panelLeft = 'auto';
      }

      const panelY = Math.max(80, Math.min(cy - panelH / 2, window.innerHeight - panelH - margin));

      panel.style.left = panelLeft === 'auto' ? 'auto' : `${panelLeft}px`;
      panel.style.right = panelRight === 'auto' ? 'auto' : `${panelRight}px`;
      panel.style.top = `${panelY}px`;

      // Connector SVG: line from component dot to panel edge
      const line = connectorLine.querySelector('line');
      const dot = connectorLine.querySelector('circle');
      if (line && dot) {
        // Panel edge X in viewport coordinates
        const lineEndX = placeLeft
          ? (typeof panelLeft === 'number' ? panelLeft : 0) // left edge of panel
          : window.innerWidth - (typeof panelRight === 'number' ? panelRight : 0) - panelW; // right-side panel left edge
        const lineEndY = panelY + panelH * 0.5;
        line.setAttribute('x1', cx.toFixed(1));
        line.setAttribute('y1', cy.toFixed(1));
        line.setAttribute('x2', lineEndX.toFixed(1));
        line.setAttribute('y2', lineEndY.toFixed(1));
        dot.setAttribute('cx', cx.toFixed(1));
        dot.setAttribute('cy', cy.toFixed(1));
        connectorLine.style.display = 'block';
      }
    }
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

  // Glide from the boot pose into the hero framing — replacing the old
  // instant setCameraAtT(0) snap (a visible camera cut after every boot).
  glideToHero();
  setActivePanel('panel-hero');
  if (vignetteEl) vignetteEl.style.opacity = '0.35';

  const totalScrollHeight = sections.reduce((sum, sec) => sum + sec.offsetHeight, 0);
  if (totalScrollHeight < window.innerHeight * 2) {
    document.body.style.minHeight = '400vh';
  }

  // One scrubbed trigger per travel leg
  for (let i = 1; i < sections.length; i++) {
    const prevT = stopTs[stopOrder[i - 1]];
    const thisT = stopTs[stopOrder[i]];
    ScrollTrigger.create({
      trigger: sections[i],
      start: 'top 95%',
      end: 'top 5%',
      scrub: 0.6,
      onUpdate: (self) => {
        const eased = gsap.parseEase('power2.out')(self.progress);
        setCameraAtT(prevT + (thisT - prevT) * eased);
        // Panel activation follows the scroll, not camera distance
        setLegState(stopOrder[i], stopOrder[i - 1], self.progress);
      }
    });
  }

  requestAnimationFrame(() => {
    ScrollTrigger.refresh();
  });

  // Panels are now safe to drive (boot sequence is done)
  journeyReady = true;
}

// ─── Direct navigation ──────────────────────────────────────
/** @param {string} sectionId */
export function scrollToSection(sectionId) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  const y = sectionId === 'sec-hero'
    ? 0
    : el.offsetTop + Math.min(el.offsetHeight * 0.45, window.innerHeight * 0.7);
  gsap.to(window, {
    scrollTo: { y },
    duration: 1.6,
    ease: 'power2.inOut',
    overwrite: 'auto'
  });
}