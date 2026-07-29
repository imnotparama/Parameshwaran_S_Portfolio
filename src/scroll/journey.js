// ============================================================
// Scroll Journey — scroll = travel along the board.
// A CatmullRomCurve3 winds across and into the PCB; GSAP
// ScrollTrigger (scrub) binds scroll position to path progress.
// Each section = the camera slowing and pushing into a component.
// ============================================================
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

// Must register GSAP plugins before any ScrollTrigger usage
gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

// Ensure ScrollTrigger refreshes after fonts and layout settle
document.fonts?.ready?.then(() => ScrollTrigger.refresh());
window.addEventListener('load', () => ScrollTrigger.refresh());

// ─── Path definition ────────────────────────────────────────
// World space (boardGroup scale = 0.85, board lies flat in XY, surface z ≈ 0.07).
// "stop" entries are section anchors; "via" entries add real turns
// so the flight traces like a signal through a trace, not a straight dolly.
const PATH = [
    // HERO — wide establishing shot of the whole board
    { stop: 'sec-hero', pos: [0, -5.2, 12.5], look: [0, 0.4, 0] },
    // swing right and dive toward the CPU
    { via: true, pos: [2.6, -3.4, 6.5], look: [0.6, 0.5, 0] },
    // ABOUT — push into U1 "PARAM-CORE"
    { stop: 'sec-about', pos: [0.15, -0.9, 2.7], look: [0, 0.85, 0.06] },
    // bank left across the CPU toward the project array
    { via: true, pos: [-1.8, 0.9, 3.8], look: [-1.2, 1.8, 0.05] },
    // PROJECTS — hover over the project component cluster + U2
    { stop: 'sec-projects', pos: [-2.05, 0.35, 3.1], look: [-2.05, 2.5, 0.06] },
    // sweep over the top of the board to the far side
    { via: true, pos: [0.4, 3.4, 4.2], look: [1.2, 3.6, 0.1] },
    // SKILLS — the capacitor/resistor bank C1–C4
    { stop: 'sec-skills', pos: [2.65, 1.7, 2.6], look: [2.65, 3.8, 0.25] },
    // dive down the main power trace toward the USB connector
    { via: true, pos: [2.4, -3.4, 4.6], look: [1.0, -4.4, 0.05] },
    // EXPERIENCE — the J1 connector, timeline etched in copper
    { stop: 'sec-experience', pos: [0, -8.3, 2.7], look: [0, -6.2, 0.08] },
    // pull up and back out
    { via: true, pos: [-2.2, -8.4, 8.0], look: [-0.6, -2.4, 0] },
    // CONTACT — full board, fully lit
    { stop: 'sec-contact', pos: [0, -6.2, 13.5], look: [0, 0, 0] }
];

let posCurve = null;
let lookCurve = null;
let stopTs = {};      // section id -> t along curve
let stopOrder = [];   // section ids in order
let activePanelId = null;
let cameraRef = null;
const curLook = new THREE.Vector3();

function buildCurves() {
    const posPoints = PATH.map((p) => new THREE.Vector3(...p.pos));
    const lookPoints = PATH.map((p) => new THREE.Vector3(...p.look));
    posCurve = new THREE.CatmullRomCurve3(posPoints, false, 'catmullrom', 0.35);
    lookCurve = new THREE.CatmullRomCurve3(lookPoints, false, 'catmullrom', 0.35);

    // Fractional-index parameterization: t of each stop along the curve
    PATH.forEach((p, i) => {
        if (p.stop) {
            stopTs[p.stop] = i / (PATH.length - 1);
            stopOrder.push(p.stop);
        }
    });
}

export function setCameraAtT(t) {
    if (!posCurve || !cameraRef) return;
    const clamped = Math.min(Math.max(t, 0), 1);
    const p = posCurve.getPoint(clamped);
    lookCurve.getPoint(clamped, curLook);
    cameraRef.position.copy(p);
    cameraRef.lookAt(curLook);
}

// ─── Panel + nav activation ─────────────────────────────────
function setActivePanel(panelId) {
    if (activePanelId === panelId) return;
    activePanelId = panelId;
    document.querySelectorAll('.ds-panel').forEach((el) => {
        el.classList.toggle('panel-active', el.id === panelId);
    });
    // Highlight matching nav item
    const secId = panelId ? panelId.replace('panel-', 'sec-') : '';
    document.querySelectorAll('.hud-nav .nav-btn').forEach((btn) => {
        btn.classList.toggle('nav-active', btn.getAttribute('data-section') === secId);
    });
}

// ─── Init (full journey mode only) ──────────────────────────
export function initJourney(camera) {
    cameraRef = camera;
    buildCurves();

    const sections = stopOrder
        .map((id) => document.getElementById(id))
        .filter(Boolean);

    if (sections.length < 2) {
        console.warn('Journey: not enough sections found for scroll path');
        return;
    }

    // Camera starts at the hero establishing shot
    setCameraAtT(0);
    setActivePanel('panel-hero');

    // Ensure we have a scrollable page by setting min-height on the body
    // (sections already have min-height from CSS)
    const totalScrollHeight = sections.reduce((sum, sec) => sum + sec.offsetHeight, 0);
    if (totalScrollHeight < window.innerHeight * 2) {
        // Add extra scroll room so the camera has space to travel
        document.body.style.minHeight = '400vh';
    }

    // One scrubbed trigger per travel leg: entering section i drives
    // the camera from stop i-1 to stop i with an ease that slows
    // and pushes in on arrival.
    for (let i = 1; i < sections.length; i++) {
        const prevT = stopTs[stopOrder[i - 1]];
        const thisT = stopTs[stopOrder[i]];
        ScrollTrigger.create({
            trigger: sections[i],
            start: 'top 95%',
            end: 'top 5%',
            scrub: 0.6,
            onUpdate: (self) => {
                const eased = gsap.parseEase('power2.inOut')(self.progress);
                setCameraAtT(prevT + (thisT - prevT) * eased);
            }
        });
    }

    // Panel activation: a section's datasheet unfolds while the
    // camera dwells on its component.
    sections.forEach((sec, i) => {
        const panelId = sec.getAttribute('data-panel');
        ScrollTrigger.create({
            trigger: sec,
            start: i === 0 ? 'top top' : 'top 35%',
            end: 'bottom 35%',
            onToggle: (self) => {
                if (self.isActive) setActivePanel(panelId);
            }
        });
    });

    // Refresh ScrollTrigger after everything is registered
    requestAnimationFrame(() => {
        ScrollTrigger.refresh();
    });
}

// ─── Direct navigation (every section reachable two ways) ───
export function scrollToSection(sectionId) {
    const el = document.getElementById(sectionId);
    if (!el) return;
    // Land where the section's dwell zone is fully engaged
    const y = sectionId === 'sec-hero'
        ? 0
        : el.offsetTop + Math.min(el.offsetHeight * 0.45, window.innerHeight * 0.7);
    gsap.to(window, {
        scrollTo: { y },
        duration: 1.4,
        ease: 'power2.inOut',
        overwrite: 'auto'
    });
}
