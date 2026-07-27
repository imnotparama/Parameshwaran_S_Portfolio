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
└── src/
    ├── data/
    │   └── portfolio.js     # Master database of CV stats, education, projects, skills, and tools
    ├── three/
    │   ├── scene.js         # Viewport setups, lights, PointLight underglows, and callbacks registry
    │   ├── board.js         # Green board shape extrusion, silkscreen CanvasTexture overlays, hatched pours
    │   ├── components.js    # Component definitions, interactive targets, and sub-core groups
    │   ├── traces.js        # Coordinate pathways, orienting box segments, and cylinder vias
    │   └── particles.js     # Path interpolation logic, segments mapping, speed overrides
    ├── ui/
    │   ├── boot.js          # Multi-phase boot sequencer, CPU pin flashes, terminal typewriter log
    │   └── tooltip.js       # Mouse-following HUD tooltip for initial PCB hovers
    └── utils/
        └── hover.js         # Raycasting NDC maps, ViewState transitions, Camera LERP loop, HUD console
```

---

## ⚙️ Module-by-Module Technical Logic & Mathematics

### 1. Central Initializer: `main.js`
- **Logic**: Executes on `DOMContentLoaded`. Triggers scene, board, components, traces, and particles instantiation sequentially. Adds standard loops (raycast checks, particle movements, tilt board parallax offsets) into `tickCallbacks` and executes `runBootSequence()`.
- **Imports live bindings**: Resolves ES Modules binding properties for dynamic scene variables.

### 2. Viewport & Lighting Setup: `src/three/scene.js`
- **Camera Configuration**: `PerspectiveCamera(45, Aspect, 0.1, 1000)` initialized at coordinate `(0, -4, 14)` looking at origin `(0, 0, 0)`.
- **Lights**:
  - `AmbientLight` (`0xdcfce7`, intensity `0.45`): Provides a faint green solder mask base ambient bounce.
  - `DirectionalLight` (`0xffffff`, intensity `1.0`): Positioned at `(6, 4, 15)` to project metallic specular highlights.
  - `PointLight` (`0x00ff88`, intensity `1.2`, distance `18`): Placed directly behind the board at `(0, 0, -1)` to create a floating underglow shadow effect.
- **Tick Loops**: Custom array `tickCallbacks` executed recursively via `requestAnimationFrame(animate)`.

### 3. Board Geometry & Canvas Silkscreen: `src/three/board.js`
- **Board Outline Shape**: Extruded rounded rectangle using `THREE.ExtrudeGeometry` based on an outline shape with width `10.0`, height `16.0`, and corner radius `0.4`.
- **Solder Mask**: Dark green `MeshStandardMaterial` (`color: 0x0f3b0f`, `roughness: 0.16`, `metalness: 0.72`) reflecting specular highlights.
- **Canvas Silkscreen Overlay Texture**:
  - To prevent performance drops from custom fonts/vector meshes, all silkscreen text, border outlines, oscilloscope drawings, SRM logo markings, and a subtle Tamil `"ம்"` character are drawn on a `2048 x 4096` offscreen HTML canvas.
  - This canvas is loaded as a `CanvasTexture` mapped onto a thin overlay plane positioned exactly `0.003` units above the board substrate.
- **Hatched Copper Ground Pours**:
  - Drawn programmatically in the four corners of the silkscreen canvas.
  - Uses canvas patterns running diagonal gold-amber hatched line segments (`ctx.lineTo` with grid spacing `12px` and stroke color `rgba(200, 150, 12, 0.2)`).
- **Parallax Tilt Math**:
  - `updateBoardParallax(elapsed, mouse)` tilts the board group depending on mouse positions.
  - Max tilt is limited to `5` degrees (`~0.08` radians):
    $$\theta_{rotX} = -\frac{\pi}{10} - mouse.y \times 0.08$$
    $$\theta_{rotY} = -\frac{\pi}{20} + mouse.x \times 0.08$$
  - Applied using linear interpolation (LERP):
    `rotation += (target - rotation) * 0.08`.
  - Added a gentle floating bobbing motion: `position.z = Math.sin(elapsed * 1.5) * 0.08`.

### 4. Solid Traces Routing: `src/three/traces.js`
- **3D Solid Traces**: To catch real directional reflections, traces are built using 3D solid box shapes (`BoxGeometry`), rather than flat flat lines (`THREE.Line`).
- **Segment Orientation Math**:
  - For each path segment between node point $A(x_A, y_A)$ and point $B(x_B, y_B)$:
    - Calculate distance: $D = \sqrt{(x_B - x_A)^2 + (y_B - y_A)^2}$.
    - Calculate midpoint: $M_x = \frac{x_A + x_B}{2}, M_y = \frac{y_A + y_B}{2}$.
    - Calculate rotation angle: $\alpha = \text{atan2}(y_B - y_A, x_B - x_A)$.
    - Instantiate `BoxGeometry(D, traceWidth, 0.02)`.
    - Set position to $(M_x, M_y, surfaceZ)$ and rotate segment along $Z$-axis by $\alpha$.
- **Vias & Ground Ring**: Placed gold cylinders (`CylinderGeometry` rings with dark center cylinders) at corners, alongside a thin edge trace running around the board perimeter.

### 5. Electron Flows: `src/three/particles.js`
- **Spawn Rules**: Spawn 3 glowing gold-white spheres per trace path.
- **Multi-Segment Vector LERP Interpolation Math**:
  - Each particle has a `progress` value between `0.0` and `1.0`.
  - On update tick: `progress += delta * speed * speedMultiplier`. If `progress >= 1.0`, wraps back to `0.0`.
  - To interpolate along multiple segments:
    - Let $N$ be the number of path segments (Points - 1).
    - Map progress to segment index: $P_{seg} = \text{progress} \times N$.
    - Current segment index: $I_{seg} = \lfloor P_{seg} \rfloor$.
    - Segment sub-progress: $P_{sub} = P_{seg} - I_{seg}$.
    - Get segment nodes: $Start = Points[I_{seg}]$, $End = Points[I_{seg} + 1]$.
    - Interpolate position: $Pos = Start + (End - Start) \times P_{sub}$ (via `lerpVectors`).
- **Hover Boost**: Hovering accelerates connected particles (`speedMultiplier = 3.0`) and turns their color from gold to white.

### 6. Interactive Raycasting & LERP Camera Zooms: `src/utils/hover.js`
- **State Machine Flow Chart**:
  Tracks state transitions via `viewState` parameter:
  - `'PCB'`: Main full board view. Cursor maps raycast coordinates to top-level board component outlines (`interactiveObjects`).
  - `'ZOOMING_IN'`: Transition state. Triggered on click/touch select. Camera coordinates ($C_p$) and focus lookAt targets ($L_t$) interpolate towards configured zoom values. Mouse events and raycasting are temporarily deactivated.
  - `'ZOOMED_IN'`: Camera coordinates LERP reaches focus threshold ($D_{target} < 0.12$). Re-enables pointer events and shifts raycast target targets to internal sub-meshes (`insideInteractiveObjects`).
  - `'ZOOMING_OUT'`: Transition state back. Triggered by Esc key or Back Button. Camera and lookAt vectors LERP back to `defaultCamPos` and `defaultLookAt`.
- **Camera LERP Coordinates Interpolation Math**:
  - The vector values `activeCamera.position` ($C_{current}$) and focus lookAt target `currentLookAt` ($L_{current}$) are updated in every single frame tick using a Constant LERP Factor ($\alpha = 0.08$):
    $$C_{current} = C_{current} + (C_{target} - C_{current}) \times 0.08$$
    $$L_{current} = L_{current} + (L_{target} - L_{current}) \times 0.08$$
    $$Camera.lookAt(L_{current})$$
  - Using a proportional LERP instead of simple steps ensures smooth ease-out velocity transitions as the camera approaches close focus.
- **Component Shell Visibility Toggles**:
  - When transitioning `PCB -> ZOOMING_IN`, `toggleComponentShells(ref, false)` runs:
    - Retreives parent mesh `const comp = scene.getObjectByName(ref)`.
    - Set component body shell `comp.visible = false` (makes outer shield transparent).
    - Sets sub-cores internal group visibility (e.g. `cpuInsideGroup.visible = true`) exposing ALU/NPU/CU/IO boxes, projects cores, or heatsink fin geometries.
  - On `ZOOMING_OUT`, restores outer shell body (`comp.visible = true`) and sets inside groups to `visible = false` to keep scene clean.
- **Sub-Core Intersect Raycasting**:
  - Once state is `'ZOOMED_IN'`, raycaster intersects are calculated against `insideInteractiveObjects`.
  - On sub-core intersect:
    - Extracts `name` and maps to accent hex color (`getSubCoreGlowColor(name)`).
    - Tweens sub-mesh scale `1.0 -> 1.08` and sets `emissiveIntensity = 0.9` for local visual feedback.
    - Resolves data fields inside `portfolio.js` (skills, projects list, degrees, intern logs) and renders them formatted in the bottom-right CRT console (`renderSubcoreHUD(name)`).

### 7. Power-on Sequencer: `src/ui/boot.js`
- **GSAP Timeline Steps**:
  1. `Set` starting opacity states: Boot overlay is solid black (`opacity: 1`), canvas, header, and badges are hidden.
  2. Sweep horizontal green laser `#scanline` element from `top: 0%` to `100%` (`duration: 0.85s`).
  3. Fade in CRT text header and run `typewriterEffect` on subtitles.
  4. Slide/Elevate 3D board `boardGroup.position` from `y: -15, z: -5` up to origin `(0, 0, 0)`, and rotate board from flat `(0, 0, 0)` to `-Math.PI / 10` and `-Math.PI / 20`.
  5. Sequentially flash trace material emissive intensities from left to right.
  6. Flash the 32 gold CPU pins emissive values one-by-one.
  7. Sequential blink of LED array lights.
  8. Unhide electron particles, start flows, and pulse CPU silicon die texture.
  9. Fade out `#boot-overlay` and set `display: none` to unlock canvas pointer interactions.

---

## 📐 Precise Dimensions & Mesh Coordinates

### 1. Board Extrusion Thickness
- Thickness = `0.16` units.
- Surface Z coordinate (`surfaceZ`) = `thickness / 2 + 0.005` = `0.085` units.

### 2. Component Centers & Geometries
| Ref | Part Description | Size Geometry ($W \times H \times D$ or $Rad \times H$) | Placement Coordinates $(x, y, z)$ |
| :--- | :--- | :--- | :--- |
| **U1** | Main CPU (About & Skills) | Box `2.4 x 2.4 x 0.22` | `(0, 1.0, 0.085)` |
| **U2** | DSP GPU (Projects) | Box `1.8 x 1.8 x 0.18` | `(-3.2, 4.5, 0.085)` |
| **C1** | Capacitor (AI/ML) | Cylinder `Rad: 0.2, H: 0.7` | `(2.3, 4.5, 0.085)` |
| **C2** | Capacitor (Web Dev) | Cylinder `Rad: 0.2, H: 0.7` | `(2.9, 4.5, 0.085)` |
| **C3** | Capacitor (Data Sci) | Cylinder `Rad: 0.2, H: 0.7` | `(3.5, 4.5, 0.085)` |
| **C4** | Capacitor (Hardware) | Cylinder `Rad: 0.2, H: 0.7` | `(4.1, 4.5, 0.085)` |
| **Y1** | Crystal Oscillator | Box `1.2 x 0.6 x 0.26` | `(-3.5, 0.5, 0.115)` |
| **ANT1**| Antenna bounding box | Box `1.0 x 1.0 x 0.15` | `(3.5, 0.5, 0.135)` |
| **J1** | USB-C power port | Box `1.2 x 0.8 x 0.32` | `(0, -7.3, 0.145)` |
| **VR1** | Regulator VR1 | Box `0.7 x 0.7 x 0.16` | `(3.5, -4.5, 0.085)` |
| **RN1** | Resistor Network RN1 | Box `1.3 x 0.16 x 0.35` | `(0, -3.5, 0.235)` |
| **TP1** | Test Point 5V | Cylinder `Rad: 0.08, H: 0.015` | `(-1.5, 3.2, 0.085)` |
| **TP2** | Test Point GND | Cylinder `Rad: 0.08, H: 0.015` | `(2.2, -3.0, 0.085)` |

### 3. CPU Pins Footprint Math
- Distributed around U1 border offsets (`-1.25`, `1.25`) with pitch stride `0.25`:
  - **Left border**: $x = -1.25, y = (i - 3.5) \times 0.25, z = -0.08$, rotation $= 0$.
  - **Top border**: $x = (i - 3.5) \times 0.25, y = 1.25, z = -0.08$, rotation $= \pi/2$.
  - **Right border**: $x = 1.25, y = (3.5 - i) \times 0.25, z = -0.08$, rotation $= 0$.
  - **Bottom border**: $x = (3.5 - i) \times 0.25, y = -1.25, z = -0.08$, rotation $= \pi/2$.

### 4. Trace Routing Pathway Coordinates (Segment Nodes)
1. **CPU (U1) $\to$ GPU (U2)**: `[(-0.6, 2.2), (-0.6, 3.2), (-1.9, 3.2), (-3.2, 4.5)]`
2. **CPU (U1) $\to$ Capacitor C1**: `[(0.2, 2.2), (0.2, 3.0), (1.0, 3.8), (2.3, 3.8), (2.3, 4.2)]`
3. **CPU (U1) $\to$ Capacitor C2**: `[(0.4, 2.2), (0.4, 2.8), (1.2, 3.6), (2.9, 3.6), (2.9, 4.2)]`
4. **CPU (U1) $\to$ Capacitor C3**: `[(0.6, 2.2), (0.6, 2.6), (1.4, 3.4), (3.5, 3.4), (3.5, 4.2)]`
5. **CPU (U1) $\to$ Capacitor C4**: `[(0.8, 2.2), (0.8, 2.4), (1.6, 3.2), (4.1, 3.2), (4.1, 4.2)]`
6. **CPU (U1) $\to$ Crystal Oscillator Y1**: `[(-1.2, 1.0), (-2.2, 1.0), (-2.2, 0.5), (-2.9, 0.5)]`
7. **CPU (U1) $\to$ Antenna ANT1**: `[(1.2, 1.0), (2.2, 1.0), (2.2, 0.5), (2.9, 0.5)]`
8. **CPU (U1) $\to$ USB J1**: `[(0, -0.2), (0, -7.0)]`
9. **CPU (U1) $\to$ Resistor Network RN1**: `[(0, -0.2), (0, -3.3)]`
10. **Resistor Network RN1 $\to$ LED Array**: `[(-0.6, -3.5), (-1.6, -3.5), (-1.6, -4.5), (-2.5, -4.5)]`
11. **Resistor Network RN1 $\to$ Regulator VR1**: `[(0.6, -3.5), (1.6, -3.5), (1.6, -4.5), (3.1, -4.5)]`

---

## 🧩 Zoomed-in 3D Internal Architecture Mappings

When the camera zooms in (`viewState = 'ZOOMED_IN'`), the following meshes represent sub-cores inside components:

### 1. CPU (U1) - About & Skills Cores
- **Group Position**: `(0, 0, 0.12)` relative to `cpuGroup`.
- **Sub-Cores Geometries**: Box `0.68 x 0.68 x 0.05` elevated by `z = 0.03`.
- **Sub-Cores IDs & Skills Map**:
  - `core_alu` (ALU Core): Top-Left `(-0.38, 0.38)`. Highlights Orange (`0xf59e0b`). Maps to **Data Science & Analytics**.
  - `core_npu` (Neural Core): Top-Right `(0.38, 0.38)`. Highlights Red (`0xef4444`). Maps to **AI / Machine Learning**.
  - `core_cu` (Control Unit): Bottom-Left `(-0.38, -0.38)`. Highlights Blue (`0x3b82f6`). Maps to **Web & Programming**.
  - `core_io` (I/O Core): Bottom-Right `(0.38, -0.38)`. Highlights Green (`0x10b981`). Maps to **IoT / Hardware**.

### 2. GPU (U2) - Projects Execution Units
- **Group Position**: `(-3.2, 4.5, 0.175)` relative to `boardGroup`.
- **Cores Geometries**: Box `0.32 x 0.32 x 0.05` on a silicon baseplate of size `1.3 x 1.3 x 0.04`.
- **Cores IDs & Projects Map**:
  - `proj_core_1`: Top-Left `(-0.38, 0.38)`. Maps to **AI/ML Stock Trader**.
  - `proj_core_2`: Top-Center `(0.0, 0.38)`. Maps to **Autopilots & Navigation Systems**.
  - `proj_core_3`: Top-Right `(0.38, 0.38)`. Maps to **PCB Component Fault Classifier**.
  - `proj_core_4`: Bottom-Left `(-0.38, -0.38)`. Maps to **Autonomous Crop Drone**.
  - `proj_core_5`: Bottom-Center `(0.0, -0.38)`. Maps to **Satellite Image Classifier**.
  - `proj_core_6`: Bottom-Right `(0.38, -0.38)`. Maps to **Retro Terminal ECE Portfolio**.

### 3. Crystal Oscillator (Y1) - Education Quartz Plates
- **Group Position**: `(-3.5, 0.5, 0.235)` relative to `boardGroup`.
- **Plates Geometries**: Box `0.24 x 0.36 x 0.04` lined with Purple (`0xaa44ff`).
- **Plates IDs & Education Map**:
  - `edu_plate_1`: Left `(-0.32, 0)`. Maps to **B.Tech in ECE @ SRMIST (9.51 CGPA)**.
  - `edu_plate_2`: Center `(0.0, 0)`. Maps to **Class XII Senior School (96.2%)**.
  - `edu_plate_3`: Right `(0.32, 0)`. Maps to **Class X Matriculation (97.4%)**.

### 4. USB Connector (J1) - Experience Gold Terminals
- **Group Position**: `(0, -7.3, 0.285)` relative to `boardGroup`.
- **Contacts Geometries**: Box `0.18 x 0.4 x 0.04` lined with Orange (`0xff8800`).
- **Contacts IDs & Experience Map**:
  - `usb_contact_1`: Left `(-0.3, 0)`. Maps to **Role: Backend Engineer Intern @ Beau Roi**.
  - `usb_contact_2`: Center `(0.0, 0)`. Maps to **API Development integrations using Python/Django**.
  - `usb_contact_3`: Right `(0.3, 0)`. Maps to **Engineering debugging, features delivery, and scrums**.

### 5. Regulator (VR1) - Tech Stack Heatsink Fins
- **Group Position**: `(3.5, -4.5, 0.285)` relative to `boardGroup`.
- **Fins Geometries**: Box `0.08 x 0.6 x 0.25` lined with Red (`0xff4444`).
- **Fins IDs & Categories Map**:
  - `vr_fin_1`: Outer-Left `(-0.32, 0)`. Maps to **Languages (Python, JavaScript, C++, SQL)**.
  - `vr_fin_2`: Inner-Left `(-0.16, 0)`. Maps to **Frameworks (Django, Fast API, Vite, Express)**.
  - `vr_fin_3`: Center `(0.0, 0)`. Maps to **AI/ML (TensorFlow, PyTorch, Scikit, OpenCV)**.
  - `vr_fin_4`: Inner-Right `(0.16, 0)`. Maps to **Tools & Hardware (Git, Arduino, PCB Designing)**.
  - `vr_fin_5`: Outer-Right `(0.32, 0)`. Maps to **Cloud & Databases (AWS, Docker, PostgreSQL, MySQL)**.

---

## 🎨 Layout Constraints & HTML Overlays

- **Full Screen Canvas Layout**:
  - `#canvas-container` is fixed to `100vw` by `100vh` at `z-index: 1`.
  - The headers, footers, and separators overlay on top at `z-index: 10` using `position: absolute` with `pointer-events: none` on main blocks and `pointer-events: auto` on interactive cards and badges.
  - This ensures that raycast mouse coordinate mappings are 100% accurate:
    $$mouse.x = \frac{clientX}{innerWidth} \times 2 - 1$$
    $$mouse.y = -\frac{clientY}{innerHeight} \times 2 + 1$$
    Without scroll offsets or height discrepancies.
- **Scanline Overlays**: Fixed viewport background linear-gradient (`rgba(18,16,16,0)` 50% / `rgba(0,0,0,0.22)` 50% at `background-size: 100% 4px`) simulating CRT monitors.
- **Copy Email Clipboard**: Uses modern navigator clipboard APIs: `navigator.clipboard.writeText('parameshwaran.s2004@gmail.com')`.

---

## 🚀 How to Run & Build

```bash
# 1. Start development server
npm run dev

# 2. Build for production (outputs compiled chunks to dist/)
npm run build
```
- **Vite production bundle size outputs**:
  - `dist/index.html`: ~5.57 kB
  - `dist/assets/index.css`: ~11.93 kB (compiled CRT console and HUD panel selectors)
  - `dist/assets/index.js`: ~659.25 kB (minified bundle of Three.js, GSAP, and modular scene scripts)

---

## ⚡ Performance Optimizations

1. **Raycaster Throttling**: Raycast intersect checks are throttled to run every 3rd animation frame (`frameCounter % 3 === 0`) instead of on every frame, reducing CPU usage by 66% during cursor moves.
2. **Target Isolation & Non-Recursive Intersects**: Raycasting runs against isolated arrays (`interactiveObjects` / `insideInteractiveObjects`) filtering by `obj.userData.isInteractive === true`, and passes `false` as the recursive check parameter to prevent costly hierarchy traversals.
3. **Immediate Hover State Reset**: When hover leaves a component, `resetHoverMesh(currentHovered)` immediately sets `emissiveIntensity = 0.0` and `emissive.setHex(0x000000)` on the material directly (bypassing GSAP transition lags) for instantaneous visual feedback.
4. **Static Coordinate Debouncing**: Mouse vectors are declared once at module scope to avoid garbage collection overhead in the active frame rendering ticks.

---

## 📱 Mobile Touch Support & Live Diagnostics

1. **Touch Coordinate Translation**: Hooked `touchstart` and `touchmove` events to translate touch coordinates `(touches[0].clientX / clientY)` directly into raycasting coordinates, mirroring the mouse pointer on mobile screens.
2. **Dynamic Live HUD Terminal**: The bottom-right CRT console updates dynamically on top-level PCB hovers (`renderComponentHUD(name)`), mapping specific component metrics (CPU speeds, antenna signals, regulator temperature) to show real-time diagnostics before the user clicks to zoom.
3. **Automatic Clean exit**: Exiting hover in PCB mode clears the HUD console instantly and LERPs layout elements smoothly.


