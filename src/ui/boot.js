// @ts-check
import gsap from 'gsap';
import { boardGroup } from '../three/board.js';
import { cpuPins, ledMeshes, siliconDieMesh } from '../three/components.js';
import { particles } from '../three/particles.js';
import { traceData } from '../three/traces.js';
import { isLiteMode } from '../config.js';

// ─── Deterministic boot choreography ──────────────────────────
// One GSAP timeline, every tween at an ABSOLUTE position (seconds) — never
// relative += chaining — so the boot is a pure function of timeline time:
// identical on every run, seek-safe, immune to the wall-clock/frame desync
// that setTimeout-driven text caused under slow renderers (the OG-capture
// bug class). Text stepping uses proxy tweens with onUpdate textContent
// writes — no setTimeout anywhere in the sequence.
const CPS = 33.3; // typewriter chars/second (matches the original 30ms/char feel)
const BOOT_LINES = [
  '> INITIALIZING PARAMA-DEV-BOARD...',
  '> LOADING GEOMETRY...',
  '> ALL PCB SYSTEMS OPERATIONAL'
];
const SCHEDULE = {
  scanline: 0.3,      // scanline sweep (0.85s)
  terminal: 1.25,     // boot terminal typing starts (parallel track)
  hud: 1.75,          // HUD bar fade (0.4s)
  heroPanel: 2.35,    // hero panel reveal (tl.set + clearProps)
  subtitle: 2.65,     // subtitle typewriter
  badges: 2.8,        // stat badges pop in (stagger 0.1)
  canvas: 3.45,       // canvas fade (0.8s)
  board: 3.45,        // board float-up (1.2s) + underline draw (1.0s)
  traces: 4.85,       // copper traces light up
  pins: 5.05,         // CPU pins flash gold
  leds: 5.25,         // LED diagnostics blink
  cores: 5.55,        // particles online + silicon die pulse
  statusFinal: 5.85,  // "ALL SYSTEMS OPERATIONAL"
  overlayFade: 6.25   // overlay fades out (0.6s) — boot ends ~6.85s
};

/** @param {() => void} [onCompleteCallback] */
export function runBootSequence(onCompleteCallback) {
    // ?og=1 = social-share capture mode (headless screenshots): take the same
    // instant path as a return visit so the ~6.8s boot timeline never delays
    // (and at software-rendered FPS never blocks) a capture.
    const isOgCapture = new URLSearchParams(window.location.search).get('og') === '1';

    // Return visitors in the same tab skip the boot ceremony (sessionStorage
    // flag). Wrapped in try/catch — storage can throw in hardened privacy modes.
    let skipBoot = false;
    try {
        skipBoot = isOgCapture || sessionStorage.getItem('psb-booted') === '1';
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
        if (overlay) overlay.style.display = 'none';
        gsap.set(canvasContainer, { opacity: 1 });
        if (boardGroup) {
            gsap.set(boardGroup.position, { y: 0, z: 0 });
            gsap.set(boardGroup.rotation, { x: -Math.PI / 10, y: -Math.PI / 20 });
        }
        gsap.set(badges, { opacity: 1, y: 0 });
        if (hudBar) hudBar.classList.add('hud-ready');
        if (heroPanel) {
            if (isOgCapture) {
                // og=1 is a headless capture mode that never navigates — set
                // the panel inline because the .panel-active CSS transition
                // does not tick under software rendering (the panel would stay
                // invisible in the capture).
                gsap.set(heroPanel, { opacity: 1, visibility: 'visible' });
            } else if (skipBoot && !liteMode) {
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
        ease: 'power1.inOut'
    }, SCHEDULE.scanline);

    // Step 2b: Terminal-type boot messages — timeline-driven typewriter.
    // Each line is a proxy tween ({n: 0 → length}) whose onUpdate writes
    // textContent — deterministic and seek-safe, no setTimeout chains. The
    // live status register is detached at rebuild and re-appended once the
    // last line lands (tl.call at an absolute position).
    const bootTerminal = document.querySelector('.boot-terminal-log');
    let typePos = SCHEDULE.terminal;
    /** @type {HTMLElement | null} */
    let savedStatusEl = null;
    if (bootTerminal) {
        bootTerminal.innerHTML = '';
        savedStatusEl = terminalStatus;
        BOOT_LINES.forEach((text) => {
            const lineEl = document.createElement('div');
            lineEl.className = 'term-green';
            bootTerminal.appendChild(lineEl);
            const proxy = { n: 0 };
            tl.to(proxy, {
                n: text.length,
                duration: text.length / CPS,
                ease: 'none',
                onUpdate: () => {
                    if (lineEl) lineEl.textContent = text.slice(0, Math.round(proxy.n));
                }
            }, typePos);
            // Brief beat between lines, then the next line begins
            typePos += text.length / CPS + 0.15;
        });
        tl.call(() => {
            if (bootTerminal && savedStatusEl) bootTerminal.appendChild(savedStatusEl);
        }, [], typePos);
    }

    // Step 3 (0.6s): HUD bar fades in — only add hud-ready here once during boot
    if (hudBar) {
        hudBar.classList.add('hud-ready');
        tl.to(hudBar, { opacity: 1, duration: 0.4 }, SCHEDULE.hud);
    }

    // Hero panel reveals
    if (heroPanel) {
        // Set, then immediately clear inline styles: without clearProps the inline
        // opacity/visibility would permanently override the .panel-active CSS toggle
        // in journey.js, leaving the hero panel stuck on top of every other section.
        tl.set(heroPanel, { opacity: 1, visibility: 'visible', clearProps: 'opacity,visibility' }, SCHEDULE.heroPanel);
    }

    // Subtitle — timeline-driven typewriter (same proxy pattern)
    if (subtitleEl) {
        const text = 'ECE + Data Science · Builds Real, Working Projects';
        const proxy = { n: 0 };
        tl.to(proxy, {
            n: text.length,
            duration: text.length / CPS,
            ease: 'none',
            onUpdate: () => {
                subtitleEl.textContent = text.slice(0, Math.round(proxy.n));
            }
        }, SCHEDULE.subtitle);
    }

    // Fade in stat badges
    tl.to(badges, {
        opacity: 1,
        y: 0,
        stagger: 0.1,
        duration: 0.35,
        ease: 'back.out(1.7)'
    }, SCHEDULE.badges);

    // Step 4: PCB board fades in from below, floats up to position
    tl.to(canvasContainer, {
        opacity: 1,
        duration: 0.8
    }, SCHEDULE.canvas);

    if (boardGroup) {
        tl.to(boardGroup.position, {
            y: 0,
            z: 0,
            duration: 1.2,
            ease: 'power2.out'
        }, SCHEDULE.board);

        tl.to(boardGroup.rotation, {
            x: -Math.PI / 10,
            y: -Math.PI / 20,
            duration: 1.2,
            ease: 'power2.out'
        }, SCHEDULE.board);

        const underline = document.querySelector('.header-underline');
        if (underline) {
            tl.to(underline, {
                width: '280px',
                duration: 1.0,
                ease: 'power2.out'
            }, SCHEDULE.board);
        }
    }

    // Step 5 (1.8s): Traces light up one by one (left to right)
    tl.call(() => updateTerminalText('// SYSTEM STATUS: ROUTING COPPER TRACES...'), [], SCHEDULE.traces);
    traceData.forEach((trace, index) => {
        // Flash traces using GSAP emissive controls — one timeline tween per
        // mesh at a stagger of 0.05s per trace, all finite (repeat: 1).
        trace.meshes.forEach((/** @type {any} */ mesh) => {
            tl.fromTo(mesh.material,
                { emissiveIntensity: 0.05 },
                { emissiveIntensity: 0.8, duration: 0.3, yoyo: true, repeat: 1 },
                SCHEDULE.traces + index * 0.05
            );
        });
    });

    // Step 6 (2.4s): CPU pins flash gold one by one (signal propagation)
    tl.call(() => updateTerminalText('// SYSTEM STATUS: INITIALIZING MCU SIGNAL PATHS...'), [], SCHEDULE.pins);
    if (cpuPins.length > 0) {
        cpuPins.forEach((pin, idx) => {
            tl.fromTo(pin.material,
                { emissiveIntensity: 0.05 },
                {
                    emissiveIntensity: 1.3,
                    duration: 0.08,
                    yoyo: true,
                    repeat: 1
                },
                SCHEDULE.pins + idx * 0.015
            );
        });
    }

    // Step 7 (3.0s): LEDs blink on sequentially
    tl.call(() => updateTerminalText('// SYSTEM STATUS: REGISTERING LED DIAGNOSTIC CHANNELS...'), [], SCHEDULE.leds);
    ledMeshes.forEach((led, idx) => {
        tl.to(led.material, {
            emissiveIntensity: 0.75,
            duration: 0.15,
            yoyo: true,
            repeat: 3
        }, SCHEDULE.leds + idx * 0.1);
    });

    // Step 8 (3.5s): Electricity particles begin flowing
    tl.call(() => {
        updateTerminalText('// SYSTEM STATUS: BOOTING CORES. ELECTRON CHANNELS ONLINE.');
        particles.forEach(p => {
            p.mesh.visible = true;
        });
    }, [], SCHEDULE.cores);

    // Silicon die pulse — fixed-delay FINITE tween (repeat: 7), started at the
    // same beat but detached from the timeline so it can never stretch the boot
    // duration. Deterministic: fixed delay, fixed repeat count, fixed values.
    if (siliconDieMesh) {
        gsap.to(siliconDieMesh.material, {
            opacity: 0.4,
            duration: 0.8,
            yoyo: true,
            repeat: 7,
            delay: SCHEDULE.cores,
            onComplete: () => {
                // Settle at a steady glow after boot
                if (siliconDieMesh) siliconDieMesh.material.opacity = 0.65;
            }
        });
    }

    // Step 9 (4.0s): Small text bottom: "// ALL SYSTEMS OPERATIONAL"
    tl.call(() => {
        updateTerminalText('// ALL SYSTEMS OPERATIONAL - RECENT TELEMETRY SYNCED');
        if (terminalStatus) {
            terminalStatus.classList.add('system-operational-active');
        }
    }, [], SCHEDULE.statusFinal);

    // Step 10 (4.2s): Boot overlay fades out, portfolio interactive
    tl.to(overlay, {
        opacity: 0,
        duration: 0.6,
        onComplete: () => {
            if (overlay) overlay.style.display = 'none';
        }
    }, SCHEDULE.overlayFade);
}

// Update terminal diagnostic text
/** @param {string} msg */
function updateTerminalText(msg) {
    const textEl = document.getElementById('terminal-status-text');
    if (textEl) {
        textEl.innerText = msg;
    }
}
