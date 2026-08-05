# Animation Audit — PCB Portfolio

- **Commit stamped**: `cd8b451`
- **Date**: 2026-08
- **Stack**: Vite + vanilla JS; GSAP 3 (timeline boot, ScrollTrigger journey, hover tweens); pure CSS transitions/keyframes. No animation library for CSS-layer motion.
- **Motion tokens (repo convention)**: `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`, `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`, `--duration-fast: 0.18s`, `--duration-base: 0.3s`, `--duration-slow: 0.6s` in `style.css:44-49`.
- **Personality**: "fab-shop" — matte soldermask, silkscreen, ENIG gold; signal green reserved for LIVE elements. Crisp, deliberate, hardware-vernacular. Bouncy/springy would be off-brand.
- **Frequency map**: nav buttons + CTAs (tens/day) → hover must be fast and cheap; panels (occasional) → 200-500ms OK; boot (rare/first-time) → can carry the delight budget.

## Findings (vetted, ordered by leverage)

| # | Severity | Category | Location | Finding | Fix summary |
| --- | --- | --- | --- | --- | --- |
| 1 | HIGH | Perf | `style.css:359-377` | `.nav-btn::after` sheen animates `left: -100% → 100%` (`transition: left 0.5s`) — a **layout property** animated on a high-frequency control (nav hover), plus 0.5s is slow for hover. | Convert to `transform: translateX` (transform-only); 0.5s → `var(--duration-base) var(--ease-out)`. Note: deleting the sheen entirely matches the established fab-shop direction (the CTA shine sweep was removed as "the template tell"). |
| 2 | MEDIUM | Perf | `src/ui/boot.js:218` + `:98`, `style.css:51-54` | Boot hero underline animates `width: 0% → 280px` — a **layout property** tween at the site's opening moment. | `.header-underline { width: 280px; transform: scaleX(0); transform-origin: center; }`; boot tweens `scaleX: 1` instead of width. Layout is stable, only transform animates. |
| 3 | MEDIUM | Cohesion | `style.css:111`, `scroll.css:363,374,404,422,438` | `cubic-bezier(0.22, 1, 0.36, 1)` hand-typed 5+ times — it equals the `--ease-out` token exactly (style.css:44). Also two near-duplicate `.nav-btn` blocks (style.css "Enhanced" ~332 vs "Minimalist" ~479) both use `0.25s ease`, overridden for HUD by `scroll.css:110`'s tokenized rule. | Replace hand-typed curves with `var(--ease-out)` / `var(--ease-in-out)`; consolidate the duplicated `.nav-btn` rules; duration `0.25s ease` → tokens. |
| 4 | MEDIUM | A11y | `scroll.css:116,236,541`; `style.css:346,408` | Hover transforms (`translateY(-1px/-2px)`) are not gated by `(hover: hover) and (pointer: fine)` — touch taps leave sticky hover states. | Wrap transform-bearing hover rules in `@media (hover: hover) and (pointer: fine)`. |
| 5 | LOW | A11y | `style.css:549-566` | Reduced-motion uses a blanket `animation-duration: 0.01ms !important` on `*` — aggressive but defensible for a scroll-jacked portfolio; **settled decision** (documented "confirm reduced-motion fallback"). Noted, not a plan. | — |
| 6 | LOW | Physicality | `scroll.css:116` `.nav-btn:active` | Press feedback exists (`translateY(0)` dip) but no scale press; acceptable subtlety for a terminal HUD. **Not a plan** (by-design crispness). | — |

## Missed opportunities (additive, not corrective)

- **Keyboard nav has no affordance**: `main.js` `handleSectionKey` (1–6) ships with zero discoverability — nothing tells the user keys exist. A subtle key-hint (e.g. `[1]`-style mini-labels in the HUD or a one-time boot-terminal line "KEYS 1–6: JUMP SECTION") would complete the feature.
- **`.nav-active` gold underline pops in instantly** (`scroll.css:127-135`): a 30-80ms `scaleX`/opacity transition on activation would polish the HUD's section-change feedback — cheap, tiny, high-visibility.
- **PWR LED lights instantly** on `hud-ready`: a 0.3s glow-in (opacity/box-shadow) would read as the board "powering on" — rare moment, allowed delight budget.

## Plans written (default top 4 by leverage)

| Plan | Severity | Category | Status |
| --- | --- | --- | --- |
| `plans/001-nav-sheen-transform-only.md` | HIGH | perf | READY — not started |
| `plans/002-boot-underline-scaleX.md` | MEDIUM | perf | READY — not started |
| `plans/003-motion-token-consolidation.md` | MEDIUM | cohesion | READY — not started |
| `plans/004-hover-gated-pointer-fine.md` | MEDIUM | a11y | READY — not started |

## Recommended execution order & dependencies

1. **002** (independent — smallest diff, pure perf win at the opening moment).
2. **001** (independent — removes the layout-animating sheen + gold-pad slide).
3. **004** (independent — touch sticky-hover fix; edits the same `.nav-btn`/CTA hover rules 001 touches, so run after 001 to keep excerpts clean).
4. **003 last** — depends on **001** and **004**: it consolidates the surviving `.nav-btn` block and the duplicated-curve transitions, and its excerpts assume the sheen is gone and hover rules are already split.

Rough cost: 001 (~10 min), 002 (~10 min), 004 (~20 min), 003 (~20 min). All are additive-free (no new dependencies), CSS/JS-local, and each verifies with `npm run build` + a live feel-check.

Each plan stamps commit `cd8b451`. After execution, run `improve-animations reconcile` to mark DONE and retire findings.
