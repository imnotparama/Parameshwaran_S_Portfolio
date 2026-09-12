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
import { clickBlip } from '../utils/sound.js';
import { focusProject } from '../scroll/journey.js';
import { inspectProject } from '../three/hardware-orchestrator.js';
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
    renderCertifications();
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
                <span class="mfg-k">SERIAL</span><span class="mfg-v board-serial-copy" title="Click to copy serial number" style="cursor:pointer;" aria-label="Copy serial number">${esc(mfg.serial)} <span class="copy-badge">📋</span></span>
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
            const badge = getProjectLiveBadge(p.ref);
            return `
        <article class="proj-ds ${building ? 'is-building' : ''} ${verified ? 'chip-verified' : ''}" data-category="${esc(p.category || '')}" data-ref="${esc(p.ref)}">
            <div class="proj-ds-header">
                <div class="proj-ds-id-row">
                    <span class="proj-ds-ref">MODULE // ${esc(p.ref)}</span>
                    <span class="proj-ds-status ${building ? 'building' : 'online'}">
                        <span class="status-dot"></span>${esc(p.statusText || (building ? 'IN BUILD' : 'ONLINE'))}
                    </span>
                    <span class="proj-ds-rail">${esc(p.rail || '+3.3V')}</span>
                </div>
                ${badge}
                <h3 class="proj-ds-title">${esc(p.title)}</h3>
                <div class="proj-ds-func">${esc(p.function || p.theme)}</div>
            </div>
            <div class="proj-ds-body">
                <p class="proj-summary">${esc(p.problem)}</p>
                <div class="proj-io-snippet">
                    <div class="io-line"><span class="io-lbl">IN:</span> <span class="io-val">${esc(p.inputs || 'Bus Inputs')}</span></div>
                    <div class="io-line"><span class="io-lbl">OUT:</span> <span class="io-val">${esc(p.outputs || 'Data Streams')}</span></div>
                </div>
                ${tags ? `<div class="proj-tags">${tags}</div>` : ''}
            </div>
            <div class="proj-footer">
                <button type="button" class="proj-inspect-btn" data-ref="${esc(p.ref)}">INSPECT IC [3D] →</button>
                <a class="proj-ds-link" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">${esc(p.linkLabel || 'REPOSITORY →')}</a>
            </div>
        </article>`;
        })
        .join('');

    // Wire hover and click triggers for direct 3D diorama inspection
    grid.querySelectorAll('.proj-ds').forEach((card) => {
        const ref = card.getAttribute('data-ref');
        card.addEventListener('mouseenter', () => {
            if (ref) inspectProject(ref);
        });
        card.addEventListener('click', (e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            if (target.closest('.proj-ds-link')) return; // let external link clicks pass through
            if (ref) {
                inspectProject(ref);
                focusProject(ref);
            }
        });
    });
}

/**
 * Returns a live 3D diorama badge for each hardware module.
 * @param {string} ref
 */
function getProjectLiveBadge(ref) {
    switch (ref) {
        case 'CP1':
            return `<div class="proj-live-badge live-cv"><span class="badge-dot"></span><span>3D CV TRACKING DIORAMA</span></div>`;
        case 'DL1':
            return `<div class="proj-live-badge live-voice"><span class="badge-dot"></span><span>3D VOICE ORB DIORAMA</span></div>`;
        case 'SP1':
            return `<div class="proj-live-badge live-parking"><span class="badge-dot"></span><span>3D DOCKING GARAGE DIORAMA</span></div>`;
        case 'BT1':
            return `<div class="proj-live-badge live-transit"><span class="badge-dot"></span><span>3D GPS HIGHWAY DIORAMA</span></div>`;
        case 'AQD1':
            return `<div class="proj-live-badge live-solar"><span class="badge-dot"></span><span>3D SOLAR PURIFIER DIORAMA</span></div>`;
        case 'PX1':
            return `<div class="proj-live-badge live-pet"><span class="badge-dot"></span><span>3D ROBOPET VITAL DIORAMA</span></div>`;
        case 'EM1':
            return `<div class="proj-live-badge live-eco"><span class="badge-dot"></span><span>3D EARTH & TURBINE DIORAMA</span></div>`;
        case 'ML1':
            return `<div class="proj-live-badge live-algo"><span class="badge-dot"></span><span>3D BINARY TREE BFS DIORAMA</span></div>`;
        default:
            return '';
    }
}

/**
 * Apply a filter to the DOM grid + the 3D chips.
 * @param {string} filter
 * @param {HTMLButtonElement} clickedBtn
 */
function applyProjectFilter(filter, clickedBtn) {
    clickBlip();
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
            duration: 0.22,
            ease: 'power1.out',
            clearProps: match ? 'opacity,visibility' : 'visibility',
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
        { code: 'BANK C1', label: 'AI & Computer Vision Architecture', group: portfolioData.skills.ai_vision },
        { code: 'BANK C2', label: 'Distributed Backend Engineering', group: portfolioData.skills.backend },
        { code: 'BANK C3', label: 'Interactive WebGL & Engine Systems', group: portfolioData.skills.webgl_ui },
        { code: 'BANK C4', label: 'Embedded Systems & IoT Hardware', group: portfolioData.skills.embedded_iot },
        { code: 'BANK C5', label: 'Data Science & Analytical Pipelines', group: portfolioData.skills.data_analytics }
    ];

    wrap.innerHTML = skillCategories
        .map((cat) => {
            const items = cat.group || [];
            return `
            <div class="skill-group">
                <div class="skill-group-head">
                    <span class="skill-group-code">${esc(cat.code)}</span>
                    <h3 class="skill-group-label">${esc(cat.label)}</h3>
                </div>
                ${items.map((item) => `
                    <div class="capability-block">
                        <div class="capability-title">${esc(item.capability)}</div>
                        <div class="skill-pills">
                            ${item.techs.map((tech) => {
                                const role = skillRoles[tech] || 'BUS';
                                return `<span class="skill-pill" tabindex="0"><span class="pill-pad"></span>${esc(tech)}<span class="skill-role">${esc(role)}</span></span>`;
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

// Certifications — D1-D7 LED Array Hardware Registers
function renderCertifications() {
    const grid = document.getElementById('cert-grid');
    if (!grid) return;

    grid.innerHTML = (portfolioData.certifications || [])
        .map((c) => {
            const isObj = typeof c === 'object' && c !== null;
            const title = isObj ? c.title : String(c);
            const issuer = isObj ? c.issuer : 'Verified Credential';
            const year = isObj ? c.year : '';
            const badge = isObj ? c.badge : 'REG_CERT';
            return `
        <div class="cert-card">
            <div class="cert-card-top">
                <span class="cert-reg">${esc(badge)}</span>
                ${year ? `<span class="cert-year">${esc(year)}</span>` : ''}
            </div>
            <div class="cert-name">${esc(title)}</div>
            <div class="cert-org">${esc(issuer)}</div>
        </div>`;
        })
        .join('');
}

