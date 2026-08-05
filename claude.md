# PCB 3D Portfolio — Technical Architecture, Microarchitecture Blueprint & Developer Transfer Log

Hi! This file is the primary reference prompt and technical transfer guide for any AI coding assistant (Claude / Antigravity / Gemini) working on this repository.

---

## 🎯 MANDATORY PRIMARY PROMPT & EXECUTION DIRECTIVE

> **IMPORTANT**: The following prompt defines the exact architectural pattern and phased implementation workflow for all 3D PCB component interactions in this portfolio. You MUST follow this blueprint strictly.

```text
"Build and verify ONE interaction before touching anything else: clicking a single labeled component on the PCB board (start with the About/education component) must do the following, in order:

1. Raycast against pointer click position to detect which mesh was clicked — use THREE.Raycaster, not a DOM click handler on an invisible div layered over the canvas.
2. On hit, animate camera.position and the camera's lookAt target from current values toward that mesh's position using GSAP (duration: 1.2, ease: 'power2.inOut'). The camera must visibly travel through 3D space — no cuts, no instant snaps.
3. Once the tween completes, reveal an info panel anchored to the mesh's projected 2D screen position (mesh.position.clone().project(camera), converted to screen coordinates, updated every frame) — so the panel visually tracks the component instead of floating independently.
4. Add a close control (X, or click elsewhere) that reverses the camera tween back to the prior position and hides the panel.

Do not build, touch, or 'improve' any other section until this exact loop works and I've confirmed it live in the browser myself. Once I confirm it, apply the identical pattern — raycast → camera tween → anchored panel → reverse tween — to every other labeled component (experience, skills, projects, certs), swapping only the content.

Also fix the duplicate 'Connect on LinkedIn' button currently stacked in Contact — there should be exactly one per section, no leftover elements."
```

---

## 🛠️ Core Tech Stack & Tooling

- **Vite & Vanilla JavaScript (ES Modules)**: Fast development server and production bundler without framework overhead.
- **Three.js (WebGL)**: Custom 3D printed circuit board substrate, SMD IC component meshes, trace copper pathways, cylinder vias, project chips, and glowing electron flow particles.
- **GSAP (GreenSock Animation Platform)**: Powers camera 3D space travel (`duration: 1.2`, `ease: 'power2.inOut'`), boot scanline sequence, typewriter terminal logs, and panel transitions.
- **Pure Vanilla CSS**: SCANLINE CRT overlay filters, CSS custom property design system tokens, responsive glassmorphism HUD cards.
- **Typography**: `Orbitron` (HUD headings, component IDs) + `Share Tech Mono` (Data registers, spec tables).

---

## 📁 Repository Directory Blueprint & Responsibilities

```
c:\Users\hunte\Parameshwaran_S_Portfolio\
├── main.js                  # Entry point: scene initialization, tick callbacks, boot execution, event listeners
├── index.html               # Semantic HTML structure, CRT filters, HUD header, section datasheet templates
├── style.css                # Primary design system: CSS tokens, scanlines, glassmorphism panels, CTA button styles
├── scroll.css               # Scroll journey overrides: camera path container, screen-space panel positioning, connector SVG
├── claude.md                # Master developer transfer log & prompt blueprint (this file)
└── src/
    ├── config.js            # External URLs (LinkedIn, GitHub), responsive breakpoints (768px lite mode), env helpers
    ├── data/
    │   └── portfolio.js     # Data source of truth: CV metrics, project list with status ('shipped' | 'building'), timeline, skills
    ├── three/
    │   ├── scene.js         # PerspectiveCamera, lighting setup, renderer config, bloom pass, FPS performance guardrail
    │   ├── board.js         # Board substrate extrusion, soldermask plane, CanvasTexture silkscreen, micro-tilt parallax
    │   ├── components.js    # 3D SMD components (U1, U2, Y1, ANT1, J1, VR1, RN1, D1-D7), sub-core geometry groups, interaction flags
    │   ├── traces.js        # Solid 3D copper trace segments (BoxGeometry), corner vias (Cylinders), trace pathways data
    │   ├── particles.js     # Electron flow particles along trace paths with speed boost on hover
    │   └── project-chips.js # Data-driven project chips (soldered vs breadboard jumpers based on portfolioData.projects.status)
    ├── scroll/
    │   └── journey.js       # CatmullRomCurve3 camera path, GSAP ScrollTrigger legs, per-frame Vector3.project screen positioning
    ├── ui/
    │   ├── boot.js          # Retro terminal boot sequence: laser scanline, typewriter status logs, badge pop-ins
    │   ├── sections.js      # Datasheet HTML injection from portfolio.js data, profile link wiring
    │   ├── pcb-hud.js       # Diagnostic HUD bar & component telemetry overlays
    │   ├── tooltip.js       # Hover tooltip for 3D components
    │   ├── sidepanel.js     # Side panel drawer UI for detailed component viewing
    │   └── fallback.js      # WebGL detection & non-WebGL fallback screen
    └── utils/
        ├── hover.js         # THREE.Raycaster pointer click/hover logic, mesh emission updates, view state handler
        └── camera-states.js # GSAP Camera Position & LookAt Tween State Machine (PCB / ZOOMING_IN / ZOOMED_IN / ZOOMING_OUT)
```

---

## 🔬 Component Coordinate & Dimension Specification Table

| Ref Identifier | Component Description | 3D Mesh Geometry | Board Position (x, y, z) | Camera Target Pos (x, y, z) | Camera LookAt (x, y, z) |
|:---|:---|:---|:---|:---|:---|
| **U1** | Main CPU (About / Education) | Box 2.4 × 2.4 × 0.22 | `(0, 1.0, 0.085)` | `(0, 1.0, 2.0)` | `(0, 1.0, 0.085)` |
| **U2** | GPU (Project Array) | Box 1.8 × 1.8 × 0.18 | `(-3.2, 4.5, 0.085)` | `(-3.2, 4.5, 2.0)` | `(-3.2, 4.5, 0.085)` |
| **C1–C4** | Decoupling Capacitor Bank (Skills) | Cylinders R=0.2, H=0.7 | `(3.2, 4.5, 0.085)` | `(3.2, 4.5, 2.0)` | `(3.2, 4.5, 0.085)` |
| **Y1** | Crystal Oscillator (Education detail) | Box 1.2 × 0.6 × 0.26 | `(-3.5, 0.5, 0.115)` | `(-3.5, 0.5, 1.8)` | `(-3.5, 0.5, 0.085)` |
| **ANT1** | RF Antenna (Contact TX/RX) | Box 1.0 × 1.0 × 0.15 | `(3.5, 0.5, 0.135)` | `(3.5, 0.5, 1.8)` | `(3.5, 0.5, 0.085)` |
| **J1** | USB-C Power Bus (Experience) | Box 1.2 × 0.8 × 0.32 | `(0, -7.3, 0.145)` | `(0, -7.3, 2.0)` | `(0, -7.3, 0.085)` |
| **VR1** | Voltage Regulator (Tech Stack) | Box 0.7 × 0.7 × 0.16 | `(3.5, -4.5, 0.085)` | `(3.5, -4.5, 2.0)` | `(3.5, -4.5, 0.085)` |
| **D1–D7** | Status LED Array | Bounds 2.4 × 1.4 | `(-3.5, -4.5, 0.085)` | `(-3.5, -4.5, 2.4)` | `(-3.5, -4.5, 0.085)` |

*Board substrate dimensions: width = 11.0, height = 15.0, thickness = 0.16, top surface Z = 0.085.*

---

## ⚡ The 4-Step Raycast → Camera Tween → Anchored Panel System

### Step 1: Pointer Click Raycasting (`THREE.Raycaster`)
- **Module**: `src/utils/hover.js`
- **Logic**: A click event listener captures mouse pointer coordinates (`mouse.x`, `mouse.y` normalized device coordinates between -1 and +1).
- **Pointer Motion Engine**: Implements Anime.js-style `clamp` boundary calculations and 500ms cubic deceleration smooth tracking (`mouse.x += (targetMouse.x - mouse.x) * 0.08`):
  ```javascript
  const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

  const updateMouseCoords = (clientX, clientY) => {
      const hw = window.innerWidth / 2;
      const hh = window.innerHeight / 2;
      targetMouse.x = clamp((clientX - hw) / hw, -1.0, 1.0);
      targetMouse.y = clamp(-(clientY - hh) / hh, -1.0, 1.0);
  };
  ```
- `THREE.Raycaster.setFromCamera(mouse, camera)` computes the ray from the camera lens through the pointer.
- Hit testing targets `interactiveObjects` (meshes with `userData.isInteractive = true`). DOM click handlers on overlay divs are strictly forbidden.

### Step 2: Visible 3D Camera Travel (`GSAP Tween`)
- **Module**: `src/utils/camera-states.js` & `src/utils/hover.js`
- **Logic**: On hit detection, GSAP animates both `camera.position` and `currentLookAt` vector over 1.2 seconds:
  ```javascript
  gsap.to(camera.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 1.2,
      ease: 'power2.inOut'
  });
  gsap.to(currentLookAt, {
      x: targetLook.x,
      y: targetLook.y,
      z: targetLook.z,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => camera.lookAt(currentLookAt),
      onComplete: () => revealScreenAnchoredPanel(ref)
  });
  ```
- No instant jumps or camera position cuts. The camera visibly glides through 3D space.

### Step 3: Screen-Space 2D Anchored Panel Positioning
- **Module**: `src/scroll/journey.js` & `src/ui/pcb-hud.js`
- **Logic**: During the render loop (every tick), the 3D world position of the focused component is projected into 2D viewport pixel coordinates:
  ```javascript
  const worldPos = new THREE.Vector3();
  componentMesh.getWorldPosition(worldPos);
  
  // Project vector into normalized device coordinates (-1 to +1)
  const ndc = worldPos.clone().project(camera);
  
  // Convert NDC to screen pixel coordinates
  const screenX = (ndc.x * 0.5 + 0.5) * window.innerWidth;
  const screenY = (-ndc.y * 0.5 + 0.5) * window.innerHeight;
  
  // Update anchored panel CSS position
  panelElement.style.left = `${screenX + offsetX}px`;
  panelElement.style.top = `${screenY + offsetY}px`;
  ```
- An SVG connector line (`<svg id="connector-overlay"><line ... /></svg>`) connects the component center to the screen card edge in real time.

### Step 4: Reverse Camera Tween & Panel Dismissal
- **Logic**: Clicking the close control (`[X]`), hitting the `Escape` key, or clicking empty board space triggers `reverseCameraTween()`:
  - Hides the active screen-space datasheet card (`opacity: 0`, `pointer-events: none`).
  - Animates `camera.position` and `currentLookAt` back to their prior values (or default PCB view `(0, -2, 17)`) using GSAP (`duration: 1.2`, `ease: 'power2.inOut'`).
  - Restores board component shell visibilities and interactivity.

---

## 🎨 UI & Layout Rules: LinkedIn CTA Single-Button Constraint

### Problem & Fix Requirement
Previously, multiple `.cta-linkedin` elements were present simultaneously in the Contact section (one in `#hud-bar` header and one in `#panel-contact`), causing stacked duplicate buttons.

### Execution Rule
1. There MUST be **exactly ONE LinkedIn button visible per section**.
2. When the user scrolls into or views `sec-contact` / `#panel-contact`, `#cta-linkedin-hud` inside `#hud-bar` is hidden via CSS/JS (`body.in-contact-section #cta-linkedin-hud { opacity: 0; pointer-events: none; }`) so it does not stack over the Contact section's primary CTA.
3. Every LinkedIn CTA element automatically receives `href = LINKEDIN_URL` via `wireProfileLinks()` in `src/ui/sections.js`.
4. All secondary links (e.g. GitHub) must have accurate accessibility attributes (`aria-label="Visit my GitHub profile (opens in new tab)"`).

---

## 🔍 Verification & Testing Protocols

After making any code changes, verify your work using these exact steps:

```bash
# 1. Run development server and verify live in browser
npm run dev

# 2. Run production build check (must exit with code 0)
npm run build

# 3. Check for TypeScript / linting issues
npx tsc --noEmit
```

### Manual Browser Checklist
1. Click the **U1 CPU component** (About/Education) on the 3D board.
2. Confirm the camera visibly travels through 3D space over **1.2 seconds** with `power2.inOut` easing (no instant snap).
3. Confirm the info panel reveals and stays **anchored to the component's projected 2D position** when panning/rotating.
4. Click the close button `[X]` or press `Escape` — confirm the camera smoothly reverses to the starting view.
5. Check the **Contact section** — confirm there is **exactly ONE 'Connect on LinkedIn' button** visible (no duplicate stacking).

---

## 📝 Developer Change & Session Log

- **Build Fixes**: Fixed malformed font fallback link tag in `index.html` and removed duplicate snippet syntax error in `src/three/board.js`.
- **CSS Improvements**: Added design system tokens (`--space-*`, `--radius-*`, `--depth-*`) in `style.css`, enhanced focus states, and skip-to-content links for accessibility.
- **Claude Blueprint Update**: Updated `claude.md` with complete architecture specification, raycasting interaction blueprint, single LinkedIn CTA constraints, and testing protocols.
