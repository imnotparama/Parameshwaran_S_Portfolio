# 007 — Make the 1–6 keyboard nav discoverable (HUD key hint)

- **Status**: DONE (executed 2026-08)
- **Commit**: `eaff1f2`
- **Severity**: MEDIUM
- **Category**: Missed opportunities / Purpose & frequency
- **Estimated scope**: 2 files (`index.html`, `scroll.css`), ~15 lines

## Problem

`main.js` ships a keyboard section navigator — `handleSectionKey` (main.js:98) maps keys **1–6** to sections — but **nothing in the UI tells the user it exists**. There is no hint anywhere in the HUD, the boot terminal, or the panels. A shipped feature with zero discoverability is dead weight; for a portfolio whose personality is "instrument panel," the absence of the key legend is a missed opportunity the first audit flagged and never shipped.

Evidence (refreshed 2026-08):
- `main.js:70, 105-112` — `SECTION_KEYS` + `handleSectionKey` parses `e.key`, `e.preventDefault()`, calls `navigateToSection`.
- `main.js:337` — `window.addEventListener('keydown', handleSectionKey)`.
- The HUD legend (index.html:153-169) already holds the power LED, sig-path, REV mark, the live scope readout, and the one-time probe hint (`hud-probe-hint`, styled at scroll.css:305-325) — the natural home for a permanent key hint.

## Target

A small, quiet key hint in the HUD legend, following the existing hint chrome (monospace, letter-spaced, muted) but **non-animated** (it's a permanent affordance, not a discovery moment):

```html
<!-- index.html — inside .hud-legend, after the probe hint (line ~169) -->
<span class="hud-keyhint" aria-hidden="true">KEYS&nbsp;1–6&nbsp;·&nbsp;JUMP</span>
```

```css
/* scroll.css — near the .hud-probe-hint rules (~line 305) */
.hud-keyhint {
    font-size: 10px;
    letter-spacing: 1.5px;
    color: rgba(157, 180, 163, 0.55);
}
```

Wiring: the HUD legend fades in as a whole via `#hud-bar.hud-ready` (scroll.css:81); the keyhint needs no state of its own — it rides that existing cascade.

- **Lite mode**: the key nav is a full-journey feature (`handleSectionKey` still binds but `navigateToSection` → `scrollToSection` is journey-scoped; lite mode has no journey). Hide the hint in lite mode: `body.lite-mode .hud-keyhint { display: none; }`.
- **Small viewports**: the HUD legend already hides `hud-probe-hint` under `@media (max-width: 900px)` (scroll.css:336-341) — add the keyhint to that same hide rule.
- **Reduced motion**: it's static text — no motion to gate. No `prefers-reduced-motion` change needed.

## Repo conventions to follow

- Hint chrome exemplar: `.hud-probe-hint` (scroll.css:305-325) — same size/letter-spacing family, muted silkscreen color (`rgba(157, 180, 163, …)` is the `--silkscreen-muted` family used throughout).
- `aria-hidden="true"` on decorative HUD chrome matches `.hud-legend`'s existing pattern (index.html:153 has `aria-hidden="true"` on the legend itself) — the nav buttons already carry proper `aria-label`s, so the hint is decorative redundancy.

## Steps

1. In `index.html`, inside `<div class="hud-legend" aria-hidden="true">` (line 153), add the `<span class="hud-keyhint" aria-hidden="true">KEYS&nbsp;1–6&nbsp;·&nbsp;JUMP</span>` after the `hud-probe-hint` span (line 166). Use `&nbsp;` and `–` exactly as shown so it renders as `KEYS 1–6 · JUMP` on one line.
2. In `scroll.css`, add the `.hud-keyhint` rule near the probe-hint block (~line 273).
3. Add `body.lite-mode .hud-keyhint { display: none; }` near the other lite-mode rules (scroll.css:1338).
4. In the `@media (max-width: 900px)` block that hides `.hud-probe-hint` (scroll.css:351-353), add `.hud-keyhint` to the same rule.

## Boundaries

- Do NOT touch `main.js` or `handleSectionKey` — this is discoverability only.
- Do NOT add a pulse/keyframe animation (the probe hint pulses; the permanent key hint must stay static).
- Do NOT add dependencies or change the nav buttons' markup.

## Verification

- **Mechanical**: `npm run typecheck` (clean) and `npm run build` (success).
- **Feel check**: in the running site, after boot:
  - The HUD legend shows `KEYS 1–6 · JUMP` in muted mono, no animation, fading in with the rest of the HUD.
  - Pressing **3** jumps to Skills; the hint does not change or flash.
  - Resize under 900px: the hint hides with the probe hint. Toggle lite mode: hint absent.
  - Keyboard-only: Tab through the nav — the hint never intercepts focus (aria-hidden, no tabindex).
- **Done when**: the keyhint renders in the HUD legend, hides on small viewports and lite mode, and keys 1–6 visibly jump sections. ✅ executed: `KEYS 1–6 · JUMP` span in `.hud-legend` (after `#hud-probe-hint`); base rule `10px / 1.5px / rgba(157,180,163,0.55)`; added to the `max-width: 900px` hide alongside `.hud-probe-hint`; `body.lite-mode .hud-keyhint { display: none }`. Verified computed styles exact; the `display:none` seen at probe time is the <900px hide (webview is 844px) — base rule has no display, so it shows above 900px. (See execution log.)
