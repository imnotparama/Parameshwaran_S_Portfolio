# PCB 3D Portfolio — Technical Architecture, Microarchitecture Blueprint & Developer Transfer Log

Hi! This file is the primary reference prompt and technical transfer guide for any AI coding assistant (Claude / Antigravity / Gemini) working on this repository.

---

## 🚦 NEXT SESSION — RESUME HERE (2026-08: post-cleanup state)

**Status: `origin master` is current through `fa6e363` (pushed). UNCOMMITTED local work (a type-hygiene + docs batch, ready to commit+push when asked): full checkJs coverage (all 12 modules), the traces.js TraceRoute typing, all four motion plans (001–004) executed, the animejs/hyperframes discipline fixes, the README refresh, and this claude.md log update.**

### Shipped in recent sessions (commit order, newest first)
- `fa6e363` — **daughterboard card redesign + full-board framing (z=23) + fab-bench backdrop + shadow grounding + board-first hero + dead-symbol sweep + checkJs on journey/boot** (one batch, pushed).
- `d7b8f52` — `public/og-preview.png` (1200×630 social share card) via the `.freebuff/og-tools` headless pipeline + `?og=1` instant-boot capture mode.
- `e43a9e4` — improve-animations motion audit: 4 self-contained plans in `plans/` (vetted findings; **not yet executed**).
- `cd8b451` — frame-clock hygiene (clamped tick delta, delta-scaled parallax lerps).
- `4da7a76` — boot→hero arrival glide (kills the boot→journey camera cut).
- `5e64df4` — signal-path scroll progress HUD + keyboard section nav (1–6).
- `9f9b852` — deterministic single-timeline boot (no setTimeout, no wall-clock).
- `26efc8a` — dead layout CSS sweep (no DOM behind it).
- `2e1f85b` — orphaned sub-core export pruning (post legacy-stack deletion).
- `f3558b0` — hash deep links (`#/about`, `#/projects`) + skip-boot-on-return (`sessionStorage`).
- `6f9d0d0` — legacy interaction stack deleted (single scroll-journey model).
- `cdb44e2` — panel activation derived from scroll-leg t (deleted distance-threshold hysteresis).
- `976b818`, `7cf9c70`, `05199ad`, `8726fef` — component quality pass, elevated camera framing, fab-shop panel chrome, fab-shop redesign.

### Open items (nice-to-haves, no urgency)
- **~~Execute the `plans/` motion audit~~ DONE** — all four plans executed: 001 (nav sheen translateX, per user direction), 002 (boot underline scaleX), 003 (motion-token consolidation), 004 (hover lifts gated). See `plans/README.md` execution log. The audit's missed opportunities (key-hint affordance, gold-pad transition, PWR LED glow-in) remain optional.
- **~~Delete stale `src/schema.ts`~~ DONE** — removed; the typecheck is `npm run typecheck` (`tsc --noEmit`) over the `// @ts-check` JS modules only.
- **~~Finish checkJs coverage~~ DONE** — `// @ts-check` now covers **all 12 modules**: journey, boot, hover, scene, traces, board, components, particles, project-chips, config, sections, fallback. See session log for what surfaced (the last `@type {any}` interop cast is gone — hover.js now narrows the typed `interactiveObjects`).

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
2. `initJourney(camera)` runs **after** the boot sequence completes (main.js boot callback) — the `boardGroup` param was removed in the 2026-08 dead-symbol sweep; only `updateJourneyEffects(camera, boardGroup)` still receives the group. Before `initJourney`, `journeyReady` is false and `updateJourneyEffects` no-ops — this gate exists so boot's GSAP inline styles on the hero panel are never fought mid-boot.
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
    │   ├── traces.js        # Solid 3D copper trace segments (BoxGeometry), corner vias (Cylinders), trace pathways data (TraceRoute typedef)
    │   ├── particles.js     # Electron flow particles along trace paths (constant speed — hover speed boost removed)
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

# 3. Check for TypeScript / linting issues — npm run typecheck (tsc --noEmit)
#    No .ts files in src. Validates the checkJs-opted files (opt-in via "// @ts-check"
#    at the top of each; tsconfig sets "allowJs": true, "checkJs": false):
#      - src/scroll/journey.js  (camera path, leg state, panel positioning)
#      - src/ui/boot.js         (deterministic boot choreography)
#      - src/utils/hover.js     (raycast hover-glow + pointer inertia)
#      - src/three/scene.js     (renderer, lights, backdrop, shadow catcher, tick loop)
#      - src/three/traces.js    (copper trace routes — TraceRoute typedef feeds journey/boot/particles)
#      - src/three/board.js     (substrate, silkscreen canvas, mounting holes, parallax)
#      - src/three/components.js (SMD components — interactiveObjects typed THREE.Mesh[])
#      - src/three/particles.js (electron flow — Particle typedef)
#      - src/three/project-chips.js (project chips — FlickerLed typedef)
#      - src/config.js          (URLs, breakpoints, env helpers)
#      - src/ui/sections.js     (datasheet injection, profile link wiring)
#      - src/ui/fallback.js     (WebGL detection, cleanup)
#    Keep their JSDoc types accurate when refactoring so the check stays green.
npm run typecheck
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

- **2026-08 Session — discrete-text-sequence applied to the boot terminal lines**: the first boot line (`> INITIALIZING PARAMA-DEV-BOARD...`) no longer types uniformly — it now runs the same discrete-text-sequence pattern as the subtitle. `boot.js` `BOOT_LINES` became `Array<string | BootLine>` with a `BootLine` typedef (`{ text, sequence?: {t, text}[], total? }`); the first entry carries a deterministic typo schedule: `> INI` → `> INITI` → **`> INITILIZING`** (typo — dropped 'A' in INITIALIZING) → `> INITI` (backspace to the fork) → corrected bulk paste `> INITIALIZING PARAMA-DEV-BOARD...`. The typing loop branches: plain-string lines keep the uniform proxy tween; sequenced lines get one `ease:'none'` driver tween whose onUpdate reverse-searches the sparse schedule (identical mechanics to the subtitle), `total: 1.4` (the typo drama needs a beat longer than the original 1.02s uniform type — shifts the live-status re-append from ~4.0s to ~4.45s, still well before the 5.85s statusFinal update), plus a final-state `tl.call` snapping the corrected line exact. All other lines + the status register are untouched. **Verified live**: re-ran the boot in-page (cleared the `psb-booted` skip flag, restored the overlay, called `runBootSequence()` directly) and sampled the first line — the exact sequence rendered: `> INITI` → `> INITILIZING` → `> INITI` → `> INITIALIZING PARAMA-DEV-BOARD...`; final terminal state has all three lines exact, status register reaches "ALL SYSTEMS OPERATIONAL", console clean. `npm run typecheck` + build green. (Note: `preview_navigate` reloads swallow the boot window — the tool waits ~15s for a load event that never arrives mid-boot; re-run the boot in-page to observe it.)
- **2026-08 Session — gradient-text-sweep extended to every datasheet title**: the hero-name twin mechanism (`.headline-stack` + `.headline-twin`, `background-clip: text`) now applies to each panel's `h2.ds-title` — `index.html` wraps all five static titles (ABOUT/PROJECTS/SKILLS/EXPERIENCE/ALL PCB SYSTEMS OPERATIONAL) plus the focused-project `#pdetail-title` in `.headline-stack.ds-title-stack` grids with pixel-identical twin spans (`aria-hidden`). `scroll.css` adds the metric-matching overrides — `.ds-title-stack .headline-twin` gets the h2's exact `padding-left: 12px` (tick offset), `22px / 3px / 700 / var(--font-heading)`, a 640px-media `16px` twin match for the mobile `.ds-title` shrink, and `.contact-panel .ds-title-stack .headline-twin { padding-left: 0 }` (centered panels drop the tick). `journey.js` `setActivePanel` now fires a one-shot sweep on activation of any non-hero panel (reuses the boot's exact tween language — `backgroundPosition 100%→0%` at `ease:'none'`, raised via `gsap.set(opacity:1)`, faded back at 1.2s with `clearProps: 'backgroundPosition'`); duration shortened 1.6→1.2s because a narrow 22px title swept at hero's duration reads draggy (travel is proportional to element width). **Hero panel excluded on purpose** — boot.js owns its twin; journey's `setActivePanel('panel-hero')` at init would otherwise double-sweep right after boot. `fillProjectDetailPanel` fills `#pdetail-title-twin` with the same text as the title. Verified: `npm run typecheck` + build green; live — twin metrics match the h2 exactly (font/weight/spacing/family/padding/text, resting opacity 0), focus-activation caught the sweep mid-travel (`backgroundPosition 78.8% 50%`, opacity 1 → back to 0), contact panel raises its twin, hero twin stays 0. Reduced-motion users never see it (lite mode = no journey).
- **2026-08 Session — social-card metadata made absolute (bulletproof sharing)**: `index.html` head now uses `https://imnotparama.github.io/Parameshwaran_S_Portfolio/` as the single **SITE_BASE** (loud comment marks it as the one place to swap for a custom domain — GitHub Pages is the deploy target; Pages is currently disabled on the repo, so the URL isn't live yet). Everything derives from it: `og:url`, `og:image` (+ `og:image:secure_url`), `twitter:image` (was missing entirely), `<link rel="canonical">` (was missing — Google uses it for dedupe), and the JSON-LD `image` (was relative `/og-preview.png`). Relative og:image URLs get dropped or mis-cached by LinkedIn/Discord scrapers, and Google dedupes via og:url/canonical — both were the stated failure modes. Verified: `npm run build` green and the built `dist/index.html` carries all five absolute URLs; live DOM parse confirms canonical + og:url + og:image + twitter:image + JSON-LD image all resolve to the Pages base. NOTE: re-scrape LinkedIn/Discord debuggers after the site is actually deployed (they cache aggressively).
- **2026-08 Session — click-to-component resurrected in the scroll-journey model (the flagship interaction)**: project chips on the board are now raycast-clickable — clicking one glides the camera to the chip and opens a focused datasheet anchored next to it. **The interaction** (exactly the blueprint's loop, adapted to the leg-driven model): `hover.js` gained a canvas-only click listener (`setBoardClickHandler`) — raycasts the click's NDC against `interactiveObjects`, forwards `userData.type === 'PROJECT'` hits by ref (listener is on `#threejs-canvas`, so HUD/panel clicks never reach it). `project-chips.js` now exports `projectChips` — `{ ref → { pos (boardGroup LOCAL space, same language as COMPONENT_WORLD), data, ledMat } }` — with `buildSolderedChip`/`buildBreadboardPatch` returning their LED materials for the focus flash. `journey.js` added a `focusedChip` state + `focusProject(ref)` (exported): fills `#panel-project-detail` from `portfolio.js` (textContent only — ref/status line, title, problem, state, tag pills, link CTA), activates it via `setActivePanel`, flashes the chip's LED (same "if it glows, it's live" language as `pulseArrival`), and glides the camera to `chip.pos + CHIP_FOCUS_OFFSET (0, 1.5, 2.8)` (closer than section stops — the chip is 0.42u) using the extracted `glideCameraTo(pos, look, duration)` (power2.inOut, `ARRIVAL_GLIDE_DURATION` default). **Release paths (all verified live)**: any scroll — `setCameraAtT` calls `clearFocus(false)` and the scrub owns the camera again; Esc (journey keydown, ignores INPUT/TEXTAREA); the panel's `✕` button (`#btn-project-close` → `exitFocusMode()`, both glide back to the current leg's stop pose); clicking the same chip toggles off. `updateJourneyEffects` was refactored: panel anchoring extracted into `positionPanelAt(panelId, cx, cy)` (the old inline block — pre-calculated sizes, side-pick, clamp, connector draw), reused by both the COMPONENT_WORLD branch and the new focus branch (detail panel anchors to the chip's projected position every frame, connector line included). `index.html` gained the `#sec-project-detail` section — `display: contents` in scroll.css so its `min-height: 180vh` `.journey-sec` can't extend the scroll path — holding `#panel-project-detail` (`.ds-panel` with `.panel-close` gold SMD button, `.ds-ref`, `.ds-title`, `#pdetail-problem/state/tags/link`). `createConnector` is now idempotent (removes any existing `#connector-line` before appending — a dev-mode double module graph stacked two fixed overlays; harmless but sloppy). **Verified**: `npm run typecheck` + build green; live via the REAL click path (synthetic canvas click at CP1's projected screen position → focus fired through the actual handler chain: panel active + filled, camera at `(-4.20, 4.40, 2.88)` = CP1 pos + offset, connector `display: block`, HUD CTA hidden); FR1 breadboard chip reads `FR1 — BREADBOARD (IN BUILD)`; toggle/scroll/Esc/close all release correctly; console clean. Note for testers: dynamic `import('/src/...')` in the dev console resolves a SECOND module instance (empty `projectChips`, null camera) — Vite appends `?t=<mtime>` to the real graph URLs; use `performance.getEntriesByType('resource')` to find the `?t=` URLs.
- **2026-08 Session — three-adapter renderer-quality ladder (composer resolution + shadows + bloom)**: `src/three/scene.js` gained a **whole-budget quality ladder** replacing the bloom-only guardrail. Findings that drove it: (1) `EffectComposer._pixelRatio` defaults to **1** and is never synced to the renderer — the bloom path silently rendered the scene at CSS-pixel resolution on retina and upscaled (soft), while the guardrail only ever scaled bloom strength; (2) the actual fill costs in the bloom path — composer resolution, then shadow map — stayed pegged at full under load. **Fix**: new `QUALITY_LEVELS` ladder — level 0 = the tuned baseline exactly (composer ×1.0, shadows 1024², bloom 0.45/0.3), level 1 = ×0.75 / 768² / 0.2·0.15, level 2 = ×0.5 / 512² / 0.1·0.08. `applyQualityLevel()` scales composer resolution (the real fill cost) + shadow map (dispose + null to force re-render) + bloom together; `enableBloom()` now syncs the composer ratio to the renderer at init; the resize handler re-applies the current level so resolution/shadows stay in budget. Added **hysteresis** — recover only when fps climbs ~5 above the downgrade floor, so borderline machines don't thrash every 30 frames. Verified: `npm run typecheck` + build green; boot completes clean (the SwiftShader shaderSource exception is the pre-existing software-rendering artifact, not this change); in this DPR=1 environment the composer ratio computes to 1.0 (identical to before) — the retina-DPR-2 fix and the down-step ladder are the real behavioral gains, feel-checkable on hardware.
- **2026-08 Session — threejs-animation perf pass (60 per-particle PointLights removed)**: `src/three/particles.js` gave every electron (5 × 12 traces = 60) its own `PointLight(0xffffff, 0.3, 1.5)` — all switched on for the whole journey — forcing every lit material's shader to evaluate 60 point-light attenuations per fragment through bloom + shadow passes. The particles are already emissive (`emissiveIntensity: 2.5`, `0x3ee6a0`) with bloom threshold 0.7, so the "moving glow" was redundant with the glow they already emit. **Fix**: deleted the per-particle light + the 60 identical `defaultMaterial.clone()` calls (nothing differentiates them per-particle — only `mesh.visible` toggles; the clones were 60 identical program bindings). Now ONE shared material, zero particle lights; scene keeps only its two intentional PointLights (`pcbBacklight` scene.js:203, `hoverLight` hover.js:47). Verified: `npm run typecheck` + build green; grep confirms zero per-particle lights; boot completes clean with no console errors. Feel-check on real hardware still pending (preview webview not compositing frames this session) — if the electrons read too flat on a device, the fallback is one shared PointLight per trace (12, not 60) following the leading particle.
- **2026-08 Session — frontend-design cohesion pass (finish, not redesign)**: the identity (FR-4/soldermask/ENIG gold, daughterboard panels, warm IPC silkscreen) was audited and three incoherences fixed against the site's own rules. **(1) Signature move — HUD nav is now the board's pin map**: each nav button gained a tiny gold reference designator (`<span class="nav-ref" aria-hidden="true">U1</span>`, U2, C1–C4, J1, ANT1 — matching the panel silkscreen refs), styled at 9px / `var(--enig-gold)` / 0.8 opacity (1.0 on hover/active); aria-hidden so the buttons' aria-labels keep the clean names. **(2) Cold-white unification**: all `#ffffff` → `var(--silkscreen)` (#ece7d8) — `.ds-title`, `.proj-ds-title`, `.tl-title` (scroll.css), `.fallback-title` + `.nav-btn:hover` (style.css) — the page previously rendered two whites (pure cold white on titles vs the warm IPC silkscreen identity), with the hero name already on silkscreen. **(3) Motion-token completion**: the raw-ease stragglers plan 003 left off-token are now tokenized — `.proj-ds` `0.3s ease` → `var(--duration-base) var(--ease-out)`, `.proj-ds-link` + `.secondary-link` `0.2s` → `var(--duration-fast) var(--ease-out)`, `body.hud-cta-hidden #cta-linkedin-hud` `0.3s ease` → tokens. Verified: `npm run typecheck` + build green; greps clean (zero `#ffffff`, zero raw `0.3s ease`/`0.2s` in both sheets); live — refs render in ENIG gold, `.ds-title` resolves `rgb(236,231,216)`, `.proj-ds` transition computed as `0.3s cubic-bezier(0.22,1,0.36,1)`.
- **2026-08 Session — hyperframes-animation rules composed into the hero (discrete-text-sequence + gradient-text-sweep)**: the boot's subtitle typing became a **discrete text sequence** (`src/ui/boot.js`) — a sparse `{t, text}` schedule (`SEQUENCE`) with keystroke clusters, a typo (`ECE + Data Sience`), backspaces peeling to the fork (`ECE + Data S`), then a corrected bulk paste (`ECE + Data Science`), driven by ONE `ease:'none'` proxy tween with a reverse-search `textAt()` in `onUpdate` (pure function of timeline time — deterministic, no timers; the old smooth per-char slice was uniformly machine-typed). A `tl.call` at `SCHEDULE.subtitle + TOTAL` snaps the final text exact as a safety net. The hero name got a **gradient-text-sweep**: `index.html` wraps `h1#user-name` in a `.headline-stack` (CSS `display:grid`) with an `aria-hidden` `.headline-twin` span stacked `grid-area: 1/1` — `background-clip:text`, `background-size: 300% 100%`, `background-position: 100% 50%`, `color: transparent`, `opacity: 0` by default (resting design untouched). Boot raises it at `SCHEDULE.board`, tweens `backgroundPosition` 100%→0% (percent axis inverted → left→right travel) at `ease:'none'` for 1.6s (gold→green ENIG sweep masked INTO the glyphs), then fades back to 0 so the solid silkscreen h1 owns the rest state. Also per the easing doctrine: board float-up + underline draw moved `power2.out` → `power3.out` (house entrance settle — the board float is the hero entrance, power2 is for secondary motion). `style.css` gained the stack/twin rules + a 768px mobile twin override (matches the h1's smaller clamp + 0.08em spacing). Validated: `npm run typecheck` + build green; live — twin computed style confirmed (`background-clip:text`, 300% size, transparent fill, resets to opacity 0), the SEQUENCE reverse-search verified in-page at all four key states, and the sweep visually confirmed over the name (pale ENIG-gold/green hue distinct from the resting silkscreen); skip-boot path unaffected (twin stays hidden, subtitle lands on the corrected full text).
- **2026-08 Session — JSON-LD Person structured data added**: `index.html` head gained an `application/ld+json` block — `@type: Person` with `name`, `jobTitle` ("ECE + Data Science Student"), `alumniOf` (SRM Institute of Science and Technology, Ramapuram), `sameAs` (LinkedIn + GitHub, mirroring `config.js`), `image` (`/og-preview.png`), and `knowsAbout` (all 25 skills across the four `portfolio.js` groups: ai_ml/web/data/hardware). **Static in the raw HTML by design** — crawlers and recruiter scrapers read markup without executing JS (dynamic injection from portfolio.js would defeat the purpose). A comment in the block flags the sync requirement with `portfolio.js`. Validated: `JSON.parse` of the extracted block via node + in the live DOM (25 skills, 2 sameAs), `npm run build` green.
- **2026-08 Session — Plans 003 + 004 executed (motion audit COMPLETE)**:
  - **004 — hover lifts gated** behind `@media (hover: hover) and (pointer: fine)` in six places: `.hud-nav .nav-btn:hover` (scroll.css), `.cta-linkedin:hover` (scroll.css, split from `:focus-visible` — keyboard half stays ungated), `.proj-ds:hover` + `.proj-ds.is-building:hover` (merged into one gated block, current lift `-3px`), `.skill-pill:hover` (found live beyond the plan's list — its `-1px` lift would have tripped the verification grep), `.nav-btn:hover` (style.css — also removed the green box-shadow that leaked onto HUD hovers), `.cta-linkedin:hover, .cta-contact:hover` (style.css). Color/bg/border/shadow feedback, `:active` dips, and `:focus-visible` stay ungated. Every `translateY` lift now sits inside a gated block (6 media blocks).
  - **003 — motion tokens consolidated**: all six hand-typed `cubic-bezier(0.22, 1, 0.36, 1)` → `var(--ease-out)` (vignette + 5 panel/typography rules; durations preserved verbatim — the only remaining raw curve is the `:root` token definition). Deleted the "Minimalist Navbar styles" `.nav-btn` block (strict subset of Enhanced; `scroll.css` owns the HUD cascade). Tokenized Enhanced `.nav-btn` + CTA `0.25s ease` → `var(--duration-fast) var(--ease-out)` (0.18s — deliberate snappiness correction) and both `.skip-link` `0.3s ease` → `var(--duration-base) var(--ease-out)`. `.proj-ds` transitions untouched per plan scope.
  - **Verified**: build + tsc green; greps clean (no raw curve outside `:root`, no `0.25s ease`, no Minimalist block, all lifts inside media blocks); live computed styles resolve to tokens (nav/CTA `0.18s cubic-bezier(0.22,1,0.36,1)`, panels `0.5s` unchanged curve); boot → hero active, HUD clickable, console clean. `plans/README.md` status + execution log updated.
- **2026-08 Session — checkJs coverage sweep COMPLETE (all 12 modules checked)**: `// @ts-check` added to `components.js`, `particles.js`, `project-chips.js`, `board.js`, `config.js`, `sections.js`, `fallback.js` (config.js surfaced zero errors). Fixes required:
  - **components.js**: `interactiveObjects`/`cpuPins`/`ledMeshes` typed `THREE.Mesh[]`, `siliconDieMesh`/`cpuRadarRing` `THREE.Mesh | undefined`; the radar-ring material check became `mat instanceof THREE.MeshBasicMaterial` (the ring is created with MeshBasicMaterial — true at runtime, and it narrows the `Material | Material[]` union that the old `mat.opacity !== undefined` guard couldn't).
  - **board.js**: `boardGroup` typed `THREE.Group | undefined`; params typed on `createBoard`/`updateBoardParallax`/`lerpFactor`/`drawHatchedPour`/`drawCrosshair`; the mounting-holes `forEach` captures `const board = boardGroup` — a module-level `let` is 'possibly undefined' inside closures even right after assignment, so the closure needs a captured const.
  - **particles.js**: `Particle` typedef (`{mesh, points, progress, baseSpeed}`), `particles` typed `Particle[]`; deleted the unused `DEFAULT_PARTICLE_COLOR` const (TS6133).
  - **project-chips.js**: `FlickerLed` typedef (`{mat: MeshStandardMaterial, seed}`), `flickerLeds`/`steadyLeds` typed; `buildBreadboardPatch(group, goldMat)` dropped its unused `goldMat` param (TS6133) and the call site now passes `(group)` only.
  - **fallback.js**: `canvas.getContext('webgl') || getContext('experimental-webgl')` asserted to `WebGLRenderingContext | null` (the raw `RenderingContext` union has no `getExtension`); `setupCleanup` dropped its unused `camera` param (main.js now calls `setupCleanup(scene, renderer)`); `disposeScene`/`disposeMaterial` params typed, with `disposeMaterial` casting to `MeshStandardMaterial` for the defensive map/lightMap/envMap disposal.
  - **sections.js**: `esc(str)` param typed; the `querySelectorAll(...).forEach` callbacks cast each element inside the body (`/** @type {HTMLAnchorElement} */ (a)`) — an arrow-param annotation is rejected by the NodeList.forEach callback signature (contravariance).
  - **boot.js**: added `import * as THREE` for the silicon-die settle — `siliconDieMesh.material.opacity = 0.65` became `instanceof THREE.MeshBasicMaterial` narrowing (the die material is MeshBasicMaterial in components.js).
  - **hover.js**: the last `/** @type {any} */` interop cast deleted — `interactiveObjects` is typed `THREE.Mesh[]` now, so the filter callback narrows without a cast.
  - **Verified**: `npm run typecheck` exits 0 across all 12 modules; `npm run build` green; live journey re-checked (boot → overlay gone, all 6 panels live, canvas WebGL rendering); console clean.
- **2026-08 Session — Dead-export sweep + typecheck script + schema.ts removed**:
  - De-exported four symbols verified dead by full-repo search (zero importers): `vias` (traces.js — export + the `vias.push(viaGroup)` collection dropped; the via groups are still created and added to the board), `silkscreenMesh` (board.js — now module-private `let`, still assigned and added to the board), `targetMouse` (hover.js — now module-private `const`, still fed by `updateMouseCoords` and read by `checkHover`), `setCameraAtT` (journey.js — now internal, still called by the ScrollTrigger `onUpdate`). All type-only de-exports — runtime identical.
  - `package.json` gained `"typecheck": "tsc --noEmit"`; **`src/schema.ts` deleted** (its only purpose was giving tsc a `.ts` file — the real checks are the `// @ts-check` JS modules). `npm run typecheck` passes with zero `.ts` files in src. README + claude.md protocol now use `npm run typecheck`; the stale open item is marked DONE.
  - **Verified**: `npm run typecheck` + build green; grep confirms no `export` remains on the four symbols; live journey re-checked (boot → hero active, vignette 0.35). Reviewer: no defects.
- **2026-08 Session — Plan 001 executed (nav sheen transform-only) + plans 001/002 marked DONE**:
  - Per user direction, plan 001 was executed as a **translateX conversion, not deletion**: `style.css` `.nav-btn::after` sweep moved from `left: -100% → 100%` (`transition: left 0.5s` — a layout property on a hot control) to `left: 0` + `transform: translateX(-100% → 100%)` with `transition: transform var(--duration-base) var(--ease-out)` (0.3s, token-eased). Two deviations from the plan body, both required by that strategy: `overflow: hidden` stays on `.nav-btn` (the sweep still needs clipping), and `.hud-nav .nav-btn.nav-active::after` in `scroll.css` gained `transition: none` so the ENIG gold pad doesn't inherit a transform slide-in on section change (plan finding #3 stays fixed).
  - `plans/README.md`: 001 and 002 marked **DONE** with an execution log; 002 was already implemented in the hyperframes-animation session (`.header-underline` pinned `280px` + `scaleX(0→1)`, center origin — matches the plan exactly). Note added for 003 that its excerpts assume the sheen was deleted — re-read current `style.css` before executing.
  - **Verified**: build + tsc green; `grep transition: left` clean in style.css; live computed-style check — sheen transition is `transform 0.3s` at `translateX(-100%)`, and the gold pad's computed transition is `none` with the transform identical before/after a nav-active toggle (snaps instantly, no slide).
- **2026-08 Session — animejs discipline audit — last unseeded randomness removed**:
  - Audited the whole animation surface for the animejs contract (deterministic, finite, single-clock, no unseeded randomness, no animations built in timers):
    - `Math.random` / `Date.now` / `performance.now` — **one hit**, fixed: `project-chips.js` seeded each breadboard LED flicker phase with `Math.random() * 100`, so the "in build" LEDs pulsed differently on every page load and every `?og=1` capture. The flicker formula was already deterministic (`sin(elapsed·7 + seed) · sin(elapsed·13.7 + seed·2)`); now the seed is `flickerLeds.length * 2.4` — a fixed per-LED phase offset, out of lockstep, reproducible every visit.
    - `setTimeout` — only the `scene.js` resize debounce remains (a debounce, not an animation); boot is setTimeout-free.
    - `repeat: -1` / `Infinity` — zero hits; all GSAP pulses are finite (boot flashes `repeat: 1`, LED blinks `repeat: 3`, silicon die `repeat: 7`).
    - `requestAnimationFrame` — exactly two: the `scene.js` tick loop (the single clock — correct) and a one-shot `ScrollTrigger.refresh()` scheduling in journey.js.
  - **Verified**: grep clean (only the explanatory comment mentions Math.random); `npm run build` + `npx tsc --noEmit` green.
- **2026-08 Session — hyperframes-animation discipline applied (transform-only tweens + pre-calculated layout constants)**:
  - **Boot underline `width` → `scaleX`** (the skill's transform-only spatial-motion rule): `style.css` `.header-underline` now has a fixed `width: 280px` + `transform: scaleX(0); transform-origin: center;` (grows from center, the same feel as the old width draw); `boot.js` tweens `scaleX: 1` instead of `width: '280px'` in the full boot path, and the skip/lite path sets `gsap.set(underline, { scaleX: 1 })`. The old tween forced layout every frame of the 1s draw; scaleX is compositor-only. Verified live: underline draws to `matrix(1,0,0,1,0,0)` after boot. *(Note: this supersedes plan 002's left-origin suggestion for the underline — center origin was chosen deliberately to preserve the shipped centered-grow visual.)*
  - **Panel dimensions measured once, not per frame** (the skill's pre-calculated layout constants rule): `updateJourneyEffects` read `panel.offsetWidth`/`offsetHeight` every animation frame — forcing layout on every scroll-scrub frame. New `panelSizeCache` (keyed per panel) measures once per panel; `invalidatePanelSizeCache()` runs on `window.resize` (media-query widths) and in the existing `document.fonts.ready` hook (font-swap heights). Fallbacks (`Math.min(480, vw-40)` / `Math.min(300, vh*0.5)`) and the `.ds-panel-wide` 980px handling are preserved. Verified live: panel-projects still right-anchors with correct cached-width placement.
  - **Verified**: tsc + build green; live journey re-checked (boot → underline drawn via scaleX → panel anchors on scroll); console clean; reviewer-clean.
- **2026-08 Session — README refresh (uncommitted)**: rewrote `README.md` to the shipped state — scroll-journey-only interaction model table, daughterboard datasheet panels, fab-bench backdrop + shadow grounding, board-first hero, deterministic boot, deep links, single-CTA rule, `og-preview.png` card embedded, and the checkJs verification protocol. Removed stale content for deleted systems (legacy hover-boost mode, tooltips/camera-states, Orbitron/Share Tech Mono fonts, canvas-renderer fallback). Setup/stack/structure sections corrected to Three.js r185 + GSAP 3.15 + Chakra Petch/Fragment Mono/Instrument Sans.
- **2026-08 Session — OG social card shipped (`d7b8f52`)**: ran the `.freebuff/og-tools` capture pipeline (headless Chrome + SwiftShader WebGL against `?og=1` instant-boot mode) and generated `public/og-preview.png` (1200×630). Verified not black — 96.7% non-black cells, 20.8% FR-4 green, 29 color buckets, board centered with lit traces, zero console errors. Committed the PNG alone (kept the redesign batch separate), confirmed Vite copies it into `dist/` so the `og:image` meta resolves. LinkedIn/Discord cache scrapes — re-scrape via their debugger tools after deploy.
- **2026-08 Session — Big batch committed + pushed (`fa6e363`)**: committed the daughterboard redesign (scroll.css), full-board framing + vignette (journey.js), fab-bench backdrop + shadow catcher (scene.js), board-first hero, dead-symbol sweep (main.js/board.js), and checkJs on journey/boot (tsconfig.json, boot.js) as one cohesive commit; pushed `cd8b451..fa6e363` to `origin master`. Validation before push: tsc + build green.
- **2026-08 Session — traces.js typed (last `@type {any}` interop casts removed)**:
  - Added `// @ts-check` to `src/three/traces.js` with a `TraceRoute` JSDoc typedef (`component: string`, `points: THREE.Vector3[]`, `width: number`, `meshes: THREE.Mesh[]`); `traceData` typed `TraceRoute[]`, `vias` typed `THREE.Group[]`; params typed on `createTraces`/`addTraceMesh`/`addVia`.
  - **journey.js**: `pulseArrival`'s `/** @type {any} */` casts on the trace callbacks are gone — `t`/`m` now flow from the typedef, and the material check became `mat instanceof THREE.MeshStandardMaterial` (trace segments always use that material; narrows the `Material | Material[]` union). **boot.js**: the `/** @type {any} */` mesh cast dropped — `mesh.material` is directly assignable to gsap's `TweenTarget`.
  - particles.js (unchecked) now receives the typed `TraceRoute[]` too — same runtime data, but its `traceData.forEach(trace => …)` reads are type-checkable when it gets `@ts-check`.
  - **Verified**: tsc exits 0 (now 6 checked files: schema + journey, boot, hover, scene, traces); build green; live journey re-checked (boot → hero active, overlay gone, console clean).
- **2026-08 Session — checkJs extended to hover.js + scene.js (full interaction core checked)**:
  - Added `// @ts-check` to `src/utils/hover.js` and `src/three/scene.js`. `npx tsc --noEmit` now type-checks the whole interaction core: journey, boot, hover, scene (+ schema.ts).
  - **hover.js**: typed module state (`raycaster`/`activeCamera`/`currentHovered`/`hoverLight` as `| null` — the runtime guards already existed), `PCB_GLOW_MAP` as `Record<string, number>`, param types for `initHover`/`handleHoverEnter`/`resetHoverMesh`, inline param annotations for the `clamp` and `updateMouseCoords` arrows, a `Record`-indexable glow map, and `/** @type {any} */` casts for the heterogeneous `mesh.material` (Standard/Basic/Phong all share `.emissive`) and the unchecked-module `interactiveObjects` filter callback.
  - **scene.js**: module exports typed as `THREE.Scene | null` etc. (honest — null until `initScene`), `tickCallbacks` as `Array<(elapsed, delta) => void>`, `canvas.getContext('2d')` asserted non-null, `checkPerformance(deltaMs)` param, `resizeTimeout = 0` + `fpsHistory: number[]` initializers, and two new **type-only guards** in the resize debounce and `animate()` (`if (!camera || !renderer) return`) — closures can't narrow module-level lets; both were already guaranteed assigned at runtime.
  - **Verified**: tsc exits 0; build green; live journey re-checked (boot → hero active, vignette 0.35, connector present, console clean).
- **2026-08 Session — Dead-symbol sweep + checkJs enabled (tsc now meaningful)**:
  - Removed dead symbols: `boardGroupRef` (declaration + assignment) and the now-unused `boardGroup` param of `initJourney` (call site is now `initJourney(camera)` in `main.js`); the unused `composer` and `isSmallViewport` imports in `main.js`; the unused `showFallbackUI` import in `board.js`.
  - **checkJs opt-in**: `tsconfig.json` now sets `"allowJs": true` (`checkJs` stays `false` — opt-in per file). Added `// @ts-check` to `src/scroll/journey.js` and `src/ui/boot.js`, so `npx tsc --noEmit` now type-checks them instead of only the trivial `schema.ts`. Journey.js needed JSDoc for its index-signature tables (`COMPONENT_WORLD`, `FIXED_CAMERAS`, `ARRIVAL_TRACE`, `stopTs`, `PATH` → `Record`/tuple types), typed module-level bindings (curves, cameraRef, connectorLine, vignetteEl, arrivalGlide, activePanelId…), params on every exported function, a `filter(Boolean)` cast for the `sections` array, `String(intensity)`/`'0.35'` for the two `style.opacity` writes (CSSStyleDeclaration.opacity is a string property), and `lookCurve` added to the `setCameraAtT` null guard. Boot.js needed param types + `overlay` null guards. Behavior unchanged — the guards and values already existed at runtime.
  - **Verified**: `npx tsc --noEmit` exits 0; `npm run build` green; live journey re-checked (boot → hero panel → scroll switches to `panel-projects`); console clean.
- **2026-08 Session — Frame-clock hygiene in the 3D tick loop (threejs-animation applied)**:
  - `scene.js`: the tick-loop delta is now **clamped at the source** (`Math.min(timer.getDelta(), 0.05)` = `MAX_DELTA`). Before, a background-tab return or frame hitch handed consumers a multi-second delta that teleported delta-driven motion. `elapsed` stays unclamped (radar ring / LED flicker are sine oscillators — phase-skip is invisible).
  - `board.js`: `updateBoardParallax` lerp factors are now **delta-scaled** via `lerpFactor(k, delta) = 1 - Math.pow(1-k, delta*60)` — the same convention `hover.js` already uses. At 60fps the factor equals the old constant exactly (feel unchanged); at any other frame rate the per-second response is now identical instead of frame-rate-dependent. `main.js` passes `delta` through.
  - `particles.js`: dropped the now-redundant internal `Math.min(delta, 0.05)` — the source clamp owns the cap.
  - **Verified live**: skip-boot path healthy (overlay gone, nav clickable), tick loop runs clean, console only shows the known env shadow-map error. Build + tsc green; code review: no defects (applied its nits — comment accuracy + redundant clamp removal).
- **2026-08 Session — Boot→hero camera glide (hyperframes-animation applied)**:
  - Fixed the **boot→journey camera cut**: `scene.js` inits the camera at `(0, -2, 17)` and the boot animates only the board, so `initJourney`'s old `setCameraAtT(0)` SNAPPED to the hero stop `(0, -5.2, 13)` — a hard cut on every load, worst on the skip-boot path.
  - `journey.js` now calls `glideToHero()` instead: a GSAP timeline tweening `cameraRef.position` + `curLook` (both Vector3) to the hero config over `ARRIVAL_GLIDE_DURATION` (1.0s) with `power2.inOut` (repositioning ease per the camera rules), `onUpdate: cameraRef.lookAt(curLook)`, `onComplete` nulls the ref. Transform-space only (3D vectors — no layout properties).
  - **Interruptible**: `setCameraAtT` kills the glide via `killArrivalGlide()` on the first scroll scrub, so the tween and the scrub never fight; the glide endpoint equals `posCurve.getPoint(0)` (both derive from `FIXED_CAMERAS['sec-hero']`) → zero drift after settle.
  - Lite mode (skips `initJourney`) and `?og=1` (gets the glide — fine, captures wait anyway) unaffected.
  - **Verified live**: full boot → journey inits, hero panel active, overlay gone; scroll after boot kills the glide cleanly (projects panel + nav sync at 27%); console clean. Build + tsc green; code review: no defects (applied its nits — named duration const, `killArrivalGlide()` helper).
- **2026-08 Session — Signal-path scroll progress + keyboard nav (animejs discipline, GSAP-free)**:
  - `index.html`: HUD legend gained a signal-path readout — `.sig-path` track > `.sig-path-fill` + `.sig-path-pct` (percentage register).
  - `scroll.css`: `.sig-path`/`.sig-path-fill`/`.sig-path-pct` — fill uses `transform: scaleX(0)` with `transform-origin: left center` and a 0.08s linear transition (transform-only, no layout); ENIG-gold gradient + glow matches the fab-shop palette; `prefers-reduced-motion` gets `transition: none` for the fill.
  - `main.js`: `updateSigPath()`/`scheduleSigPath()` — the fill is a **pure function of scroll position** (`scrollY / (scrollHeight - innerHeight)`), deterministic, no wall-clock; passive `scroll` + `resize` listeners with rAF coalescing (one write per frame max); DOM refs cached after first lookup. `handleSectionKey()` — number keys 1–6 jump to sections via `navigateToSection`, ignoring modifier-held keys and form-field focus.
  - Applied the animejs skill's *principles* (deterministic, finite, single source of truth) without adding the dependency — the project is GSAP-based and the skill itself directs complex sequencing to GSAP.
  - **Verified live**: fill tracked a 50% scroll to `scaleX(0.5001)` / "50%" within 1%; key `3` → `#/projects`; guards confirmed (ctrl+5, letter `a`, focused input all ignored; `6` → `#/contact`); console clean. Build + tsc green; code review clean (cached the two DOM refs).
- **2026-08 Session — Deterministic boot sequence (hyperframes-animation applied)**:
  - `boot.js` rewritten as **one GSAP timeline with ALL-ABSOLUTE positions** (a `SCHEDULE` const in seconds — scanline 0.3, HUD 1.75, hero 2.35, subtitle 2.65, badges 2.8, canvas/board 3.45, traces 4.85, pins 5.05, LEDs 5.25, cores 5.55, status 5.85, overlay fade 6.25 → boot ends ~6.85s). No relative `+=` chaining.
  - **Typewriters are now timeline-driven proxy tweens** (`tl.to` on `{ n: 0 → text.length }` with `onUpdate` slicing `textContent`, `CPS = 33.3` chars/s) — deleted `typewriterEffect()` and `typeTerminalLine()` entirely. No `setTimeout` anywhere in the boot (the only remaining `setTimeout` in the repo is the debounced resize in `scene.js`).
  - **All flash tweens moved onto the timeline**: trace emissive flashes (staggered `SCHEDULE.traces + index*0.05`), CPU pin flashes (`+ idx*0.015`), LED blinks (`+ idx*0.1`) — previously created ad-hoc inside `tl.add` callbacks; status text updates via `tl.call(..., [], absPos)`.
  - **Terminal rebuild is synchronous**: the 3 `BOOT_LINES` divs are created + their typewriter tweens scheduled at boot time; the `#terminal-status-text` register is re-appended via `tl.call` after the last line (~4.2s) — all `updateTerminalText` calls (≥4.85s) happen after it's attached again.
  - **Silicon die pulse** stays a detached FINITE `gsap.to` (`repeat: 7`, `delay: SCHEDULE.cores`) so it can't stretch the timeline; settles at opacity 0.65. The `?og=1` / skip-boot instant paths are unchanged.
  - **Why**: the old boot mixed wall-clock `setTimeout` typewriters inside a frame-ticked GSAP timeline — under slow renderers the timeline and text desynced and boot completion (→ `initJourney`) became non-deterministic, the root cause of the headless OG-capture failures.
  - **Verified live**: full boot types all 3 lines + subtitle, re-appends the status register, ends with overlay `opacity 0`/`display none`, hero visible, HUD ready, underline 280px, journey inits after; `?og=1` and skip-boot paths still instant. Build + tsc green. Code review: no defects.
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
- **Card Redesign (daughterboard datasheets)**: Replaced the flat glass `.ds-panel` cards with physical-PCB daughterboards — FR-4 glass-weave background stack, four corner mounting holes (radial-gradient layers), a gold edge-connector pad strip via `border-image` (slice `0 0 12 0`, pinned in the border box so it never scrolls), and a seated double-shadow. Internal components upgraded: `.ds-ref` is now a via-node + fading copper trace, `.ds-title` gets a gold pad tick (contact panel overrides it), spec tables read as pin tables (gold left tick), skill pills are SMD components with silver end-caps, project cards are mini-PCBs (gold trace top border, corner screw hole, bottom pad strip, LED-glow shipped status), timeline nodes got copper-plated via centers with hover glow, and body copy switched from mono to Instrument Sans (`--font-body`) for readability. Reduced-motion block extended. Verified live across hero/about/projects/skills/experience; build + tsc green; reviewer-clean.
- **Full-board framing + fab-bench backdrop**: The hero/contact cameras clipped the board's bottom edge at FOV 45° (z=13/14 → the board rendered "only half" on short desktop viewports). Pulled both stops to z=23 (hero `(0,-5.4,23)` look `(0,0.2,0)`) so the 15-unit board fits with ~2-unit margins, and softened the arrival vignette ceiling 0.85 → 0.6. Added `createBackdropTexture()` in scene.js — a 1024² CanvasTexture (FR-4 gradient, soldermask-green + ENIG-gold + signal glows, 64px fabrication grid with plated gold vias, light baked vignette) set as `scene.background`, plus a matching CSS fallback layer behind `#canvas-container`. The view is never an empty void around the board.
- **Board grounding (shadow catcher)**: Added a transparent bench plane (`ShadowMaterial` opacity 0.38, PlaneGeometry 36×36 at y=-8.6, receiveShadow) below the board so the already-enabled shadows (board + components all cast) land on a visible band behind/below the board — it reads as seated in the fab-bench backdrop instead of hovering. Enlarged `dirLight1`'s shadow frustum (ortho ±10 + `updateProjectionMatrix`, far 25→35, bias -0.0005→-0.001) since the default ±5 box clipped the cast shadow to a hard stripe; kept 1024² map so the per-frame shadow fill matches the original budget (the FPS guardrail scales bloom only, not shadows).
- **Board-first hero composition**: Split the shared hero/contact centering rule in `scroll.css` — contact stays center-anchored (full-board closer), while `#panel-hero` is now right-anchored (`right: 24px`, `translateY(-50%)` centered) like the component sections, so the fully-framed board's chips and traces show around the datasheet at the establishing shot instead of hiding behind it. Below 900px (and on phones ≤640) the hero recenters since a 620px panel would fully cover the board there. Verified: hero right-anchored + vertical-centered, journey scroll/panel positioning unaffected, build + tsc green, reviewer-clean after closing the 641-820px dead-zone.
- **Claude Blueprint Update**: Updated `claude.md` with complete architecture specification, raycasting interaction blueprint, single LinkedIn CTA constraints, and testing protocols.
- **2026-08 Session — Pointer inertia & journey-mode hardening**:
  - `hover.js`: bounded pointer clamping (NDC ±1) + 500ms smooth mouse inertia (`targetMouse` vs `mouse` lerp `* 0.08`); raycasts now use instant `targetMouse` while parallax uses smoothed `mouse`; legacy click-zoom + camera LERP disabled in `full-journey` mode.
  - `journey.js`: rewrote screen-space panel positioning (side-anchoring with viewport clamping) and **fixed wide-panel overflow** via `panel.offsetWidth`; added `body.in-hero-section` toggle; made `buildCurves()` idempotent.
  - `boot.js`: `hud-ready` applied once inside boot step 3 (duplicate add removed from `main.js`); hero panel reveal uses `clearProps`; silicon die pulse now finite (8 pulses → settle 0.65).
  - `scroll.css`: `#hud-bar.hud-ready { pointer-events: auto !important; }` (HUD was unclickable in full-journey mode); hidden HUD LinkedIn CTA (hero/contact) also gets `visibility: hidden` (tab-order fix).
  - **Verified live in browser (full-journey)**: boot → HUD interactive → nav clicks navigate each section → panels activate anchored on-screen → hero panel hidden at all other sections → HUD CTA hidden only at hero/contact. `npm run build` + `npx tsc --noEmit` pass; console clean.
- **2026-08 Session — "Fab-shop" redesign + journey bugfix (committed as `8726fef` + `05199ad`, follow-ups done)**:
  - Applied the fab-shop design (matte soldermask palette, warm silkscreen, ENIG gold accents, signal green reserved for "live") across HTML/CSS/Three.js — see the 🚦 NEXT SESSION block at the top of this file for the full change list.
  - **Fixed a Chromium `visibility`-transition deadlock** in `scroll.css` `.ds-panel` (panels froze at opacity 0 with transitions stuck at `currentTime 0` after nav clicks): visibility now flips instantly on activate and waits out the fade on deactivate (`visibility 0s` / `visibility 0s linear 0.6s`). **Applied but not yet re-verified live.**
  - Made the single-LinkedIn-CTA rule data-driven (`body.hud-cta-hidden` when the active panel has its own CTA) — About no longer shows a duplicate.
  - **All follow-ups done**: visibility fix verified live, `.freebuff/` gitignored, committed (`8726fef`/`05199ad`) + pushed to `origin master`.
- **2026-08 Session — 3D framing + animation pass (pushed as `05199ad` + follow-ups)**:
  - **Camera framing fix** (`journey.js`): component stops were viewed horizontally at component height (`CAMERA_OFFSET (0,0,1.915)`) — chips read as edge-on slivers. Now elevated 3/4 angle: `CAMERA_OFFSET (0, 2.6, 4.2)`, `LOOK_AT_OFFSET (0, 0.15, 0)` (~31° elevation). Via points retuned to the same z depth (~4.2) for consistent travel speed instead of per-leg zoom pulsing.
  - **Panel transition timing** (`scroll.css`): container 0.6s→0.5s; `.ds-ref`/`.ds-body` 0.6s→0.45s, `.ds-title` 0.7s→0.5s; delays 0.2/0.3/0.4s→0.1/0.15/0.25s; replaced `transition: all` with enumerated opacity/transform.
  - **Verified live**: U1 projects near screen center with panel anchored + connector attached; projects panel fully on-screen; console clean.
- **2026-08 Session — Component quality + animation polish (animejs / hyperframes-animation / improve-animations applied)**:
  - **Component quality**: 4 plated-through mounting holes with gold rings (board.js, aligned with silkscreen markers); gold lead-frame outlines on U1/U2 + silver seam on Y1 (components.js); hemisphere light for material depth (scene.js); silkscreen adds: mounting-hole rings, pin-1 dot, `Pb-FREE / NO-CLEAN` + `IPC-A-610 CLASS 2` fab markings.
  - **Animation quality**: power-on pulse on arrival (journey.js `pulseArrival` — U1 radar+die flash; U2/C1/J1 trace emissive flash, reusing boot's trace-flash language); connector line dashes march toward the panel (`signal-flow` keyframe, scroll.css); all remaining `transition: all` enumerated (style.css).
  - **Verified**: build + tsc pass; console clean; tick loop live (vignette 0.4→0.85 on proximity, connector attached, pulse fired without errors).
