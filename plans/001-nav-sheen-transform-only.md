# 001 — Remove the nav-button sheen sweep (layout-animating, template tell)

- **Commit stamped**: `cd8b451`
- **Severity**: HIGH — perf (layout property animated on a high-frequency control)
- **Category**: Performance
- **Location**: `style.css` — "Enhanced Nav Buttons" block, `.nav-btn::after` / `.nav-btn:hover::after`

## Problem

`style.css` animates a shine-sweep across nav buttons by moving `left` — a **layout property**:

```css
/* style.css, Enhanced Nav Buttons block (~lines 332–381) */
.nav-btn {
    /* ... */
    transition: color 0.25s ease, background-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
    letter-spacing: 1px;
    font-weight: 500;
    position: relative;
    overflow: hidden;
}

.nav-btn::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
        90deg,
        transparent,
        rgba(0, 255, 136, 0.2),
        transparent
    );
    transition: left 0.5s;
}

.nav-btn:hover::after {
    left: 100%;
}
```

Why this is wrong on three counts:

1. **Layout animation on a hot control.** Every frame of the sweep re-resolves layout (`left` is a geometric property). Nav hover is one of the most frequent interactions on the page.
2. **0.5s is slow for a hover effect.** The page's own hover tokens are `--duration-fast: 0.18s` / `--duration-base: 0.3s`. A 0.5s sweep makes hover feel laggy.
3. **It leaks onto the HUD's active gold pad.** `scroll.css:127` `.hud-nav .nav-btn.nav-active::after` (the ENIG-gold underline pad) inherits `transition: left 0.5s` from this rule — so the gold pad **slides** on every section change instead of appearing crisply.
4. **It is the exact motif the codebase already disavowed.** The CTA in `scroll.css` carries the comment: `(No rotating shine sweep: that was the template tell.)` (scroll.css, gold-pad CTA block). The sheen is the AI-template tell this portfolio deliberately removed elsewhere.

## Fix

Delete the sheen. Do **not** convert it to `transform: translateX` — the sweep itself is the template tell and provides no information; the HUD already communicates active state via the gold pad.

### Exact steps (ordered)

1. In `style.css`, delete the two rules in full:
   - `.nav-btn::after { ... }` (the block shown above)
   - `.nav-btn:hover::after { left: 100%; }`
2. In the same `.nav-btn` block, remove `overflow: hidden;` — it existed only to clip the sweeping sheen. The gold pad (`scroll.css` `.nav-active::after`, width 16px, fully inside the button) does not need clipping.
3. Leave everything else in `.nav-btn` untouched — color/background/box-shadow/transform hover feedback stays (it is transform/color only; the sheen was the only layout offender). The `0.25s ease` durations are tokenized by plan `003-motion-token-consolidation.md`; do not tokenize here to keep this diff atomic.

### Hard scope boundaries

- **Do not** touch `scroll.css` `.hud-nav .nav-btn` rules or the `.nav-active::after` gold pad — that is the correct, on-theme active indicator.
- **Do not** delete the `.nav-btn` blocks themselves: `src/ui/fallback.js:37-38` styles its two fallback links (`[ CHECK WEBGL SUPPORT ]`, `[ VISIT GITHUB ]`) with `.nav-btn`, and `main.js:206` queries `.nav-btn` for HUD wiring. Deleting the base rule would unstyle the fallback screen.
- **Do not** touch the `.cta-linkedin::before` / `.cta-contact::before` rotate sweep in `style.css` — it is transform-only (no layout cost) and is noted separately in the audit's missed opportunities.

## Verification

```bash
npm run build          # must exit 0
npx tsc --noEmit       # must pass (note: tsc only checks src/schema.ts; rely on build + feel-check)
grep -n "transition: left\|nav-btn::after" style.css   # must return nothing
```

**Feel-check (do this in the live preview):**
1. Hover each HUD nav button — the button should change color instantly (≤0.2s), with **no** light sweeping across it.
2. Navigate sections — the gold `nav-active` pad must appear under the active button without sliding.
3. Open the WebGL fallback (disable WebGL in devtools) — the two fallback links must still render with their green button styling.
4. On a touch device or touch-emulation: tap a nav button — no stuck sheen (there is no sheen anymore).
