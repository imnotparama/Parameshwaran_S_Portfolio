import { detectWebGL, showFallbackUI, setupCleanup } from './src/ui/fallback.js';
import { initScene, scene, camera, renderer, tickCallbacks, enableBloom, composer } from './src/three/scene.js';
import { createBoard, boardGroup, updateBoardParallax } from './src/three/board.js';
import { createComponents } from './src/three/components.js';
import { createTraces } from './src/three/traces.js';
import { createParticles, updateParticles } from './src/three/particles.js';
import { createProjectChips, updateProjectChips } from './src/three/project-chips.js';
import { updateRadarRing } from './src/three/components.js';
import { runBootSequence } from './src/ui/boot.js';
import { initHover, checkHover, mouse } from './src/utils/hover.js';
import { LINKEDIN_URL, GITHUB_URL, isLiteMode, isSmallViewport } from './src/config.js';
import { renderSections } from './src/ui/sections.js';
import { initJourney, scrollToSection, updateJourneyEffects } from './src/scroll/journey.js';

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

    // 7. Render section datasheet content from portfolio data
    renderSections();

    // 7b. Wire LinkedIn and GitHub links from config
    document.querySelectorAll('.js-linkedin, #cta-linkedin-hud').forEach(a => { a.href = LINKEDIN_URL; });
    document.querySelectorAll('.js-github').forEach(a => { a.href = GITHUB_URL; });

    // 8. Bind hover raycast checking
    initHover(camera, scene);

    // 9. Set up body class for mode detection
    if (isLiteMode()) {
        document.body.classList.add('lite-mode');
    } else {
        document.body.classList.add('full-journey');
    }

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

        // Run hover raycasting intersection diagnostics
        checkHover(delta);

        // Apply mouse movement 3D board parallax tilts
        updateBoardParallax(elapsed, mouse);

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
            initJourney(camera, boardGroup);
        }
        // Note: hud-ready class is already set inside runBootSequence step 3
    });

    // 13. Register memory cleanup on page unload
    setupCleanup(scene, renderer, camera);

    // 14. Bind Navigation Bar Buttons (scroll journey):
    // Every section reachable two ways: by scrolling to it, AND by clicking it directly.
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.getAttribute('data-section');
            if (section && document.getElementById(section)) {
                // Scroll-journey navigation
                if (typeof scrollToSection === 'function') {
                    scrollToSection(section);
                } else {
                    document.getElementById(section).scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });

    // 15. Hero section nav button for the HUD name/brand link
    const brandLink = document.querySelector('.hud-name');
    if (brandLink) {
        brandLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof scrollToSection === 'function') {
                scrollToSection('sec-hero');
            } else {
                document.getElementById('sec-hero')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

});