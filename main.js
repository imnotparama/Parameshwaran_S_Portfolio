import { detectWebGL, showFallbackUI, setupCleanup } from './src/ui/fallback.js';
import { initScene, scene, camera, renderer, tickCallbacks } from './src/three/scene.js';
import { createBoard, boardGroup, updateBoardParallax } from './src/three/board.js';
import { createComponents } from './src/three/components.js';
import { createTraces } from './src/three/traces.js';
import { createParticles, updateParticles } from './src/three/particles.js';
import { initTooltip } from './src/ui/tooltip.js';
import { runBootSequence } from './src/ui/boot.js';
import { initHover, checkHover, mouse, triggerComponentAction } from './src/utils/hover.js';
import { initSidePanel, openSidePanel, closeSidePanel } from './src/ui/sidepanel.js';

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

    // 7. Initialize UI detail panels and tooltip frameworks
    initTooltip();
    initSidePanel();

    // 8. Bind hover raycast checking
    initHover(camera, scene);

    // 9. Add animation loops to ticks callback registry
    tickCallbacks.push((elapsed, delta) => {
        // Run electron pathing animations
        updateParticles(delta);

        // Run hover raycasting intersection diagnostics
        checkHover();

        // Apply mouse movement 3D board parallax tilts
        updateBoardParallax(elapsed, mouse);
    });

    // 10. Execute GSAP Power-on sequence
    runBootSequence(() => {
        console.log("PARAMESHWARAN S PORTFOLIO SYSTEMS FULLY OPERATIONAL.");
    });

    // 10. Register memory cleanup on page unload
    setupCleanup(scene, renderer, camera);

    // 11. Bind Navigation Bar Buttons
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const ref = btn.getAttribute('data-ref');
            const section = btn.getAttribute('data-section');
            
            if (section === 'skills') {
                // Panel-only navigation: open side panel without zooming
                closeSidePanel();
                openSidePanel(ref);
                // Scroll to skills section after panel opens
                setTimeout(() => {
                    const skillsSection = document.querySelector('.panel-skills-grid');
                    if (skillsSection) skillsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 450);
            } else {
                closeSidePanel();
                triggerComponentAction(ref);
            }
        });
    });

    // Register global triggers (for hover.js direct access)
    window.openSidePanel = openSidePanel;
    window.closeSidePanel = closeSidePanel;
});
