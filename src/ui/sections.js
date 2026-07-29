// ============================================================
// Section content renderer — injects datasheet content from
// portfolio data, and wires every LinkedIn/GitHub link.
// ============================================================
import { portfolioData } from '../data/portfolio.js';
import { LINKEDIN_URL, GITHUB_URL } from '../config.js';

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
        a.href = LINKEDIN_URL;
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
    });
    // GitHub — secondary, lower contrast, never competes for the click
    document.querySelectorAll('.js-github').forEach((a) => {
        a.href = GITHUB_URL;
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
    });
}

// Projects — exactly three fields per datasheet: Problem / State / Link.
function renderProjects() {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;

    grid.innerHTML = portfolioData.projects
        .map((p) => {
            const building = p.status === 'building';
            return `
        <article class="proj-ds ${building ? 'is-building' : ''}">
            <div class="proj-ds-head">
                <span class="proj-ds-title">${esc(p.ref)} · ${esc(p.title)}</span>
                <span class="proj-ds-status ${building ? 'building' : 'shipped'}">${building ? '□ BREADBOARD' : '■ SOLDERED'}</span>
            </div>
            <div class="proj-field"><b>PROBLEM</b> ${esc(p.problem)}</div>
            <div class="proj-field"><b>STATE</b> ${esc(p.state)}</div>
            <a class="proj-ds-link" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">${esc(p.linkLabel)}</a>
        </article>`;
        })
        .join('');
}

// Skills — each skill is one small component in the cluster.
function renderSkills() {
    const wrap = document.getElementById('skills-groups');
    if (!wrap) return;

    const groups = [
        { label: 'C1 — ML / DATA SCIENCE TOOLS', items: portfolioData.skills.ai_ml },
        { label: 'C2 — WEB / BACKEND', items: portfolioData.skills.web },
        { label: 'C3 — DATA / ANALYTICS', items: portfolioData.skills.data },
        { label: 'C4 — HARDWARE / CS FUNDAMENTALS', items: portfolioData.skills.hardware }
    ];

    wrap.innerHTML = groups
        .map(
            (g) => `
        <div class="skill-group">
            <div class="skill-group-label">${esc(g.label)}</div>
            <div class="skill-pills">${g.items.map((s) => `<span class="skill-pill">${esc(s)}</span>`).join('')}</div>
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
