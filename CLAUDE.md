# PARAMA-DEV-BOARD (3D PCB Portfolio) — Technical Architecture & AI Developer Reference

> **Welcome AI Collaborator (Claude / Antigravity / Gemini)!**  
> This file is your single comprehensive guide to the codebase architecture, 3D graphics pipeline, scroll journey engine, interactive subsystems, design standards, and testing protocols for the **Parameshwaran S (Parama)** 3D PCB Developer Portfolio.

---

## 📌 Project Overview & Identity

- **Owner**: Parameshwaran S (`Parama`) — 3rd-year B.Tech ECE (Data Science) student at SRM Institute of Science and Technology, Ramapuram, Chennai.
- **Theme**: An ultra-premium, photo-realistic **3D Hardware Development Board (`PARAMA-DEV-BOARD-v2.0`)** running live in WebGL.
- **Aesthetic**: Retro-futuristic cyberpunk hardware laboratory — ENIG gold contacts, matte green solder mask, glowing copper traces, CRT phosphor oscilloscopes, glassmorphic HUD datasheets, and 8-bit chiptune sound design.
- **Identity Standards**:
  - Serial Number: `PRM-2026-DEV-001` (Dynamically generated hardware serial)
  - Motherboard Revision: `R2.0` | Firmware: `v2.4.0` | Build: `2026.09`
  - Manufacturing Plate: `PARAMA LABS PRM-DEV-BOARD V2.0`
  - Name Branding: `PARAMESHWARAN S` (must remain on a single line on desktop headers)
  - Terminal Hotkeys: `sudo`, `help`, `matrix`, `konami`, `parama`

---

## 🏗️ Technology Stack

| Layer | Technology | Key Details |
|:---|:---|:---|
| **Core Architecture** | Vanilla JavaScript (ES Modules) | Zero heavy front-end frameworks (no React/Vue runtime overhead). Maximum raw performance and deterministic 60fps execution. |
| **3D Rendering** | Three.js (WebGL) | Custom procedural geometries, CanvasTexture silkscreens, multi-light studio rig, shadow mapping, UnrealBloomPass post-processing. |
| **Animation Engine** | GSAP (GreenSock) + ScrollTrigger + ScrollToPlugin | Camera spline flights, section-by-section snap transitions, retro boot scanline sequences, UI entrance cascades. |
| **Styling & UI** | Pure Vanilla CSS (`style.css`, `scroll.css`) | CSS custom property tokens, frosted glassmorphism (`backdrop-filter: blur`), CRT scanline overlays, responsive split-screen layouts. |
| **Audio Synthesis** | Web Audio API (`sound.js`, `synth.js`) | Dynamic 8-bit oscillator synthesis, relay clicks, DC-DC inductor whine, RF packet chirps, continuity beeps, and power-up chimes. Muted by default. |
| **Tactile Haptics** | Web Vibration API (`haptics.js`) | Tactical micro-vibrations for component hovers, switch clicks, multi-touch gestures, and benchmark completion confirmations. |
| **PWA Engine** | Service Worker (`public/sw.js`) | Stale-While-Revalidate and pre-caching engine delivering resilient offline standalone execution. |
| **Type Safety** | TypeScript (`// @ts-check` + JSDoc) | Complete checkJs coverage across all modules; validated via `npm run typecheck` (`tsc --noEmit`). |
| **Build & Tooling** | Vite | Lightning-fast development server and optimized production rollup bundler. |

---

## 📁 Repository Directory Structure

```
c:\Users\hunte\Parameshwaran_S_Portfolio\
├── index.html                  # Semantic structure, HUD header, section templates, CRT filters
├── main.js                     # System initialization, tick scheduler wiring, global hotkeys, boot launch, SW registration
├── style.css                   # Core design tokens, CRT scanlines, base glassmorphism, responsive grid
├── scroll.css                  # Scroll journey layout, fixed datasheet sidebar, CAD/CAM rack, live bench meters
├── CLAUDE.md                   # AI Developer transfer blueprint (this file)
├── package.json                # Scripts: dev, build, preview, typecheck, smoke
├── jsconfig.json               # TypeScript / checkJs configuration
├── public/
│   ├── manifest.json           # Web App Manifest for standalone PWA installation
│   ├── sw.js                   # Service Worker offline caching engine
│   └── favicon.svg             # Vector hardware board icon
├── tests/
│   └── smoke-tick.mjs          # Headless 14-phase deterministic test suite (zero DOM/WebGL dependency)
└── src/
    ├── config.js               # Global configuration, URLs (LinkedIn, GitHub), responsive breakpoints
    ├── data/
    │   └── portfolio.js        # Single source of truth: projects, skills, education, experience data
    ├── scroll/
    │   └── journey.js          # CatmullRomCurve3 camera flight paths, snap scrolling, panel transitions, focus mode
    ├── three/
    │   ├── scene.js            # PerspectiveCamera, lighting rig (key, fill, backlight, rim light), bloom composer
    │   ├── board.js            # PCB substrate, gold vias, copper pour, silkscreen canvas texture, parallax tilt
    │   ├── components.js       # 3D SMD chips (U1 CPU, U2, Y1, ANT1, J1, D1-D7 LEDs), silicon die, radar ring
    │   ├── project-holograms.js# 3D project dioramas (density radar rings, phonetic waveform sphere, float sensors)
    │   ├── traces.js           # 3D copper traces, corner vias, active section trace energizing pulses
    │   ├── particles.js        # Glowing electron flow particles along trace routes, ambient gold flecks/dust
    │   ├── project-chips.js    # Data-driven 3D project chips (soldered vs breadboard jumpers with LED status)
    │   ├── lcd.js              # 3D LCD display mesh + canvas texture, Signal Snake game integration
    │   ├── lcd-sim.js          # Pure deterministic Signal Snake retro game simulation logic
    │   ├── rover.js            # 3D Nano-Rover mesh generation (chassis, 4 wheels, antenna, headlights)
    │   ├── rover-physics.js    # Rover driving physics, collision detection, and project-chip raycast activation
    │   ├── playground-props.js # Interactive 3D playground obstacles (ramps, cones, hurdles)
    │   ├── overclock.js        # Turbo Overclock system (CPU overclock frequency, particle speed boost, heat bloom)
    │   ├── teardown.js         # CAD/CAM 6-Layer Stackup Inspector, internal GND/PWR planes, X-Ray shader, laser guides
    │   ├── probe.js            # Interactive flying oscilloscope test probe with live voltage readout
    │   ├── potentiometer.js    # Soldermask color theme cycler (Classic Green, Matte Black, Royal Blue, Cyber Red)
    │   ├── power.js            # Power rail relay switch & Night-Bench mode (dimmed room lights, board float)
    │   ├── idle.js             # Idle self-test sequence & heartbeat LED pulse on prolonged user stillness
    │   ├── tick-scheduler.js   # Priority-gated frame tick scheduler (CRITICAL, STANDARD, DEFERRED tiers)
    │   └── ambient-tunings.js  # Per-section circuit neighborhood ambient parameters
    ├── ui/
    │   ├── boot.js             # Retro terminal power-on sequence: laser scanline, typewriter logs, status badges
    │   ├── command-palette.js  # Ctrl+K / Cmd+K BIOS terminal palette with fuzzy search
    │   ├── cursor.js           # Custom scope-probe crosshair cursor with active rail signal telemetry
    │   ├── oscilloscope.js     # Dual-Channel CRT waveform HUD (CH1 probe, CH2 ref) & live logic sniffer
    │   ├── live-bench.js       # Interactive Subsystem Simulation Lab (clock tuning 1x-4x, test vectors, telemetry)
    │   ├── sections.js         # Dynamic DOM card renderer for Projects, Skills, Timeline, and Filter Bar
    │   ├── telemetry.js        # System telemetry HUD chip, live clock/temperature, and debug overlay
    │   └── fallback.js         # Graceful WebGL missing/unsupported degradation UI
    └── utils/
        ├── sound.js            # Synthesized Web Audio SFX (inductor whine, mechanical click, RF chirp, continuity beep)
        ├── haptics.js          # Web Haptics tactile micro-vibrations (hapticTick, hapticClick, hapticSuccess, hapticAlert)
        ├── synth.js            # Square wave synthesizer and audio peak visualizer
        ├── buzzer.js           # Piezo buzzer horn sound generator
        ├── hover.js            # 3D raycasting pointer hover, multi-touch pinch-zoom / twist-rotate, chip tooltip management
        ├── hash-nav.js         # Deep-linking URL hash mapper (`#/about`, `#/projects`, `#/skills`, etc.)
        ├── motion-prefs.js     # Accessibility reduced-motion and touch device detection
        └── analytics.js        # LinkedIn CTA conversion tracking
```

---

## 🎮 Interactive Features & Hotkeys

| Feature | Key / Action | Description |
|:---|:---|:---|
| **🔬 CAD/CAM 6-Layer Stackup** | `E` or Hero Button / HUD Rack | Explodes the board in 3D space into 6 discrete CAD/CAM layers (Silkscreen, Components, Top Cu, FR-4 Core, Internal GND, Internal PWR, Bottom Cu). Features dynamic Z-expansion slider, layer filter isolation (`ALL`, `SILK`, `TOP_CU`, `FR4`, `GND`, `PWR`, `BOT_CU`), and glowing through-hole laser guides. |
| **☢️ X-Ray Fluoroscopy** | HUD Rack Button / `toggleXRayMode` | Inverts the board rendering into a high-contrast cyan fluoroscopic X-Ray inspection mode revealing internal copper routing. |
| **📟 Dual-Channel Oscilloscope** | HUD Scope Rack | Visualizes live probe signal on CH1 (Green), hardware reference clock on CH2 (Amber), plus a live decoded logic sniffer packet strip (`[0x5A, 0xA5, 0x01, CRC-OK]`). |
| **🏎️ PCB Nano-Rover** | `R` or Hero Button | Drive a miniature 4-wheeled rover across the 3D board using `WASD` / `Arrow` keys. Running over chips focuses their datasheets! |
| **🎨 Color Theme Cycler** | Hero Button / Command Palette | Cycles the PCB soldermask between Green, Matte Black, Royal Blue, and Cyber Red. |
| **🕹️ 8-Bit Signal Snake** | Click on `LCD1` or `#/lcd` | An authentic retro Nokia-style Snake mini-game rendered directly onto the 3D LCD screen quad. |
| **📐 Flying Scope Probe** | `WASD` (desktop) + `Enter` | Flies a test probe around the board in 3D. Pressing `Enter` measures the component and reads live voltage rails with acoustic continuity beeps. |
| **📱 Mobile Touch Gestures & Haptics** | Touchscreens | 2-finger pinch-to-zoom and twist-to-rotate camera control with tactile micro-vibration feedback on chips, switches, and benchmarks. |
| **💻 BIOS Command Palette** | `Ctrl+K` / `Cmd+K` / `[CMD]` | Phosphor-green terminal with fuzzy search across sections, utilities, direct links, and easter eggs. |
| **🌙 Night-Bench Mode** | `P` or Command Palette | Switches off the laboratory bench lights; the board floats calmly in the dark with emissive traces glowing. |
| **📊 Debug Telemetry** | `D` or Command Palette | Displays real-time FPS, frame budget, draw calls, and memory telemetry in a retro HUD badge. |
| **🔑 Operator Easter Egg** | Type `parama` | Triggers secret developer operator notes rewarding curious engineers. |

---

## 🚀 Navigation & Scroll Architecture

### 1. Section-by-Section Smooth Snap Scrolling
- **One Gesture = One Clean Transition**:
  - A single deliberate scroll down (mouse wheel, trackpad flick, touch swipe down, `ArrowDown`, `PageDown`, `Space`) smoothly glides from current section to the next (`Hero` ➔ `About` ➔ `Projects` ➔ `Skills` ➔ `Experience` ➔ `Contact`).
  - A single scroll up glides smoothly to the previous section.
- **Smart Panel Overflow Handling**:
  - When scrolling inside `#panel-projects` (or any long panel), scrolling down scrolls the project cards until reaching the bottom; the subsequent scroll down smoothly glides to the next section.
  - When scrolling up from the top of the panel, it smoothly returns to the previous section.
- **Momentum & Cooldown Protection**:
  - A transition duration of `0.85s` with `power2.inOut` ease paired with an inertial cooldown lock ensures trackpad momentum never multi-skips sections uncontrollably.
- **Hash Deep Links**:
  - Every section is directly linkable and back-button compliant (`#/about`, `#/projects`, `#/skills`, `#/experience`, `#/contact`, `#/lcd`).

### 2. Raycast Click-to-Component Focus Mode
- Clicking any labeled 3D component or project chip (e.g. `U2`, `CP1`, `FR1`, `LCD1`) glides the 3D camera into a macro zoom (`duration: 1.2s`), illuminates the chip's LED, and opens a focused datasheet panel.
- Pressing `Esc`, clicking the close button `✕`, or scrolling smoothly releases focus and returns the camera to the section stop.

---

## 🎨 Design System & UI Aesthetics

1. **Colors**:
   - Signal Green: `#3ee6a0` (Primary LED / active state)
   - ENIG Gold: `#c9a24b` (Plated vias, copper accents, secondary highlights)
   - Soldermask Dark: `#05140b` / `#08140e`
   - Text Primary: `#d7ffe6`
   - Dark Backdrop: `#030705`
2. **Typography**:
   - Headings: `Chakra Petch` (600/700/800)
   - Monospace Registers: `Fragment Mono`
   - Body Copy: `Instrument Sans`
3. **Glassmorphism**:
   - `background: rgba(8, 20, 14, 0.82); backdrop-filter: blur(24px); border: 1px solid rgba(62, 230, 160, 0.18); border-radius: 20px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);`
4. **CTA Discipline**:
   - Exactly **ONE** primary `CONNECT ON LINKEDIN` CTA per section.

---

## 🧪 Testing & Verification Protocols

Always run and maintain 100% green checks before committing any changes:

```bash
# 1. Type Safety Check (0 errors required)
npm run typecheck

# 2. Comprehensive 14-Phase Smoke Test (must PASS)
npm run smoke

# 3. Production Vite Bundle Build
npm run build
```

### What the 14-Phase Smoke Test Validates:
1. **Phase R**: Real-loop clock & delta clamp (16.7ms steady cadence, 50ms spike clamp).
2. **Phase R2**: Priority scheduler budget gating (CRITICAL runs every frame; STANDARD/DEFERRED shed under load).
3. **Phase A**: 12,000 frames normal motion simulation (zero NaN, board float/sweep/dust/LED within strict invariant bounds).
4. **Phase B**: Reduced-motion enforcement (materials frozen, float planted).
5. **Phase F**: Ambient signatures across all 6 section neighborhoods.
6. **Phase E**: Signal Snake LCD game state machine, collision, distance scoring, physics.
7. **Phase C**: Raycast layer (165 aimable component poses across all camera stops).
8. **Phase D**: Idle drift & 60s idle self-test sequence.
9. **Pure Math**: Directional stops, wheel step queues, and hash navigation round-trips.

---

## ⚠️ Critical Rules & Gotchas for AI Engineers

1. **Preserve Single-Line Name Constraint**:
   - The desktop header brand text `PARAMESHWARAN S` must always stay on a single line (`white-space: nowrap;`). Never allow it to wrap into two lines.
2. **Sound Policy**:
   - Audio is muted by default. Never initialize `AudioContext` or play sound without `isSoundEnabled()` being true and triggered by a direct user gesture.
3. **CheckJs Integrity**:
   - All `.js` files must maintain clean `// @ts-check` JSDoc annotations. Never introduce raw TypeScript files (`.ts`) that require compiler stripping in Vite unless explicitly requested.
4. **Maintain Deterministic Headless Execution**:
   - `tests/smoke-tick.mjs` runs in Node.js without browser DOM or WebGL. Any new module imported by the smoke test must guard DOM/canvas access (`typeof window !== 'undefined'`).
5. **Camera Transitions**:
   - Never snap the camera instantly unless in lite-mode / boot skip. Always use smooth GSAP tweens (`power2.inOut`).

---

*Last Updated: 2026-08 — Master Blueprint synced and verified.*
