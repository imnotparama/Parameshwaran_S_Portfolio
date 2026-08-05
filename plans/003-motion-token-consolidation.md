# 003 — Motion token consolidation (hand-typed curves + duplicated `.nav-btn` blocks)

- **Commit stamped**: `cd8b451`
- **Severity**: MEDIUM — cohesion (token system exists but is bypassed in the base stylesheet)
- **Category**: Cohesion & tokens
- **Location**: `style.css` (vignette transition, two `.nav-btn` blocks, CTA/skip-link durations); `scroll.css` (panel/typography transitions)

## Problem

The repo defines motion tokens in `style.css:44-49`:

```css
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
--duration-fast: 0.18s;
--duration-base: 0.3s;
--duration-slow: 0.6s;
```

But the hand-typed curve `cubic-bezier(0.22, 1, 0.36, 1)` — exactly `--ease-out` — is duplicated verbatim in **six** places, and `style.css` carries **two near-identical `.nav-btn` blocks** ("Enhanced Nav Buttons" ~lines 332–381 and "Minimalist Navbar styles" ~lines 478–498) both using bare `0.25s ease` (a slower, softer curve than the token's `--ease-out`). Both blocks apply to the same elements (HUD nav buttons + fallback links), so the second block is pure dead weight that makes future edits ambiguous.

Duplicated curves:

| Location | Rule | Current |
| --- | --- | --- |
| `style.css:111` | `.vignette-overlay` | `transition: opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1);` |
| `scroll.css:363` | `body.full-journey .ds-panel` | `transition: opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), visibility 0s linear 0.5s;` |
| `scroll.css:374` | `body.full-journey .ds-panel.panel-active` | `transition: opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), visibility 0s;` |
| `scroll.css:404` | `.ds-ref` | `transition: opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);` |
| `scroll.css:422` | `.ds-title` | `transition: opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);` |
| `scroll.css:438` | `.ds-body` | `transition: opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);` |

## Fix

Swap every hand-typed `cubic-bezier(0.22, 1, 0.36, 1)` for `var(--ease-out)` — **keeping each rule's existing duration verbatim** (0.45s/0.5s are deliberate stagger pacing; only the curve is duplicated). Delete the "Minimalist Navbar styles" `.nav-btn` block (its `border-radius: 2px` equals `var(--radius-sm)`; everything else is a strict subset of "Enhanced"). Tokenize the surviving `.nav-btn` and CTA durations.

### Exact steps (ordered)

1. **`scroll.css`** — six replacements, each: `cubic-bezier(0.22, 1, 0.36, 1)` → `var(--ease-out)`. Exact result for the panel (line 363):

```css
transition: opacity 0.5s var(--ease-out), transform 0.5s var(--ease-out), visibility 0s linear 0.5s;
```

(and identically for lines 374, 404, 422, 438, and `style.css:111`.)

2. **`style.css`** — delete the entire "Minimalist Navbar styles" `.nav-btn { ... }` block (the second one, ~lines 478–498, the block ending before the `/* ======= WebGL Fallback Styles ======= */` comment). The "Enhanced Nav Buttons" block above it already covers every property, and `scroll.css` `.hud-nav .nav-btn` (loaded after) wins the HUD cascade regardless.

3. **`style.css`** — in the surviving "Enhanced Nav Buttons" `.nav-btn` block, change:

```css
transition: color 0.25s ease, background-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
```

to:

```css
transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out);
```

4. **`style.css`** — CTA block (`~line 393`): same replacement, `0.25s ease` → `var(--duration-fast) var(--ease-out)`.

5. **`style.css`** — `.skip-link` (`~line 464`): `transition: transform 0.3s ease;` → `transition: transform var(--duration-base) var(--ease-out);`.

6. **`scroll.css`** — `.proj-ds` (`~line 541`) and `.pwr-led` (`~line 165`) are already close; leave `.proj-ds`'s `0.3s ease` as-is **unless** step 5's pattern is approved — the project grid hover lift is a deliberate "board sample" feel. If in doubt, do not touch it (documented in scope boundaries).

### Hard scope boundaries

- **Preserve durations exactly.** This is a curve/token swap, not a retiming. Only `0.25s ease` and `0.3s ease` bare-ease cases become token durations (fast/base) — those change the curve, not the millisecond value (0.25s→0.18s is a deliberate snappiness correction for hover; flag it in the PR).
- **Do not** touch the `@keyframes blink` / `flicker` / `hint-pulse` / `signal-flow` animation timings — CSS keyframes are excluded from the transition tokens.
- **Do not** touch `boot.js` GSAP eases (`power2.out`, `power1.inOut`, `back.out(1.7)`) — GSAP and CSS token systems are separate layers; mapping them is out of scope.
- **Do not** delete the "Enhanced Nav Buttons" block — the fallback screen (`src/ui/fallback.js:37-38`) and HUD wiring (`main.js:206`) depend on `.nav-btn` existing.

## Verification

```bash
npm run build          # must exit 0
npx tsc --noEmit       # must pass
grep -rn "cubic-bezier(0.22, 1, 0.36, 1)" style.css scroll.css   # must return nothing
grep -c "\.nav-btn" style.css                                    # exactly one rule block remains
```

**Feel-check (live preview):**
1. Hover HUD nav buttons and the gold CTA — response should feel snappier than before (0.18s `--ease-out`), not sluggish.
2. Scroll between sections — panel fade/slide timing must be **identical** to before (same durations, same curve value).
3. Open the WebGL fallback — fallback links still styled and hoverable.
4. Compare pre/post on the same machine: the only perceptible difference should be hover speed on buttons/CTAs.
