import { detectWebGL, showFallbackUI, setupCleanup } from './src/ui/fallback.js';
import { initScene, scene, camera, renderer, enableBloom, syncCanvasSize } from './src/three/scene.js';
import { onTick, CRITICAL, STANDARD, DEFERRED } from './src/three/tick-scheduler.js';
import { createBoard, boardGroup, updateBoardParallax, updateBenchSweep, updateHoverShadow } from './src/three/board.js';
import { createComponents, updateLedArray, SWITCH_POS } from './src/three/components.js';
import { createTraces, updateTraceCurrent, updateTraceRipple, updateAmbientPulses } from './src/three/traces.js';
import { createParticles, updateParticles, updateAmbientDust, updateAmbientGoldFlecks } from './src/three/particles.js';
import { createProjectChips, updateProjectChips, projectChips } from './src/three/project-chips.js';
import { createLcd, updateLcdScreen, isLcdActive, getBestScore, setBestListener, getBoardFx } from './src/three/lcd.js';
import { updateRadarRing, pulseBuzzer } from './src/three/components.js';
import { runBootSequence } from './src/ui/boot.js';
import { initHover, checkHover, mouse, setBoardClickHandler, setBuzzerHandler, setSwitchHandler, setLcdHandler } from './src/utils/hover.js';
import { isSoundEnabled, toggleSound, switchClack, electricalHum, stopElectricalHum, powerUpBeep } from './src/utils/sound.js';
import { noteInteraction, updateIdleDrift, updateIdleSelfTest, selfTestPostLine, updateIdleHeartbeat } from './src/three/idle.js';
// The HUD scope's value line — the board's live readout. Cached once so the
// idle self-test's POST replay doesn't do a DOM lookup per frame.
let scopeValEl = null;
import { createProbe, updateProbe, pressProbeKey, releaseProbeKey, measureProbeTarget, isProbeModeActive, activateProbe, deactivateProbe } from './src/three/probe.js';
import { initPower, togglePower } from './src/three/power.js';
import { initCursor } from './src/ui/cursor.js';
import { initOscilloscope, updateOscilloscope } from './src/ui/oscilloscope.js';
import { initCommandPalette, openCommandPalette } from './src/ui/command-palette.js';
import { initTelemetry, toggleSysinfo, toggleDebug, showDevNotes, updateTelemetry } from './src/ui/telemetry.js';
import { initTeardown, toggleTeardown, isTeardownActive } from './src/three/teardown.js';
import { cycleTheme } from './src/three/potentiometer.js';
import { initOverclock, updateOverclock, toggleOverclock } from './src/three/overclock.js';
import { updateAudioPeak } from './src/utils/synth.js';
import { createRover } from './src/three/rover.js';
import { initPlaygroundProps } from './src/three/playground-props.js';
import { activateRover, deactivateRover, toggleRover, isRoverModeActive, handleRoverKeyDown, handleRoverKeyUp, updateRoverPhysics } from './src/three/rover-physics.js';
import { LINKEDIN_URL, GITHUB_URL, isLiteMode } from './src/config.js';
import { initLinkedInTracking } from './src/utils/analytics.js';
import { renderSections } from './src/ui/sections.js';
import { initJourney, scrollToSection, updateJourneyEffects, focusProject, exitFocusMode, getActiveSectionId, resizeJourney, isFocusMode, focusLcdCamera } from './src/scroll/journey.js';
import { SECTION_HASHES, hashToSectionId } from './src/utils/hash-nav.js';

// ─── Hash-based deep links ─────────────────────────────────
// Each section gets a shareable URL (#/about, #/projects, ...). Nav clicks
// pushState + scroll; back/forward fire hashchange/popstate and we scroll
// to match the hash — so every section is linkable and the back button works.
// The hash → section mapping lives in src/utils/hash-nav.js (pure, so the
// smoke suite can assert it); '#/lcd' is reserved for the LCD game below.

// True once the boot sequence completes and the scroll journey is live — the
// board's arrival tween owns its position until then, so levitation must not
// start earlier (an early write would yank the board mid-float-up). Set in
// the boot onComplete callback, passed to updateBoardParallax each tick.
let journeyLive = false;

let lastAppliedHash = null;
function applyHashNavigation() {
    // hashchange AND popstate both fire on back/forward — dedupe so the
    // scroll tween isn't restarted twice per history step.
    if (window.location.hash === lastAppliedHash) return;
    lastAppliedHash = window.location.hash;
    const raw = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
    if (raw === 'lcd') {
        // #/lcd — the LCD game deep link: focus the display and replay the
        // boot POST (no section scroll). If the game is already focused,
        // leave it running — a share-link re-entry must not toggle it off.
        if (!document.body.classList.contains('lcd-active')) focusLcdCamera(true);
        return;
    }
    const secId = hashToSectionId(window.location.hash);
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

// ─── Scroll-velocity drone (electricalHum) ─────────────────
// The board's power rail hums in proportion to scroll speed. Velocity is
// derived from scroll position over wall-clock time — an INPUT-rate metric
// (same hybrid-touch precedent as the hover-blip rate limiter), NOT scene
// state: the scene itself stays fully deterministic. Tracked in the same
// passive scroll handler as the signal-path readout (one listener, one
// coalesced write). The hum decays back to silence when scrolling stops
// (electricalHum ramps the gain — never cuts), gated on the SND toggle.
let lastScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
let lastScrollAt = typeof performance !== 'undefined' ? performance.now() : 0;
let humIdleTimer = 0;
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
    // Scroll velocity → electrical hum: px per second converted to the
    // drone's px-per-frame-at-60fps scale (0..~40), smoothed through the
    // WebAudio gain ramp. Scrolling fast swells the hum; idling hushes it.
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
    const dt = Math.max(1, now - lastScrollAt);
    const velocityPxPerSec = Math.abs(window.scrollY - lastScrollY) / (dt / 1000);
    lastScrollY = window.scrollY;
    lastScrollAt = now;
    electricalHum(velocityPxPerSec / 60); // px/frame @ 60fps
    clearTimeout(humIdleTimer);
    humIdleTimer = setTimeout(() => electricalHum(0), 250);
    if (progressRaf === null) progressRaf = requestAnimationFrame(updateSigPath);
}

// ─── Keyboard section navigation (number keys 1–6) ───────
// Section order matches the HUD nav buttons. Keys are ignored while typing
// in a field or when a modifier is held, so the page never hijacks input.
function handleSectionKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // LCD1's SIGNAL SNAKE owns all keys while its game is focused.
    if (document.body.classList.contains('lcd-active')) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement && document.activeElement.isContentEditable) return;
    const idx = parseInt(e.key, 10) - 1;
    if (idx >= 0 && idx < SECTION_KEYS.length) {
        e.preventDefault();
        navigateToSection(SECTION_KEYS[idx]);
        // Membrane-switch clack on a successful keyboard section jump — the
        // same mechanical feedback language as the night-bench relay, gated
        // on the master SND toggle inside sound.js.
        switchClack();
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
    // Initialize oscilloscope HUD + hidden telemetry overlays
    initOscilloscope();
    initTelemetry();

    // 4. Construct board SMD/IC components
    createComponents(boardGroup);

    // 5. Build trace routing pathways
    createTraces(boardGroup);

    // 6. Build electricity electron flows
    createParticles(boardGroup);

    // 6b. Build project chips on the board
    createProjectChips(boardGroup);

    // 6c. Flying scope probe (WASD) — the board's test probe, flyable over
    // 6c. Flying scope probe (WASD) — the board's test probe, flyable over
    // the components. Scroll stays the primary path; this is additive.
    createProbe(boardGroup);

    // 6c2. 3D Exploded Teardown initialization
    initTeardown(boardGroup);

    // 6c3. Turbo Overclock initialization
    initOverclock(boardGroup);

    // 6c4. 3D PCB Nano-Rover & Playground Props
    createRover(boardGroup);
    initPlaygroundProps(boardGroup);

    // 6d. LCD1 — the 2.4" display running SIGNAL RUNNER (boot POST at
    // rest; player-controlled once focused). Optional content, capped at
    // the third "extra" after the fly-probe and the night bench.
    createLcd(boardGroup);

    // 6e. Board record readout — the LCD's best score mirrors off the board
    // into the About spec table (REC row) and the Contact footer (SN · FW ·
    // BEST NN). The lcd module owns the value; main.js only mirrors it into
    // the DOM. Null-safe for the headless build (elements absent there).
    const aboutRecRow = () => document.getElementById('about-rec-row');
    const aboutRecVal = () => document.getElementById('about-rec-val');
    const contactBest = () => document.getElementById('contact-best');
    const syncBoardBest = () => {
        const best = getBestScore();
        const row = aboutRecRow();
        const val = aboutRecVal();
        const cb = contactBest();
        if (best > 0) {
            const label = String(best).padStart(2, '0');
            if (row) row.hidden = false;
            if (val) val.textContent = label;
            if (cb) cb.textContent = ` · BEST ${label}`;
        } else {
            if (row) row.hidden = true;
            if (val) val.textContent = '—';
            if (cb) cb.textContent = '';
        }
    };
    setBestListener(() => syncBoardBest());
    syncBoardBest(); // boot-time value (createLcd already loaded the record)

    // 7. Render section datasheet content from portfolio data
    renderSections();

    // 7b. Wire LinkedIn and GitHub links from config
    document.querySelectorAll('.js-linkedin, #cta-linkedin-hud, #lcd-game-minicta').forEach(a => { a.href = LINKEDIN_URL; });
    document.querySelectorAll('.js-github').forEach(a => { a.href = GITHUB_URL; });

    // 7c. LinkedIn CTA click tracking — one named goal, separate from
    // pageviews; no-op (no script, no beacon) unless configured via
    // VITE_PLAUSIBLE_DOMAIN / VITE_CTA_TRACKING_ENDPOINT (analytics.js).
    initLinkedInTracking();

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
    // SW1-3 — the board's front-panel switches. Each press dips the cap and
    // blips (hover.js), then fires a behavior: SW1 toggles the night bench,
    // SW2 sounds the horn, SW3 glides to the project chip nearest to it.
    // All three reuse existing entry points (togglePower / pulseBuzzer /
    // focusProject) — no new state, scroll stays the primary path.
    // LCD1 — clicking the display on the board glides the camera to it and
    // hands the keyboard to SIGNAL RUNNER (journey.focusLcdCamera).
    setLcdHandler(() => focusLcdCamera());
    setSwitchHandler((switchName) => {
        if (switchName === 'SW1') {
            togglePower();
        } else if (switchName === 'SW2') {
            pulseBuzzer();
        } else if (switchName === 'SW3') {
            // Nearest chip by board-local distance — projectChips stores each
            // chip's position in the same space as SWITCH_POS, so plain 2D
            // distance is exact (no world-matrix math needed).
            const [sx, sy] = SWITCH_POS[2];
            let nearest = null;
            let bestD = Infinity;
            for (const ref of Object.keys(projectChips)) {
                const p = projectChips[ref].pos;
                const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
                if (d < bestD) {
                    bestD = d;
                    nearest = ref;
                }
            }
            if (nearest) focusProject(nearest);
        }
    });
    const projectCloseBtn = document.getElementById('btn-project-close');
    if (projectCloseBtn) {
        projectCloseBtn.addEventListener('click', () => exitFocusMode());
    }
    // 8c. Night bench — the PWR LED is the board's power switch: clicking it
    // (or pressing P) cuts the bench lights so the board's emissive traces
    // and LEDs become the only light source. Reversible; gated by
    // prefers-reduced-motion inside power.js.
    const pwrBtn = document.getElementById('pwr-led');
    if (pwrBtn) {
        pwrBtn.addEventListener('click', () => togglePower());
    }

    // 8d. Teardown, Rover & Theme HUD buttons
    const roverBtn = document.getElementById('rover-toggle-btn');
    if (roverBtn) {
        roverBtn.addEventListener('click', () => toggleRover(() => scrollToSection(getActiveSectionId())));
    }
    const teardownBtn = document.getElementById('teardown-toggle-btn');
    if (teardownBtn) {
        teardownBtn.addEventListener('click', () => toggleTeardown(() => scrollToSection(getActiveSectionId())));
    }
    const turboBtn = document.getElementById('turbo-toggle-btn');
    if (turboBtn) {
        turboBtn.addEventListener('click', () => toggleOverclock());
    }
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => cycleTheme());
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
        // Night bench needs the bloom pass + trace routes in place.
        initPower();
    }

    // 11. Register animation loops on the priority tick scheduler.
    //
    // CRITICAL — runs every frame, no exceptions:
    //   Physics, camera, interactivity, the LCD game, LED array, radar,
    //   parallax, probe, hover.  If these fall behind the user sees lag.
    //
    // STANDARD — cosmetic ambient, skipped when the critical pass eats
    //   >8ms of the 16.6ms budget:
    //   Trace ripple/sweep/current, ambient dust/flecks, oscilloscope,
    //   project-chips, idle drift, self-test, hover shadow.
    //
    // DEFERRED — hidden UI, skipped when >5ms spent:
    //   Telemetry readouts, journey panel positioning.
    //
    // The self-test + LED array + radar ring share the boardFx and
    // selfTest values computed once per frame in a CRITICAL preamble,
    // so STANDARD callbacks that need them read the module-scoped
    // snapshot (set by the preamble) rather than recomputing.

    // Shared per-frame reads (CRITICAL preamble — computed once).
    let _activeSectionId = '';
    let _boardFx = null;
    let _selfTest = /** @type {{ active: boolean, frac: number }} */ ({ active: false, frac: 0 });
    let _heartbeatFrac = 0;
    let _distScale = 1;

    onTick(CRITICAL, (elapsed, delta) => {
        _activeSectionId = getActiveSectionId();
        _boardFx = getBoardFx();
        _selfTest = updateIdleSelfTest(delta);
        _heartbeatFrac = updateIdleHeartbeat(delta).frac;

        // POST replay: while the self-test runs, the scope shows the
        // current POST line.  Captures the resting readout on first
        // active frame and restores exactly that on cancel/complete.
        if (!scopeValEl) scopeValEl = document.getElementById('hud-scope-val');
        if (scopeValEl) {
            if (_selfTest.active) {
                if (!scopeValEl.dataset.selfTest) {
                    scopeValEl.dataset.selfTestRestore = scopeValEl.textContent || '';
                    scopeValEl.dataset.selfTest = '1';
                }
                scopeValEl.textContent = selfTestPostLine(_selfTest.frac);
            } else if (scopeValEl.dataset.selfTest) {
                scopeValEl.textContent = scopeValEl.dataset.selfTestRestore || '';
                delete scopeValEl.dataset.selfTest;
                delete scopeValEl.dataset.selfTestRestore;
            }
        }
        // Heartbeat scope flicker: during a flash the scope briefly shows
        // "HEARTBEAT" then restores the resting readout.  Uses the same
        // capture/restore pattern as the self-test but with its own flag.
        if (scopeValEl && _heartbeatFrac > 0 && !_selfTest.active) {
            if (!scopeValEl.dataset.hbRestore) {
                scopeValEl.dataset.hbRestore = scopeValEl.textContent || '';
            }
            scopeValEl.textContent = 'HEARTBEAT';
        } else if (scopeValEl && scopeValEl.dataset.hbRestore && _heartbeatFrac === 0) {
            scopeValEl.textContent = scopeValEl.dataset.hbRestore;
            delete scopeValEl.dataset.hbRestore;
        }

        updateParticles(delta);
        updateRadarRing(elapsed, _boardFx);
        const audioPeak = updateAudioPeak(delta);
        updateLedArray(elapsed, _activeSectionId, _boardFx, _selfTest.frac, _heartbeatFrac, audioPeak);

        if (isRoverModeActive()) {
            updateRoverPhysics(delta, (ref) => focusProject(ref));
        }

        if (!isProbeModeActive() && !isRoverModeActive()) checkHover(delta);
        updateProbe(delta);

        _distScale = Math.min(1 + Math.max(camera.position.z - 4.2, 0) / 12, 3);
        updateBoardParallax(elapsed, mouse, delta, _activeSectionId, journeyLive, isFocusMode(), _distScale);

        updateLcdScreen(elapsed, delta);

        if (journeyLive) updateIdleDrift(elapsed, delta);
    });

    onTick(STANDARD, (elapsed, delta) => {
        updateOverclock(elapsed, delta);
        updateOscilloscope(elapsed, document.body.dataset.hoverRef);
        updateProjectChips(elapsed);
        updateHoverShadow();
        updateAmbientDust(elapsed, _activeSectionId);
        updateAmbientGoldFlecks(elapsed, _activeSectionId);
        updateTraceCurrent(elapsed, _activeSectionId);
        updateAmbientPulses(elapsed, _activeSectionId);
        updateTraceRipple(elapsed, _activeSectionId);
        updateBenchSweep(elapsed, _distScale);
    });

    onTick(DEFERRED, (elapsed, delta) => {
        updateTelemetry(elapsed, delta);
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
        // Journey is live: the board's boot arrival tween has finished, so the
        // levitation float may take over position (gated on this flag).
        journeyLive = true;
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
    // Coordinated resize: ONE debounced handler with a defined order — scene
    // sync first (camera aspect / renderer buffer / composer follow the 58%
    // canvas), then journey (curves read the fresh canvas size, then
    // ScrollTrigger re-measures the leg windows), then the progress readout.
    // Previously three independent listeners (scene 100ms, journey 200ms,
    // sig-path immediate) raced — ordering between them was luck, and a stale
    // read could leave the hero/contact framing z off until the next resize.
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            syncCanvasSize();
            resizeJourney();
            scheduleSigPath();
        }, 120);
    }, { passive: true });
    scheduleSigPath();

    // 18. Keyboard section navigation (1–6)
    window.addEventListener('keydown', handleSectionKey);

    // 19b. Idle-ambient tracking: any scroll/pointer/key/touch interaction
    // resets the idle clock (idle.js gates the camera micro-drift after ~3s
    // of stillness). All passive — noteInteraction is a timestamp write.
    ['scroll', 'wheel', 'pointermove', 'touchstart', 'keydown'].forEach((t) => {
        window.addEventListener(t, noteInteraction, { passive: true });
    });

    // 19c. Master sound toggle — the SND switch in the HUD legend. Muted by
    // default; the toggle click is the user gesture that may build the
    // AudioContext (sound.js), so autoplay policy is never fought. One flag
    // gates the hover/click blips, the buzzer horn, and the electrical hum
    // (which is hushed here rather than cut, so the toggle never pops).
    const soundBtn = document.getElementById('sound-toggle');
    if (soundBtn) {
        const syncSoundBtn = () => {
            soundBtn.textContent = isSoundEnabled() ? 'SND\u00A0ON' : 'SND\u00A0OFF';
            soundBtn.setAttribute('aria-pressed', String(isSoundEnabled()));
            document.body.classList.toggle('sound-on', isSoundEnabled());
            if (!isSoundEnabled()) {
                stopElectricalHum();
                clearTimeout(humIdleTimer);
            }
        };
        soundBtn.addEventListener('click', () => {
            const wasOn = isSoundEnabled();
            toggleSound();
            syncSoundBtn();
            // Power-up beep — the board chirps when the audio subsystem comes
            // online (the toggle click is the gesture that builds the context,
            // so the chime is legal AND the moment it belongs to).
            if (!wasOn && isSoundEnabled()) powerUpBeep();
        });
        syncSoundBtn();
    }

    // 18b. BIOS terminal command palette (Ctrl+K / Cmd+K or the [CMD] HUD
    // button). Wired once after DOM ready: the palette's commands reuse the
    // app's real entry points (scrollToSection / togglePower / toggleSound /
    // activateProbe) plus the profile links from config. The sound command
    // routes through the HUD button's own click handler so the label stays
    // in sync (the palette is just another way to flip the same switch).
    const cmdSoundToggle = () => {
        const btn = document.getElementById('sound-toggle');
        if (btn) {
            btn.click(); // toggle + label/aria-pressed/body-class sync
        } else {
            toggleSound();
        }
    };
    initCommandPalette({
        scrollToSection,
        togglePower,
        toggleSound: cmdSoundToggle,
        activateProbe,
        deactivateProbe,
        toggleSysinfo,
        toggleDebug,
        toggleTeardown: () => toggleTeardown(() => scrollToSection(getActiveSectionId())),
        toggleOverclock: () => toggleOverclock(),
        toggleRover: () => toggleRover(() => scrollToSection(getActiveSectionId())),
        cycleTheme: () => cycleTheme(),
        linkedinUrl: LINKEDIN_URL,
        githubUrl: GITHUB_URL
    });
    const cmdBtn = document.getElementById('cmd-palette-btn');
    if (cmdBtn) cmdBtn.addEventListener('click', openCommandPalette);
    // Ctrl+K / Cmd+K — the standard palette shortcut. Not gated on form
    // focus: it's a deliberate global command, and the palette closes itself
    // on Esc. Guarded so a modifier-less 'k' still scrolls normally.
    window.addEventListener('keydown', (e) => {
        // The palette is a global command — but the SIGNAL SNAKE session is
        // exclusive, so Ctrl+K stands down while the game is focused.
        if (isLcdActive()) return;
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            openCommandPalette();
        }
    });

    // 19. Flying scope probe keyboard (full-journey only): WASD activates +
    // flies (arrows fly only once the probe is already active — they stay
    // free for keyboard scrolling otherwise); Enter MEASUREs the component
    // under the tip; Esc exits probe mode.
    const PROBE_MOVE_KEYS = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const normalizeProbeKey = (/** @type {string} */ k) => (k.length === 1 ? k.toLowerCase() : k);
    window.addEventListener('keydown', (e) => {
        if (isLiteMode()) return;
        // LCD1's SIGNAL SNAKE owns WASD/arrows/Enter/Esc while its game is
        // focused — the probe (and the P/T/D shortcuts below) stand down.
        if (isLcdActive()) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) return;
        const key = normalizeProbeKey(e.key);
        if (isRoverModeActive()) {
            if (e.key === 'Escape') {
                deactivateRover(() => scrollToSection(getActiveSectionId()));
            } else {
                handleRoverKeyDown(e.key);
            }
            return;
        }

        if (PROBE_MOVE_KEYS.includes(key)) {
            // Arrows are the page's scroll keys — only hijack them once the
            // probe is already active (WASD is the activation affordance).
            if (key.startsWith('Arrow') && !isProbeModeActive()) return;
            e.preventDefault();
            pressProbeKey(key);
        } else if (e.key === 'Enter' && isProbeModeActive()) {
            e.preventDefault();
            measureProbeTarget();
        } else if (e.key === 'Escape') {
            if (isProbeModeActive()) deactivateProbe();
            if (isTeardownActive()) toggleTeardown(() => scrollToSection(getActiveSectionId()));
        } else if (key === 'p') {
            // Night bench — cut/restore the bench lights (the PWR switch).
            e.preventDefault();
            togglePower();
        } else if (!isProbeModeActive() && key === 'r') {
            // 3D PCB Nano-Rover Drive Mode (R key)
            e.preventDefault();
            toggleRover(() => scrollToSection(getActiveSectionId()));
        } else if (!isProbeModeActive() && key === 'e') {
            // 3D Exploded Hardware Teardown view (E key)
            e.preventDefault();
            toggleTeardown(() => scrollToSection(getActiveSectionId()));
        } else if (!isProbeModeActive() && key === 't') {
            // Turbo Overclock mode (T key)
            e.preventDefault();
            toggleOverclock();
        } else if (!isProbeModeActive() && key === 'd') {
            // Hidden shortcut: D = debug overlay (FPS/frame).
            e.preventDefault();
            toggleDebug();
        }
    });
    window.addEventListener('keyup', (e) => {
        if (isRoverModeActive()) {
            handleRoverKeyUp(e.key);
        } else {
            releaseProbeKey(normalizeProbeKey(e.key));
        }
    });

    // 20. Hidden cheat-code: typing 'parama' (the board's name) fires the
    // operator-notes easter egg — a one-shot gold chip that thanks the
    // curious (and tips the T/D shortcuts). Silent unless typed: the buffer
    // rolls a fixed window and resets on any non-letter or modifier key, so
    // normal typing never trips it. Ignored inside form fields.
    const CHEAT = 'parama';
    let cheatBuf = '';
    window.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (document.body.classList.contains('lcd-active')) {
            cheatBuf = '';
            return;
        }
        if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) {
            cheatBuf = '';
            return;
        }
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable)) {
            cheatBuf = '';
            return;
        }
        cheatBuf = (cheatBuf + e.key.toLowerCase()).slice(-CHEAT.length);
        if (cheatBuf === CHEAT) {
            cheatBuf = '';
            showDevNotes();
        }
    });
});