# 006 — Animate the nav-active ref glyph (no more instant snap)

- **Status**: DONE (executed 2026-08, shipped in commit `239fb1c`)
- **Commit**: `eaff1f2`
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens / Purpose
- **Estimated scope**: 1 file (`scroll.css`), ~6 lines

## Problem

The HUD nav buttons show a tiny gold silkscreen reference glyph (`.nav-ref`: `U1`, `U2`, `C1–C4`, `J1`, `ANT1`) that **flips opacity 0.8 → 1 instantly** when a section becomes active. The button's other properties (`color`, `background-color`) transition on the house token, but the ref glyph's opacity change snaps, and `opacity` is not in the button's transition list. On every section change — the most frequent state change in the UI — the HUD's active marker teleports.

Current rules:

```css
/* scroll.css:141-152 — as executed (transition landed at :152) */
.nav-ref {
    font-size: 9px;
    letter-spacing: 0.5px;
    color: var(--enig-gold);
    opacity: 0.8;
    margin-right: 6px;
    font-weight: 500;
    /* Plan 006: the ref glyph must not snap on section change — the active
       state flips opacity 0.8→1, and it wasn't in any transition list. Same
       fast curve as the button's own color transition, so the section change
       reads as one beat (button label + ref + panel cascade). */
    transition: opacity var(--duration-fast) var(--ease-out);
}
```

The ref glyph is also missing a transition of its own entirely (no `transition` property on `.nav-ref` — the block was at `scroll.css:122-127`, now `141-147`).

## Target

The ref glyph transitions its opacity on the fast token when the active state lands:

```css
/* target — scroll.css, replace the .nav-ref block */
.nav-ref {
    font-size: 9px;
    letter-spacing: 0.5px;
    color: var(--enig-gold);
    opacity: 0.8;
    margin-right: 6px;
    font-weight: 500;
    transition: opacity var(--duration-fast) var(--ease-out);
}
```

The hover/active rule above it stays exactly as-is — it now animates instead of snapping.

- `var(--duration-fast)` = `0.18s`, `var(--ease-out)` = `cubic-bezier(0.22, 1, 0.36, 1)` — the repo's tokens (defined `style.css:44,50`), matching the button's own transition at `scroll.css:116`.

## Repo conventions to follow

- The HUD button already uses `transition: color var(--duration-fast) var(--ease-out), background-color var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out);` (`.hud-nav .nav-btn` at `scroll.css:122`) — mirror that token pairing.
- Reduced motion: `scroll.css` has a `@media (prefers-reduced-motion: reduce)` block that already kills transitions on `.proj-ds`, `.skill-pill`, `.cta-linkedin`, etc. `opacity` transitions are feedback, not movement — per the audit rule ("keep opacity/color, drop movement"), the nav-ref transition may stay ungated. No reduced-motion change needed.

## Steps

1. In `scroll.css`, the `.nav-ref` block (now `141-152`) gained the `transition: opacity var(--duration-fast) var(--ease-out);` line after `font-weight: 500;`.
2. Leave the `.hud-nav .nav-btn:hover .nav-ref, .hud-nav .nav-btn.nav-active .nav-ref` rule unchanged.
3. Do not touch the `.hud-nav .nav-btn` block or any other rule.

## Boundaries

- Do NOT change the `.nav-btn` transition list or any other nav rule.
- Do NOT add markup or JS — motion property only.
- Do NOT touch `style.css`'s duplicated nav styles (the HUD is owned by `scroll.css`; per plan 003, the `style.css` Minimalist block was deleted).

## Verification

- **Mechanical**: `npm run typecheck` (clean) and `npm run build` (success). CSS-only change.
- **Feel check**: in the running site, press keys 1–6 or click the nav buttons:
  - The active button's ref glyph brightens over ~0.18s — no instant snap.
  - Hover in/out of a button also fades the glyph at the same speed (consistent with the button's color fade).
- **Done when**: `.nav-ref` reports `transition: opacity 0.18s cubic-bezier(0.22, 1, 0.36, 1)` in the computed styles, and switching sections shows a visible fade on the ref glyph rather than a teleport. (✅ verified at execution: `scroll.css:152`, commit `239fb1c`.)
