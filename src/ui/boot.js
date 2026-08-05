import gsap from 'gsap';
import { boardGroup } from '../three/board.js';
import { cpuPins, ledMeshes, siliconDieMesh } from '../three/components.js';
import { particles } from '../three/particles.js';
import { traceData } from '../three/traces.js';
import { isLiteMode } from '../config.js';

export function runBootSequence(onCompleteCallback) {
    // Return visitors in the same tab skip the boot ceremony (sessionStorage
    // flag). Wrapped in try/catch — storage can throw in hardened privacy modes.
    let skipBoot = false;
    try {
        skipBoot = sessionStorage.getItem('psb-booted') === '1';
        sessionStorage.setItem('psb-booted', '1');
    } catch { /* storage unavailable — always run the full boot */ }

    const tl = gsap.timeline({
        onComplete: () => {
            if (onCompleteCallback) onCompleteCallback();
        }
    });

    const overlay = document.getElementById('boot-overlay');
    const scanline = document.getElementById('scanline');
    const hudBar = document.getElementById('hud-bar');
    const heroPanel = document.getElementById('panel-hero');
    const subtitleEl = document.getElementById('typewriter-subtitle');
    const badges = document.querySelectorAll('.stat-badge');
    const terminalStatus = document.getElementById('terminal-status-text');
    const canvasContainer = document.getElementById('canvas-container');

    // Skip animations for reduced-motion/small viewport (lite mode) OR a
    // return visit in this tab (skipBoot) — same instant "already on" state.
    const liteMode = isLiteMode();
    if (liteMode || skipBoot) {
        overlay.style.display = 'none';
        gsap.set(canvasContainer, { opacity: 1 });
        if (boardGroup) {
            gsap.set(boardGroup.position, { y: 0, z: 0 });
            gsap.set(boardGroup.rotation, { x: -Math.PI / 10, y: -Math.PI / 20 });
        }
        gsap.set(badges, { opacity: 1, y: 0 });
        if (hudBar) hudBar.classList.add('hud-ready');
        if (heroPanel) {
            if (skipBoot && !liteMode) {
                // Journey fast path: clear inline styles so the .panel-active
                // CSS toggle keeps ownership (see Critical Gotchas — inline
                // visibility would pin the hero panel over every section).
                gsap.set(heroPanel, { opacity: 1, visibility: 'visible', clearProps: 'opacity,visibility' });
            } else {
                gsap.set(heroPanel, { opacity: 1, visibility: 'visible' });
            }
        }
        if (subtitleEl) subtitleEl.textContent = 'ECE + Data Science · Builds Real, Working Projects';
        particles.forEach(p => { p.mesh.visible = true; });
        const underline = document.querySelector('.header-underline');
        if (underline) gsap.set(underline, { width: '280px' });
        if (onCompleteCallback) onCompleteCallback();
        return;
    }

    // Make sure elements start in hidden states for sequence
    gsap.set(overlay, { opacity: 1 });
    if (hudBar) gsap.set(hudBar, { opacity: 0, pointerEvents: 'none' });
    if (heroPanel) gsap.set(heroPanel, { opacity: 0, visibility: 'hidden' });
    gsap.set(badges, { opacity: 0, y: 10 });
    gsap.set(canvasContainer, { opacity: 0 });
    if (boardGroup) {
        gsap.set(boardGroup.position, { y: -15, z: -5 });
        gsap.set(boardGroup.rotation, { x: 0, y: 0 });
    }

    // Step 2 (0.3s): Horizontal scanline sweep top to bottom
    // Tween the transform (y) instead of `top` — layout properties stutter
    // on slow eases and force reflow per frame (GSAP transform-alias rule).
    // The sweep distance is the overlay's full height, measured once at setup.
    const scanlineTravel = overlay ? overlay.clientHeight : window.innerHeight;
    tl.to(scanline, {
        y: scanlineTravel,
        duration: 0.85,
        ease: 'power1.inOut',
        delay: 0.3
    });

    // Step 2b: Terminal-type boot messages with typewriter effect (runs in parallel)
    const bootTerminal = document.querySelector('.boot-terminal-log');
    let savedStatusEl = null;
    tl.add(() => {
        if (bootTerminal) {
            // Save status element before clearing
            savedStatusEl = document.getElementById('terminal-status-text');
            bootTerminal.innerHTML = '';
            // Type the boot lines first (they'll appear in order)
            typeTerminalLine(bootTerminal, '> INITIALIZING PARAMA-DEV-BOARD...', 30, () => {
                typeTerminalLine(bootTerminal, '> LOADING GEOMETRY...', 30, () => {
                    typeTerminalLine(bootTerminal, '> ALL PCB SYSTEMS OPERATIONAL', 30, () => {
                        // All lines done — now append status at the BOTTOM
                        if (savedStatusEl) {
                            bootTerminal.appendChild(savedStatusEl);
                        } else {
                            const newStatus = document.createElement('div');
                            newStatus.className = 'terminal-status';
                            newStatus.id = 'terminal-status-text';
                            newStatus.textContent = '// LOADING BOARD ASSETS...';
                            bootTerminal.appendChild(newStatus);
                            savedStatusEl = newStatus;
                        }
                    });
                });
            });
        }
    }, '+=0.1');

    // Step 3 (0.6s): HUD bar fades in — only add hud-ready here once during boot
    if (hudBar) {
        hudBar.classList.add('hud-ready');
        tl.to(hudBar, { opacity: 1, duration: 0.4 }, '+=0.5');
    }

    // Hero panel reveals
    if (heroPanel) {
        // Set, then immediately clear inline styles: without clearProps the inline
        // opacity/visibility would permanently override the .panel-active CSS toggle
        // in journey.js, leaving the hero panel stuck on top of every other section.
        tl.set(heroPanel, { opacity: 1, visibility: 'visible', clearProps: 'opacity,visibility' }, '+=0.2');
    }

    // Typewriter effect for subtitle
    tl.add(() => {
        typewriterEffect(subtitleEl, "ECE + Data Science · Builds Real, Working Projects", 30);
    }, '+=0.3');

    // Fade in stat badges
    tl.to(badges, {
        opacity: 1,
        y: 0,
        stagger: 0.1,
        duration: 0.35,
        ease: 'back.out(1.7)'
    }, '+=0.15');

    // Step 4: PCB board fades in from below, floats up to position
    tl.to(canvasContainer, {
        opacity: 1,
        duration: 0.8
    }, '+=0.3');

    if (boardGroup) {
        tl.to(boardGroup.position, {
            y: 0,
            z: 0,
            duration: 1.2,
            ease: 'power2.out'
        }, '-=0.8');

        tl.to(boardGroup.rotation, {
            x: -Math.PI / 10,
            y: -Math.PI / 20,
            duration: 1.2,
            ease: 'power2.out'
        }, '-=1.2');

        const underline = document.querySelector('.header-underline');
        if (underline) {
            tl.to(underline, {
                width: '280px',
                duration: 1.0,
                ease: 'power2.out'
            }, '-=1.2');
        }
    }

    // Step 5 (1.8s): Traces light up one by one (left to right)
    tl.add(() => {
        updateTerminalText('// SYSTEM STATUS: ROUTING COPPER TRACES...');
        traceData.forEach((trace, index) => {
            // Flash traces using GSAP emissive controls
            trace.meshes.forEach(mesh => {
                gsap.fromTo(mesh.material, 
                    { emissiveIntensity: 0.05 },
                    { emissiveIntensity: 0.8, duration: 0.3, yoyo: true, repeat: 1, delay: index * 0.05 }
                );
            });
        });
    }, '+=0.2');

    // Step 6 (2.4s): CPU pins flash gold one by one (signal propagation)
    tl.add(() => {
        updateTerminalText('// SYSTEM STATUS: INITIALIZING MCU SIGNAL PATHS...');
        if (cpuPins.length > 0) {
            cpuPins.forEach((pin, idx) => {
                gsap.fromTo(pin.material,
                    { emissiveIntensity: 0.05 },
                    {
                        emissiveIntensity: 1.3,
                        duration: 0.08,
                        yoyo: true,
                        repeat: 1,
                        delay: idx * 0.015
                    }
                );
            });
        }
    }, '+=0.2');

    // Step 7 (3.0s): LEDs blink on sequentially
    tl.add(() => {
        updateTerminalText('// SYSTEM STATUS: REGISTERING LED DIAGNOSTIC CHANNELS...');
        ledMeshes.forEach((led, idx) => {
            gsap.to(led.material, {
                emissiveIntensity: 0.75,
                duration: 0.15,
                delay: idx * 0.1,
                yoyo: true,
                repeat: 3
            });
        });
    }, '+=0.2');

    // Step 8 (3.5s): Electricity particles begin flowing
    tl.add(() => {
        updateTerminalText('// SYSTEM STATUS: BOOTING CORES. ELECTRON CHANNELS ONLINE.');
        particles.forEach(p => {
            p.mesh.visible = true;
        });
        
        // Pulse CPU Silicon die grid (finite, 8 pulses then settle)
        if (siliconDieMesh) {
            gsap.to(siliconDieMesh.material, {
                opacity: 0.4,
                duration: 0.8,
                yoyo: true,
                repeat: 7,
                onComplete: () => {
                    // Settle at a steady glow after boot
                    if (siliconDieMesh) siliconDieMesh.material.opacity = 0.65;
                }
            });
        }
    }, '+=0.3');

    // Step 9 (4.0s): Small text bottom: "// ALL SYSTEMS OPERATIONAL"
    tl.add(() => {
        updateTerminalText('// ALL SYSTEMS OPERATIONAL - RECENT TELEMETRY SYNCED');
        if (terminalStatus) {
            terminalStatus.classList.add('system-operational-active');
        }
    }, '+=0.3');

    // Step 10 (4.2s): Boot overlay fades out, portfolio interactive
    tl.to(overlay, {
        opacity: 0,
        duration: 0.6,
        onComplete: () => {
            overlay.style.display = 'none';
        }
    }, '+=0.4');
}

// Utility to run typewriter text printing
function typewriterEffect(element, text, speed) {
    if (!element) return;
    element.innerHTML = '';
    let i = 0;
    
    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    type();
}

// Type a line into the terminal, then fire an optional callback
function typeTerminalLine(container, text, speed, onComplete) {
    if (!container) { if (onComplete) onComplete(); return; }
    const line = document.createElement('div');
    line.className = 'term-green';
    container.appendChild(line);
    let i = 0;
    function type() {
        if (i < text.length) {
            line.textContent = text.substring(0, i + 1);
            i++;
            setTimeout(type, speed);
        } else {
            // Brief pause then fire callback
            setTimeout(() => { if (onComplete) onComplete(); }, speed * 5);
        }
    }
    type();
}

// Update terminal diagnostic text
function updateTerminalText(msg) {
    const textEl = document.getElementById('terminal-status-text');
    if (textEl) {
        textEl.innerText = msg;
    }
}
