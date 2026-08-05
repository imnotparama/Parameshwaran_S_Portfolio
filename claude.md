# PCB 3D Portfolio — Technical Architecture, Microarchitecture Blueprint & Developer Transfer Log

Hi! This file is the primary reference prompt and technical transfer guide for any AI coding assistant (Claude / Antigravity / Gemini) working on this repository.

---

## 🚦 NEXT SESSION — RESUME HERE (2026-08: post-cleanup state)

**Status: everything below is committed & pushed to `origin master`. The only uncommitted work is this session's legacy-stack deletion (pending commit).**

### Shipped in recent sessions (commit order)
- `8726fef` + `05199ad` — fab-shop redesign (palette/fonts/HUD/CTAs/Three.js color pass) + gold gerber panel chrome.
- `7cf9c70` — elevated 3/4 camera framing (`CAMERA_OFFSET (0,2.6,4.2)`), retuned flight path, tightened panel transitions.
- `976b818` — component quality (mounting holes, lead frames, hemisphere light) + arrival power-on pulse + connector signal-flow dashes.
- `cdb44e2` — panel activation derived from scroll-leg t (deleted distance-threshold hysteresis; see session log).
- **Current session** — legacy interaction stack deleted (single scroll-journey model). See session log.

### Open items (nice-to-haves, no urgency)
- **`public/og-preview.png` (1200×630 share card) is NOT generated yet.** `index.html` references it; without it LinkedIn/Discord cards render bare. Work done so far: headless-Chrome pipeline in `.freebuff/og-tools/` (gitignored; puppeteer-core + SwiftShader WebGL verified working) — but boot is a ~6.4s GSAP timeline that runs at a few FPS under software rendering, so `initJourney` (which activates panels) hasn't fired by capture time and the canvas reads black. Fix path: wait ~30-45s in the capture, OR add an `?og=1` capture mode that skips/shortens boot and sets the hero camera.
- Optional: deep-linkable sections (`#/about` via hashchange), skip-boot-on-return (`sessionStorage`), delete stale `src/schema.ts`, README refresh (bloom thresholds changed).

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

## 🧭 Current Interaction Model — SINGLE scroll-journey model (READ FIRST)

**The legacy click-to-zoom stack was DELETED (2026-08): `camera-states.js`, `sidepanel.js`, `tooltip.js`, `pcb-hud.js` are gone; hover.js is hover-glow only; `#pcb-tooltip` removed from `index.html`; all related CSS removed.** There is now ONE interaction model, with a degraded static-scroll mode for accessibility:

| Mode | Body Class | Who Gets It | Camera / Interaction |
|:---|:---|:---|:---|
| **Scroll-Journey** | `full-journey` | Default (viewport ≥ 768px AND no reduced-motion) | Camera flies along a CatmullRomCurve3 path driven by GSAP ScrollTrigger scrub (`setCameraAtT(t)`). Panels are fixed overlays side-anchored to the projected component position; activation is a pure function of the current scroll leg. |
| **Lite** | `lite-mode` | `prefers-reduced-motion: reduce` OR viewport < 768px (`isLiteMode()` in `src/config.js`) | No scroll-jacking; sections stack normally (all content reachable by scrolling). Hover glow still works on the fixed canvas. No zoom, no tooltip, no sidepanel. |

**Consequences you must respect in code:**

1. `setCameraAtT(t)` owns the camera every frame in journey mode — do NOT reintroduce any camera LERP/zoom.
2. `initJourney(camera, boardGroup)` runs **after** the boot sequence completes (main.js boot callback). Before that, `journeyReady` is false and `updateJourneyEffects` no-ops — this gate exists so boot's GSAP inline styles on the hero panel are never fought mid-boot.
3. Panel activation is leg-derived (`setLegState` in ScrollTrigger `onUpdate`, switch at ≥0.55 progress) — no distance scanning, no cooldowns. See session log.
4. `#hud-bar` interactivity is gated by the `.hud-ready` class — see the Critical Gotchas section.
5. `main.js` step 14 binds nav buttons to `scrollToSection()` only.

---

## 🛠️ Core Tech Stack & Tooling

- **Vite & Vanilla JavaScript (ES Modules)**: Fast development server and production bundler without framework overhead.
- **Three.js (WebGL)**: Custom 3D printed circuit board substrate, SMD IC component meshes, trace copper pathways, cylinder vias, project chips, and glowing electron flow particles.
- **GSAP (GreenSock Animation Platform)**: Powers camera 3D space travel (`duration: 1.2`, `ease: 'power2.inOut'`), boot scanline sequence, typewriter terminal logs, and panel transitions.
- **Pure Vanilla CSS**: SCANLINE CRT overlay filters, CSS custom property design system tokens, responsive glassmorphism HUD cards.
- **Typography**: `Chakra Petch` (HUD headings, component IDs) + `Fragment Mono` (Data registers, spec tables, terminal) + `Instrument Sans` (body prose).

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
    │   ├── components.js    # 3D SMD components (U1, U2, Y1, ANT1, J1, VR1, RN1, D1-D7), silicon die + radar ring, interaction flags
    │   ├── traces.js        # Solid 3D copper trace segments (BoxGeometry), corner vias (Cylinders), trace pathways data
    │   ├── particles.js     # Electron flow particles along trace paths with speed boost on hover
    │   └── project-chips.js # Data-driven project chips (soldered vs breadboard jumpers based on portfolioData.projects.status)
    ├── scroll/
    │   └── journey.js       # CatmullRomCurve3 camera path, GSAP ScrollTrigger legs, per-frame Vector3.project screen positioning
    ├── ui/
    │   ├── boot.js          # Retro terminal boot sequence: laser scanline, typewriter status logs, badge pop-ins
    │   ├── sections.js      # Datasheet HTML injection from portfolio.js data, profile link wiring
    │   └── fallback.js      # WebGL detection & non-WebGL fallback screen
    └── utils/
        └── hover.js         # THREE.Raycaster hover-glow ONLY: bounded pointer clamp + targetMouse inertia + parallax feed. No camera control, no click-zoom.
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

*(⚠️ HISTORICAL — the legacy click-to-zoom stack described below was DELETED in 2026-08 (`camera-states.js`, `sidepanel.js`, `tooltip.js`, `pcb-hud.js` removed; hover.js is glow-only). Kept as the original build blueprint. The shipped interaction is the scroll journey: `setCameraAtT(t)` + leg-derived panel activation + screen-anchored panels in `src/scroll/journey.js`. The only parts still live: the `THREE.Raycaster` hover-glow pattern in `src/utils/hover.js` and the screen-projection anchoring math in `updateJourneyEffects()`.)*

### Step 1: Pointer Click Raycasting (`THREE.Raycaster`)
- **Module**: `src/utils/hover.js`
- **Logic**: A click event listener captures mouse pointer coordinates (`mouse.x`, `mouse.y` normalized device coordinates between -1 and +1).
- **Pointer Motion Engine**: Implements bounded `clamp` boundary calculations (NDC ±1) and 500ms smooth inertia tracking. `targetMouse` is the instant, clamped pointer position (updated by `mousemove`/`touch`); `mouse` lerps toward it every frame (`mouse.x += (targetMouse.x - mouse.x) * 0.08`) and feeds only the board parallax tilt:
  ```javascript
  const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

  const updateMouseCoords = (clientX, clientY) => {
      const hw = window.innerWidth / 2;
      const hh = window.innerHeight / 2;
      targetMouse.x = clamp((clientX - hw) / hw, -1.0, 1.0);
      targetMouse.y = clamp(-(clientY - hh) / hh, -1.0, 1.0);
  };
  ```
- `THREE.Raycaster.setFromCamera(targetMouse, camera)` computes the ray from the camera lens through the pointer. **Raycasts use `targetMouse` (instant, accurate); the smoothed `mouse` vector is used only for parallax tilt via `updateBoardParallax()`.**
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
2. **Data-driven rule (current)**: `setActivePanel()` in `src/scroll/journey.js` toggles `body.hud-cta-hidden` whenever the active panel embeds its own `.cta-linkedin` (hero, about, contact all do). `scroll.css` hides `#cta-linkedin-hud` under that class (`opacity: 0 !important; pointer-events: none !important; visibility: hidden !important;`). `visibility: hidden` also removes the link from the tab order. *(The old `in-hero-section` / `in-contact-section` classes were removed — do not restore them.)*
3. Every LinkedIn CTA element automatically receives `href = LINKEDIN_URL` via `wireProfileLinks()` in `src/ui/sections.js`.
4. All secondary links (e.g. GitHub) must have accurate accessibility attributes (`aria-label="Visit my GitHub profile (opens in new tab)"`).

**Known remaining gap (do not "fix" without user confirmation):**
- **Lite mode**: the `hud-cta-hidden` toggle only runs in journey mode (`setActivePanel`), so lite-mode users see the HUD CTA *plus* the hero/contact panel CTA together. The HUD CTA is also the only CTA on Skills/Projects/Experience in lite mode, so a blanket hide has tradeoffs.

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
*(The legacy click-to-zoom checklist is obsolete — the zoom flow was deleted. Journey-mode checks below.)*
1. Check the **Contact section** — confirm there is **exactly ONE 'Connect on LinkedIn' button** visible (no duplicate stacking).

### Manual Browser Checklist (scroll-journey mode)
1. After boot, the **HUD nav buttons are clickable** — `getComputedStyle(hudBar).pointerEvents` must be `auto` (the `!important` on `.hud-ready` beats boot's inline `pointer-events: none`).
2. Click `[PROJECTS]` — the camera travels and the **wide projects panel stays fully on-screen** (no overflow past the right edge).
3. Navigate to any non-hero section — the **hero panel is hidden** (no leftover hero CTA / scroll-hint overlaying other sections).
4. At hero and contact — exactly one LinkedIn CTA visible, and the hidden HUD CTA must be **absent from the tab order** (Tab through the page; `visibility: hidden` removes it).

---

## ⚠️ Critical Gotchas — Fixed Defects That WILL Regress (keep these invariants)

The following were found by adversarial review (2026-08) and fixed. Any future refactor must preserve these invariants:

1. **Never leave inline styles that override class-driven visibility toggles.**
   - `#hud-bar.hud-ready` **must** keep `pointer-events: auto !important` in `scroll.css`. `boot.js` writes an inline `pointer-events: none` via `gsap.set()` and never clears it; without `!important`, the fixed HUD (nav, brand link, LinkedIn CTA) is **permanently unclickable** in full-journey mode.
   - `boot.js` hero reveal must keep `clearProps: 'opacity,visibility'` on its `tl.set(heroPanel, ...)`. Without it, the inline styles permanently override `body.full-journey .ds-panel` / `.panel-active`, leaving the hero panel stuck on top of every other section.
2. **Panel anchoring must use the real rendered panel width**: `const panelW = panel.offsetWidth || Math.min(480, window.innerWidth - 40)` in `updateJourneyEffects()`. `#panel-projects` is `.ds-panel-wide` (up to 980px); a hardcoded 480 shoves it off-screen (measured at `left: -321px`).
3. **`buildCurves()` resets `stopOrder`, `stopTs`, `stopPosVectors`** at the top so re-initialization (HMR / re-entry) can't duplicate stops or leave stale t-mappings.
4. **Silicon die pulse is finite** (`repeat: 7` + `onComplete` settle at opacity 0.65) — do not restore an infinite `repeat: -1` pulse.

---

## 📝 Developer Change & Session Log

- **2026-08 Session — Dead layout CSS sweep (no DOM behind it)**:
  - Removed from `style.css` (~140 lines): `#main-header` + `.header-container` wrappers (hero typography kept), the whole `.svg-separator` / `.trace-active-line` / `.spark` section + `traceDraw`/`sparkMove` keyframes, `.canvas-hint`, `#main-footer` + all old footer classes (`.footer-container`, `.footer-details`, `.footer-meta`, `.footer-status`), `.social-pins`/`.social-pin`/`.pin-dot`/`.pin-lbl`/`.copyright`, the `.header-nav` wrapper in the Minimalist Navbar block, and the dead `#main-header`/`.header-nav`/`.svg-separator`/footer/social-pins rules in the 768/480 media queries + reduced-motion block. Kept everything live: `.nav-btn` (HUD), `.header-underline` (boot animates it), `.ece-label`/`h1#user-name`/`.subtitle-wrap`/`.terminal-cursor`/`.badge-row`/`.stat-badge`/`.badge-lbl` (hero panel).
- **2026-08 Session — Orphaned export pruning (post legacy-stack deletion)**:
  - **`particles.js`**: removed `setHoveredTraceSpeedBoost` (only consumer was the deleted legacy hover path) and its supporting state (`speedMultiplier`, `connectedComponent`, `material` fields on particles, `BOOST_PARTICLE_COLOR`). Particles now flow at constant `baseSpeed`.
  - **`components.js`**: removed the never-visible sub-core architecture — `insideInteractiveObjects`, `cpuInsideGroup`/`gpuInsideGroup`/`oscInsideGroup`/`antInsideGroup`/`usbInsideGroup`/`vrInsideGroup` + all their meshes (core_*, proj_core_*, edu_plate_*, ant_receiver, usb_contact_*, vr_fin_*). These groups were always `visible = false` and only toggled by the deleted `toggleComponentShells`. Kept: `siliconDieMesh`, `cpuRadarRing`, `cpuPins`, `ledMeshes`, `interactiveObjects` (all still used by boot/journey/hover). The LED domes stay (they're the visible LED array), only their `insideInteractiveObjects` registration was dropped.
  - `boot.js` retains the **`?og=1` capture mode** (added for the shelved OG-card task): same instant path as a return visit, with the hero panel set inline (CSS transitions don't tick under software rendering). Harmless; used only when the query param is present.
- **2026-08 Session — Deep links + boot skip**:
  - **Hash routing** (`main.js`): `SECTION_HASHES` maps `sec-*` → `#/about`-style slugs; `navigateToSection()` does `history.pushState` + `scrollToSection` (nav buttons + brand link); `applyHashNavigation()` listens for `hashchange` + `popstate` so the back/forward buttons and manually edited hashes navigate sections; on first load an existing hash is honored after `initJourney`. Hero = no hash (clean URL). Unknown hashes are ignored.
  - **Boot skip** (`boot.js`): `sessionStorage['psb-booted']` flag (try/catch-guarded) — return visitors in the same tab take the instant path (same as lite mode: overlay hidden, board at rest, HUD + badges + particles on). For the full-journey fast path the hero panel reveal uses `clearProps: 'opacity,visibility'` so the `.panel-active` CSS toggle keeps ownership (gotcha #1).
- **2026-08 Session — Legacy interaction stack deleted (single scroll-journey model)**:
  - **Deleted files**: `src/utils/camera-states.js` (zoom state machine), `src/ui/sidepanel.js` (drawer), `src/ui/tooltip.js`, `src/ui/pcb-hud.js` (hover telemetry HUD).
  - **`src/utils/hover.js`** rewritten as a pure hover-glow module: removed click-to-zoom handler, `viewState` branches, `toggleComponentShells`, `updateCamera`, tooltip/HUD/trace-boost calls, `triggerComponentAction` export. Kept: bounded pointer clamp, `targetMouse` inertia, parallax feed, glow/scale/hover-light. Exports are now only `mouse`, `targetMouse`, `initHover`, `checkHover`.
  - **`main.js`**: dropped `initTooltip`/`initSidePanel`/`openSidePanel`/`closeSidePanel`/`triggerComponentAction` imports + the tooltip/sidepanel init guards + the `data-ref` legacy nav fallback + `window.openSidePanel/closeSidePanel` globals.
  - **`index.html`**: removed `#pcb-tooltip`.
  - **`style.css`**: removed ~600 lines of legacy CSS (`.pcb-tooltip-hud`, `#component-panel`, section-7 side-panel builder classes, `.info-panel-layout`, `.btn-hud-control`, `.pcb-hud-layout` + all `.hud-*`, tooltip-frame classes, and their media/focus/reduced-motion references). Kept live hero classes (`.ece-label`, `h1#user-name`, `.stat-badge`, `.nav-btn`, etc.).
  - **Verified**: `npm run build` + `npx tsc --noEmit` pass; zero references to deleted modules remain; journey mode re-checked live.
- **Panel Activation Refactor**: `updateJourneyEffects` no longer scans camera distance thresholds. Panel activation is now a **pure function of the current scroll leg** — `setLegState(destination, source, progress)` runs in each ScrollTrigger `onUpdate` and switches sections at 0.55 progress (0.05 boundary band vs. 0.5). Deleted the hysteresis/cooldown machinery (`ARRIVED_THRESHOLD`, `LEFT_THRESHOLD`, `DEACTIVATE_FRAMES`, `inAnyZone` second scan). Activation is applied idempotently each frame via the `activePanelId` early-return in `setActivePanel`. Also gated panel driving behind `journeyReady` (set at the end of `initJourney`) so the boot sequence's GSAP inline styles on the hero panel are never fought mid-boot.
- **Build Fixes**: Fixed malformed font fallback link tag in `index.html` and removed duplicate snippet syntax error in `src/three/board.js`.
- **CSS Improvements**: Added design system tokens (`--space-*`, `--radius-*`, `--depth-*`) in `style.css`, enhanced focus states, and skip-to-content links for accessibility.
- **Claude Blueprint Update**: Updated `claude.md` with complete architecture specification, raycasting interaction blueprint, single LinkedIn CTA constraints, and testing protocols.
- **2026-08 Session — Pointer inertia & journey-mode hardening**:
  - `hover.js`: bounded pointer clamping (NDC ±1) + 500ms smooth mouse inertia (`targetMouse` vs `mouse` lerp `* 0.08`); raycasts now use instant `targetMouse` while parallax uses smoothed `mouse`; legacy click-zoom + camera LERP disabled in `full-journey` mode.
  - `journey.js`: rewrote screen-space panel positioning (side-anchoring with viewport clamping) and **fixed wide-panel overflow** via `panel.offsetWidth`; added `body.in-hero-section` toggle; made `buildCurves()` idempotent.
  - `boot.js`: `hud-ready` applied once inside boot step 3 (duplicate add removed from `main.js`); hero panel reveal uses `clearProps`; silicon die pulse now finite (8 pulses → settle 0.65).
  - `scroll.css`: `#hud-bar.hud-ready { pointer-events: auto !important; }` (HUD was unclickable in full-journey mode); hidden HUD LinkedIn CTA (hero/contact) also gets `visibility: hidden` (tab-order fix).
  - **Verified live in browser (full-journey)**: boot → HUD interactive → nav clicks navigate each section → panels activate anchored on-screen → hero panel hidden at all other sections → HUD CTA hidden only at hero/contact. `npm run build` + `npx tsc --noEmit` pass; console clean.
- **2026-08 Session — "Fab-shop" redesign + journey bugfix (NOT yet committed/pushed)**:
  - Applied the fab-shop design (matte soldermask palette, warm silkscreen, ENIG gold accents, signal green reserved for "live") across HTML/CSS/Three.js — see the 🚦 NEXT SESSION block at the top of this file for the full change list.
  - **Fixed a Chromium `visibility`-transition deadlock** in `scroll.css` `.ds-panel` (panels froze at opacity 0 with transitions stuck at `currentTime 0` after nav clicks): visibility now flips instantly on activate and waits out the fade on deactivate (`visibility 0s` / `visibility 0s linear 0.6s`). **Applied but not yet re-verified live.**
  - Made the single-LinkedIn-CTA rule data-driven (`body.hud-cta-hidden` when the active panel has its own CTA) — About no longer shows a duplicate.
  - **Remaining**: live-verify the visibility fix, gitignore `.freebuff/`, commit + push to `origin master` (user explicitly requested the push).
- **2026-08 Session — 3D framing + animation pass (pushed as `05199ad` + follow-ups)**:
  - **Camera framing fix** (`journey.js`): component stops were viewed horizontally at component height (`CAMERA_OFFSET (0,0,1.915)`) — chips read as edge-on slivers. Now elevated 3/4 angle: `CAMERA_OFFSET (0, 2.6, 4.2)`, `LOOK_AT_OFFSET (0, 0.15, 0)` (~31° elevation). Via points retuned to the same z depth (~4.2) for consistent travel speed instead of per-leg zoom pulsing.
  - **Panel transition timing** (`scroll.css`): container 0.6s→0.5s; `.ds-ref`/`.ds-body` 0.6s→0.45s, `.ds-title` 0.7s→0.5s; delays 0.2/0.3/0.4s→0.1/0.15/0.25s; replaced `transition: all` with enumerated opacity/transform.
  - **Verified live**: U1 projects near screen center with panel anchored + connector attached; projects panel fully on-screen; console clean.
- **2026-08 Session — Component quality + animation polish (animejs / hyperframes-animation / improve-animations applied)**:
  - **Component quality**: 4 plated-through mounting holes with gold rings (board.js, aligned with silkscreen markers); gold lead-frame outlines on U1/U2 + silver seam on Y1 (components.js); hemisphere light for material depth (scene.js); silkscreen adds: mounting-hole rings, pin-1 dot, `Pb-FREE / NO-CLEAN` + `IPC-A-610 CLASS 2` fab markings.
  - **Animation quality**: power-on pulse on arrival (journey.js `pulseArrival` — U1 radar+die flash; U2/C1/J1 trace emissive flash, reusing boot's trace-flash language); connector line dashes march toward the panel (`signal-flow` keyframe, scroll.css); all remaining `transition: all` enumerated (style.css).
  - **Verified**: build + tsc pass; console clean; tick loop live (vignette 0.4→0.85 on proximity, connector attached, pulse fired without errors).
