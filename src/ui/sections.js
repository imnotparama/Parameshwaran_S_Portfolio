// @ts-check
// ============================================================
// Section content renderer — injects datasheet content from
// portfolio data, and wires every LinkedIn/GitHub link.
// ============================================================
import { portfolioData, skillRoles } from '../data/portfolio.js';
import { LINKEDIN_URL, GITHUB_URL } from '../config.js';
import { setProjectFilter } from '../three/project-chips.js';
import { motionPrefs } from '../utils/motion-prefs.js';
import gsap from 'gsap';

/** @param {string} str */
function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function renderSections() {
    wireProfileLinks();
    renderProjects();
    renderSkills();
    renderTimeline();
}

// The LinkedIn CTA is the entire point of the site — every
// .js-linkedin element gets the real URL from env config.
// This runs on every section change to re-wire any dynamically
// added or re-rendered CTA elements.
function wireProfileLinks() {
    // LinkedIn — primary CTAs (the entire point of the site)
    document.querySelectorAll('.js-linkedin, #cta-linkedin-hud').forEach((a) => {
        const anchor = /** @type {HTMLAnchorElement} */ (a);
        anchor.href = LINKEDIN_URL;
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
    });
    // GitHub — secondary, lower contrast, never competes for the click
    document.querySelectorAll('.js-github').forEach((a) => {
        const anchor = /** @type {HTMLAnchorElement} */ (a);
        anchor.href = GITHUB_URL;
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
    });
}

// Projects — exactly three fields per datasheet: Problem / State / Link.
// The grid is preceded by an SMD DIP-switch filter bar (F6): ALL / AI/ML /
// FULL-STACK / SYSTEMS, wired to animate the cards AND sync the 3D chips
// (project-chips.setProjectFilter) so the board and datasheet filter together.
const PROJECT_FILTERS = ['ALL', 'AI/ML', 'FULL-STACK', 'SYSTEMS'];

function renderProjects() {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    const panel = grid.closest('.ds-panel');
    if (!panel) return;

    // Idempotent: a re-render (HMR / re-entry) must never stack filter bars.
    if (!panel.querySelector('.proj-filter-bar')) {
        const bar = document.createElement('div');
        bar.className = 'proj-filter-bar';
        bar.setAttribute('aria-label', 'Filter projects by category');
        PROJECT_FILTERS.forEach((f, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'proj-filter' + (i === 0 ? ' active' : '');
            btn.setAttribute('data-filter', f);
            btn.setAttribute('aria-pressed', String(i === 0));
            btn.textContent = `[${f}]`;
            btn.addEventListener('click', () => applyProjectFilter(f, btn));
            bar.appendChild(btn);
        });
        panel.insertBefore(bar, grid);
    }

    grid.innerHTML = portfolioData.projects
        .map((p) => {
            const building = p.status === 'building';
            const spec = (p.spec || []).map((s) => `<li>${esc(s)}</li>`).join('');
            // Each module gets its own identity: subsystem theme + its own
            // signal color (the same hex tints the 3D chip's LED on the board)
            // + its own technical specification block. The problem field stays
            // the primary read — WHAT it solves, not which tech it used.
            return `
        <article class="proj-ds ${building ? 'is-building' : ''}" data-category="${esc(p.category || '')}" data-ref="${esc(p.ref)}">
            <span class="proj-ds-ref" aria-hidden="true">${esc(p.ref)}</span>
            <div class="proj-ds-head">
                <div class="proj-ds-title-wrap">
                    <span class="proj-ds-theme"><i class="proj-signal" style="--sig:${esc(p.signal || '')}" aria-hidden="true"></i>${esc(p.theme || '')}</span>
                    <span class="proj-ds-title">${esc(p.title)}</span>
                </div>
                <span class="proj-ds-status ${building ? 'building' : 'shipped'}" role="img" aria-label="${building ? 'In build' : 'Shipped'}"></span>
            </div>
            <div class="proj-field"><b>PROBLEM</b> ${esc(p.problem)}</div>
            <div class="proj-field"><b>STATE</b> ${esc(p.state)}</div>
            ${spec ? `<ul class="proj-spec">${spec}</ul>` : ''}
            <a class="proj-ds-link" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">${esc(p.linkLabel)}</a>
        </article>`;
        })
        .join('');
}

/** Apply a filter to the DOM grid + the 3D chips. Animate on the house
 *  power2 curve; under reduced motion the state snaps (no gsap — same
 *  posture as the rest of the board).
 *  @param {string} filter @param {HTMLButtonElement} clickedBtn */
function applyProjectFilter(filter, clickedBtn) {
    // Micro-flip the clicked DIP switch: rotate Y 180° and settle back.
    if (!motionPrefs.reduced) {
        gsap.killTweensOf(clickedBtn);
        gsap.fromTo(clickedBtn,
            { rotationY: 0 },
            { rotationY: 180, duration: 0.18, ease: 'power2.in', yoyo: true, repeat: 1, clearProps: 'transform', overwrite: 'auto' }
        );
    }
    const bar = clickedBtn.closest('.proj-filter-bar');
    if (bar) {
        bar.querySelectorAll('.proj-filter').forEach((b) => {
            const on = b === clickedBtn;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', String(on));
        });
    }

    const cards = /** @type {HTMLElement[]} */ ([
        ...document.querySelectorAll('#projects-grid .proj-ds')
    ]);
    cards.forEach((card) => {
        const match = filter === 'ALL' || card.dataset.category === filter;
        card.classList.toggle('proj-filtered', !match);
        if (motionPrefs.reduced) {
            // Reduced: instant opacity flip — the CSS rule owns the value.
            card.style.opacity = match ? '' : '0.2';
            card.style.transform = match ? '' : 'scale(0.92)';
            return;
        }
        gsap.killTweensOf(card);
        gsap.to(card, {
            opacity: match ? 1 : 0,
            scale: match ? 1 : 0.9,
            duration: 0.35,
            ease: 'power2.out',
            clearProps: match ? 'opacity,transform,visibility' : 'visibility',
            overwrite: 'auto'
        });
    });

    // Sync the 3D board chips (dim non-matching, restore matching).
    setProjectFilter(filter);
}

// Skills — each skill is one small component in the cluster.
function renderSkills() {
    const wrap = document.getElementById('skills-groups');
    if (!wrap) return;

    // The library is organized as component banks — each skill is one part on
    // the board, labeled with its component class (skillRoles): Python is the
    // MCU, FastAPI is the COMM BUS, React is the DISPLAY CTRL, and so on.
    const groups = [
        { label: 'C1 — AI ACCELERATOR BANK', items: portfolioData.skills.ai_ml },
        { label: 'C2 — DISPLAY & I/O BANK', items: portfolioData.skills.web },
        { label: 'C3 — STORAGE CONTROLLER BANK', items: portfolioData.skills.data },
        { label: 'C4 — FIRMWARE & RF MODULES', items: portfolioData.skills.hardware }
    ];

    wrap.innerHTML = groups
        .map(
            (g) => `
        <div class="skill-group">
            <div class="skill-group-label">${esc(g.label)}</div>
            <div class="skill-pills">${g.items.map((s) => `<span class="skill-pill">${esc(s)}<em>${esc(skillRoles[s] || 'PASSIVE')}</em></span>`).join('')}</div>
        </div>`
        )
        .join('');
}

// Experience — a trace path with time-stamped junctions.
function renderTimeline() {
    const list = document.getElementById('timeline-list');
    if (!list) return;

    list.innerHTML = portfolioData.timeline
        .map(
            (t) => `
        <div class="tl-item">
            <div class="tl-date">${esc(t.date)}</div>
            <div class="tl-title">${esc(t.title)}</div>
            <div class="tl-detail">${esc(t.detail)}</div>
        </div>`
        )
        .join('');
}
