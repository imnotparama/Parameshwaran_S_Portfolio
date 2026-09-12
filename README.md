# PARAMA DEV BOARD (v2.0)

[![CI Status](https://github.com/imnotparama/Parameshwaran_S_Portfolio/actions/workflows/smoke.yml/badge.svg)](https://github.com/imnotparama/Parameshwaran_S_Portfolio/actions)
![Three.js r185](https://img.shields.io/badge/Three.js-r185-green?style=flat&logo=three.js)
![TypeScript](https://img.shields.io/badge/TypeScript-Typechecked-blue?style=flat&logo=typescript)
![WebGL 2.0](https://img.shields.io/badge/Graphics-WebGL%202.0-orange?style=flat)
![Allocation Discipline](https://img.shields.io/badge/Render%20Loop-Scratch%20Registers-brightgreen)

An interactive 3D digital twin development board portfolio showcasing Electronics & Communication Engineering (ECE) and Data Science. Instead of a conventional flat webpage, the portfolio is engineered as a physical 4-layer FR-4 motherboard: scrolling guides a plasma current wavefront along realistic copper routes, while the camera smoothly tracks each electrical path directly into physical hardware modules.

**Live Board:** [https://parama.dev](http://localhost:5173) (via `npm run dev`)

![PCB Digital Twin Preview](public/og-preview.png)

---

## Overview

PARAMA DEV BOARD is designed as an authentic hardware development system. Visitors navigate software and engineering projects by physically inspecting board components:
- **`U1` Core Processor:** Bio, background, and ECE / Data Science foundation.
- **`U2` Expansion Modules:** Soldered and breadboard hardware/software projects (FlyRank, CrowdPulse, Dialora, BusIT, AquaDot).
- **`C1–C4` Component Library:** Filtered engineering capability matrix and tech stack pills.
- **`J1` Signal History:** Academic timeline, internships, and engineering leadership milestones.
- **`ANT1` Transmission Interface:** Uplink contact portal and social networks.
- **`LCD1` Signal Runner:** Built-in 128×64 monochrome CRT arcade mini-game running on an isolated deterministic engine.

---

## Why This Portfolio Exists

> *"Instead of another scrolling webpage, I wanted my portfolio to reflect how I think as an engineer—systems, diagnostics, modular architecture, and interactive software. The entire experience is designed as a hardware development board because embedded systems and AI are the domains I enjoy building in."*

---

## Features

- **Current-Guided Conduction Engine:** Scrolling drives an authentic multi-layer charge packet (plasma core, bloom halo, trailing spark motes, localized point light) along physical copper traces into each hardware module.
- **Snappy 0.6–0.85s Camera Kinematics:** Parametric Catmull-Rom 3D spline flight paths calibrated so the camera never makes the user wait, complete with 180ms trackpad inertia filters.
- **Real-Time CRT Oscilloscope:** Synchronized signal visualization reflecting authentic operational waveforms for each inspected IC.
- **Dedicated Engineering Architecture Panel:** An in-depth specification modal detailing graphics shaders, the 8-state machine, live WebGL telemetry, and the performance budget.
- **Signal Runner LCD Arcade (`#/lcd`):** An embedded 128×64 monochrome CRT display game with jump/slide/dash physics, LCG seed determinism, and high-score persistence.
- **BIOS Terminal Command Palette (`Ctrl+K` / `[CMD]`):** Retro phosphor-green terminal with fuzzy search across all sections, utilities, direct links, and system actions.
- **Genuine Runtime Telemetry:** Live FPS, draw calls, rendered triangles, geometry buffers, and canvas metrics derived directly from `renderer.info` without fake silicon metrics.
- **Fast 2.8s Boot Sequence with Return Skip:** Hardware power-on POST sequence with instant `[ESC]` skip affordance and `localStorage` return-visit caching.
- **Low-Glare Bench Mode:** Instant one-click toggle reducing bloom strength to 0.35× and dimming ambient lighting for comfortable viewing sessions.
- **Tactile Audio Feedback:** Synthesized mechanical relay clicks, frequency-modulated inductive scroll whines, and audio chimes synthesized via Web Audio oscillators (muted by default).

---

## Architecture

### System Execution Pipeline

```text
  [ User Input / DOM Events ]
               │
               ▼
   [ Main Loop (rAF Step) ] ── (60 FPS Clock / Priority Scheduler)
               │
               ▼
    [ 8-State State Machine ] ── (OFF, BOOT, IDLE, ACTIVE, OVERCLOCK...)
               │
               ▼
  [ Scene Renderer (WebGL2) ] ── (Three.js r185, Custom Shaders, Bloom)
               │
               ▼
  [ Interaction & Raycasting ] ── (Canvas-Relative NDC, Probe, Click)
               │
               ▼
      [ UI & CRT HUD ] ──────── (Daughterboard Panels, Oscilloscope)
               │
               ▼
  [ Genuine Telemetry Engine ] ── (Three.js renderer.info / Live State)
               │
               ▼
    [ Portfolio Data Store ] ─── (src/data/portfolio.js Single Source)
```

### Design Decisions (The "Why")

- **No React / React Three Fiber:** Direct imperative WebGL avoids virtual DOM diffing and garbage collector churn during continuous 60 FPS animation loops.
- **Vanilla JS + Strict Typed JSDoc:** Deterministic render lifecycle and single source of truth without hydration delays or heavy framework bundles.
- **Camera Transitions < 850ms:** Eliminates recruiter navigation friction while retaining continuous 3D spatial orientation.
- **Allocation Discipline in Render Loop:** Designed to avoid unnecessary allocations during continuous animation loops by reusing pre-allocated scratch vectors (`_camPosTarget`, `_sparkTarget`, etc.).
- **Authentic Telemetry Only:** Replaced synthetic datasheet numbers with live metrics derived from browser and WebGL state.
- **Cached Boot via LocalStorage:** Respects reviewer time by playing the boot POST once and bypassing it on subsequent visits.

---

## Installation & Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

```bash
# 1. Clone repository
git clone https://github.com/imnotparama/Parameshwaran_S_Portfolio.git
cd Parameshwaran_S_Portfolio

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
# Open http://localhost:5173

# 4. Production build
npm run build

# 5. Strict TypeScript validation (0 errors)
npm run typecheck

# 6. Headless 14-phase deterministic motion smoke test
npm run smoke
```

---

## Controls & Keybindings

| Input | Action | Description |
| :--- | :--- | :--- |
| `Scroll / Wheel` | **Navigate Modules** | Advances current wavefront and camera to next/previous section |
| `1` – `6` | **Direct Jump** | Instantly navigates to Hero (1), About (2), Projects (3), Skills (4), Exp (5), Contact (6) |
| `Click (on IC)` | **Inspect Module** | Glides camera directly into chip and opens detailed project datasheet |
| `Ctrl+K` / `Cmd+K` | **Command Palette** | Opens BIOS phosphor terminal with fuzzy command search |
| `Esc` | **Exit / Dismiss** | Releases chip inspection, closes modals, exits game mode |
| `W A S D` | **Flying Probe** | Flies active test probe over PCB surface (Enter to MEASURE) |
| `P` | **Toggle Power** | Cuts bench lighting for night inspection mode |
| `sudo` / `help` | **Terminal Shell** | Opens BIOS Command Terminal |
| `matrix` | **Phosphor Mode** | Toggles CRT phosphor diagnostic stream overlay |
| `konami` | **Overclock** | Engages 100MHz Turbo Overclock mode |

---

## Performance Budget

| Constraint | Budget Target | Live Actual | Verification |
| :--- | :--- | :--- | :--- |
| **Target Frame Rate** | 60.0 FPS | **60.0 FPS** (steady) | `requestAnimationFrame` + Tiered scheduler |
| **Draw Calls** | < 80 calls | **~48–54 calls** | Batched geometries, instanced pins |
| **Memory Footprint** | < 150 MB | **Observed in dev (<100MB)** | Pre-allocated scratch registers |
| **Boot Sequence** | < 3.0 s | **2.8 s** (first) / **0.0 s** (return) | `localStorage` fast-path bypass |
| **Input Latency** | < 100 ms | **Target: < 1 frame (~16.7ms)** | Direct DOM event dispatch |
| **Shader Passes** | ≤ 2 passes | **2 passes** | Scene Render + Selective UnrealBloomPass |

---

## Folder Structure

```text
├── index.html                 # HUD bar, CRT scanlines, datasheet panels, architecture modal
├── main.js                    # Core entry: tick scheduler, boot execution, event bus, deep routing
├── scroll.css                 # PCB design system: daughterboard cards, SVG diagram, mobile drawer
├── style.css                  # Base styles, typography tokens, scanline overlays, HUD layouts
├── tests/
│   └── smoke-tick.mjs         # Headless 14-phase deterministic motion smoke test suite
├── docs/
│   └── claude.md              # Engineering specification & architectural changelog
└── src/
    ├── config.js              # Environment settings, URLs, lite mode detection
    ├── data/
    │   └── portfolio.js       # Single source of truth for projects, skills, and experience
    ├── scroll/
    │   └── journey.js         # Camera spline math, current wavefront, scroll-snap gating
    ├── three/
    │   ├── board.js           # FR-4 substrate, silkscreen canvas, mounting holes, via array
    │   ├── components.js      # SMD 3D components (U1, U2, caps, LEDs, crystal, USB)
    │   ├── traces.js          # 4-layer copper routes, conduction lighting, signal pulses
    │   ├── particles.js       # Electron drift motes, ambient dust, gold flecks
    │   ├── project-chips.js   # 3D project daughterboard chips & status LEDs
    │   ├── lcd.js             # 128x64 monochrome CRT display mesh & camera integration
    │   ├── lcd-sim.js         # Pure zero-dependency simulation seam for Signal Runner
    │   ├── scene.js           # Three.js WebGL2 renderer, lights, bloom pass, quality guardrails
    │   └── tick-scheduler.js  # Tiered priority scheduler (CRITICAL, STANDARD, DEFERRED)
    ├── ui/
    │   ├── boot.js            # 2.8s deterministic GSAP power-on timeline
    │   ├── command-palette.js # BIOS terminal command palette (Ctrl+K)
    │   ├── oscilloscope.js    # Real-time HTML5 canvas CRT waveform monitor
    │   ├── telemetry.js       # Genuine diagnostic telemetry & UART serial streamer
    │   └── sections.js        # Dynamic HTML datasheet renderer from portfolio data
    └── utils/
        ├── hover.js           # Raycasting, NDC canvas conversion, tooltip positioning
        ├── sound.js           # Web Audio oscillator synthesizer (muted by default)
        └── motion-prefs.js    # Single-source reduced-motion media query listener
```

---

## Verification Protocol

Before merging or deploying any change, the three-tier validation pipeline must pass:

```bash
npm run typecheck    # 100% strict TypeScript/JSDoc type safety
npm run smoke        # 14-phase headless deterministic motion test
npm run build        # Production bundle compilation
```

---

## License

Designed and developed by **Parameshwaran S** (Electronics & Communication Engineering + Data Science).
Distributed under the [MIT License](LICENSE).
