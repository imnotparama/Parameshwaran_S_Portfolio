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
const CPS = 33.3; // typewriter chars/second (matches the original 30ms/char feel)

/**
 * Boot terminal lines. Plain strings type uniformly (one char per tick).
 * An entry with a `sequence` uses the discrete-text-sequence pattern — a
 * sparse {t, text} schedule (keystroke clusters → typo → backspace to the
 * fork → corrected bulk paste) so that line reads as typed by a human,
 * identical on every run. The driver tween is ease:'none' — a pure function
 * of timeline time, no timers, seek-safe.
 * @typedef {{ text: string, sequence?: Array<{ t: number, text: string }>, total?: number }} BootLine
 */
const BOOT_LINES = /** @type {Array<string | BootLine>} */ ([
  {
    text: '> INITIALIZING PARAMA-DEV-BOARD...',
    total: 1.4,
    // deterministic typo + backspace correction: 'INITILIZING' drops the 'A',
    // backspaces to the fork ('> INITI'), then pastes the corrected line.
    sequence: [
      { t: 0.0, text: '' },
      { t: 0.3, text: '> INI' },
      { t: 0.5, text: '> INITI' },
      { t: 0.75, text: '> INITILIZING' },                       // typo — dropped 'A' in INITIALIZING
      { t: 1.05, text: '> INITI' },                             // backspace to the fork
      { t: 1.25, text: '> INITIALIZING PARAMA-DEV-BOARD...' }   // corrected bulk paste
    ]
  },
  '> LOADING GEOMETRY...',
  '> ALL PCB SYSTEMS OPERATIONAL'
]);
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
            { t: 0.35, text: 'ECE' },
            { t: 0.55, text: 'ECE +' },
            { t: 0.75, text: 'ECE + Data' },
            { t: 0.95, text: 'ECE + Data Sience' },          // typo — dropped 'c'
            { t: 1.25, text: 'ECE + Data S' },               // backspace to the fork
            { t: 1.45, text: 'ECE + Data Science' },         // corrected bulk paste
            { t: 1.75, text: 'ECE + Data Science ·' },
            { t: 2.05, text: 'ECE + Data Science · Builds Real, Working Projects' }
        ];
        const TOTAL = 2.15;
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
        // Final-state safety: whatever the reverse search renders, the last
        // schedule entry is the full corrected phrase — the text ends exact.
        tl.call(() => {
            if (subtitleEl) subtitleEl.textContent = FINAL_TEXT;
        }, [], SCHEDULE.subtitle + TOTAL);
    }

    // Fade in stat badges
    tl.to(badges, {
        opacity: 1,
        y: 0,
        stagger: 0.1,
        duration: 0.35,
        ease: 'back.out(1.7)'
    }, SCHEDULE.badges);

    // Stat badge count-up (counting-dynamic-scale): the four hero readouts
    // count from 0 to their final value on the pop beat, and each badge
    // swells with its value (peak ~2-3% mid-count) before settling to rest
    // — the "instrument just reported" beat. One proxy tween per badge at
    // the SAME absolute position as the pop (matching its 0.1 stagger), so
    // the count is a pure function of timeline time: no timers, no random,
    // seek-safe both directions. Values ending in a suffix ("9.48/10")
    // keep it through the count; non-numeric values are left untouched.
    const BADGE_COUNT_SEC = 0.9;
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
        const at = SCHEDULE.badges + i * 0.1; // same stagger as the pop
        tl.to(proxy, {
            n: target,
            duration: BADGE_COUNT_SEC,
            ease: 'power2.out',
            onUpdate: () => {
                if (valEl) valEl.textContent = proxy.n.toFixed(decimals) + suffix;
                // Swell with the value, settle to exactly 1: the (1-linear)
                // term pulls the scale back to rest by the end, so the
                // badge's settled transform never drifts from CSS.
                const linear = Math.min(1, Math.max(0, (tl.time() - at) / BADGE_COUNT_SEC));
                gsap.set(badge, { scale: 1 + 0.06 * (proxy.n / target) * (1 - linear) });
            }
        }, at);
    });

    // Step 4: PCB board fades in from below, floats up to position
    tl.to(canvasContainer, {
        opacity: 1,
        duration: 0.8
    }, SCHEDULE.canvas);

    if (boardGroup) {
        // power3.out = the house entrance settle (easing doctrine) — the board
        // float-up is the hero entrance, so it gets the confident long-tail
        // landing, not the gentler power2 used for secondary motion.
        tl.to(boardGroup.position, {
            y: 0,
            z: 0,
            duration: 1.2,
            ease: 'power3.out'
        }, SCHEDULE.board);

        tl.to(boardGroup.rotation, {
            x: -Math.PI / 10,
            y: -Math.PI / 20,
            duration: 1.2,
            ease: 'power3.out'
        }, SCHEDULE.board);

        const underline = document.querySelector('.header-underline');
        if (underline) {
            // scaleX draw (transform-only) — the old width tween forced layout
            // every frame; CSS now owns the 280px width and starts at scaleX(0).
            tl.to(underline, {
                scaleX: 1,
                duration: 1.0,
                ease: 'power3.out'
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
            { backgroundPosition: '0% 50%', duration: 1.6, ease: 'none' },
            SCHEDULE.board + 0.1
        );
        tl.to(headlineTwin, {
            opacity: 0,
            duration: 0.4,
            ease: 'power1.out'
        }, SCHEDULE.board + 1.75);
    }

    // Step 5 (1.8s): Traces light up one by one (left to right)
    tl.call(() => updateTerminalText('// SYSTEM STATUS: ROUTING COPPER TRACES...'), [], SCHEDULE.traces);
    traceData.forEach((trace, index) => {
        // Flash traces using GSAP emissive controls — one timeline tween per
        // mesh at a stagger of 0.05s per trace, all finite (repeat: 1).
        trace.meshes.forEach(mesh => {
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
                // Settle at a steady glow after boot — the die material is a
                // MeshBasicMaterial (components.js), narrow to make the write safe.
                if (siliconDieMesh && siliconDieMesh.material instanceof THREE.MeshBasicMaterial) {
                    siliconDieMesh.material.opacity = 0.65;
                }
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
