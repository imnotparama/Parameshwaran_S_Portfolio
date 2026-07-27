import { portfolioData } from '../data/portfolio.js';

let panelEl = null;
let contentEl = null;

export function initSidePanel() {
    panelEl = document.getElementById('info-panel');
    contentEl = document.getElementById('info-panel-content');

    const closeBtn = document.getElementById('btn-close-panel');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSidePanel);
    }
}

export function openSidePanel(ref) {
    if (!panelEl || !contentEl) return;
    if (!portfolioData) return;

    const info = portfolioData.personalInfo;
    let html = '';

    switch (ref) {
        case 'U1':
            html = buildAboutSection(info);
            break;
        case 'U2':
            html = buildProjectsSection();
            break;
        case 'J1':
            html = buildExperienceSection();
            break;
        case 'ANT1':
            html = buildContactSection(info);
            break;
        default:
            html = buildGenericSection(ref);
    }

    contentEl.innerHTML = html;
    panelEl.classList.add('active');
}

export function closeSidePanel() {
    if (panelEl) panelEl.classList.remove('active');
}

// ─── Section Builders ───────────────────────────────────────

function buildAboutSection(info) {
    return `
        <div class="panel-section-title">// MCU: About & Skills</div>
        <pre class="panel-ascii-art">
+----------------------------------+
|      PARAMESHWARAN S SYSTEM      |
|         STATUS: OPERATIONAL      |
+----------------------------------+
        </pre>
        <div class="panel-body-content">
            <p><strong>Name:</strong> ${info.name}</p>
            <p><strong>Role:</strong> ${info.tagline}</p>
            <p><strong>University:</strong> ${info.institution}</p>
            <p><strong>GPA:</strong> 9.51 / 10</p>
            <p><strong>Location:</strong> ${info.location}</p>
            <p class="panel-bio">${info.bio}</p>
        </div>
        <div class="panel-section-title" style="margin-top:25px;font-size:15px;">// Silicon Skills Grid</div>
        <div class="panel-skills-grid">
            <p><strong class="tag-ai">AI / ML:</strong> ${portfolioData.skills.ai_ml.join(', ')}</p>
            <p><strong class="tag-web">Web Dev:</strong> ${portfolioData.skills.web.join(', ')}</p>
            <p><strong class="tag-data">Data Sci:</strong> ${portfolioData.skills.data.join(', ')}</p>
            <p><strong class="tag-hw">Hardware:</strong> ${portfolioData.skills.hardware.join(', ')}</p>
        </div>
        <div class="panel-links">
            <a href="${info.socials.github}" target="_blank" class="nav-btn" rel="noopener noreferrer">[ GITHUB ]</a>
            <a href="${info.socials.linkedin}" target="_blank" class="nav-btn" rel="noopener noreferrer">[ LINKEDIN ]</a>
        </div>
    `;
}

function buildProjectsSection() {
    let html = `<div class="panel-section-title">// DSP: Projects Registry</div><div class="panel-projects-list">`;
    portfolioData.projects.forEach(p => {
        html += `
            <div class="project-card">
                <div class="project-card-title">${p.title}</div>
                <div class="project-card-desc">${p.description}</div>
                <div class="project-card-tags">
                    ${p.tags.map(t => `<span class="tag-pill">${t}</span>`).join('')}
                </div>
                <a href="${p.github}" target="_blank" class="project-card-link" rel="noopener noreferrer">[ VIEW SOURCE ]</a>
            </div>
        `;
    });
    html += `</div>`;
    return html;
}

function buildExperienceSection() {
    let html = `<div class="panel-section-title">// BUS: Experience Logs</div><div class="panel-exp-list">`;
    portfolioData.experience.forEach(exp => {
        html += `
            <div class="experience-entry">
                <p class="exp-title">${exp.role} <span class="exp-at">@</span> <span class="exp-company">${exp.company}</span></p>
                <p class="exp-meta">${exp.duration} &mdash; ${exp.location}</p>
                <ul class="exp-details">
                    ${exp.details.map(d => `<li>${d}</li>`).join('')}
                </ul>
            </div>
        `;
    });
    html += `</div>`;
    return html;
}

function buildContactSection(info) {
    return `
        <div class="panel-section-title">// TX/RX: Gateway Link</div>
        <div class="panel-body-content">
            <p><strong class="tag-link">Email:</strong> ${info.email}</p>
            <p><strong class="tag-link">Phone:</strong> ${info.phone}</p>
            <p><strong class="tag-link">Location:</strong> ${info.location}</p>
            <p class="panel-bio">Drop me an email or trace my links for engineering collaborations, research proposals, or project scrums.</p>
            <div class="panel-links" style="flex-direction:column;">
                <a href="mailto:${info.email}" class="nav-btn" style="text-align:center;">[ TRANSMIT EMAIL ]</a>
                <a href="${info.socials.github}" target="_blank" class="nav-btn" style="text-align:center;" rel="noopener noreferrer">[ ROUTE GITHUB CHANNEL ]</a>
                <a href="${info.socials.linkedin}" target="_blank" class="nav-btn" style="text-align:center;" rel="noopener noreferrer">[ CONNECT LINKEDIN NODE ]</a>
            </div>
        </div>
    `;
}

function buildGenericSection(ref) {
    return `
        <div class="panel-section-title">// MCU Registry: ${ref}</div>
        <div class="panel-body-content">
            <p><strong>Designator:</strong> ${ref}</p>
            <p><strong>Device:</strong> SMD Component — Module</p>
            <p><strong>Status:</strong> Systems running at stable reference levels.</p>
            <p class="panel-bio" style="margin-top:20px;">Hover over the component on the PCB board for diagnostic details, or click to inspect its internal microarchitecture.</p>
        </div>
    `;
}
