import * as THREE from 'three';
import gsap from 'gsap';
import { showTooltip, hideTooltip } from '../ui/tooltip.js';
import { setHoveredTraceSpeedBoost } from '../three/particles.js';
import { interactiveObjects, insideInteractiveObjects, siliconDieMesh, cpuInsideGroup, gpuInsideGroup, oscInsideGroup, antInsideGroup, usbInsideGroup, vrInsideGroup, ledMeshes } from '../three/components.js';
import { portfolioData } from '../data/portfolio.js';

export const mouse = new THREE.Vector2();

export let viewState = 'PCB'; // 'PCB' | 'ZOOMING_IN' | 'ZOOMED_IN' | 'ZOOMING_OUT'
export let activeComponentRef = ''; // Track which component is zoomed into

let raycaster;
let activeCamera;
let activeScene;
let hoveredObject = null;
let currentHovered = null;
let frameCounter = 0;
let hoverLight = null;

// LERP target positions
const defaultCamPos = new THREE.Vector3(0, -2, 17);
const defaultLookAt = new THREE.Vector3(0, 0, 0);

export const targetCamPos = defaultCamPos.clone();
export const targetLookAt = defaultLookAt.clone();
export const currentLookAt = defaultLookAt.clone();

let btnBack = null;
let hudTooltip = null;

// Map components to zoom positions & internal labels
const ZOOM_CONFIG = {
    'U1': { pos: new THREE.Vector3(0, 1.0, 2.6), look: new THREE.Vector3(0, 1.0, 0.08), group: 'cpu' },
    'U2': { pos: new THREE.Vector3(-3.2, 4.5, 2.2), look: new THREE.Vector3(-3.2, 4.5, 0.08), group: 'gpu' },
    'Y1': { pos: new THREE.Vector3(-3.5, 0.5, 1.8), look: new THREE.Vector3(-3.5, 0.5, 0.08), group: 'osc' },
    'ANT1': { pos: new THREE.Vector3(3.5, 0.5, 1.8), look: new THREE.Vector3(3.5, 0.5, 0.08), group: 'antenna' },
    'J1': { pos: new THREE.Vector3(0, -7.3, 2.0), look: new THREE.Vector3(0, -7.3, 0.08), group: 'usb' },
    'D1-D7': { pos: new THREE.Vector3(-3.5, -4.5, 2.4), look: new THREE.Vector3(-3.5, -4.5, 0.08), group: 'leds' },
    'VR1': { pos: new THREE.Vector3(3.5, -4.5, 2.0), look: new THREE.Vector3(3.5, -4.5, 0.08), group: 'vr' }
};

export function initHover(camera, scene) {
    activeCamera = camera;
    activeScene = scene;
    raycaster = new THREE.Raycaster();

    // Create moving PointLight for hovered component glows
    hoverLight = new THREE.PointLight(0xffffff, 0, 3);
    scene.add(hoverLight);

    // Create Back to PCB HUD button
    btnBack = document.createElement('button');
    btnBack.id = 'btn-hud-back';
    btnBack.innerText = '[ ESCAPE COMPONENT VIEW ]';
    btnBack.className = 'btn-hud-control';
    btnBack.style.display = 'none';
    document.body.appendChild(btnBack);

    btnBack.addEventListener('click', exitZoomView);

    // Create dynamic HUD tooltip
    hudTooltip = document.createElement('div');
    hudTooltip.id = 'hud-terminal';
    hudTooltip.className = 'pcb-hud-layout';
    document.body.appendChild(hudTooltip);

    const updateHudDefault = () => {
        hudTooltip.style.opacity = '0';
        hudTooltip.style.transform = 'translateY(10px)';
    };
    updateHudDefault();

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && (viewState === 'ZOOMED_IN' || viewState === 'ZOOMING_IN')) {
            exitZoomView();
        }
    });

    const updateMouseCoords = (clientX, clientY) => {
        mouse.x = (clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    };

    window.addEventListener('mousemove', (e) => {
        updateMouseCoords(e.clientX, e.clientY);
    });

    // Touch Event Listeners for mobile touch support (mirrors mouse events)
    window.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            updateMouseCoords(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            updateMouseCoords(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });

    // Main viewport click/touch triggers zooming in
    window.addEventListener('click', (e) => {
        if (btnBack.contains(e.target)) return;

        if (viewState === 'PCB' && hoveredObject) {
            const ref = hoveredObject.name;
            const config = ZOOM_CONFIG[ref];

            if (config) {
                viewState = 'ZOOMING_IN';
                activeComponentRef = ref;
                
                targetCamPos.copy(config.pos);
                targetLookAt.copy(config.look);

                // Hide component outer shell to reveal internals
                toggleComponentShells(ref, false);
                updateHudDefault();

                // Open side panel
                if (window.openSidePanel) {
                    window.openSidePanel(ref);
                }
            }
        }
    });
}

function exitZoomView() {
    if (viewState !== 'ZOOMED_IN' && viewState !== 'ZOOMING_IN') return;

    viewState = 'ZOOMING_OUT';
    btnBack.style.display = 'none';
    
    // Restore default camera position
    targetCamPos.copy(defaultCamPos);
    targetLookAt.copy(defaultLookAt);
    
    // Hide tooltips
    hudTooltip.style.opacity = '0';
    hudTooltip.style.transform = 'translateY(10px)';

    // Restore component shell visibility
    toggleComponentShells(activeComponentRef, true);

    // Close side panel
    if (window.closeSidePanel) {
        window.closeSidePanel();
    }
}

// Show/Hide outer component bodies to reveal internal geometries
function toggleComponentShells(ref, isVisible) {
    // 1. Hide/Show specific component body
    const comp = activeScene.getObjectByName(ref);
    if (comp) {
        comp.visible = isVisible;
    }

    // 2. Hide/Show silicon grids or internal groups
    if (ref === 'U1') {
        if (siliconDieMesh) siliconDieMesh.visible = isVisible;
        if (cpuInsideGroup) cpuInsideGroup.visible = !isVisible;
    } else if (ref === 'U2') {
        if (gpuInsideGroup) gpuInsideGroup.visible = !isVisible;
    } else if (ref === 'Y1') {
        if (oscInsideGroup) oscInsideGroup.visible = !isVisible;
    } else if (ref === 'ANT1') {
        if (antInsideGroup) antInsideGroup.visible = !isVisible;
    } else if (ref === 'J1') {
        if (usbInsideGroup) usbInsideGroup.visible = !isVisible;
    } else if (ref === 'VR1') {
        if (vrInsideGroup) vrInsideGroup.visible = !isVisible;
    }
}

// Called inside tick callbacks animation loop
export function checkHover(elapsed, delta) {
    if (!raycaster || !activeCamera) return;

    // Apply Camera position/lookAt LERP interpolations
    activeCamera.position.lerp(targetCamPos, 0.08);
    currentLookAt.lerp(targetLookAt, 0.08);
    activeCamera.lookAt(currentLookAt);

    // Handle view state boundaries
    if (viewState === 'ZOOMING_IN' && activeCamera.position.distanceTo(targetCamPos) < 0.12) {
        viewState = 'ZOOMED_IN';
        btnBack.style.display = 'block';
    } else if (viewState === 'ZOOMING_OUT' && activeCamera.position.distanceTo(targetCamPos) < 0.12) {
        viewState = 'PCB';
        activeComponentRef = '';
    }

    // Increment frame counter for throttled raycasting
    frameCounter++;

    if (frameCounter % 3 === 0) {
        // Set target objects depending on current state
        const targets = (viewState === 'PCB') ? interactiveObjects : (viewState === 'ZOOMED_IN' ? insideInteractiveObjects : []);
        
        // Filter by isInteractive flag to only check responsive meshes
        const filteredTargets = targets.filter(obj => obj.userData && obj.userData.isInteractive);

        raycaster.setFromCamera(mouse, activeCamera);
        const intersects = raycaster.intersectObjects(filteredTargets, false); // false = non-recursive

        if (intersects.length > 0) {
            const first = intersects[0].object;

            if (currentHovered !== first) {
                // Immediately reset previous hover state
                resetHoverMesh(currentHovered);

                currentHovered = first;
                hoveredObject = first; // keep reference for click listener

                if (currentHovered instanceof THREE.Mesh) {
                    const mat = currentHovered.material;
                    const name = currentHovered.name;

                    // Emissive highlights
                    let glowColor = 0x00ff88;
                    if (viewState === 'PCB') {
                        // Standard board raycasting
                        let glowColorMap = {
                            'U1': 0x00ff88, 'U2': 0x00bfff, 'Y1': 0xaa44ff, 
                            'ANT1': 0x00ffff, 'J1': 0xff8800, 'VR1': 0xff4444, 
                            'RN1': 0x14b8a6, 'TP1': 0xffcc00, 'TP2': 0xffcc00
                        };
                        glowColor = glowColorMap[name] || 0x00ff88;

                        if (mat.emissive) {
                            mat.emissive.setHex(glowColor);
                            // Increase emissiveIntensity from 0.6 to 0.9
                            gsap.to(mat, { emissiveIntensity: 0.9, duration: 0.25, overwrite: 'auto' });
                        }
                        
                        // Scale component up with a brief hardware "pulse" (1.0 -> 1.12 -> 1.08 in 0.3s)
                        gsap.killTweensOf(currentHovered.scale);
                        gsap.fromTo(currentHovered.scale,
                            { x: 1.0, y: 1.0, z: 1.0 },
                            {
                                x: 1.12, y: 1.12, z: 1.12,
                                duration: 0.12,
                                ease: 'power1.out',
                                onComplete: () => {
                                    gsap.to(currentHovered.scale, {
                                        x: 1.08, y: 1.08, z: 1.08,
                                        duration: 0.18,
                                        ease: 'power2.out'
                                    });
                                }
                            }
                        );

                        // Attach PointLight to the component position on hover (intensity 1.5, distance 3)
                        if (hoverLight) {
                            hoverLight.color.setHex(glowColor);
                            currentHovered.getWorldPosition(hoverLight.position);
                            hoverLight.position.z += 0.3; // lift it off the board surface
                            gsap.to(hoverLight, { intensity: 1.5, duration: 0.25, overwrite: 'auto' });
                        }

                        // Speed up particles
                        setHoveredTraceSpeedBoost(name, true);
                        showTooltip(name, currentHovered.userData.componentName || 'SMD Module');

                        // Dynamic HUD terminal update on hover (bottom right)
                        renderComponentHUD(name);
                    } else if (viewState === 'ZOOMED_IN') {
                        // Zoomed-in internal sub-core raycasting
                        glowColor = getSubCoreGlowColor(name);
                        if (mat.emissive) {
                            mat.emissive.setHex(glowColor);
                            gsap.to(mat, { emissiveIntensity: 0.9, duration: 0.2, overwrite: 'auto' });
                        }
                        gsap.to(currentHovered.scale, { x: 1.08, y: 1.08, z: 1.08, duration: 0.2, overwrite: 'auto' });

                        // Render dynamic architecture terminal logs
                        renderSubcoreHUD(name);
                    }

                    document.body.style.cursor = 'pointer';
                }
            }
        } else {
            if (currentHovered) {
                resetHoverMesh(currentHovered);
                currentHovered = null;
                hoveredObject = null;
                document.body.style.cursor = 'default';
                
                // Show default help text if zoomed in
                if (viewState === 'ZOOMED_IN') {
                    renderZoomedDefaultHUD();
                }
            }
        }
    }
}

function resetHoverMesh(obj) {
    if (obj && obj instanceof THREE.Mesh) {
        const mat = obj.material;
        const name = obj.name;

        if (viewState === 'PCB') {
            setHoveredTraceSpeedBoost(name, false);
            hideTooltip();
            // Turn off the hover PointLight
            if (hoverLight) {
                gsap.to(hoverLight, { intensity: 0, duration: 0.35, overwrite: 'auto' });
            }
            // Clear the HUD terminal
            if (hudTooltip) {
                hudTooltip.style.opacity = '0';
                hudTooltip.style.transform = 'translateY(10px)';
            }
        }

        // Dispose hover state IMMEDIATELY (no ghosting glows)
        if (mat.emissive) {
            mat.emissiveIntensity = 0.0;
            mat.emissive.setHex(0x000000);
        }

        gsap.killTweensOf(obj.scale);
        gsap.to(obj.scale, {
            x: 1.0,
            y: 1.0,
            z: 1.0,
            duration: 0.35,
            overwrite: 'auto'
        });
    }
}

function getSubCoreGlowColor(name) {
    if (name.startsWith('core_')) {
        if (name === 'core_alu') return 0xf59e0b;
        if (name === 'core_npu') return 0xef4444;
        if (name === 'core_cu') return 0x3b82f6;
        return 0x10b981;
    }
    if (name.startsWith('proj_')) return 0x00bfff;
    if (name.startsWith('edu_')) return 0xaa44ff;
    if (name.startsWith('usb_')) return 0xff8800;
    if (name.startsWith('vr_')) return 0xff4444;
    return 0x00ff88;
}

// Details HUD mapping for zoomed microarchitecture hover checking
function renderSubcoreHUD(name) {
    if (!hudTooltip) return;

    hudTooltip.style.opacity = '1';
    hudTooltip.style.transform = 'translateY(0)';

    const data = portfolioData;

    // CPU Cores
    if (name.startsWith('core_')) {
        let title, desc, skills;
        if (name === 'core_alu') {
            title = 'ALU CORE - DATA SCIENCE & ANALYTICS';
            desc = 'Runs calculations, database transforms, and statistical analytics.';
            skills = data.skills.data;
        } else if (name === 'core_npu') {
            title = 'NPU NEURAL ENGINE - AI / ML';
            desc = 'Handles vision networks, tensor matrix operations, and inference.';
            skills = data.skills.ai_ml;
        } else if (name === 'core_cu') {
            title = 'CU CORE - LANGUAGES & WEB DEV';
            desc = 'Coordinates execution stacks, API structures, and servers.';
            skills = data.skills.web;
        } else {
            title = 'I/O CORE - HARDWARE & IoT';
            desc = 'Interfaces board signals with physical hardware, sensors, and DOM.';
            skills = data.skills.hardware;
        }

        hudTooltip.innerHTML = `
            <div class="hud-system-status">[U1 CORE: ACTIVE]</div>
            <div class="hud-component-title">${title}</div>
            <div class="hud-core-desc">${desc}</div>
            <div class="hud-skills-title">Active Registers (Skills):</div>
            <ul class="hud-skills-items">
                ${skills.map(s => `<li>${s}</li>`).join('')}
            </ul>
        `;
    }
    // GPU Projects Cores
    else if (name.startsWith('proj_core_')) {
        const index = parseInt(name.split('_').pop()) - 1;
        const proj = data.projects[index];
        if (proj) {
            hudTooltip.innerHTML = `
                <div class="hud-system-status">[U2 CORE PROJECT 0${index + 1}: ONLINE]</div>
                <div class="hud-component-title">${proj.title}</div>
                <div class="hud-core-desc">${proj.description}</div>
                <div class="hud-skills-title">Project Stack / Tags:</div>
                <ul class="hud-skills-items">
                    ${proj.tags.map(t => `<li>${t}</li>`).join('')}
                </ul>
                <div style="margin-top: 12px; font-size: 11px;">
                    <a href="${proj.github}" target="_blank" style="color: #60a5fa; text-decoration: none;">&gt; VISIT GITHUB REPOSITORY</a>
                </div>
            `;
        }
    }
    // Crystal Oscillator Education
    else if (name.startsWith('edu_plate_')) {
        const idx = parseInt(name.split('_').pop()) - 1;
        const edu = data.education[idx];
        if (edu) {
            hudTooltip.innerHTML = `
                <div class="hud-system-status">[Y1 CRYSTAL NODE: SYNCHRONIZED]</div>
                <div class="hud-component-title">${edu.degree}</div>
                <div class="hud-core-desc">
                    <strong>Institution:</strong> ${edu.institution}<br>
                    <strong>Duration:</strong> ${edu.duration}
                </div>
                <div class="hud-skills-title">Result Score:</div>
                <div style="color: #00ff88; font-weight: bold;">${edu.grade}</div>
            `;
        }
    }
    // USB Experience Gold Contacts
    else if (name.startsWith('usb_contact_')) {
        const exp = data.experience[0]; // Beau Roi
        let topic, info;
        if (name === 'usb_contact_1') {
            topic = 'Role & Company';
            info = `${exp.role} @ <span style="color: #00ff88;">${exp.company}</span><br>Duration: ${exp.duration}<br>Location: ${exp.location}`;
        } else if (name === 'usb_contact_2') {
            topic = 'Project Work';
            info = `Backend API development using Python and Django. Integrated services and managed schemas.`;
        } else {
            topic = 'Collaboration & Debugging';
            info = `Participated in bug testing, feature implementation, and engineering scrum team discussions.`;
        }

        hudTooltip.innerHTML = `
            <div class="hud-system-status">[J1 PIN BUS: LOCKED]</div>
            <div class="hud-component-title">Experience Node</div>
            <div class="hud-core-desc">${info}</div>
            <div class="hud-skills-title">Data Category:</div>
            <div style="color: #ff8800; font-size: 11px;">${topic}</div>
        `;
    }
    // Heatsink Fins (Voltage Regulator VR1 Stack)
    else if (name.startsWith('vr_fin_')) {
        const finIdx = parseInt(name.split('_').pop()) - 1;
        const categories = ['languages', 'frameworks', 'ai_ml', 'tools', 'cloud'];
        const catName = categories[finIdx];
        const tags = data.stack[catName];

        hudTooltip.innerHTML = `
            <div class="hud-system-status">[VR1 HEATSINK FIN 0${finIdx + 1}: STABLE]</div>
            <div class="hud-component-title">${catName.toUpperCase()} REGISTER</div>
            <div class="hud-core-desc">Cooling stack for system software configurations.</div>
            <div class="hud-skills-title">Integrated Tools:</div>
            <ul class="hud-skills-items">
                ${tags.map(t => `<li>${t}</li>`).join('')}
            </ul>
        `;
    }
    // Antenna Contact
    else if (name === 'ant_receiver') {
        hudTooltip.innerHTML = `
            <div class="hud-system-status">[ANT1 BROADCASTER ACTIVE]</div>
            <div class="hud-component-title">Contact Channels</div>
            <div class="hud-core-desc" style="font-size: 11px; line-height: 1.6;">
                <strong>Email:</strong> ${data.personalInfo.email}<br>
                <strong>Phone:</strong> ${data.personalInfo.phone}<br>
                <strong>Location:</strong> ${data.personalInfo.location}<br>
                <strong>Status:</strong> Open to Collaborations
            </div>
            <div class="hud-skills-title">Transmission Paths:</div>
            <div style="font-size: 11px; margin-top: 5px;">
                <a href="${data.personalInfo.socials.github}" target="_blank" style="color: #60a5fa; text-decoration: none;">GitHub</a> | 
                <a href="${data.personalInfo.socials.linkedin}" target="_blank" style="color: #60a5fa; text-decoration: none;">LinkedIn</a>
            </div>
        `;
    }
}

// Show helper instruction when zoomed into a component but nothing is hovered
export function renderZoomedDefaultHUD() {
    if (!hudTooltip) return;

    hudTooltip.style.opacity = '1';
    hudTooltip.style.transform = 'translateY(0)';

    let title = 'MICROARCHITECTURE CORE';
    let label = 'Hover over silicon core blocks or pins to analyze architecture.';

    if (activeComponentRef === 'U1') {
        title = 'U1 CPU REGISTER INSPECT';
        label = 'Hover over CPU core blocks (ALU, NPU, Control Unit, I/O Core) to explore skills registers.';
    } else if (activeComponentRef === 'U2') {
        title = 'U2 GPU PROJECTS CORES';
        label = 'Hover over the 6 execution units of the GPU to inspect project codebases.';
    } else if (activeComponentRef === 'Y1') {
        title = 'Y1 CRYSTAL TIMELINE';
        label = 'Hover over quartz timing plates to trace education frequencies.';
    } else if (activeComponentRef === 'ANT1') {
        title = 'ANT1 ANTENNA CHIP';
        label = 'Hover over transceiver core to display broadcast links.';
    } else if (activeComponentRef === 'J1') {
        title = 'J1 USB BUS PINS';
        label = 'Hover over metal contact connections to list intern role details.';
    } else if (activeComponentRef === 'VR1') {
        title = 'VR1 REGULATOR STACK';
        label = 'Hover over metal regulator fins to filter engineering stack utilities.';
    }

    hudTooltip.innerHTML = `
        <div class="hud-system-status">[DIAGNOSTICS ONLINE]</div>
        <div class="hud-component-title">${title}</div>
        <div style="font-size: 11px; margin-top: 6px; color: #94a3b8; line-height: 1.4;">
            ${label}
        </div>
    `;
}

// Render dynamic HUD details for top-level PCB hovers (bottom right terminal)
function renderComponentHUD(name) {
    if (!hudTooltip) return;

    hudTooltip.style.opacity = '1';
    hudTooltip.style.transform = 'translateY(0)';

    let content = '';
    if (name === 'U1') {
        content = `
            <div class="hud-title">// DEVICE: U1 MAIN PROCESSOR (MCU)</div>
            <div class="hud-row"><span class="hud-lbl">SYS REG :</span> ECE_MCU_v2.0</div>
            <div class="hud-row"><span class="hud-lbl">SECTION :</span> ABOUT ME & GENERAL SKILLS</div>
            <div class="hud-row"><span class="hud-lbl">SIGNAL  :</span> 97.4% (ACTIVE)</div>
            <div class="hud-action">&gt;&gt; CLICK COMPONENT TO EXPLORE SILICON CORES...</div>
        `;
    } else if (name === 'U2') {
        content = `
            <div class="hud-title">// DEVICE: U2 GRAPHICS CO-PROCESSOR</div>
            <div class="hud-row"><span class="hud-lbl">SYS REG :</span> GPU_CORE_v1.0</div>
            <div class="hud-row"><span class="hud-lbl">SECTION :</span> PROJECTS REGISTRY</div>
            <div class="hud-row"><span class="hud-lbl">PIPELINE:</span> OPTIMIZED PARALLEL</div>
            <div class="hud-action">&gt;&gt; CLICK COMPONENT TO INSPECT COMPILED WORK...</div>
        `;
    } else if (name === 'Y1') {
        content = `
            <div class="hud-title">// DEVICE: Y1 SYSTEM CLOCK GENERATOR</div>
            <div class="hud-row"><span class="hud-lbl">SYS REG :</span> CLK_OSC_27.000MHz</div>
            <div class="hud-row"><span class="hud-lbl">SECTION :</span> EDUCATION CHRONOLOGY</div>
            <div class="hud-row"><span class="hud-lbl">ACCURACY:</span> +- 5 PPM (HIGH)</div>
            <div class="hud-action">&gt;&gt; CLICK COMPONENT TO VIEW TIMED MILESTONES...</div>
        `;
    } else if (name === 'ANT1') {
        content = `
            <div class="hud-title">// DEVICE: ANT1 TRANSCEIVER ANTENNA</div>
            <div class="hud-row"><span class="hud-lbl">SYS REG :</span> RF_ANT_TRANSCEIVER</div>
            <div class="hud-row"><span class="hud-lbl">SECTION :</span> CONTACTS & GATEWAY</div>
            <div class="hud-row"><span class="hud-lbl">LINK    :</span> ESTABLISHED (100% QUALITY)</div>
            <div class="hud-action">&gt;&gt; CLICK COMPONENT TO ROUTE CHANNELS...</div>
        `;
    } else if (name === 'J1') {
        content = `
            <div class="hud-title">// DEVICE: J1 USB-C SYSTEM BUS</div>
            <div class="hud-row"><span class="hud-lbl">SYS REG :</span> USB_PD_CONTROL</div>
            <div class="hud-row"><span class="hud-lbl">SECTION :</span> INTERNSHIPS & WORK LOGS</div>
            <div class="hud-row"><span class="hud-lbl">SPEED   :</span> 10 GBPS (USB 3.1)</div>
            <div class="hud-action">&gt;&gt; CLICK COMPONENT TO FETCH SYSTEM LOGS...</div>
        `;
    } else if (name === 'VR1') {
        content = `
            <div class="hud-title">// DEVICE: VR1 VOLTAGE REGULATOR</div>
            <div class="hud-row"><span class="hud-lbl">SYS REG :</span> BUCK_BOOST_1.8V_3.3V</div>
            <div class="hud-row"><span class="hud-lbl">SECTION :</span> TOOLS & LANGUAGES STACK</div>
            <div class="hud-row"><span class="hud-lbl">TEMP    :</span> 38.6 C (STABLE)</div>
            <div class="hud-action">&gt;&gt; CLICK COMPONENT TO SOLVE THERMALS...</div>
        `;
    } else if (name === 'D1-D7') {
        content = `
            <div class="hud-title">// DEVICE: LED ARRAY D1-D7</div>
            <div class="hud-row"><span class="hud-lbl">SYS REG :</span> LED_BAR_INDICATOR</div>
            <div class="hud-row"><span class="hud-lbl">SECTION :</span> VALIDATED CERTIFICATIONS</div>
            <div class="hud-row"><span class="hud-lbl">BUS     :</span> SPI CONTROLLED</div>
            <div class="hud-action">&gt;&gt; CLICK COMPONENT TO BLINK STATUS REGISTERS...</div>
        `;
    } else if (name === 'RN1') {
        content = `
            <div class="hud-title">// DEVICE: RN1 RESISTOR NETWORK</div>
            <div class="hud-row"><span class="hud-lbl">SYS REG :</span> PULL_UP_RES_10K</div>
            <div class="hud-row"><span class="hud-lbl">SECTION :</span> LANGUAGES BUS</div>
            <div class="hud-row"><span class="hud-lbl">STAT    :</span> PULL-UPS ENERGISED</div>
            <div class="hud-action">&gt;&gt; STABLE INTERCONNECTION REFERENCE</div>
        `;
    } else if (name.startsWith('TP')) {
        content = `
            <div class="hud-title">// DEVICE: ${name} TEST PAD</div>
            <div class="hud-row"><span class="hud-lbl">SYS REG :</span> DIAGNOSTIC_PAD</div>
            <div class="hud-row"><span class="hud-lbl">VOLTAGE :</span> ${name === 'TP1' ? '5.01 V' : '0.00 V'}</div>
            <div class="hud-action">&gt;&gt; STABILIZED TEST VOLTAGE LEVEL</div>
        `;
    }

    hudTooltip.innerHTML = content;
}

// Global action to trigger components from the navigation bar
export function triggerComponentAction(ref) {
    if (!activeScene) return;
    const comp = activeScene.getObjectByName(ref);
    if (comp) {
        // Pulse component scale visually
        gsap.killTweensOf(comp.scale);
        gsap.fromTo(comp.scale, 
            { x: 1.0, y: 1.0, z: 1.0 },
            {
                x: 1.15, y: 1.15, z: 1.15,
                duration: 0.15,
                yoyo: true,
                repeat: 1,
                ease: 'power1.out',
                onComplete: () => {
                    comp.scale.set(1, 1, 1);
                }
            }
        );

        // Zoom to the target camera settings
        const config = ZOOM_CONFIG[ref];
        if (config) {
            viewState = 'ZOOMING_IN';
            activeComponentRef = ref;
            targetCamPos.copy(config.pos);
            targetLookAt.copy(config.look);
            toggleComponentShells(ref, false);
            if (hudTooltip) {
                hudTooltip.style.opacity = '0';
                hudTooltip.style.transform = 'translateY(10px)';
            }
            if (window.openSidePanel) {
                window.openSidePanel(ref);
            }
        }
    }
}
