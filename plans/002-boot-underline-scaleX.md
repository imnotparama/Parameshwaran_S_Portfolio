# 002 — Boot hero underline: animate `scaleX` instead of `width`

- **Commit stamped**: `cd8b451`
- **Severity**: MEDIUM — perf (layout property tween at the site's opening moment)
- **Category**: Performance
- **Location**: `style.css` `.header-underline`; `src/ui/boot.js` (full-boot tween at ~line 215, skip/og/lite instant paths at ~line 97)

## Problem

The gold underline under the hero name grows by animating **`width`** — a layout property — during the boot sequence, at the exact moment the page is busiest (scanline, typewriters, board float-up all running):

```css
/* style.css, hero panel typography block (~lines 48–54) */
.header-underline {
    width: 0%;
    height: 2px;
    background-color: var(--enig-gold);
    margin: -4px auto 14px;
}
```

```js
// src/ui/boot.js — full-boot path (~line 215)
const underline = document.querySelector('.header-underline');
if (underline) {
    tl.to(underline, {
        width: '280px',
        duration: 1.0,
        ease: 'power2.out'
    }, SCHEDULE.board);
}

// src/ui/boot.js — instant paths (skip / ?og=1 / lite mode, ~line 97)
const underline = document.querySelector('.header-underline');
if (underline) gsap.set(underline, { width: '280px' });
```

Animating `width` forces a reflow every frame of the 1.0s draw. GSAP's own transform-alias rule (already used elsewhere in `boot.js` — see the scanline comment at ~line 130) says: tween transforms, never geometric properties.

## Fix

Pin the final layout in CSS and animate the compositor-only `transform: scaleX`. The underline grows from center (both directions), matching the visual of the current `width: 0% → 280px` (auto margins center a growing element).

### Exact steps (ordered)

1. **`style.css`** — replace the `.header-underline` block with:

```css
.header-underline {
    width: 280px;                 /* final width pinned — no layout tween */
    height: 2px;
    background-color: var(--enig-gold);
    margin: -4px auto 14px;       /* auto margins keep it centered */
    transform: scaleX(0);         /* hidden start state */
    transform-origin: center;
}
```

2. **`src/ui/boot.js`** — full-boot path (~line 215): change the tween target from `width` to `scaleX`:

```js
tl.to(underline, {
    scaleX: 1,
    duration: 1.0,
    ease: 'power2.out'
}, SCHEDULE.board);
```

3. **`src/ui/boot.js`** — instant paths (~line 97): change the set so the underline ends fully drawn:

```js
if (underline) gsap.set(underline, { scaleX: 1 });
```

4. Check `index.html:102` — no inline style on `<div class="header-underline">` (it is a bare div; leave it bare so CSS owns the start state).

### Hard scope boundaries

- **Do not** touch the subtitle typewriter, `h1#user-name`, or any other hero element — only `.header-underline`.
- **Do not** touch the `SCHEDULE.board` timing (1.0s draw at 3.45s) — the choreography is deliberately deterministic.
- **Do not** add `will-change: transform` — the element is animated once per load; the hint would pin a compositor layer for the whole page lifetime.

## Verification

```bash
npm run build          # must exit 0
npx tsc --noEmit       # must pass
grep -n "width: '280px'\|width: \"280px\"" src/ui/boot.js   # must return nothing
grep -n "header-underline" style.css                        # must show width: 280px + scaleX(0)
```

**Feel-check (live preview, devtools → Rendering → "Paint flashing"):**
1. Full boot (clear `sessionStorage` first): the underline must grow from the center over ~1.0s starting at the `SCHEDULE.board` beat — **no green paint-flash rectangles** along the underline during the draw.
2. Skip-boot path (reload same tab): underline fully drawn, no animation, correct length.
3. `?og=1` path: underline present in the instant state.
4. Slow-motion (devtools CPU throttle 4×): underline draw stays smooth and completes within the boot timeline; boot completion (`onComplete` → journey init) timing unchanged.
