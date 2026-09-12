// @ts-check
import * as THREE from 'three';
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
const CPS = 60; // crisp typewriter chars/second

/**
 * Boot terminal lines. Plain strings type uniformly (one char per tick).
 * @typedef {{ text: string, sequence?: Array<{ t: number, text: string }>, total?: number }} BootLine
 */
const BOOT_LINES = /** @type {Array<string | BootLine>} */ ([
  {
    text: '> INITIALIZING PARAMA-DEV-BOARD...',
    total: 0.7,
    sequence: [
      { t: 0.0, text: '' },
      { t: 0.15, text: '> INI' },
      { t: 0.25, text: '> INITI' },
      { t: 0.38, text: '> INITILIZING' },
      { t: 0.52, text: '> INITI' },
      { t: 0.65, text: '> INITIALIZING PARAMA-DEV-BOARD...' }
    ]
  },
  '> LOADING GEOMETRY...',
  '> ALL PCB SYSTEMS OPERATIONAL'
]);
const SCHEDULE = {
  scanline: 0.1,      // scanline sweep (0.55s)
  terminal: 0.25,     // boot terminal typing starts (parallel track)
  hud: 0.5,           // HUD bar fade (0.3s)
  canvas: 0.65,       // canvas fade (0.5s)
  board: 0.65,        // board float-up (0.8s) + underline draw (0.7s)
  heroPanel: 0.95,    // hero panel reveal
  subtitle: 1.05,     // subtitle typewriter (1.0s)
  traces: 1.25,       // copper traces light up
  badges: 1.35,       // stat badges pop in
  pins: 1.55,         // CPU pins flash gold
  leds: 1.75,         // LED diagnostics blink
  cores: 1.95,        // particles online + silicon die pulse
  statusFinal: 2.15,  // "ALL SYSTEMS OPERATIONAL"
  overlayFade: 2.35   // overlay fades out (0.45s) — boot ends ~2.80s
};

/** @param {() => void} [onCompleteCallback] */
export function runBootSequence(onCompleteCallback) {
    // ?og=1 = social-share capture mode (headless screenshots): take the same
    // instant path as a return visit so the ~6.8s boot timeline never delays
    // (and at software-rendered FPS never blocks) a capture.
    const isOgCapture = new URLSearchParams(window.location.search).get('og') === '1';

    // Return visitors skip the boot ceremony (localStorage/sessionStorage
    // flag). Wrapped in try/catch — storage can throw in hardened privacy modes.
    let skipBoot = false;
    try {
        skipBoot = isOgCapture || localStorage.getItem('psb-booted') === '1' || sessionStorage.getItem('psb-booted') === '1';
        localStorage.setItem('psb-booted', '1');
        sessionStorage.setItem('psb-booted', '1');
    } catch { /* storage unavailable — always run the full boot */ }

    const overlay = document.getElementById('boot-overlay');
    const scanline = document.getElementById('scanline');
    const hudBar = document.getElementById('hud-bar');
    const heroPanel = document.getElementById('panel-hero');
    const subtitleEl = document.getElementById('typewriter-subtitle');
    const badges = document.querySelectorAll('.stat-badge');
    const terminalStatus = document.getElementById('terminal-status-text');
    const canvasContainer = document.getElementById('canvas-container');

    const tl = gsap.timeline({
        onComplete: () => {
            if (overlay) overlay.style.display = 'none';
            if (onCompleteCallback) onCompleteCallback();
        }
    });

    // Instant [ESC] or Skip button click affordance
    const fastForwardBoot = () => {
        try {
            localStorage.setItem('psb-booted', '1');
            sessionStorage.setItem('psb-booted', '1');
        } catch {}
        tl.progress(1);
    };
    const skipBtn = document.getElementById('boot-skip-btn');
    if (skipBtn) {
        skipBtn.addEventListener('click', fastForwardBoot, { once: true });
    }
    const onBootKeydown = (/** @type {KeyboardEvent} */ e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            window.removeEventListener('keydown', onBootKeydown);
            fastForwardBoot();
        }
    };
    window.addEventListener('keydown', onBootKeydown);
    tl.eventCallback('onComplete', () => {
        window.removeEventListener('keydown', onBootKeydown);
        if (overlay) overlay.style.display = 'none';
        if (onCompleteCallback) onCompleteCallback();
    });

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
        if (underline) gsap.set(underline, { scaleX: 1 });
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
        gsap.set(boardGroup.position, { y: -8, z: -3 });
        gsap.set(boardGroup.rotation, { x: 0, y: 0 });
    }

    // Step 2 (0.3s): Horizontal scanline sweep top to bottom
    // Tween the transform (y) instead of `top` — layout properties stutter
    // on slow eases and force reflow per frame (GSAP transform-alias rule).
    // The sweep distance is the overlay's full height, measured once at setup.
    const scanlineTravel = overlay ? overlay.clientHeight : window.innerHeight;
    tl.to(scanline, {
        y: scanlineTravel,
        duration: 0.55,
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
        BOOT_LINES.forEach((entry) => {
            const isSequenced = typeof entry !== 'string';
            const text = isSequenced ? entry.text : entry;
            const lineEl = document.createElement('div');
            lineEl.className = 'term-green';
            bootTerminal.appendChild(lineEl);

            if (isSequenced && entry.sequence) {
                // Discrete-text-sequence: one driver tween, onUpdate
                // reverse-searches the sparse {t, text} schedule (same pattern
                // as the subtitle) — typo → backspace → corrected paste.
                const seq = entry.sequence;
                const total = entry.total || text.length / CPS;
                const driver = { t: 0 };
                /** @param {number} time */
                const textAt = (time) => {
                    for (let i = seq.length - 1; i >= 0; i--) {
                        if (time >= seq[i].t) return seq[i].text;
                    }
                    return '';
                };
                tl.to(driver, {
                    t: total,
                    duration: total,
                    ease: 'none',
                    onUpdate: () => {
                        if (lineEl) lineEl.textContent = textAt(driver.t);
                    }
                }, typePos);
                // Final-state safety: whatever the reverse search renders, the
                // last schedule entry is the corrected full line — snap it exact.
                tl.call(() => {
                    if (lineEl) lineEl.textContent = text;
                }, [], typePos + total);
                typePos += total + 0.15;
            } else {
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
            }
        });
        tl.call(() => {
            if (bootTerminal && savedStatusEl) bootTerminal.appendChild(savedStatusEl);
        }, [], typePos);
    }

    // Step 3: HUD bar fades in
    if (hudBar) {
        hudBar.classList.add('hud-ready');
        tl.to(hudBar, { opacity: 1, duration: 0.3 }, SCHEDULE.hud);
    }

    // Hero panel reveals
    if (heroPanel) {
        // Set, then immediately clear inline styles: without clearProps the inline
        // opacity/visibility would permanently override the .panel-active CSS toggle
        // in journey.js, leaving the hero panel stuck on top of every other section.
        tl.set(heroPanel, { opacity: 1, visibility: 'visible', clearProps: 'opacity,visibility' }, SCHEDULE.heroPanel);
    }

    // Subtitle — humanized typing via a discrete text sequence
    // (discrete-text-sequence rule): keystroke clusters → a typo → backspaces
    // peeling back to the fork → a corrected bulk paste. The display is a
    // pure function of timeline time — one driver tween at ease:'none', and
    // onUpdate reverse-searches the sparse {t, text} schedule. No per-char
    // easing, no timers — identical on every run.
    if (subtitleEl) {
        const FINAL_TEXT = 'ECE + Data Science · Builds Real, Working Projects';
        /** @type {Array<{ t: number, text: string }>} */
        const SEQUENCE = [
            { t: 0.0, text: '' },
            { t: 0.15, text: 'ECE' },
            { t: 0.3, text: 'ECE + Data' },
            { t: 0.45, text: 'ECE + Data Sience' },
            { t: 0.6, text: 'ECE + Data S' },
            { t: 0.75, text: 'ECE + Data Science' },
            { t: 0.9, text: 'ECE + Data Science · Builds Real, Working Projects' }
        ];
        const TOTAL = 1.0;
        const driver = { t: 0 };
        /** @param {number} time */
        const textAt = (time) => {
            for (let i = SEQUENCE.length - 1; i >= 0; i--) {
                if (time >= SEQUENCE[i].t) return SEQUENCE[i].text;
            }
            return '';
        };
        tl.to(driver, {
            t: TOTAL,
            duration: TOTAL,
            ease: 'none',
            onUpdate: () => { subtitleEl.textContent = textAt(driver.t); }
        }, SCHEDULE.subtitle);
        tl.call(() => {
            if (subtitleEl) subtitleEl.textContent = FINAL_TEXT;
        }, [], SCHEDULE.subtitle + TOTAL);
    }

    // Fade in stat badges
    tl.to(badges, {
        opacity: 1,
        y: 0,
        stagger: 0.05,
        duration: 0.25,
        ease: 'back.out(1.7)'
    }, SCHEDULE.badges);

    const BADGE_COUNT_SEC = 0.6;
    Array.from(badges).forEach((badge, i) => {
        const valEl = badge.querySelector('.badge-val');
        if (!valEl) return;
        const match = /^(\d+(?:\.\d+)?)(.*)$/.exec(valEl.textContent || '');
        if (!match) return;
        const target = parseFloat(match[1]);
        if (!(target > 0)) return;
        const suffix = match[2];
        const decimals = (match[1].split('.')[1] || '').length;
        const proxy = { n: 0 };
        const at = SCHEDULE.badges + i * 0.05;
        tl.to(proxy, {
            n: target,
            duration: BADGE_COUNT_SEC,
            ease: 'power2.out',
            onUpdate: () => {
                if (valEl) valEl.textContent = proxy.n.toFixed(decimals) + suffix;
                const linear = Math.min(1, Math.max(0, (tl.time() - at) / BADGE_COUNT_SEC));
                gsap.set(badge, { scale: 1 + 0.04 * (proxy.n / target) * (1 - linear) });
            }
        }, at);
    });

    // Step 4: PCB board fades in from below, floats up to position
    tl.to(canvasContainer, {
        opacity: 1,
        duration: 0.5
    }, SCHEDULE.canvas);

    if (boardGroup) {
        tl.to(boardGroup.position, {
            y: 0,
            z: 0,
            duration: 0.8,
            ease: 'power2.out'
        }, SCHEDULE.board);

        tl.to(boardGroup.rotation, {
            x: -Math.PI / 10,
            y: -Math.PI / 20,
            duration: 0.8,
            ease: 'power2.out'
        }, SCHEDULE.board);

        const underline = document.querySelector('.header-underline');
        if (underline) {
            tl.to(underline, {
                scaleX: 1,
                duration: 0.7,
                ease: 'power2.out'
            }, SCHEDULE.board);
        }
    }

    // Gradient sweep through the hero name (gradient-text-sweep rule, Form A
    // one-shot): the .headline-twin is a background-clip:text layer masked into
    // the same glyphs. Tweening backgroundPosition 100%→0% slides the
    // gold→green highlight left→right THROUGH the letterforms (percent axis
    // inverted — 100%→0% is left→right travel). ease:'none' — an eased sweep
    // reads as an object, not light. One-shot, then the twin fades back to
    // opacity 0 and the solid silkscreen h1 owns the rest state.
    const headlineTwin = document.querySelector('.headline-twin');
    if (headlineTwin) {
        tl.set(headlineTwin, { opacity: 1 }, SCHEDULE.board + 0.05);
        tl.fromTo(headlineTwin,
            { backgroundPosition: '100% 50%' },
            { backgroundPosition: '0% 50%', duration: 1.0, ease: 'none' },
            SCHEDULE.board + 0.05
        );
        tl.to(headlineTwin, {
            opacity: 0,
            duration: 0.3,
            ease: 'power1.out'
        }, SCHEDULE.board + 1.05);
    }

    // Step 5: Traces light up
    tl.call(() => updateTerminalText('// SYSTEM STATUS: ROUTING COPPER TRACES...'), [], SCHEDULE.traces);
    traceData.forEach((trace, index) => {
        trace.meshes.forEach(mesh => {
            tl.fromTo(mesh.material,
                { emissiveIntensity: 0.05 },
                { emissiveIntensity: 0.8, duration: 0.2, yoyo: true, repeat: 1 },
                SCHEDULE.traces + index * 0.02
            );
        });
    });

    // Step 6: CPU pins flash gold
    tl.call(() => updateTerminalText('// SYSTEM STATUS: INITIALIZING MCU SIGNAL PATHS...'), [], SCHEDULE.pins);
    if (cpuPins.length > 0) {
        cpuPins.forEach((pin, idx) => {
            tl.fromTo(pin.material,
                { emissiveIntensity: 0.05 },
                {
                    emissiveIntensity: 1.3,
                    duration: 0.05,
                    yoyo: true,
                    repeat: 1
                },
                SCHEDULE.pins + idx * 0.01
            );
        });
    }

    // Step 7: LEDs blink on sequentially
    tl.call(() => updateTerminalText('// SYSTEM STATUS: REGISTERING LED DIAGNOSTIC CHANNELS...'), [], SCHEDULE.leds);
    ledMeshes.forEach((led, idx) => {
        tl.to(led.material, {
            emissiveIntensity: 0.75,
            duration: 0.1,
            yoyo: true,
            repeat: 2
        }, SCHEDULE.leds + idx * 0.05);
    });

    // Step 8: Electricity particles begin flowing
    tl.call(() => {
        updateTerminalText('// SYSTEM STATUS: BOOTING CORES. ELECTRON CHANNELS ONLINE.');
        particles.forEach(p => {
            p.mesh.visible = true;
        });
    }, [], SCHEDULE.cores);

    if (siliconDieMesh) {
        gsap.to(siliconDieMesh.material, {
            opacity: 0.4,
            duration: 0.4,
            yoyo: true,
            repeat: 3,
            delay: SCHEDULE.cores,
            onComplete: () => {
                if (siliconDieMesh && siliconDieMesh.material instanceof THREE.MeshBasicMaterial) {
                    siliconDieMesh.material.opacity = 0.65;
                }
            }
        });
    }

    // Step 9: Small text bottom: "// ALL SYSTEMS OPERATIONAL"
    tl.call(() => {
        updateTerminalText('// ALL SYSTEMS OPERATIONAL - RECENT TELEMETRY SYNCED');
        if (terminalStatus) {
            terminalStatus.classList.add('system-operational-active');
        }
    }, [], SCHEDULE.statusFinal);

    // Step 10: Boot overlay fades out, portfolio interactive (~2.8s total)
    tl.to(overlay, {
        opacity: 0,
        duration: 0.45,
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
