// @ts-check
// ============================================================
// Section content renderer — injects datasheet content from
// portfolio data, and wires every LinkedIn/GitHub link.
// ============================================================
import { portfolioData, skillRoles } from '../data/portfolio.js';
import { LINKEDIN_URL, GITHUB_URL } from '../config.js';
import { setProjectFilter } from '../three/project-chips.js';
import { isChipVerified } from './telemetry.js';
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
    renderManufacturingLabel();
}

// Hero stat badges — CORE / MODULES / UPTIME / BUILD
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
    const gpa = '9.48/10';
    td.textContent = `GPA ${gpa}`;
}

// Motherboard Manufacturing Silkscreen Label in About panel
function renderManufacturingLabel() {
    const labelContainer = document.getElementById('mfg-label-card');
    if (!labelContainer) return;
    const mfg = portfolioData.personalInfo.manufacturingLabel;
    labelContainer.innerHTML = `
        <div class="mfg-silkscreen-label">
            <div class="mfg-header">${esc(mfg.brand)}</div>
            <div class="mfg-grid">
                <span class="mfg-k">MODEL</span><span class="mfg-v">${esc(mfg.model)}</span>
                <span class="mfg-k">REVISION</span><span class="mfg-v">${esc(mfg.revision)}</span>
                <span class="mfg-k">SERIAL</span><span class="mfg-v">${esc(mfg.serial)}</span>
                <span class="mfg-k">ASSEMBLED</span><span class="mfg-v">${esc(mfg.assembled)}</span>
                <span class="mfg-k">STATUS</span><span class="mfg-v mfg-status">${esc(mfg.status)}</span>
            </div>
        </div>
    `;
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
    { id: 'ALL', label: 'All Modules' },
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
        bar.setAttribute('aria-label', 'Filter installed modules by category');
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
            const verified = isChipVerified(p.ref);
            const tags = (p.tags || []).map((t) => `<span class="proj-tag">${esc(t)}</span>`).join('');
            return `
        <article class="proj-ds ${building ? 'is-building' : ''} ${verified ? 'chip-verified' : ''}" data-category="${esc(p.category || '')}" data-ref="${esc(p.ref)}">
            <div class="proj-ds-head">
                <div class="proj-ds-title-wrap">
                    <span class="proj-ds-theme" style="color: ${esc(p.signal || '#3ee6a0')}">IC // ${esc(p.ref)} · ${esc(p.theme || p.category)}</span>
                    <h3 class="proj-ds-title">${esc(p.title)}</h3>
                </div>
                <div class="proj-status-cluster">
                    ${verified ? '<span class="status-tag verified">✓ VERIFIED</span>' : ''}
                    <span class="status-tag ${building ? 'building' : 'shipped'}">${building ? '⚡ In Build' : '🚀 Online'}</span>
                </div>
            </div>
            <p class="proj-summary">${esc(p.problem)}</p>
            <div class="proj-field"><strong>Specifications:</strong> ${esc(p.state)}</div>
            ${tags ? `<div class="proj-tags">${tags}</div>` : ''}
            <div class="proj-footer">
                <a class="proj-ds-link" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">${esc(p.linkLabel || 'Inspect Repository →')}</a>
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

// Skills — Capabilities First, Supported by Technologies
function renderSkills() {
    const wrap = document.getElementById('skills-groups');
    if (!wrap) return;

    const skillCategories = [
        { label: '🧠 AI & Computer Vision', group: portfolioData.skills.ai_vision },
        { label: '⚙️ Backend Engineering', group: portfolioData.skills.backend },
        { label: '🎨 Interactive Web & Graphics', group: portfolioData.skills.webgl_ui },
        { label: '⚡ Embedded & IoT Systems', group: portfolioData.skills.embedded_iot },
        { label: '📊 Data Analytics & Modeling', group: portfolioData.skills.data_analytics }
    ];

    wrap.innerHTML = skillCategories
        .map((cat) => {
            const items = cat.group || [];
            return `
            <div class="skill-group">
                <div class="skill-group-label">${esc(cat.label)}</div>
                ${items.map((item) => `
                    <div class="capability-block">
                        <div class="capability-title">${esc(item.capability)}</div>
                        <div class="skill-pills">
                            ${item.techs.map((tech) => {
                                const role = skillRoles[tech] || 'BUS';
                                return `<span class="skill-pill" tabindex="0">${esc(tech)}<span class="skill-role">${esc(role)}</span></span>`;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>`;
        })
        .join('');
}

// Experience — FW UPDATE Timeline
function renderTimeline() {
    const list = document.getElementById('timeline-list');
    if (!list) return;

    list.innerHTML = portfolioData.timeline
        .map(
            (t) => `
        <div class="tl-item">
            <div class="tl-marker"><span class="tl-pulse"></span></div>
            <div class="tl-content">
                <div class="tl-head-row">
                    <span class="fw-badge">${esc(t.version || 'FW UPDATE')}</span>
                    <span class="tl-date">${esc(t.date)}</span>
                </div>
                <h3 class="tl-title">${esc(t.title)}</h3>
                <div class="tl-detail">${esc(t.detail)}</div>
            </div>
        </div>`
        )
        .join('');
}
