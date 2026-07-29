import gsap from 'gsap';
import { boardGroup } from '../three/board.js';
import { cpuPins, ledMeshes, siliconDieMesh } from '../three/components.js';
import { particles } from '../three/particles.js';
import { traceData } from '../three/traces.js';
import { isLiteMode } from '../config.js';

export function runBootSequence(onCompleteCallback) {
    const tl = gsap.timeline({
        onComplete: () => {
            if (onCompleteCallback) onCompleteCallback();
        }
    });

    const overlay = document.getElementById('boot-overlay');
    const scanline = document.getElementById('scanline');
    const header = document.getElementById('main-header');
    const nameEl = document.getElementById('user-name');
    const subtitleEl = document.getElementById('typewriter-subtitle');
    const badges = document.querySelectorAll('.stat-badge');
    const terminalStatus = document.getElementById('terminal-status-text');
    const canvasContainer = document.getElementById('canvas-container');

    // If user prefers reduced motion or small viewport, skip animations
    if (isLiteMode()) {
        overlay.style.display = 'none';
        gsap.set(header, { opacity: 1 });
        gsap.set(canvasContainer, { opacity: 1 });
        if (boardGroup) {
            gsap.set(boardGroup.position, { y: 0, z: 0 });
            gsap.set(boardGroup.rotation, { x: -Math.PI / 10, y: -Math.PI / 20 });
        }
        gsap.set(badges, { opacity: 1, y: 0 });
        if (subtitleEl) subtitleEl.textContent = 'ECE + Data Science · Builds Real, Working Projects';
        particles.forEach(p => { p.mesh.visible = true; });
        const underline = document.querySelector('.header-underline');
        if (underline) gsap.set(underline, { width: '280px' });
        if (onCompleteCallback) onCompleteCallback();
        return;
    }

    // Make sure elements start in hidden states for sequence
    gsap.set(overlay, { opacity: 1 });
    gsap.set(header, { opacity: 0 });
    gsap.set(badges, { opacity: 0, y: 10 });
    gsap.set(canvasContainer, { opacity: 0 });
    if (boardGroup) {
        gsap.set(boardGroup.position, { y: -15, z: -5 });
        gsap.set(boardGroup.rotation, { x: 0, y: 0 });
    }

    // Step 2 (0.3s): Horizontal scanline sweep top to bottom
    tl.to(scanline, {
        top: '100%',
        duration: 0.85,
        ease: 'power1.inOut',
        delay: 0.3
    });

    // Step 3 (0.6s): Header and HUD bar fade in
    tl.to(header, {
        opacity: 1,
        duration: 0.4,
        onStart: () => {
            const hudBar = document.getElementById('hud-bar');
            if (hudBar) hudBar.classList.add('hud-ready');
        }
    }, '+=0.1');

    // Typewriter effect for hero subtitle — from portfolio data
    tl.add(() => {
        typewriterEffect(subtitleEl, "ECE + Data Science · Builds Real, Working Projects", 35);
    }, '-=0.1');

    // Fade in stat badges
    tl.to(badges, {
        opacity: 1,
        y: 0,
        stagger: 0.1,
        duration: 0.35,
        ease: 'back.out(1.7)'
    }, '+=0.2');

    // Step 4 (1.2s): PCB board fades in from below, floats up to position
    tl.to(canvasContainer, {
        opacity: 1,
        duration: 0.8
    }, '+=0.2');

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
        
        // Pulse CPU Silicon die grid
        if (siliconDieMesh) {
            gsap.to(siliconDieMesh.material, {
                opacity: 0.4,
                duration: 1.0,
                yoyo: true,
                repeat: -1
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

// Update terminal diagnostic text
function updateTerminalText(msg) {
    const textEl = document.getElementById('terminal-status-text');
    if (textEl) {
        textEl.innerText = msg;
    }
}
