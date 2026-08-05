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

document.fonts?.ready?.then(() => ScrollTrigger.refresh());
window.addEventListener('load', () => ScrollTrigger.refresh());

// ─── Camera offsets for component-based sections ─────
// Elevated + pulled back: the old (0, 0, 1.915) sat the camera horizontally at
// component height, viewing the board edge-on so chips read as thin slivers.
// This 3/4 angle (~31°) shows each component's top surface and silkscreen.
const CAMERA_OFFSET = new THREE.Vector3(0, 2.6, 4.2);
const LOOK_AT_OFFSET = new THREE.Vector3(0, 0.15, 0);

// Fixed camera configurations for non-component sections (hero, contact)
const FIXED_CAMERAS = {
  'sec-hero': {
    pos: new THREE.Vector3(0, -5.2, 13),
    look: new THREE.Vector3(0, 0.4, 0)
  },
  'sec-contact': {
    pos: new THREE.Vector3(0, -5.0, 14),
    look: new THREE.Vector3(0, 0, 0)
  }
};

// Component world positions (in boardGroup LOCAL space)
const COMPONENT_WORLD = {
  'sec-about':      new THREE.Vector3(0, 1.0, 0.085),
  'sec-projects':   new THREE.Vector3(-3.2, 4.5, 0.085),
  'sec-skills':     new THREE.Vector3(3.2, 4.5, 0.085),
  'sec-experience': new THREE.Vector3(0, -7.3, 0.085),
};

// ─── Path definition: stops (section IDs) and via points (hardcoded) ─────
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

let posCurve = null;
let lookCurve = null;
let stopTs = {};
let stopOrder = [];
let activePanelId = null;
let cameraRef = null;
let boardGroupRef = null;
let vignetteEl = null;
let connectorLine = null;
const curLook = new THREE.Vector3();
const worldPos = new THREE.Vector3();
const screenPos = new THREE.Vector3();

// Pre-cached stop position vectors (avoids GC per frame)
const stopPosVectors = {};

// Panel flicker cooldown
let deactiveCooldown = 0;
const DEACTIVATE_FRAMES = 10; // Wait 10 frames before deactivating

// ─── Build CatmullRom curves from PATH ─────────────────────
function buildCurves() {
  // Reset accumulated state so re-initializing (HMR, re-entry) can't
  // duplicate stops or leave stale t-mappings behind.
  stopOrder.length = 0;
  for (const k in stopTs) delete stopTs[k];
  for (const k in stopPosVectors) delete stopPosVectors[k];

  const posPoints = [];
  const lookPoints = [];
  PATH.forEach((p, i) => {
    let pos, look;
    if (p.stop) {
      // Get camera config for stop
      const config = getCameraConfigForStop(p.stop);
      pos = config.pos.clone();
      look = config.look.clone();
      // Cache stop position vectors for performance
      stopPosVectors[p.stop] = pos.clone();
      if (p.stop) stopOrder.push(p.stop);
    } else if (p.via) {
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

export function setCameraAtT(t) {
  if (!posCurve || !cameraRef) return;
  const clamped = Math.min(Math.max(t, 0), 1);
  const p = posCurve.getPoint(clamped);
  lookCurve.getPoint(clamped, curLook);
  cameraRef.position.copy(p);
  cameraRef.lookAt(curLook);
}

// ─── Arrival micro-moment: the component (or its signal trace)
// lights up when the camera reaches its section. Same language as
// the boot sequence's trace flash — "if it glows, it's live".
const ARRIVAL_TRACE = { 'sec-projects': 'U2', 'sec-skills': 'C1', 'sec-experience': 'J1' };
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
            if (m.material && m.material.emissiveIntensity !== undefined) {
                gsap.fromTo(m.material, { emissiveIntensity: 0.4 }, { emissiveIntensity: 1.3, duration: 0.35, yoyo: true, repeat: 1, ease: 'power1.out', delay: 0.05, overwrite: 'auto' });
            }
        });
    });
}

// ─── Panel + nav activation ─────────────────────────────────
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
  deactiveCooldown = 0; // Reset cooldown on any state change
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
export function updateJourneyEffects(camera, boardGroup) {
  if (!camera || !boardGroup) return;

  const camPos = camera.position;

  // 1. Find nearest section (using cached vectors)
  let nearestSection = null;
  let nearestDist = Infinity;
  Object.keys(stopPosVectors).forEach((secId) => {
    const targetPos = stopPosVectors[secId];
    const dx = camPos.x - targetPos.x;
    const dy = camPos.y - targetPos.y;
    const dz = camPos.z - targetPos.z;
    const dist = dx * dx + dy * dy + dz * dz; // squared distance (faster)
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestSection = secId;
    }
  });
  nearestDist = Math.sqrt(nearestDist); // convert back for threshold checks

  // 2. Panel activation based on camera arrival
  const panelId = nearestSection ? nearestSection.replace('sec-', 'panel-') : null;
  const isComponent = !!COMPONENT_WORLD[nearestSection];
  const ARRIVED_THRESHOLD = isComponent ? 3.5 : 6.0;
  const LEFT_THRESHOLD = ARRIVED_THRESHOLD + 2.0;
  const hasArrived = nearestDist < ARRIVED_THRESHOLD;
  const hasLeft = nearestDist > LEFT_THRESHOLD;

  if (panelId && hasArrived && activePanelId !== panelId) {
    // Camera arrived — activate this section's panel
    setActivePanel(panelId);
  } else if (activePanelId && hasLeft && activePanelId !== panelId) {
    // Camera left the current section and hasn't arrived at another
    deactiveCooldown++;
    if (deactiveCooldown > DEACTIVATE_FRAMES) {
      // Only deactivate when we're not near ANY section's activation zone
      let inAnyZone = false;
      Object.keys(stopPosVectors).forEach((secId) => {
        const tp = stopPosVectors[secId];
        const ddx = camPos.x - tp.x;
        const ddy = camPos.y - tp.y;
        const ddz = camPos.z - tp.z;
        const dd = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
        const t = COMPONENT_WORLD[secId] ? 3.5 : 6.0;
        if (dd < t + 1.0) inAnyZone = true;
      });
      if (!inAnyZone) {
        setActivePanel(null);
      }
    }
  } else {
    deactiveCooldown = 0;
  }

  // 3. Screen-space panel positioning + connector line
  if (nearestSection && COMPONENT_WORLD[nearestSection] && hasArrived) {
    const localPos = COMPONENT_WORLD[nearestSection];
    worldPos.copy(localPos);
    boardGroup.localToWorld(worldPos);
    screenPos.copy(worldPos).project(camera);

    const cx = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const cy = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

    const panel = document.getElementById(panelId);
    if (panel && connectorLine) {
      // Use the panel's real rendered width — #panel-projects is .ds-panel-wide
      // (up to 980px), so a hardcoded 480 would shove it off-screen.
      const panelW = panel.offsetWidth || Math.min(480, window.innerWidth - 40);
      const panelH = panel.offsetHeight || Math.min(300, window.innerHeight * 0.5);
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

  // 4. Dynamic vignette based on camera proximity
  if (!vignetteEl) vignetteEl = document.querySelector('.vignette-overlay');
  if (vignetteEl) {
    let intensity = 0.35;
    if (nearestSection && COMPONENT_WORLD[nearestSection] && hasArrived) {
      const t = Math.max(0, Math.min(1, (nearestDist - 1.5) / 3.0));
      intensity = 0.35 + (1 - t) * 0.5;
    }
    vignetteEl.style.opacity = intensity;
  }
}

// ─── Init ───────────────────────────────────────────────────
export function initJourney(camera, boardGroup) {
  cameraRef = camera;
  boardGroupRef = boardGroup;
  buildCurves();
  createConnector();

  const sections = stopOrder
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  if (sections.length < 2) {
    console.warn('Journey: not enough sections found for scroll path');
    return;
  }

  setCameraAtT(0);
  setActivePanel('panel-hero');
  if (vignetteEl) vignetteEl.style.opacity = 0.35;

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
      }
    });
  }

  requestAnimationFrame(() => {
    ScrollTrigger.refresh();
  });
}

// ─── Direct navigation ──────────────────────────────────────
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