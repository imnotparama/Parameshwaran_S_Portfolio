// @ts-check
// ============================================================
// Section content renderer — injects datasheet content from
// portfolio data, and wires every LinkedIn/GitHub link.
// ============================================================
import { portfolioData } from '../data/portfolio.js';
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
    renderHeroStats();
    renderAboutVref();
    renderProjects();
    renderSkills();
    renderTimeline();
}

// Hero stat badges — GPA / PROJECTS / HACKATHONS / CERTS
function renderHeroStats() {
    const row = document.getElementById('hero-badges');
    if (!row) return;
    row.innerHTML = portfolioData.personalInfo.stats
        .map((s) => `
        <div class="stat-badge">
            <span class="badge-val">${esc(s.value)}</span>
            <span class="badge-lbl">${esc(s.label)}</span>
        </div>`)
        .join('');
}

// About spec-table VREF row
function renderAboutVref() {
    const td = document.getElementById('about-vref');
    if (!td) return;
    const gpa = (portfolioData.personalInfo.stats[0] || {}).value || '9.48/10';
    td.textContent = `GPA ${gpa}`;
}

// The LinkedIn CTA is the primary contact action
function wireProfileLinks() {
    document.querySelectorAll('.js-linkedin, #cta-linkedin-hud').forEach((a) => {
        const anchor = /** @type {HTMLAnchorElement} */ (a);
        anchor.href = LINKEDIN_URL;
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
    });
    document.querySelectorAll('.js-github').forEach((a) => {
        const anchor = /** @type {HTMLAnchorElement} */ (a);
        anchor.href = GITHUB_URL;
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
    });
}

// Projects Filter definitions
const PROJECT_FILTERS = [
    { id: 'ALL', label: 'All Projects' },
    { id: 'AI/ML', label: 'AI & Machine Learning' },
    { id: 'FULL-STACK', label: 'Full-Stack Web' },
    { id: 'SYSTEMS', label: 'Systems & IoT' }
];

function renderProjects() {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    const panel = grid.closest('.ds-panel');
    if (!panel) return;

    if (!panel.querySelector('.proj-filter-bar')) {
        const bar = document.createElement('div');
        bar.className = 'proj-filter-bar';
        bar.setAttribute('aria-label', 'Filter projects by category');
        PROJECT_FILTERS.forEach((f, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'proj-filter' + (i === 0 ? ' active' : '');
            btn.setAttribute('data-filter', f.id);
            btn.setAttribute('aria-pressed', String(i === 0));
            btn.textContent = f.label;
            btn.addEventListener('click', () => applyProjectFilter(f.id, btn));
            bar.appendChild(btn);
        });
        panel.insertBefore(bar, grid);
    }

    grid.innerHTML = portfolioData.projects
        .map((p) => {
            const building = p.status === 'building';
            const tags = (p.tags || []).map((t) => `<span class="proj-tag">${esc(t)}</span>`).join('');
            return `
        <article class="proj-ds ${building ? 'is-building' : ''}" data-category="${esc(p.category || '')}" data-ref="${esc(p.ref)}">
            <div class="proj-ds-head">
                <div class="proj-ds-title-wrap">
                    <span class="proj-ds-theme">${esc(p.category || 'Software')}</span>
                    <h3 class="proj-ds-title">${esc(p.title)}</h3>
                </div>
                <span class="status-tag ${building ? 'building' : 'shipped'}">${building ? '⚡ In Active Build' : '🚀 Shipped &amp; Live'}</span>
            </div>
            <p class="proj-summary">${esc(p.problem)}</p>
            <div class="proj-field"><strong>Highlights:</strong> ${esc(p.state)}</div>
            ${tags ? `<div class="proj-tags">${tags}</div>` : ''}
            <div class="proj-footer">
                <a class="proj-ds-link" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">${esc(p.linkLabel || 'View Details →')}</a>
            </div>
        </article>`;
        })
        .join('');
}

/**
 * Apply a filter to the DOM grid + the 3D chips.
 * @param {string} filter
 * @param {HTMLButtonElement} clickedBtn
 */
function applyProjectFilter(filter, clickedBtn) {
    const bar = clickedBtn.closest('.proj-filter-bar');
    if (bar) {
        bar.querySelectorAll('.proj-filter').forEach((b) => {
            const btn = /** @type {HTMLButtonElement} */ (b);
            const on = btn === clickedBtn;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-pressed', String(on));
        });
    }

    const cards = /** @type {HTMLElement[]} */ ([
        ...document.querySelectorAll('#projects-grid .proj-ds')
    ]);
    cards.forEach((card) => {
        const match = filter === 'ALL' || card.dataset.category === filter;
        card.classList.toggle('proj-filtered', !match);
        if (motionPrefs.reduced) {
            card.style.opacity = match ? '' : '0.2';
            card.style.transform = match ? '' : 'scale(0.95)';
            return;
        }
        gsap.killTweensOf(card);
        gsap.to(card, {
            opacity: match ? 1 : 0,
            scale: match ? 1 : 0.95,
            duration: 0.3,
            ease: 'power2.out',
            clearProps: match ? 'opacity,transform,visibility' : 'visibility',
            overwrite: 'auto'
        });
    });

    setProjectFilter(filter);
}

// Skills — modern visual categories
function renderSkills() {
    const wrap = document.getElementById('skills-groups');
    if (!wrap) return;

    /** @type {Record<string, string[]>} */
    const usedIn = {};
    for (const p of portfolioData.projects) {
        const short = p.title.split(/\s*[—-]\s*/)[0];
        for (const tag of p.tags || []) {
            (usedIn[tag] = usedIn[tag] || []).push(short);
        }
    }
    const shortName = (/** @type {string} */ s) => {
        const hits = usedIn[s] || [];
        return hits.length ? hits.slice(0, 4).join(', ') : '';
    };

    const groups = [
        { label: '🧠 AI & Machine Learning', items: portfolioData.skills.ai_ml },
        { label: '💻 Full-Stack & Web Development', items: portfolioData.skills.web },
        { label: '📊 Data Science & Analytics', items: portfolioData.skills.data },
        { label: '⚡ Embedded Systems & IoT', items: portfolioData.skills.hardware }
    ];

    wrap.innerHTML = groups
        .map(
            (g) => `
        <div class="skill-group">
            <div class="skill-group-label">${esc(g.label)}</div>
            <div class="skill-pills">${g.items
                .map(
                    (s) => {
                        const used = shortName(s);
                        return `<span class="skill-pill"${used ? ` data-used="${esc(used)}"` : ''} tabindex="0">${esc(s)}${used ? `<i class="skill-used" aria-hidden="true">Used in: ${esc(used)}</i>` : ''}</span>`;
                    }
                )
                .join('')}</div>
        </div>`
        )
        .join('');
}

// Experience — modern interactive vertical timeline
function renderTimeline() {
    const list = document.getElementById('timeline-list');
    if (!list) return;

    list.innerHTML = portfolioData.timeline
        .map(
            (t) => `
        <div class="tl-item">
            <div class="tl-marker"><span class="tl-pulse"></span></div>
            <div class="tl-content">
                <div class="tl-date">${esc(t.date)}</div>
                <h3 class="tl-title">${esc(t.title)}</h3>
                <div class="tl-detail">${esc(t.detail)}</div>
            </div>
        </div>`
        )
        .join('');
}
