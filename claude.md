# PCB 3D Zoom Microarchitecture Portfolio - Developer Transfer Log & Comprehensive Code Blueprint

Hi! This file is for the incoming AI agent (Claude) to provide a complete, deep-dive technical transfer of all logic, mathematics, rendering rules, layout configurations, coordinates, and component dimensions built in this repository.

---

## 🛠️ Core Tech Stack & Specifications

- **Vite & Vanilla JavaScript (ES Modules)**: Fast bundler without TypeScript compiles or framework boilerplates.
- **Three.js**: Custom WebGL board substrate, solid 3D box segment traces, timing crystals, copper pins, and glowing electron flow nodes.
- **GSAP (GreenSock)**: Drives multi-phase booting timeline sequences, typewriter cursor loops, and hover emissive color transitions.
- **Pure CSS**: Scanline CRT overlay filter, absolute flex header/footer positions, and HUD panel designs.
- **Fonts**: Orbitron (ECE style headings) + Share Tech Mono (Monospaced registers).

---

## 📁 Detailed Directory Structure & Code Layout

```
c:\Users\hunte\Parameshwaran S_Portfolio\
├── main.js                  # Central bootstrapping, ticks registration, and boot triggers
├── index.html               # Floating typography overlays, stat badges, and CRT filter divs
├── style.css                # Full-screen fixed canvas containers, CRT console styles, HUD templates
├── scroll.css               # Scroll journey layer - panel styles, lite mode, mobile responsive
└── src/
    ├── config.js            # Public URLs, lite mode / reduced motion / viewport detection
    ├── data/
    │   └── portfolio.js     # Master database of CV stats, education, projects, skills, tools
    ├── three/
    │   ├── scene.js         # Viewport, lights, bloom, FPS guardrail, tick callbacks registry
    │   ├── board.js         # Green board extrusion, silkscreen CanvasTexture, parallax tilt
    │   ├── components.js    # Component definitions, interactive targets, sub-core groups
    │   ├── traces.js        # Coordinate pathways, box segment traces, cylinder vias
    │   ├── particles.js     # Path interpolation, segment mapping, hover speed boosts
    │   └── project-chips.js # Breadboard/soldered project chips driven by data.status
    ├── scroll/
    │   └── journey.js       # Scroll journey: camera path, screen-space panels, connector SVG, vignette
    ├── ui/
    │   ├── boot.js          # Multi-phase boot: scanline sweep + typewriter terminal lines
    │   ├── sections.js      # Datasheet content injection from portfolio data
    │   ├── pcb-hud.js       # Diagnostics HUD terminal for component hover/zoom
    │   ├── tooltip.js       # Mouse-following tooltip for PCB hovers
    │   ├── sidepanel.js     # Legacy side info panel
    │   └── fallback.js      # WebGL fallback UI
    └── utils/
        ├── hover.js         # Raycasting, hover glow/pulse, view state transitions
        └── camera-states.js # Camera zoom state machine (PCB/ZOOMING_IN/ZOOMED_IN/ZOOMING_OUT)
```

---

## ⚙️ Module-by-Module Technical Logic & Mathematics

### 1. Central Initializer: `main.js`
- **Logic**: Executes on `DOMContentLoaded`. Triggers scene, board, components, traces, particles, project chips, sections render, hover init, bloom, and boot sequence in order.
- **Tick Callbacks**: Registers `updateParticles`, `updateProjectChips`, `checkHover`, `updateBoardParallax`, and `updateJourneyEffects` (if full-journey mode) into `tickCallbacks` array.
- **Navigation**: Binds `.nav-btn` click handlers to `scrollToSection()` for scroll-journey, falls back to `triggerComponentAction()` for legacy zoom mode.
- **Journey Init**: Calls `initJourney(camera, boardGroup)` after boot sequence completes.

### 2. Viewport & Lighting Setup: `src/three/scene.js`
- **Camera**: `PerspectiveCamera(45, Aspect, 0.1, 1000)` at `(0, -2, 17)` looking at origin.
- **Lights**: AmbientLight (green tint), DirectionalLight (key + fill), PointLight (green underglow behind board).
- **Renderer**: WebGL with alpha, antialias, PCFSoftShadowMap, pixel ratio capped at 2.
- **Bloom**: UnrealBloomPass (strength 0.45, radius 0.3, threshold 0.7). Created by `enableBloom()`.
- **FPS Guardrail**: 30-frame sliding window of frame deltas. If sustained average <50fps, reduces bloom strength to 0.2 and radius to 0.1. Runs once (bloomReduced flag).
- **Tick Loop**: `requestAnimationFrame` drives all callbacks, renders via composer (bloom) or plain renderer.

### 3. Board Geometry & Canvas Silkscreen: `src/three/board.js`
- **Board Shape**: Extruded rounded rectangle (width 11, height 15, thickness 0.16, corner radius 0.4).
- **Solder Mask**: Dark green with soldermask overlay plane.
- **Silkscreen**: 2048x4096 offscreen canvas → CanvasTexture → thin overlay mesh at z = thickness/2 + 0.003. Contains component outlines, border tracing, hatched copper pours, SRM markings, Tamil character, crosshairs, mock QR.
- **Parallax Tilt**: `updateBoardParallax(elapsed, mouse)` tilts board via LERP. In journey mode: ultra-smooth micro-tilt (magnitude 0.003, lerp 0.035, no deadzone). In legacy mode: full tilt (magnitude 0.08, lerp 0.08, bob).

### 4. Solid Traces Routing: `src/three/traces.js`
- **3D Solid Traces**: BoxGeometry segments between node points. Each segment: calculate distance, midpoint, rotation angle (atan2). Width varies by trace.
- **Vias**: Gold cylinders at corners with dark center cylinders. Edge trace around board perimeter.
- **Trace Data**: Exported `traceData` array used by boot sequence (emissive flash) and particles.

### 5. Electron Flows: `src/three/particles.js`
- **Spawn**: 3 glowing spheres per trace path. Multi-segment LERP interpolation with progress wrapping.
- **Hover Boost**: `setHoveredTraceSpeedBoost()` accelerates connected particles (3x speed) and turns gold→white.

### 6. Interactive Raycasting & Camera Zooms: `src/utils/hover.js`
- **State Machine**: `viewState` tracks 'PCB' | 'ZOOMING_IN' | 'ZOOMED_IN' | 'ZOOMING_OUT'.
- **Hover Disambiguation (Req 3)**: In journey mode (`full-journey` class present), hover is **subtle glow only**:
  - Emissive intensity: 0.5 (not 0.9)
  - Scale pulse: 1.04 (not 1.12)
  - Hover light intensity: 0.6 (not 1.5)
  - No tooltip / HUD / trace speed boost during hover
  - These effects are reserved for scroll-arrival (full camera zoom + datasheet panel)
- **Legacy Hover**: Outside journey mode, full tooltip + HUD + trace boost still activates.
- **Component Shell Toggle**: `toggleComponentShells()` hides outer body, shows internal sub-core groups.
- **Camera LERP**: `updateCamera()` drives position and lookAt toward target with LERP factor 0.08.

### 7. Scroll Journey: `src/scroll/journey.js` (MAJOR REWRITE)
- **Camera Path**: `PATH` array defines 6 stop sections + 5 via points along a CatmullRomCurve3.
- **Stop Positions**: Each section's camera positioned at z=2.0 from its component (About: U1 CPU, Projects: U2 GPU, Skills: capacitor bank, Experience: J1 USB). Hero/contact at z=13/14 for wide establishing shots.
- **ScrollTrigger**: One trigger per travel leg, `scrub: 0.6`, `power2.out` easing, drives `setCameraAtT()`.
- **Panel Activation by Camera Arrival**: NOT by scroll position. `updateJourneyEffects()` runs per frame:
  - Finds nearest section via cached `stopPosVectors` (squared distance, no GC per frame)
  - Activates panel when camera distance < threshold (3.5 for components, 6.0 for hero/contact)
  - 10-frame cooldown (`DEACTIVATE_FRAMES`) + `inAnyZone` check prevents flickering
  - Panels deactivate only after sustained absence from all zones
- **Screen-Space Panel Positioning**:
  - `COMPONENT_WORLD` maps section IDs to board-local 3D positions
  - `boardGroup.localToWorld()` + `Vector3.project()` converts to CSS pixel coordinates every frame
  - Panels positioned adjacent to component, left or right based on screen half
  - CSS `translateY(24px) scale(0.97)` → `translateY(0) scale(1)` animation preserved
- **Connector SVG Line**:
  - Fixed SVG overlay at z-index 29, `pointer-events: none`
  - Dashed line (`stroke-dasharray: 4 4`, color: rgba(0,255,136,0.45)) from component center to panel edge
  - Glowing dot (circle r=3) at component end
  - Visible only for component sections (hero/contact have no connector)
- **Dynamic Vignette**:
  - `.vignette-overlay` opacity varies 0.35 (base) → 0.85 (when zoomed into component)
  - CSS transition on opacity: `0.5s cubic-bezier(0.22, 1, 0.36, 1)`
  - Intensity mapped from camera distance: closer = darker vignette
- **Direct Navigation**: `scrollToSection()` uses `gsap.to(window, { scrollTo, overwrite: 'auto' })` - scroll position stays synced with GSAP.

### 8. Power-on Boot Sequencer: `src/ui/boot.js` (MODIFIED)
- **GSAP Timeline**: Multi-step sequence:
  1. Set initial hidden states (overlay opacity 1, canvas/badges/HUD hidden)
  2. Scanline sweep: horizontal laser from top:0% to top:100% (duration 0.85s)
  3. **Terminal typewriter** (NEW - Req 5): Sequential lines at 30ms/character:
     - `> INITIALIZING PARAMA-DEV-BOARD...`
     - `> LOADING GEOMETRY...`
     - `> ALL PCB SYSTEMS OPERATIONAL`
     - Status element preserved and appended at bottom after all lines finish
  4. HUD bar fade in, hero panel reveal, subtitle typewriter effect
  5. Stat badges stagger in with back.out easing
  6. PCB board floats up from below (position y: -15 → 0, rotation 0 → -π/10, -π/20)
  7. Traces emissive flash one-by-one
  8. CPU pins sequential gold flash (32 pins, staggered)
  9. LEDs sequential blink
  10. Electron particles appear, CPU silicon die pulses
  11. Terminal status: "ALL SYSTEMS OPERATIONAL"
  12. Overlay fades out, interactive mode unlocked
- **Lite Mode**: Skip all animations, show everything immediately.

### 9. Project Chips: `src/three/project-chips.js`
- **Data-Driven Rendering (Req 4)**: `proj.status` from portfolio.js drives visual:
  - `'shipped'` → soldered chip: solid gold trace to bus, steady glow LED (emissive intensity 1.4)
  - `'building'` → breadboard patch: visible jumper wires (3 colors), hole grid, loosely-seated chip, flickering LED
  - Adding a new project with the correct `status` field automatically selects rendering
- **Per-frame Update**: `updateProjectChips(elapsed)` flickers breadboard LEDs via sin modulation, keeps soldered ones steady.

---

## 📐 Precise Dimensions & Mesh Coordinates

### 1. Board Extrusion
- Thickness = 0.16 units. Surface Z = 0.085 units.

### 2. Component Centers & Geometries
| Ref | Description | Geometry | Position (x, y, z) |
|:---|:---|:---|:---|
| U1 | Main CPU | Box 2.4×2.4×0.22 | (0, 1.0, 0.085) |
| U2 | GPU (Projects) | Box 1.8×1.8×0.18 | (-3.2, 4.5, 0.085) |
| C1-C4 | Capacitor bank | Cylinder R=0.2, H=0.7 | (2.3/2.9/3.5/4.1, 4.5, 0.085) |
| Y1 | Crystal Oscillator | Box 1.2×0.6×0.26 | (-3.5, 0.5, 0.115) |
| ANT1 | Antenna bounding | Box 1.0×1.0×0.15 | (3.5, 0.5, 0.135) |
| J1 | USB-C power | Box 1.2×0.8×0.32 | (0, -7.3, 0.145) |
| VR1 | Regulator | Box 0.7×0.7×0.16 | (3.5, -4.5, 0.085) |
| RN1 | Resistor Network | Box 1.3×0.16×0.35 | (0, -3.5, 0.235) |
| D1-D7 | LED Array | Bounds 2.4×1.4 | centered at (-3.5, -4.5) |

### 3. Camera Path Stop Positions
| Section | Camera Position (x, y, z) | lookAt (x, y, z) |
|:---|:---|:---|
| sec-hero | (0, -5.2, 13) | (0, 0.4, 0) |
| sec-about | (0, 1.0, 2.0) | (0, 1.0, 0.06) |
| sec-projects | (-3.2, 4.5, 2.0) | (-3.2, 4.5, 0.06) |
| sec-skills | (3.2, 4.5, 2.0) | (3.2, 4.5, 0.06) |
| sec-experience | (0, -7.3, 2.0) | (0, -7.3, 0.06) |
| sec-contact | (0, -5.0, 14) | (0, 0, 0) |

### 4. Component World Positions (boardGroup local space, for screen-space projection)
| Section | Position |
|:---|:---|
| sec-about | (0, 1.0, 0.085) |
| sec-projects | (-3.2, 4.5, 0.085) |
| sec-skills | (3.2, 4.5, 0.085) |
| sec-experience | (0, -7.3, 0.085) |

---

## 🧩 Zoomed-in 3D Internal Architecture Mappings

### CPU (U1) - Sub-Cores
- 4 cores at z=0.12: ALU (orange, top-left), NPU (red, top-right), CU (blue, bottom-left), IO (green, bottom-right)
- Silicon die: 6×6 grid CanvasTexture on PlaneGeometry at z=0.115
- 32 gold pins around border (8 per side, pitch 0.25)
- CPU Radar Ring: RingGeometry with additive blending

### GPU (U2) - Project Cores
- 6 execution cores in 3×2 grid on silicon baseplate
- Each core: Box 0.32×0.32×0.05 with blue edge line

### Crystal Oscillator (Y1) - Education Plates
- 3 quartz plates: BTech (left), Class12 (center), Class10 (right)
- Purple edge lines

### USB (J1) - Experience Contacts
- 3 gold contact pins with orange edge lines

### Regulator (VR1) - Tech Stack Fins
- 5 cooling fins with red edge lines: Languages, Frameworks, AI/ML, Tools, Cloud

---

## 🎨 Theme & CSS Architecture

### Root Variables (style.css)
- `--bg-color: #030b06`, `--glow-green: #00ff88`, `--pcb-gold: #c8960c`
- Glass-morphism panels: `backdrop-filter: blur(8px)`, layered box-shadows
- Vignette: `radial-gradient(circle, transparent 30%, rgba(0,0,0,0.6) 100%)` with dynamic opacity

### Panel System (scroll.css)
- Full-journey mode: `position: fixed` with JS-driven left/right/top pixel positioning
- Hero/contact centered with `!important` CSS transforms (protected from JS)
- Transition: `opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1), transform 0.6s` with scale+slide animation
- `will-change: transform, opacity` for GPU acceleration

### Lite Mode (<768px viewport or prefers-reduced-motion)
- Body `class="lite-mode"`, no scroll-jacking, vertical CSS section stack
- Same PCB visual language, colors, typography — 3D canvas still visible as background
- Detect via `config.js`: `isSmallViewport()` checks `window.innerWidth < 768`

### Mobile Responsive
- 900px breakpoint: HUD bar wraps, smaller nav buttons
- 640px breakpoint: Full-width panels, smaller typography, grid→single column

---

## 🚀 How to Run & Build
```bash
npm run dev     # Development server
npm run build   # Production build to dist/
```

---

## ⚡ Performance Optimizations

1. **Raycaster Throttling**: Every 3rd frame (`frameCounter % 3 === 0`), 66% CPU reduction.
2. **Target Isolation**: `interactiveObjects` / `insideInteractiveObjects` filtered by `obj.userData.isInteractive`.
3. **Immediate Hover Reset**: `emissiveIntensity = 0.0` set directly (bypasses GSAP) for instant feedback.
4. **Static Coordinate Reuse**: Mouse vectors declared once at module scope.
5. **Cached Vectors**: `stopPosVectors` pre-allocated, no garbage collection per frame.
6. **Squared Distance First**: Nearest-section check uses squared distance, sqrt only once for thresholds.
7. **FPS Guardrail** (Req 7): Bloom strength/radius reduced if sustained <50fps over 30-frame window.
8. **Debounced Resize**: 100ms timeout on window resize.
9. **Pixel Ratio Cap**: `Math.min(window.devicePixelRatio, 2)`.

---

## ✅ Session Change Log (All Modifications Made)

The following is a complete log of every file changed during the session, organized by requirement:

### Req 1: Section-to-Section Camera Continuity
- Already satisfied by CatmullRomCurve3 path with scrub:0.6 + power2.out. No changes needed.

### Req 2: Nav Clicks Sync With Scroll State
- Already satisfied by `gsap.to(window, { scrollTo, overwrite: 'auto' })` in `scrollToSection()`. No changes needed.

### Req 3: Hover vs Scroll-Arrival Disambiguation
- **File**: `src/utils/hover.js`
- Changed `handleHoverEnter()`: wrapped tooltip/HUD/trace boost behind `if (!document.body.classList.contains('full-journey'))` guard
- Reduced hover emissive intensity: 0.9 → 0.5
- Reduced hover scale pulse: 1.12 → 1.04
- Reduced hover light intensity: 1.5 → 0.6
- Changed `resetHoverMesh()`: tooltip/HUD cleanup also guarded by journey mode check

### Req 4: Breadboard/Soldered From Data (Already Implemented)
- `src/three/project-chips.js` reads `proj.status` from `portfolio.data`.
- `'building'` → breadboard patch with flicker, `'shipped'` → soldered chip with steady glow.
- No changes needed.

### Req 5: Terminal Boot Sequence
- **File**: `src/ui/boot.js`
- Added `typeTerminalLine()` helper function (appends div, types char by char at 30ms, fires callback on complete)
- Replaced generic boot terminal text with sequential: `> INITIALIZING PARAMA-DEV-BOARD...`, `> LOADING GEOMETRY...`, `> ALL PCB SYSTEMS OPERATIONAL`
- Status element preserved before `innerHTML = ''`, re-appended at bottom after all 3 lines finish
- Subtitle typewriter speed: 35ms → 30ms
- **Bug fixed**: `#terminal-status-text` was destroyed by `innerHTML = ''` — now preserved and re-inserted
- **Bug fixed**: Scanline sweep was removed — now restored as step 2 before terminal messages
- **Bug fixed**: Status appeared at top of terminal (visual inversion) — now appended at bottom after all lines finish

### Req 6: Mobile Fallback at 768px
- **File**: `src/config.js`
- Changed `isSmallViewport()` threshold: 820 → 768
- Lite mode activates: no scroll-jacking, vertical CSS stack, same PCB styling

### Req 7: Performance Guardrail (50+ fps)
- **File**: `src/three/scene.js`
- Added FPS monitoring: 30-frame sliding window of delta times
- If sustained avg <50fps, reduces bloom strength to 0.2 and radius to 0.1
- `bloomReduced` flag prevents repeated reductions
- `checkPerformance(deltaMs)` called every frame before tick callbacks

### Smoothness Improvements (Earlier Session)
- **File**: `src/scroll/journey.js`
- Scrub: 0.3 → 0.5 (later adjusted to 0.6)
- Easing: power1.out → power2.out
- Path tension: 0.35 → 0.4
- scrollToSection duration: 1.4s → 1.6s

- **File**: `scroll.css`
- Added `overscroll-behavior: contain`
- Added `-webkit-overflow-scrolling: touch`
- Added `will-change: transform, opacity` to panels and CTAs
- Panel transition: 0.45s → 0.55s ease, then 0.6s with scale animation and cubic-bezier
- Removed `content-visibility: auto` (was breaking `position: fixed` panels)

- **File**: `src/three/board.js`
- Removed mouse threshold deadzone for micro-tilt (was `Math.abs(mouse.x) > 0.3`)
- Lerp: 0.02 → 0.035, magnitude: 0.005 → 0.003

### Camera Zoom + Screen-Space Panels (Major Feature)
- **File**: `src/scroll/journey.js` — Complete rewrite:
  - Camera PATH updated to z=2.0 for all component stops (was 2.6-3.1)
  - Added `COMPONENT_WORLD` mapping for screen-space projection
  - Added `updateJourneyEffects()` per-frame callback: finds nearest section, activates panels on arrival, positions panels via Vector3.project(), draws connector SVG line, controls vignette intensity
  - Added SVG connector overlay with dashed line + glow dot
  - Added distance-threshold panel activation with 10-frame cooldown
  - Added `stopPosVectors` cache (no GC per frame)
  - Exported `updateJourneyEffects()`

- **File**: `main.js`
  - Imported `updateJourneyEffects`
  - Passes `boardGroup` to `initJourney(camera, boardGroup)`
  - Registers `updateJourneyEffects` in tick callbacks (guarded by `!isLiteMode()`)

- **File**: `scroll.css`
  - Removed per-section fixed panel positions (about, projects, skills, experience now positioned by JS)
  - Hero/contact panels protected with `!important` centering
  - Panel transition: 0.6s with scale(0.97→1.0) + translateY animation

- **File**: `style.css`
  - Updated root variables: richer color palette (`--glow-green-dim`, `--panel-bg`, `--panel-border`, `--panel-shadow`)
  - Vignette: stronger gradient + CSS opacity transition

### Complete File Manifest (All Changed Files)
| File | Changes |
|:---|:---|
| `src/scroll/journey.js` | Complete rewrite: camera path, screen-space panels, connector SVG, vignette, distance activation |
| `src/utils/hover.js` | Hover disambiguation: subtle glow only in journey mode |
| `src/config.js` | Mobile threshold 820→768 |
| `src/ui/boot.js` | Terminal boot sequence + scanline + status element fix |
| `src/three/scene.js` | FPS guardrail with bloom reduction |
| `scroll.css` | Dynamic panel positioning, glass-morphism, will-change, connector z-index |
| `style.css` | Richer color variables, vignette transition |
| `main.js` | Pass boardGroup to initJourney, register updateJourneyEffects |
| `src/three/board.js` | Smoother micro-tilt (no deadzone, higher lerp) |
| `claude.md` | This file - complete session memory |
