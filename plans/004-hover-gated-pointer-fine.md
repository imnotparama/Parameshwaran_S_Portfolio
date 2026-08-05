# 004 — Gate hover transform-lifts behind `(hover: hover) and (pointer: fine)`

- **Commit stamped**: `cd8b451`
- **Severity**: MEDIUM — accessibility (sticky hover states on touch)
- **Category**: Accessibility
- **Location**: `scroll.css` (`.hud-nav .nav-btn:hover` ~116, `.cta-linkedin:hover` ~236, `.proj-ds:hover` ~541); `style.css` (`.nav-btn:hover` ~346, `.cta-linkedin:hover, .cta-contact:hover` ~408)

## Problem

Several rules lift elements with `transform: translateY(-1px / -2px)` on `:hover` — but `:hover` fires on touch right before the tap commits, and without a `(hover: hover)` gate the lifted state can stick on touch devices until the next tap. Affected rules (verified at line level):

| Location | Rule | Lift |
| --- | --- | --- |
| `scroll.css:116` | `.hud-nav .nav-btn:hover` | `translateY(-1px)` |
| `scroll.css:236` | `.cta-linkedin:hover, .cta-linkedin:focus-visible` | `translateY(-1px)` |
| `scroll.css:541` | `.proj-ds:hover` (+ `.is-building:hover` ~547) | `translateY(-2px)` |
| `style.css:346` | `.nav-btn:hover` (legacy — also leaks green box-shadow to HUD hover) | `translateY(-1px)` |
| `style.css:408` | `.cta-linkedin:hover, .cta-contact:hover` | `translateY(-2px)` |

Only the **transform lift** needs gating. Color / border / box-shadow hover feedback is harmless on touch and should keep working — it is the only "hovered" cue a tap can't fake, and removing it would make active states feel dead.

## Fix

For each rule, split the transform-lift into a `@media (hover: hover) and (pointer: fine)` wrapper, keeping the non-transform feedback on the ungated rule. `:focus-visible` states must **stay ungated** — keyboard users on touch laptops still need them.

### Exact steps (ordered)

1. **`scroll.css:116`** — split `.hud-nav .nav-btn:hover`:

```css
.hud-nav .nav-btn:hover {
    color: var(--silkscreen);
    background-color: rgba(236, 231, 216, 0.06);
}
@media (hover: hover) and (pointer: fine) {
    .hud-nav .nav-btn:hover {
        transform: translateY(-1px);
    }
}
```

2. **`scroll.css:236`** — split `.cta-linkedin:hover, .cta-linkedin:focus-visible`: keep the `:focus-visible` half fully ungated; move only `:hover`'s `transform: translateY(-1px)` into the media query. (Box-shadow/background changes stay on the ungated `:hover`.)

3. **`scroll.css:541`** — `.proj-ds:hover` and `.proj-ds.is-building:hover`: move `transform: translateY(-2px)` into the media query; keep box-shadow/border-color ungated.

4. **`style.css:346`** — `.nav-btn:hover`: move `transform: translateY(-1px)` into the media query. (Note for the executor: the green `box-shadow: 0 0 10px rgba(0, 255, 136, 0.3)` on this rule also leaks onto HUD nav hovers — fix it here by removing the box-shadow line, since `scroll.css` intentionally uses a subtler silkscreen hover for the HUD. Verify with the feel-check below.)

5. **`style.css:408`** — `.cta-linkedin:hover, .cta-contact:hover`: move `transform: translateY(-2px)` into the media query; keep `box-shadow`/`background` ungated.

### Hard scope boundaries

- **Do not** gate `:active` states — the press dip (`translateY(0)`) must fire on touch; it is the tactile feedback for the tap itself.
- **Do not** gate `:focus-visible` rules anywhere — keyboard navigation visibility is unconditional.
- **Do not** gate color/background/border hover feedback — only `transform` declarations move into the media query.
- **Do not** touch the reduced-motion blocks (`scroll.css:779-800`, `style.css:549-566`) — they operate on the same rules via `!important` and are orthogonal.

## Verification

```bash
npm run build          # must exit 0
npx tsc --noEmit       # must pass
grep -n "translateY(-1px)\|translateY(-2px)" scroll.css style.css   # every match must sit inside a
                                                                    # @media (hover: hover) and (pointer: fine) block
```

**Feel-check (live preview):**
1. Desktop mouse: hover nav/CTA/project cards — lift + color feedback both work, unchanged feel.
2. Devtools → device toolbar → touch emulation: tap a nav button then **stop touching** — the button must not remain lifted; only its color/bg feedback may persist until the next tap.
3. Keyboard: Tab to a CTA and press Enter — `:focus-visible` outline + any focus styles still appear (nothing gated away).
4. Narrow viewport (< 640px) on a real touch phone if available — project cards tap cleanly with no sticky lift.
