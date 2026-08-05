# PCB 3D Portfolio — Technical Architecture, Microarchitecture Blueprint & Developer Transfer Log

Hi! This file is the primary reference prompt and technical transfer guide for any AI coding assistant (Claude / Antigravity / Gemini) working on this repository.

---

## 🚦 NEXT SESSION — RESUME HERE (2026-08: "fab-shop" redesign)

**Status: ~90% complete — edits are on disk, `npm run build` + `npx tsc --noEmit` pass, but NOT committed or pushed. No `git commit`/`git push` has run.**

### DONE this session (verified working live unless noted)
- **Layer 1a `index.html`**: fonts → Chakra Petch (display) + Fragment Mono (mono) + Instrument Sans (body); HUD silkscreen legend added (`PWR` LED + `REV 1.0 · 2026`).
- **Layer 1b `style.css`**: fab-shop tokens — `--fr4`, `--mask-green`, `--silkscreen`, `--silkscreen-muted`, `--enig-gold`, `--signal` + `--ease-*`/`--duration-*`; hero/stat-badge restyle; legacy aliases kept.
- **Layer 1c `scroll.css`**: silkscreen HUD legend, gold-pad nav active + `:active`, gold-pad CTAs (rotating shine sweep REMOVED), `hud-cta-hidden` rule.
- **Layer 2 Three.js**: particles → signal green `0x3ee6a0`; radar sweep gated by `prefers-reduced-motion`; soldermask-green backlight; warm silkscreen `#ece7d8` canvas texture; mask `0x1e4d33`; every remaining `0x00ff88`/`0xfffacd` glow → `0x3ee6a0` (hover.js, project-chips.js, components.js).
- **Single-CTA rule is now data-driven**: `setActivePanel()` toggles `body.hud-cta-hidden` whenever the active panel embeds its own `.cta-linkedin` (hero, about, contact) — the About dual-CTA gap is FIXED. Live-verified CTA counts: hero=1, about=1, projects=1.
- **FIXED a Chromium `visibility`-transition deadlock** (reproduced live after nav clicks): panels froze at `opacity 0` with transitions stuck at `currentTime 0`. Fix in `scroll.css` `.ds-panel`: inactive `transition: ..., visibility 0s linear 0.6s`; `.panel-active` gets `..., visibility 0s` — visibility flips instantly on activate, waits out the fade on deactivate. ⚠️ **Applied but NOT yet re-verified live — verify before pushing.**

### REMAINING (do these first next session)
1. **Verify the visibility fix live**: reload preview → click `[CONTACT]` nav → `#panel-contact` must reach `opacity 1` and `getAnimations()` must settle to `[]` (no frozen transitions). Also click every nav button.
2. **Add `.freebuff/` to `.gitignore`** — it's untracked and currently NOT ignored; must never be pushed.
3. **Commit + push to GitHub** (user explicitly requested). Changed files: `index.html`, `style.css`, `scroll.css`, `main.js`, `src/three/*.js`, `src/utils/hover.js`, `src/scroll/journey.js`, `src/ui/boot.js`, `claude.md`. Push to `origin master`.
4. Optional polish: panel chrome now uses silkscreen-white/gold gerber-style borders + shadows (`.ds-panel`, `.hero-panel`, `.spec-table`, `.proj-ds`, `.skill-pill`, `.contact-footer`). The `0.6s` panel transition delays (`.ds-ref` 0.2s / `.ds-title` 0.3s / `.ds-body` 0.4s) could still be tightened.

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

## 🧭 Current Interaction Model — Two Modes (READ FIRST)

The portfolio has **two mutually exclusive modes**, selected at boot via body class:

| Mode | Body Class | Who Gets It | Camera / Interaction |
|:---|:---|:---|:---|
| **Full Scroll-Journey** | `full-journey` | Default (viewport ≥ 768px AND no reduced-motion) | Camera flies along a CatmullRomCurve3 path driven by GSAP ScrollTrigger scrub (`setCameraAtT(t)`). Panels are fixed overlays side-anchored to the projected component position. |
| **Lite / Legacy** | `lite-mode` | `prefers-reduced-motion: reduce` OR viewport < 768px (`isLiteMode()` in `src/config.js`) | No scroll-jacking; sections stack normally. Legacy raycast **click-to-zoom** (`zoomToComponent`) still works here. |

**Consequences you must respect in code:**

1. In `full-journey` mode, clicks on components are **ignored** (`hover.js` click handler early-returns) and `updateCamera()` (legacy zoom LERP) is **never called** — `setCameraAtT(t)` owns the camera every frame. Calling `updateCamera()` in journey mode would fight the scrub position.
2. Hover glow + scale pulse still work in both modes; tooltip / HUD telemetry / trace speed-boost are legacy-mode only.
3. `initJourney(camera, boardGroup)` runs **after** the boot sequence completes (main.js boot callback). Before that, `stopPosVectors` is empty so `updateJourneyEffects` no-ops safely.
4. `#hud-bar` interactivity is gated by the `.hud-ready` class — see the Critical Gotchas section.
5. `main.js` step 14 binds nav buttons to `scrollToSection()` (journey) with a legacy `triggerComponentAction(ref)` fallback when the section element is missing.

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
        ├── hover.js         # THREE.Raycaster hover/click logic, bounded pointer clamp + targetMouse inertia, journey vs legacy mode split
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

*(This describes the legacy click-to-zoom interaction, active in lite mode. In full-journey mode the same screen-anchoring math runs continuously from ScrollTrigger — see `updateJourneyEffects()` in `src/scroll/journey.js` — and the click-zoom steps are disabled.)*

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
1. Click the **U1 CPU component** (About/Education) on the 3D board.
2. Confirm the camera visibly travels through 3D space over **1.2 seconds** with `power2.inOut` easing (no instant snap).
3. Confirm the info panel reveals and stays **anchored to the component's projected 2D position** when panning/rotating.
4. Click the close button `[X]` or press `Escape` — confirm the camera smoothly reverses to the starting view.
5. Check the **Contact section** — confirm there is **exactly ONE 'Connect on LinkedIn' button** visible (no duplicate stacking).

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
