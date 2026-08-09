import { detectWebGL, showFallbackUI, setupCleanup } from './src/ui/fallback.js';
import { initScene, scene, camera, renderer, tickCallbacks, enableBloom, syncCanvasSize } from './src/three/scene.js';
import { createBoard, boardGroup, updateBoardParallax } from './src/three/board.js';
import { createComponents } from './src/three/components.js';
import { createTraces, updateTraceCurrent } from './src/three/traces.js';
import { createParticles, updateParticles } from './src/three/particles.js';
import { createProjectChips, updateProjectChips } from './src/three/project-chips.js';
import { updateRadarRing, pulseBuzzer } from './src/three/components.js';
import { runBootSequence } from './src/ui/boot.js';
import { initHover, checkHover, mouse, setBoardClickHandler, setBuzzerHandler } from './src/utils/hover.js';
import { createProbe, updateProbe, pressProbeKey, releaseProbeKey, measureProbeTarget, isProbeModeActive, deactivateProbe } from './src/three/probe.js';
import { initCursor } from './src/ui/cursor.js';
import { LINKEDIN_URL, GITHUB_URL, isLiteMode } from './src/config.js';
import { renderSections } from './src/ui/sections.js';
import { initJourney, scrollToSection, updateJourneyEffects, focusProject, exitFocusMode, getActiveSectionId } from './src/scroll/journey.js';

// ─── Hash-based deep links ─────────────────────────────────
// Each section gets a shareable URL (#/about, #/projects, ...). Nav clicks
// pushState + scroll; back/forward fire hashchange/popstate and we scroll
// to match the hash — so every section is linkable and the back button works.
const SECTION_HASHES = {
    'sec-hero': '',
    'sec-about': 'about',
    'sec-projects': 'projects',
    'sec-skills': 'skills',
    'sec-experience': 'experience',
    'sec-contact': 'contact'
};

function sectionFromHash() {
    const raw = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
    if (!raw) return 'sec-hero';
    const secId = `sec-${raw}`;
    return document.getElementById(secId) ? secId : null;
}

let lastAppliedHash = null;
function applyHashNavigation() {
    // hashchange AND popstate both fire on back/forward — dedupe so the
    // scroll tween isn't restarted twice per history step.
    if (window.location.hash === lastAppliedHash) return;
    lastAppliedHash = window.location.hash;
    const secId = sectionFromHash();
    if (secId) scrollToSection(secId);
}

function navigateToSection(sectionId) {
    const slug = SECTION_HASHES[sectionId];
    if (slug === undefined) return;
    const targetHash = slug ? `#/${slug}` : '';
    if (window.location.hash !== targetHash) {
        const base = window.location.pathname + window.location.search;
        history.pushState(null, '', slug ? `${base}#/${slug}` : base);
        lastAppliedHash = targetHash;
    }
    scrollToSection(sectionId);
}

// ─── Signal-path scroll progress readout (HUD legend + top-edge meter) ──────
// The fill is a pure function of scroll position — deterministic, no
// wall-clock anywhere. Driven by a passive scroll listener + rAF coalescing
// (one compositor write per frame max), reading the elements that exist.
const SECTION_KEYS = ['sec-hero', 'sec-about', 'sec-projects', 'sec-skills', 'sec-experience', 'sec-contact'];
let progressRaf = null;
// Static elements — cache once so the per-frame hot path never queries the DOM.
let sigFillEl = null;
let sigPctEl = null;
let meterFillEl = null;
let meterHeadEl = null;
function updateSigPath() {
    progressRaf = null;
    if (!sigFillEl || !sigPctEl) {
        sigFillEl = document.querySelector('.sig-path-fill');
        sigPctEl = document.querySelector('.sig-path-pct');
        if (!sigFillEl || !sigPctEl) return;
    }
    if (!meterFillEl || !meterHeadEl) {
        meterFillEl = document.getElementById('sig-meter-fill');
        meterHeadEl = document.getElementById('sig-meter-head');
    }
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    sigFillEl.style.transform = `scaleX(${p.toFixed(4)})`;
    sigPctEl.textContent = `${Math.round(p * 100)}%`;
    // Top-edge signal meter: segmented fill (scaleX) + glowing head LED
    // (translateX in vw — the meter spans the viewport, so p*100vw is its
    // exact position; transform-only, no layout writes).
    if (meterFillEl) meterFillEl.style.transform = `scaleX(${p.toFixed(4)})`;
    if (meterHeadEl) meterHeadEl.style.transform = `translateX(calc(${(p * 100).toFixed(2)}vw - 50%))`;
}
function scheduleSigPath() {
    if (progressRaf === null) progressRaf = requestAnimationFrame(updateSigPath);
}

// ─── Keyboard section navigation (number keys 1–6) ───────
// Section order matches the HUD nav buttons. Keys are ignored while typing
// in a field or when a modifier is held, so the page never hijacks input.
function handleSectionKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement && document.activeElement.isContentEditable) return;
    const idx = parseInt(e.key, 10) - 1;
    if (idx >= 0 && idx < SECTION_KEYS.length) {
        e.preventDefault();
        navigateToSection(SECTION_KEYS[idx]);
    }
}

// Font loading detection for fallback management
function detectFontLoading() {
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            document.documentElement.classList.add('fonts-loaded');
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    detectFontLoading();

    // 0. Check WebGL support before initializing 3D
    if (!detectWebGL()) {
        showFallbackUI();
        console.warn('WebGL not supported — showing fallback UI');
        return;
    }

    // 1. Grab canvas element
    const canvas = document.getElementById('threejs-canvas');
    if (!canvas) {
        console.error('ThreeJS Canvas element not found!');
        return;
    }

    // 2. Initialize ThreeJS scene, camera, renderer
    initScene(canvas);

    // 3. Build PCB Base Board Group
    createBoard(scene);

    // 4. Construct board SMD/IC components
    createComponents(boardGroup);

    // 5. Build trace routing pathways
    createTraces(boardGroup);

    // 6. Build electricity electron flows
    createParticles(boardGroup);

    // 6b. Build project chips on the board
    createProjectChips(boardGroup);

    // 6c. Flying scope probe (WASD) — the board's test probe, flyable over
    // the components. Scroll stays the primary path; this is additive.
    createProbe(boardGroup);

    // 7. Render section datasheet content from portfolio data
    renderSections();

    // 7b. Wire LinkedIn and GitHub links from config
    document.querySelectorAll('.js-linkedin, #cta-linkedin-hud').forEach(a => { a.href = LINKEDIN_URL; });
    document.querySelectorAll('.js-github').forEach(a => { a.href = GITHUB_URL; });

    // 8. Bind hover raycast checking
    initHover(camera, scene);

    // 8a. Scope-probe custom cursor (pointer:fine desktop only — lite mode
    // keeps the native cursor for reduced-motion and touch users).
    if (!isLiteMode() && window.matchMedia('(pointer: fine)').matches) {
        initCursor();
    }

    // 8b. Click-to-component: clicking a project chip on the board glides the
    // camera to it and opens its focused datasheet (journey.focusProject).
    // The close button releases the same way Esc does.
    setBoardClickHandler((ref) => focusProject(ref));
    // BZ1 — the horn: clicking the piezo on the board pulses it, fires an
    // expanding sound ring, and beeps via WebAudio (user gesture required).
    setBuzzerHandler(pulseBuzzer);
    const projectCloseBtn = document.getElementById('btn-project-close');
    if (projectCloseBtn) {
        projectCloseBtn.addEventListener('click', () => exitFocusMode());
    }

    // 9. Set up body class for mode detection
    if (isLiteMode()) {
        document.body.classList.add('lite-mode');
    } else {
        document.body.classList.add('full-journey');
    }
    // The mode class resizes the canvas region (desktop split: left 58%;
    // mobile: 48vh strip) — initScene measured it full-width before the class
    // existed, so re-sync renderer/camera/composer to the actual region now.
    syncCanvasSize();

    // Store journey flag for after boot
    const shouldInitJourney = !isLiteMode();

    // 10. Enable bloom post-processing (unless lite mode)
    if (!isLiteMode()) {
        enableBloom();
    }

    // 11. Add animation loops to ticks callback registry
    tickCallbacks.push((elapsed, delta) => {
        // Run electron pathing animations
        updateParticles(delta);

        // U1 CPU radar sweep (procedural, elapsed-driven)
        updateRadarRing(elapsed);

        // Update project chip LEDs (flicker breadboard LEDs)
        updateProjectChips(elapsed);

        // Run hover raycasting intersection diagnostics (suspended while the
        // flying scope probe is active — one probe at a time)
        if (!isProbeModeActive()) {
            checkHover(delta);
        }

        // Fly the scope probe (WASD/arrows) — moves in board-local space,
        // raycasts its tip, drives the HUD scope readout
        updateProbe(delta);

        // Apply mouse movement 3D board parallax tilts (delta-scaled lerp).
        // The active section gates the tilt strength — boosted on About so the
        // "move cursor to tilt board" affordance is felt, capped everywhere.
        const activeSectionId = getActiveSectionId();
        updateBoardParallax(elapsed, mouse, delta, activeSectionId);

        // Traveling current dot: power visibly flows along the active
        // section's trace (the arrival pulse is the flash; this is the
        // sustained current).
        updateTraceCurrent(elapsed, activeSectionId);

        // Update screen-space panel positioning, connector line, and vignette
        if (typeof updateJourneyEffects === 'function' && !isLiteMode()) {
            updateJourneyEffects(camera, boardGroup);
        }
    });

    // 12. Execute GSAP Power-on sequence — then init journey after boot
    runBootSequence(() => {
        console.log("PARAMESHWARAN S PORTFOLIO SYSTEMS FULLY OPERATIONAL.");

        // Init scroll journey after boot animation completes (camera is ready)
        if (shouldInitJourney) {
            initJourney(camera);
        }
        // Honor a deep link (#/about, #/projects) on first load
        if (window.location.hash) applyHashNavigation();
        // Note: hud-ready class is already set inside runBootSequence step 3
    });

    // 13. Register memory cleanup on page unload
    setupCleanup(scene, renderer);

    // 14. Bind Navigation Bar Buttons (scroll journey):
    // Every section reachable two ways: by scrolling to it, AND by clicking it directly.
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.getAttribute('data-section');
            if (section && document.getElementById(section)) {
                // Scroll-journey navigation + shareable hash URL
                navigateToSection(section);
            }
        });
    });    // 15. Hero section nav button for the HUD name/brand link
    const brandLink = document.querySelector('.hud-name');
    if (brandLink) {
        brandLink.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToSection('sec-hero');
        });
    }

    // 16. Hash routing: back/forward + manual hash edits navigate sections
    window.addEventListener('hashchange', applyHashNavigation);
    window.addEventListener('popstate', applyHashNavigation);

    // 17. Signal-path scroll progress: passive scroll listener + rAF coalescing
    window.addEventListener('scroll', scheduleSigPath, { passive: true });
    window.addEventListener('resize', scheduleSigPath);
    scheduleSigPath();

    // 18. Keyboard section navigation (1–6)
    window.addEventListener('keydown', handleSectionKey);

    // 19. Flying scope probe keyboard (full-journey only): WASD activates +
    // flies (arrows fly only once the probe is already active — they stay
    // free for keyboard scrolling otherwise); Enter MEASUREs the component
    // under the tip; Esc exits probe mode.
    const PROBE_MOVE_KEYS = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const normalizeProbeKey = (/** @type {string} */ k) => (k.length === 1 ? k.toLowerCase() : k);
    window.addEventListener('keydown', (e) => {
        if (isLiteMode()) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) return;
        const key = normalizeProbeKey(e.key);
        if (PROBE_MOVE_KEYS.includes(key)) {
            // Arrows are the page's scroll keys — only hijack them once the
            // probe is already active (WASD is the activation affordance).
            if (key.startsWith('Arrow') && !isProbeModeActive()) return;
            e.preventDefault();
            pressProbeKey(key);
        } else if (e.key === 'Enter' && isProbeModeActive()) {
            e.preventDefault();
            measureProbeTarget();
        } else if (e.key === 'Escape' && isProbeModeActive()) {
            deactivateProbe();
        }
    });
    window.addEventListener('keyup', (e) => releaseProbeKey(normalizeProbeKey(e.key)));
});