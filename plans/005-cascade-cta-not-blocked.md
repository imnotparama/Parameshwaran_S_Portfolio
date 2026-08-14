# 005 — Cascade must not block the CTA (shorten + exclude CTA)

- **Status**: DONE (executed 2026-08)
- **Commit**: `eaff1f2`
- **Severity**: HIGH
- **Category**: Purpose & frequency / Interruptibility
- **Estimated scope**: 1 file (`src/scroll/journey.js`), ~10 lines

## Problem

The panel content cascade added to `setActivePanel` in `src/scroll/journey.js` runs on **every section activation** — the site's most frequent state change. It staggers *every* child of the activated panel, including the LinkedIn CTA (hero, about, and contact panels all carry their own `.cta-linkedin`). Current code:

```js
// src/scroll/journey.js:538-556 — current
if (panelId && activePanelEl && document.body.classList.contains('full-journey')) {
    const blocks = /** @type {HTMLElement[]} */ ([...activePanelEl.children].filter(
      (el) => el instanceof HTMLElement && !el.classList.contains('headline-twin')
    ));
    if (blocks.length > 1) {
      gsap.killTweensOf(blocks);
      gsap.fromTo(blocks,
        { autoAlpha: 0, y: 12 },
        {
          autoAlpha: 1, y: 0, duration: 0.5,
          stagger: { each: 0.06, from: 'start' },
          ease: 'power2.out',
          clearProps: 'transform'
        }
      );
    }
  }
```

Consequences:
- **CTA delay**: on the hero panel the CTA is the last of 6 blocks → it finishes appearing ~0.8s after activation, at the exact moment a first-time visitor is deciding whether to click. The CTA is "the entire point of the site" (per the file comment in `src/ui/sections.js`).
- **Duration**: 0.5s + stagger is over the UI budget (200–500ms panel/entrance max; "stagger is decorative — it must never block interaction").
- The hero panel also gets a *double reveal*: `runBootSequence` already staggers the hero badges, then `initJourney`'s `setActivePanel('panel-hero')` re-staggers the same elements (the badge row is a direct child of `panel-hero`).

## Target

The cascade keeps its orchestrated feel but never delays the CTA and stays inside the budget:

```js
// target — src/scroll/journey.js (same block)
if (panelId && activePanelEl && document.body.classList.contains('full-journey')) {
    const blocks = /** @type {HTMLElement[]} */ ([...activePanelEl.children].filter(
      (el) => el instanceof HTMLElement
        && !el.classList.contains('headline-twin')
        && !el.classList.contains('cta-linkedin')
    ));
    if (blocks.length > 1) {
      gsap.killTweensOf(blocks);
      gsap.fromTo(blocks,
        { autoAlpha: 0, y: 10 },
        {
          autoAlpha: 1, y: 0, duration: 0.3,
          stagger: { each: 0.04, from: 'start' },
          ease: 'power2.out',
          clearProps: 'transform'
        }
      );
    }
  }
```

- CTA children (`.cta-linkedin`, plus the detail panel's `#pdetail-link`) are excluded → they appear instantly with the panel, never delayed.
- `duration: 0.5` → `0.3`; `stagger each: 0.06` → `0.04`; `y: 12` → `10` (smaller distance for the shorter duration). `power2.out` unchanged — it is the established house curve (matches the `--ease-out` token family and the site's other GSAP entrances).

## Repo conventions to follow

- The cascade's `power2.out` + `clearProps: 'transform'` pattern is the established entrance style in this file (same block, `src/scroll/journey.js:551`).
- CTA elements are `.cta-linkedin` everywhere (`src/ui/sections.js` `wireProfileLinks` targets `.js-linkedin, #cta-linkedin-hud`; the panel CTAs are `class="cta-linkedin js-linkedin"`). The detail link is `class="cta-linkedin"` with `id="pdetail-link"`.

## Steps

1. In `src/scroll/journey.js`, edit the `blocks` filter (around line 544) to also exclude `el.classList.contains('cta-linkedin')` — this covers the hero/about/contact CTAs and the detail panel's `#pdetail-link` (it has the class). (Reconcile note 2026-08: still unexecuted — the filter at `journey.js:545` excludes only `headline-twin`.)
2. In the same block, change `y: 12` → `y: 10`, `duration: 0.5` → `duration: 0.3`, and `stagger: { each: 0.06, from: 'start' }` → `stagger: { each: 0.04, from: 'start' }`.
3. Leave `power2.out`, `autoAlpha`, `clearProps: 'transform'`, and the `full-journey` / `headline-twin` guards untouched.

## Boundaries

- Do NOT touch the boot sequence (`src/ui/boot.js`) — its hero stagger is separate and intentional (rare, first-time moment).
- Do NOT change the CSS panel cross-fade (`body.full-journey .ds-panel` transition in `scroll.css`).
- Do NOT add dependencies or change markup.

## Verification

- **Mechanical**: `npm run typecheck` (expect clean) and `npm run build` (expect success).
- **Feel check**: in the running site, scroll into the hero, about, and projects sections:
  - The LinkedIn CTA is visible at full opacity the instant the panel cross-fade lands — no fade-in wait.
  - The remaining blocks cascade noticeably faster than before (total ~0.45s for a 4-block panel, was ~0.75s).
  - The hero after boot does NOT double-reveal the badge row (boot owns it; the cascade skips it only if the row is the CTA — verify the badges still cascade once from the boot timeline, and the CTA appears immediately).
  - In DevTools Animations panel at 10% playback: blocks rise ~10px and settle, CTA never animates.
  - Toggle `prefers-reduced-motion`: movement is dropped (CSS already gates panel transitions; the GSAP cascade is short and opacity-dominant).
- **Done when**: no `.cta-linkedin` element is ever a GSAP cascade target (check via DevTools: activate each section, confirm the CTA has no inline opacity/transform from GSAP), and the panel content still reads as sequenced rather than simultaneous. ✅ executed: about/contact/detail CTAs are direct panel children and now excluded; hero CTA rides inside `.hero-cta-row`, which still cascades as a block (pre-existing structure, now ~0.45s total vs ~0.75s) — see execution log.
