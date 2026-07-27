import { initScene, scene, camera, tickCallbacks } from './src/three/scene.js';
import { createBoard, boardGroup, updateBoardParallax } from './src/three/board.js';
import { createComponents } from './src/three/components.js';
import { createTraces } from './src/three/traces.js';
import { createParticles, updateParticles } from './src/three/particles.js';
import { initTooltip } from './src/ui/tooltip.js';
import { runBootSequence } from './src/ui/boot.js';
import { initHover, checkHover, mouse, triggerComponentAction } from './src/utils/hover.js';
import { portfolioData } from './src/data/portfolio.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Grab canvas element
    const canvas = document.getElementById('threejs-canvas');
    if (!canvas) {
        console.error("ThreeJS Canvas element not found!");
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

    // 11. Bind Side Panel Close Button
    const closeBtn = document.getElementById('btn-close-panel');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSidePanel);
    }

    // Register global triggers on window (for hover.js direct access)
    window.openSidePanel = openSidePanel;
    window.closeSidePanel = closeSidePanel;

    // Bind Navigation Bar Buttons
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const ref = btn.getAttribute('data-ref');
            closeSidePanel(); // close existing panel
            triggerComponentAction(ref); // trigger component scale pulse & zoom-in LERP
        });
    });

    function openSidePanel(ref) {
        const panel = document.getElementById('info-panel');
        const content = document.getElementById('info-panel-content');
        if (!panel || !content) return;

        let html = '';
        const info = portfolioData.personalInfo;

        if (ref === 'U1') {
            html = `
                <div class="panel-section-title">MCU: About & Skills</div>
                <pre style="color: var(--glow-green); font-size: 8px; line-height: 1.2; overflow-x: hidden; margin-bottom: 15px;">
+----------------------------------+
|      PARAMESHWARAN S SYSTEM      |
|         STATUS: OPERATIONAL      |
+----------------------------------+
                </pre>
                <div style="font-size: 13px; line-height: 1.6;">
                    <p><strong>Name:</strong> ${info.name}</p>
                    <p><strong>Role:</strong> ${info.tagline}</p>
                    <p><strong>University:</strong> ${info.institution}</p>
                    <p><strong>GPA:</strong> 9.51 / 10</p>
                    <p><strong>Location:</strong> ${info.location}</p>
                    <p style="color: var(--color-text-muted); margin-top: 10px;">${info.bio}</p>
                </div>
                
                <div class="panel-section-title" style="margin-top: 25px; font-size: 15px;">Silicon Skills Grid</div>
                <div style="font-size: 12px; margin-top: 10px; line-height: 1.6;">
                    <p><strong style="color: var(--glow-green);">AI / ML:</strong> ${portfolioData.skills.ai_ml.join(', ')}</p>
                    <p><strong style="color: var(--glow-green);">Web Dev:</strong> ${portfolioData.skills.web.join(', ')}</p>
                    <p><strong style="color: var(--glow-green);">Data Sci:</strong> ${portfolioData.skills.data.join(', ')}</p>
                    <p><strong style="color: var(--glow-green);">Hardware:</strong> ${portfolioData.skills.hardware.join(', ')}</p>
                </div>
                
                <div style="margin-top: 30px; display: flex; gap: 15px;">
                    <a href="${info.socials.github}" target="_blank" class="nav-btn" style="text-decoration: none; font-size: 11px;">[ GITHUB ]</a>
                    <a href="${info.socials.linkedin}" target="_blank" class="nav-btn" style="text-decoration: none; font-size: 11px;">[ LINKEDIN ]</a>
                </div>
            `;
        } else if (ref === 'U2') {
            html = `
                <div class="panel-section-title">DSP: Projects Registry</div>
                <div style="display: flex; flex-direction: column; gap: 20px;">
            `;
            portfolioData.projects.forEach(p => {
                html += `
                    <div style="border: 1px solid #165316; background-color: rgba(5,15,5,0.6); padding: 12px; border-radius: 2px;">
                        <div style="font-weight: bold; color: var(--glow-green); font-size: 14px;">${p.title}</div>
                        <div style="font-size: 11px; color: var(--color-text-muted); margin: 6px 0 10px;">${p.description}</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px;">
                            ${p.tags.map(t => `<span style="font-size: 9px; background-color: #112d11; color: var(--glow-green); padding: 1px 5px; border-radius: 2px; border: 1px solid #165316;">${t}</span>`).join('')}
                        </div>
                        <a href="${p.github}" target="_blank" style="color: #60a5fa; text-decoration: none; font-size: 11px; font-weight: bold;">[ View GitHub Code ]</a>
                    </div>
                `;
            });
            html += `</div>`;
        } else if (ref === 'J1') {
            html = `
                <div class="panel-section-title">BUS: Experience logs</div>
                <div style="display: flex; flex-direction: column; gap: 20px; font-size: 12px;">
            `;
            portfolioData.experience.forEach(exp => {
                html += `
                    <div style="border-left: 2px solid var(--glow-green); padding-left: 12px; margin-bottom: 15px;">
                        <p style="font-size: 14px; font-weight: bold; color: #ffffff; margin-bottom: 4px;">${exp.role} @ ${exp.company}</p>
                        <p style="color: var(--glow-green); font-size: 11px; margin-bottom: 8px;">${exp.period}</p>
                        <ul style="padding-left: 15px; color: var(--color-text-muted); line-height: 1.5;">
                            ${exp.tasks.map(t => `<li style="margin-bottom: 4px;">${t}</li>`).join('')}
                        </ul>
                    </div>
                `;
            });
            html += `</div>`;
        } else if (ref === 'ANT1') {
            html = `
                <div class="panel-section-title">TX/RX: Gateway Link</div>
                <div style="font-size: 13px; line-height: 1.8;">
                    <p><strong style="color: var(--glow-green);">Email:</strong> ${info.email}</p>
                    <p><strong style="color: var(--glow-green);">Phone:</strong> ${info.phone}</p>
                    <p><strong style="color: var(--glow-green);">Location:</strong> ${info.location}</p>
                    <p style="margin-top: 15px; color: var(--color-text-muted);">Drop me an email or trace my links for engineering collaborations, research proposals, or project scrums.</p>
                    
                    <div style="margin-top: 30px; display: flex; flex-direction: column; gap: 10px;">
                        <a href="mailto:${info.email}" class="nav-btn" style="text-decoration: none; font-size: 12px; text-align: center;">[ TRANSMIT EMAIL ]</a>
                        <a href="${info.socials.github}" target="_blank" class="nav-btn" style="text-decoration: none; font-size: 12px; text-align: center;">[ ROUTE GITHUB CHANNEL ]</a>
                        <a href="${info.socials.linkedin}" target="_blank" class="nav-btn" style="text-decoration: none; font-size: 12px; text-align: center;">[ CONNECT LINKEDIN NODE ]</a>
                    </div>
                </div>
            `;
        } else {
            html = `
                <div class="panel-section-title">MCU Registry</div>
                <div style="font-size: 13px; line-height: 1.6;">
                    <p><strong>Designator:</strong> ${ref}</p>
                    <p><strong>Device:</strong> SMD Chip component</p>
                    <p><strong>Diagnostic:</strong> Systems running stable reference levels.</p>
                </div>
            `;
        }

        content.innerHTML = html;
        panel.classList.add('active');
    }

    function closeSidePanel() {
        const panel = document.getElementById('info-panel');
        if (panel) panel.classList.remove('active');
    }
});
