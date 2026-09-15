import { detectWebGL, showFallbackUI, setupCleanup } from './src/ui/fallback.js';
import { initScene, scene, camera, renderer, enableBloom, syncCanvasSize, setBloomBoost } from './src/three/scene.js';
import { onTick, CRITICAL, STANDARD, DEFERRED } from './src/three/tick-scheduler.js';
import { createBoard, boardGroup, updateBoardParallax, updateBenchSweep, updateHoverShadow } from './src/three/board.js';
import { createComponents, updateLedArray, SWITCH_POS, toggleDelidCpu, isCpuDelidded } from './src/three/components.js';
import { createTraces, updateTraceCurrent, updateTraceRipple, updateAmbientPulses } from './src/three/traces.js';
import { createParticles, updateParticles, updateAmbientDust, updateAmbientGoldFlecks } from './src/three/particles.js';
import { createProjectChips, updateProjectChips, projectChips } from './src/three/project-chips.js';
import { createLcd, updateLcdScreen, isLcdActive, getBestScore, setBestListener, getBoardFx } from './src/three/lcd.js';
import { updateRadarRing, pulseBuzzer, updateCapacitorBanks, triggerCapacitorOverdrive } from './src/three/components.js';
import { runBootSequence } from './src/ui/boot.js';
import { initHover, checkHover, mouse, setBoardClickHandler, setBuzzerHandler, setSwitchHandler, setLcdHandler, setSubsystemInspectHandler, setTestpointHandler, setTrimpotHandler, setHeaderHandler, setRfHandler, setInductorHandler } from './src/utils/hover.js';
import { isSoundEnabled, toggleSound, switchClack, clickBlip, electricalHum, stopElectricalHum, powerUpBeep } from './src/utils/sound.js';
import { noteInteraction, updateIdleDrift, updateIdleSelfTest, selfTestPostLine, updateIdleHeartbeat } from './src/three/idle.js';
// The HUD scope's value line — the board's live readout. Cached once so the
// idle self-test's POST replay doesn't do a DOM lookup per frame.
let scopeValEl = null;
import { createProbe, updateProbe, pressProbeKey, releaseProbeKey, measureProbeTarget, isProbeModeActive, activateProbe, deactivateProbe } from './src/three/probe.js';
import { initPower, togglePower } from './src/three/power.js';
import { initCursor } from './src/ui/cursor.js';
import { initOscilloscope, updateOscilloscope } from './src/ui/oscilloscope.js';
import { initLiveBench } from './src/ui/live-bench.js';
import { initCommandPalette, openCommandPalette } from './src/ui/command-palette.js';
import { initTelemetry, toggleSysinfo, toggleDebug, showDevNotes, updateTelemetry, markChipVerified, emitUartLog, emitSystemEvent } from './src/ui/telemetry.js';
import { initTeardown, toggleTeardown, isTeardownActive } from './src/three/teardown.js';
import { cycleTheme, getClockFrequency } from './src/three/potentiometer.js';
import { initOverclock, updateOverclock, toggleOverclock } from './src/three/overclock.js';
import { updateAudioPeak, playBuzzerPianoNote } from './src/utils/synth.js';
import { createRover } from './src/three/rover.js';
import { initPlaygroundProps } from './src/three/playground-props.js';
import { activateRover, deactivateRover, toggleRover, isRoverModeActive, handleRoverKeyDown, handleRoverKeyUp, updateRoverPhysics, setRoverActionHandler } from './src/three/rover-physics.js';
import { LINKEDIN_URL, GITHUB_URL, RESUME_URL, isLiteMode } from './src/config.js';
import { initLinkedInTracking } from './src/utils/analytics.js';
import { renderSections } from './src/ui/sections.js';
import { initHardwareOrchestrator, onSectionChanged, inspectProject, updateHardwareOrchestrator, disturbDroplets, launchPaperAirplane } from './src/three/hardware-orchestrator.js';
import { triggerRfBurst } from './src/three/rf-wavefront.js';
import { initJourney, scrollToSection, updateJourneyEffects, focusProject, exitFocusMode, getActiveSectionId, resizeJourney, isFocusMode, focusLcdCamera } from './src/scroll/journey.js';
import { SECTION_HASHES, hashToSectionId } from './src/utils/hash-nav.js';
import { initContactTerminal } from './src/ui/contact-terminal.js';

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

    // Slow-motion Spacebar wave: disturbs droplets and sends an acoustic chime
    if (e.code === 'Space') {
        e.preventDefault();
        disturbDroplets();
        switchClack();
        return;
    }

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
    initLiveBench();

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

    // 7a. Initialize Unified 3D Hardware Orchestrator (Probe, Project Visuals, Waves)
    initHardwareOrchestrator(boardGroup);

    // 7b. Wire LinkedIn and GitHub links from config
    document.querySelectorAll('.js-linkedin, #cta-linkedin-hud, #lcd-game-minicta').forEach(a => { 
        a.href = LINKEDIN_URL;
        a.addEventListener('click', () => triggerRfBurst());
    });
    document.querySelectorAll('.js-github').forEach(a => { a.href = GITHUB_URL; });

    // 7bb. Wire Paper Airplane Resume Delivery flight
    document.querySelectorAll('.js-resume-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            launchPaperAirplane(RESUME_URL);
        });
    });

    // 7c. LinkedIn CTA click tracking
    initLinkedInTracking();

    // 7d. Initialize Primary Uplink Contact Terminal & Live Telemetry
    initContactTerminal();

    // 8. Bind hover raycast checking
    initHover(camera, scene);

    // 8a. Scope-probe custom cursor (pointer:fine desktop only — lite mode
    // keeps the native cursor for reduced-motion and touch users).
    if (!isLiteMode() && window.matchMedia('(pointer: fine)').matches) {
        initCursor();
    }

    // 8b. Physical Board Inspection: clicking any component on the board glides
    // the camera with weighted physics and opens its corresponding datasheet.
    setBoardClickHandler((ref) => {
        markChipVerified(ref);
        emitUartLog('INSPECT', `${ref} Module Activated · EEPROM Signature Verified`);
        inspectProject(ref);
        focusProject(ref);
    });
    setSubsystemInspectHandler((sectionId) => {
        scrollToSection(sectionId);
    });
    // BZ1 — the musical buzzer piano: clicking plays pentatonic notes & rings
    setBuzzerHandler(() => {
        pulseBuzzer();
        playBuzzerPianoNote();
    });
    // SW1-3 — the board's front-panel switches. Each press dips the cap and
    // blips (hover.js), then fires a behavior: SW1 toggles the night bench,
    // SW2 sounds the horn, SW3 glides to the project chip nearest to it.
    // All three reuse existing entry points (togglePower / pulseBuzzer /
    // focusProject) — no new state, scroll stays the primary path.
    // LCD1 — clicking the display on the board glides the camera to it and
    // hands the keyboard to SIGNAL RUNNER (journey.focusLcdCamera).
    setLcdHandler(() => focusLcdCamera());
    let moduleStepIndex = -1;
    setSwitchHandler((switchName) => {
        if (switchName === 'SW1') {
            togglePower();
            triggerCapacitorOverdrive();
            emitUartLog('PWR', 'Front Panel SW1 Pressed · Capacitor Overdrive & Power Mode Active');
            emitSystemEvent('POWER MODE TOGGLE', 'Night bench power rail & capacitor banks energized');
        } else if (switchName === 'SW2') {
            pulseBuzzer();
            emitUartLog('DIAG', 'Front Panel SW2 Pressed · Piezo Audio Beacon Test Initiated');
            emitSystemEvent('PIEZO TRANSDUCER TEST', '2.7kHz resonant transducer pulse emitted');
        } else if (switchName === 'SW3') {
            // Hardware Module Stepper: cycle sequentially through all installed project chips
            const chipRefs = Object.keys(projectChips);
            if (chipRefs.length > 0) {
                moduleStepIndex = (moduleStepIndex + 1) % chipRefs.length;
                const nextRef = chipRefs[moduleStepIndex];
                markChipVerified(nextRef);
                const title = projectChips[nextRef]?.data?.title || nextRef;
                emitUartLog('STEPPER', `SW3 Pressed · Stepping to Module ${nextRef} (${title})`);
                emitSystemEvent('EXPANSION MODULE STEPPER', `Active Module: ${nextRef} — ${title}`);
                focusProject(nextRef);
            }
        }
    });

    setTestpointHandler((tpName) => {
        if (tpName === 'TP1') {
            emitUartLog('DMM', 'Probe Contact TP1: +5.02V VCC Rail (Nominal, Ripple 7.4mV)');
            emitSystemEvent('TEST POINT TP1: +5.00V', 'Primary DC rail voltage nominal · Ripple 7.4mV');
        } else if (tpName === 'TP2') {
            emitUartLog('DMM', 'Probe Contact TP2: 0.00V Ground Reference (Impedance 0.02Ω)');
            emitSystemEvent('TEST POINT TP2: GND', 'System ground reference stable · Impedance 0.02Ω');
        }
    });

    setTrimpotHandler(() => {
        const freq = getClockFrequency();
        emitUartLog('CLK', `RV1 Trimmer Rotated · Bus Frequency Tuned to ${freq.toFixed(1)}MHz`);
        emitSystemEvent('TRIMMER RV1 ADJUST', `Master clock modulated to ${freq.toFixed(1)}MHz`);
    });

    setHeaderHandler(() => {
        emitUartLog('UART', 'Debug Header HDR1 Pins 1-6 Sampled · 115200 Baud · Signal Stable');
        emitSystemEvent('DEBUG HEADER HDR1', 'Logic analyzer probe active on 6-pin breakout');
    });

    setRfHandler(() => {
        emitUartLog('RF1', 'RF Transceiver Ping · 2.4GHz IEEE 802.15.4 · RSSI -42dBm');
        emitSystemEvent('RF1 SHIELD TELEMETRY', '2.4GHz RF module telemetry verified');
    });

    setInductorHandler(() => {
        emitUartLog('PWR', 'Choke Inductor L1: DC-DC Buck Filter Stage · 1.2MHz Switch Rate Nominal');
        emitSystemEvent('INDUCTOR L1 STAGE', 'Power supply filter choke operational');
    });

    const projectCloseBtn = document.getElementById('btn-project-close');
    if (projectCloseBtn) {
        projectCloseBtn.addEventListener('click', () => {
            clickBlip();
            exitFocusMode();
        });
    }
    // 8c. Night bench — the PWR LED is the board's power switch: clicking it
    // (or pressing P) cuts the bench lights so the board's emissive traces
    // and LEDs become the only light source. Reversible; gated by
    // prefers-reduced-motion inside power.js.
    const pwrBtn = document.getElementById('pwr-led');
    if (pwrBtn) {
        pwrBtn.addEventListener('click', () => {
            clickBlip();
            togglePower();
        });
    }

    // 8d. Teardown, Rover & Theme HUD buttons
    const roverBtn = document.getElementById('rover-toggle-btn');
    if (roverBtn) {
        roverBtn.addEventListener('click', () => {
            clickBlip();
            toggleRover(() => scrollToSection(getActiveSectionId()));
        });
    }
    setRoverActionHandler((item) => {
        emitUartLog('ROVER', `Proximity Scan Action: ${item.title}`);
        if (item.actionType === 'project') {
            markChipVerified(item.actionTarget);
            inspectProject(item.actionTarget);
            focusProject(item.actionTarget);
        } else if (item.actionType === 'section') {
            scrollToSection(item.actionTarget);
        } else if (item.actionType === 'modal') {
            openArchModal();
        } else if (item.actionType === 'function') {
            if (item.actionTarget === 'lcd') focusLcdCamera();
            else if (item.actionTarget === 'buzzer') {
                pulseBuzzer();
                playBuzzerPianoNote();
            } else if (item.actionTarget === 'tp1') {
                showPcbToast('TP1 CONTACT: +5.02V VCC RAIL // RIPPLE 7.4mV');
            } else if (item.actionTarget === 'tp2') {
                showPcbToast('TP2 CONTACT: 0.00V GND REFERENCE // 0.02Ω');
            }
        }
    });
    const teardownBtn = document.getElementById('teardown-toggle-btn');
    if (teardownBtn) {
        teardownBtn.addEventListener('click', () => {
            clickBlip();
            toggleTeardown(() => scrollToSection(getActiveSectionId()));
        });
    }
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            clickBlip();
            cycleTheme();
        });
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

    let _activeSectionId = '';
    let _boardFx = null;
    let _selfTest = /** @type {{ active: boolean, frac: number }} */ ({ active: false, frac: 0 });
    let _heartbeatFrac = 0;
    let _distScale = 1;
    let _telemetryHeartbeatTimer = 0;

    const SECTION_COMPONENT_MAP = {
        'sec-hero': 'U1',
        'sec-about': 'U1',
        'sec-projects': 'U2',
        'sec-skills': 'C1',
        'sec-experience': 'Y1',
        'sec-contact': 'ANT1'
    };

    let _lastSectionScan = '';
    onTick(CRITICAL, (elapsed, delta) => {
        _activeSectionId = getActiveSectionId();
        if (_activeSectionId && _activeSectionId !== _lastSectionScan) {
            onSectionChanged(_activeSectionId);
            _lastSectionScan = _activeSectionId;
        }
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
        updateHardwareOrchestrator(elapsed, delta);
        // Synchronize oscilloscope to hovered chip, focused chip, or active section component
        const activeRef = document.body.dataset.hoverRef || (isFocusMode() ? 'U2' : null) || SECTION_COMPONENT_MAP[_activeSectionId] || 'U1';
        updateOscilloscope(elapsed, activeRef);
        updateProjectChips(elapsed);
        updateCapacitorBanks(elapsed, delta);
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
        if (archModalOpen) {
            updateArchTelemetry(elapsed, delta);
        }
        // Periodic authentic diagnostics heartbeat derived from genuine WebGL/application state
        _telemetryHeartbeatTimer += delta;
        if (_telemetryHeartbeatTimer >= 7.5) {
            _telemetryHeartbeatTimer = 0;
            if (renderer && renderer.info) {
                const fps = delta > 0 ? (1 / delta).toFixed(0) : '60';
                const calls = renderer.info.render.calls;
                const tris = (renderer.info.render.triangles / 1000).toFixed(1);
                const geos = renderer.info.memory.geometries;
                const subsys = (_activeSectionId || 'sec-hero').replace('sec-', '').toUpperCase();
                emitUartLog('SYS', `FPS: ${fps} · Calls: ${calls} · Tris: ${tris}k · Geos: ${geos} · Subsystem: ${subsys}`);
            }
        }
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
            switchClack();
            const section = btn.getAttribute('data-section');
            if (section && document.getElementById(section)) {
                // Scroll-journey navigation + shareable hash URL
                navigateToSection(section);
            }
        });
    });

    // 15. Hero section nav button for the HUD name/brand link
    const brandLink = document.querySelector('.hud-name');
    if (brandLink) {
        brandLink.addEventListener('click', (e) => {
            e.preventDefault();
            switchClack();
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
            const txt = document.getElementById('sound-toggle-text');
            if (txt) txt.textContent = isSoundEnabled() ? 'AUDIO\u00A0ON' : 'AUDIO\u00A0OFF';
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

    // Hero quick-action buttons
    const heroRoverBtn = document.getElementById('hero-rover-btn');
    if (heroRoverBtn) {
        heroRoverBtn.addEventListener('click', () => {
            clickBlip();
            toggleRover(() => scrollToSection(getActiveSectionId()));
        });
    }
    const heroDelidBtn = document.getElementById('hero-delid-btn');
    if (heroDelidBtn) {
        heroDelidBtn.addEventListener('click', () => {
            clickBlip();
            const open = toggleDelidCpu();
            const tag = heroDelidBtn.querySelector('.btn-tag');
            const title = heroDelidBtn.querySelector('.btn-title');
            if (tag && title) {
                tag.textContent = open ? 'DIE' : 'IHS';
                title.textContent = open ? 'Seat Lid' : 'Delid CPU';
            }
            showPcbToast(open ? 'CPU IHS DELIDDED // EXPOSED SILICON DIE' : 'CPU IHS SEATED // HEAT SPREADER LOCKED', 2200);
        });
    }
    const heroTeardownBtn = document.getElementById('hero-teardown-btn');
    if (heroTeardownBtn) {
        heroTeardownBtn.addEventListener('click', () => {
            clickBlip();
            toggleTeardown(() => scrollToSection(getActiveSectionId()));
        });
    }
    const heroThemeBtn = document.getElementById('hero-theme-btn');
    if (heroThemeBtn) {
        heroThemeBtn.addEventListener('click', () => {
            clickBlip();
            cycleTheme();
        });
    }

    // 18b. Dedicated Engineering Architecture Specification Modal
    const archModal = document.getElementById('modal-architecture');
    let archModalOpen = false;
    let toastTimer = null;

    /** Universal floating PCB notification toast */
    function showPcbToast(msg, durationMs = 2600) {
        const toast = document.getElementById('pcb-toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.hidden = false;
        toast.classList.add('toast-show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('toast-show');
            setTimeout(() => { toast.hidden = true; }, 300);
        }, durationMs);
    }

    /** Universal board serial copy handler */
    function copyBoardSerial(e) {
        if (e) e.stopPropagation();
        const sn = 'PRM-2026-DEV-001';
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(sn).catch(() => {});
        }
        clickBlip();
        emitUartLog('SYS', `Board Serial Copied: ${sn}`);
        showPcbToast(`📋 COPIED TO CLIPBOARD: ${sn}`);
        emitSystemEvent('Clipboard', `Serial Number ${sn} Copied`);
    }

    document.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        if (target && target.closest('.board-serial-copy')) {
            copyBoardSerial(e);
        }
    });

    /** Detect genuine WebGL & host hardware capabilities */
    function populateHardwareDiagnostics() {
        if (!renderer) return;
        const gl = renderer.getContext();
        if (!gl) return;

        const webglVerEl = document.getElementById('arch-val-webgl-ver');
        if (webglVerEl) {
            webglVerEl.textContent = (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) ? 'WebGL 2.0 (Active)' : 'WebGL 1.0 (Fallback)';
        }

        const gpuEl = document.getElementById('arch-val-gpu');
        if (gpuEl) {
            let rendererName = 'WebGL2 Hardware Rasterizer';
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const unmasked = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                if (unmasked) rendererName = String(unmasked);
            }
            if (rendererName.length > 30) {
                rendererName = rendererName.replace(/ANGLE \((.*?), (.*?),.*?\)/, '$1 $2').slice(0, 28);
            }
            gpuEl.textContent = rendererName;
        }

        const maxTexEl = document.getElementById('arch-val-max-tex');
        if (maxTexEl) {
            const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
            maxTexEl.textContent = maxTex ? `${maxTex}px` : '4096px';
        }

        const coresEl = document.getElementById('arch-val-cores');
        if (coresEl) {
            const cores = navigator.hardwareConcurrency || 8;
            coresEl.textContent = `${cores} Cores`;
        }
    }

    /** Low-Glare Bench Mode (reduced bloom for long sessions) */
    let benchModeActive = false;
    function toggleBenchMode() {
        benchModeActive = !benchModeActive;
        document.body.classList.toggle('bench-mode-dim', benchModeActive);
        setBloomBoost(benchModeActive ? 0.35 : 1.0);
        clickBlip();
        const statusEl = document.getElementById('arch-bench-status');
        const toggleBtn = document.getElementById('arch-bench-toggle');
        if (statusEl) statusEl.textContent = benchModeActive ? 'ACTIVE (DIM)' : 'OFF';
        if (toggleBtn) toggleBtn.classList.toggle('active', benchModeActive);
        emitUartLog('SYS', `Bench Mode: ${benchModeActive ? 'LOW-GLARE DIMMED (0.35x BLOOM)' : 'NORMAL (1.0x BLOOM)'}`);
        showPcbToast(benchModeActive ? 'BENCH MODE: Low-Glare Dimming Active' : 'BENCH MODE: Normal Luminance Restored');
    }

    function openArchModal() {
        if (!archModal) return;
        archModalOpen = true;
        archModal.hidden = false;
        clickBlip();
        populateHardwareDiagnostics();
        emitUartLog('SYS', 'Engineering Architecture Panel Opened');
        emitSystemEvent('System Architecture', 'PARAMA-DEV-BOARD v2.0 Specification Active');
    }

    function closeArchModal() {
        if (!archModal) return;
        archModalOpen = false;
        archModal.hidden = true;
        clickBlip();
    }

    function toggleArchModal() {
        if (archModalOpen) closeArchModal();
        else openArchModal();
    }

    /** Update genuine WebGL runtime telemetry in the Architecture panel */
    function updateArchTelemetry(elapsed, delta) {
        if (!archModalOpen || !renderer || !renderer.info) return;
        const fpsVal = delta > 0 ? (1 / delta).toFixed(1) : '60.0';
        const fpsEl = document.getElementById('arch-val-fps');
        if (fpsEl) fpsEl.textContent = fpsVal;

        const callsEl = document.getElementById('arch-val-calls');
        if (callsEl) callsEl.textContent = String(renderer.info.render.calls);

        const trisEl = document.getElementById('arch-val-triangles');
        if (trisEl) trisEl.textContent = renderer.info.render.triangles.toLocaleString();

        const geosEl = document.getElementById('arch-val-geometries');
        if (geosEl) geosEl.textContent = String(renderer.info.memory.geometries);

        const texsEl = document.getElementById('arch-val-textures');
        if (texsEl) texsEl.textContent = String(renderer.info.memory.textures);

        const modEl = document.getElementById('arch-val-module');
        if (modEl) {
            const curSec = getActiveSectionId();
            modEl.textContent = curSec ? curSec.replace('sec-', '').toUpperCase() : 'U1 (CORE)';
        }

        const resEl = document.getElementById('arch-val-resolution');
        if (resEl) {
            resEl.textContent = `${window.innerWidth}×${window.innerHeight} (${(window.devicePixelRatio || 1).toFixed(1)}x)`;
        }

        const uptimeEl = document.getElementById('arch-val-uptime');
        if (uptimeEl) {
            const h = Math.floor(elapsed / 3600);
            const m = Math.floor((elapsed % 3600) / 60);
            const s = Math.floor(elapsed % 60);
            const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
            uptimeEl.textContent = `${p(h)}:${p(m)}:${p(s)}`;
        }

        // Synchronize performance budget table in Card 2
        const budgetFps = document.getElementById('budget-val-fps');
        if (budgetFps) budgetFps.textContent = `${fpsVal} FPS`;

        const budgetCalls = document.getElementById('budget-val-calls');
        if (budgetCalls) budgetCalls.textContent = `${renderer.info.render.calls} calls`;
    }

    const archToggleBtn = document.getElementById('arch-toggle-btn');
    if (archToggleBtn) archToggleBtn.addEventListener('click', toggleArchModal);

    const heroArchBtn = document.getElementById('hero-arch-btn');
    if (heroArchBtn) heroArchBtn.addEventListener('click', openArchModal);

    const archBenchToggle = document.getElementById('arch-bench-toggle');
    if (archBenchToggle) archBenchToggle.addEventListener('click', toggleBenchMode);

    const archModalClose = document.getElementById('arch-modal-close');
    if (archModalClose) archModalClose.addEventListener('click', closeArchModal);

    const archDismissBtn = document.getElementById('arch-dismiss-btn');
    if (archDismissBtn) archDismissBtn.addEventListener('click', closeArchModal);

    const archBackdrop = document.getElementById('arch-modal-backdrop');
    if (archBackdrop) archBackdrop.addEventListener('click', closeArchModal);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && archModalOpen) {
            e.preventDefault();
            closeArchModal();
        }
    });

    // 18c. BIOS terminal command palette (Ctrl+K / Cmd+K or the [CMD] HUD
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
        toggleArch: () => toggleArchModal(),
        toggleBench: () => toggleBenchMode(),
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
        } else if (!isProbeModeActive() && key === 'h') {
            // FLIR Thermal Infrared Camera mode (H key)
            e.preventDefault();
            toggleThermalMode();
        } else if (!isProbeModeActive() && key === 'l') {
            // Laser Surface Profiling Scan (L key)
            e.preventDefault();
            triggerLaserScan();
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

    // 20. Disciplined Terminal Commands: typing 'sudo', 'help', 'matrix', or 'konami'
    // directly on the board triggers authentic hardware responses. Restricted to authentic 4 commands.
    let cmdBuffer = '';
    const COMMANDS = ['sudo', 'help', 'matrix', 'konami'];
    const MAX_BUF = 10;

    window.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (document.body.classList.contains('lcd-active')) {
            cmdBuffer = '';
            return;
        }
        if (e.key.length !== 1 || !/[a-z]/i.test(e.key)) {
            cmdBuffer = '';
            return;
        }
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && /** @type {HTMLElement} */ (document.activeElement).isContentEditable)) {
            cmdBuffer = '';
            return;
        }

        cmdBuffer = (cmdBuffer + e.key.toLowerCase()).slice(-MAX_BUF);

        for (const cmd of COMMANDS) {
            if (cmdBuffer.endsWith(cmd)) {
                cmdBuffer = '';
                if (cmd === 'sudo' || cmd === 'help') {
                    openCommandPalette();
                    emitUartLog('AUTH', 'Terminal Shell Opened');
                    emitSystemEvent('Terminal Access', 'BIOS Command Palette Armed');
                } else if (cmd === 'matrix') {
                    emitUartLog('SYS', 'CRT Phosphor Matrix Stream Active');
                    emitSystemEvent('Matrix Mode', 'CRT Phosphor Diagnostic Test');
                    document.body.classList.toggle('matrix-rain');
                } else if (cmd === 'konami') {
                    triggerGlobalCelebrationPulse();
                    emitUartLog('SYS', 'DEVELOPER CHEAT ENGAGED');
                    emitSystemEvent('God Mode', 'Developer System Surge Active');
                }
                break;
            }
        }
    });

    // 21. Universal tactile click acoustic feedback for all UI interactives
    document.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        if (!target) return;
        if (target.closest('.nav-btn, .hud-name')) return;
        const interactive = target.closest('button, a, .quick-action-btn, .proj-ds-link, .panel-close, .proj-filter, .stat-badge');
        if (interactive) {
            clickBlip();
        }
    }, { passive: true });

    // 22. PWA Offline Engine Service Worker Registration
    if ('serviceWorker' in navigator && !isLiteMode()) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then((reg) => {
                emitUartLog('SYS', `PWA Offline Engine Active (Scope: ${reg.scope})`);
            }).catch((_err) => {
                // Offline fallback silent catch
            });
        });
    }
});
