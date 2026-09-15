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
import { clickBlip, relayClick } from '../utils/sound.js';
import { focusProject } from '../scroll/journey.js';
import { inspectProject } from '../three/hardware-orchestrator.js';
import { energizeCapacitor, triggerFirmwareFlashAnim } from '../three/components.js';
import { flyProbeTo } from '../three/flying-probe.js';
import { emitUartLog } from './telemetry.js';
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

// Skills — Capabilities First, Supported by Technologies & Energy Banks
function renderSkills() {
    const wrap = document.getElementById('skills-groups');
    if (!wrap) return;

    /** @type {Record<string, number>} */
    const BANK_X = { C1: 2.3, C2: 2.9, C3: 3.5, C4: 4.1 };

    const skillCategories = [
        {
            code: 'BANK C1',
            bank: 'C1',
            spec: '+3.3V · 4700µF · TENSOR CORE',
            metric: '48.2 TFLOPS',
            latency: '0.4ms INFERENCE',
            pct: 98,
            colorHex: '#f59e0b',
            label: 'AI & Computer Vision Architecture',
            group: portfolioData.skills.ai_vision
        },
        {
            code: 'BANK C2',
            bank: 'C2',
            spec: '+5.0V · 3300µF · ASYNC CLOUD',
            metric: '100 GbE ASYNC',
            latency: '1.2ms P99',
            pct: 95,
            colorHex: '#06b6d4',
            label: 'Distributed Backend Engineering',
            group: portfolioData.skills.backend
        },
        {
            code: 'BANK C3',
            bank: 'C3',
            spec: '+3.3V · 2200µF · 3D WEBGL ENGINE',
            metric: '120 FPS V-SYNC',
            latency: '<120 DRAW CALLS',
            pct: 96,
            colorHex: '#10b981',
            label: 'Interactive WebGL & Engine Systems',
            group: portfolioData.skills.webgl_ui
        },
        {
            code: 'BANK C4',
            bank: 'C4',
            spec: '+1.8V · 1000µF · EMBEDDED DMA',
            metric: '240 MHz CLOCK',
            latency: '8-CH DMA',
            pct: 92,
            colorHex: '#8b5cf6',
            label: 'Embedded Systems & IoT Hardware',
            group: portfolioData.skills.embedded_iot
        },
        {
            code: 'BANK C5',
            bank: 'C1', // Links to primary analytics core
            spec: '+12V · 6800µF · DATA PIPELINE',
            metric: '1.2 TB/DAY',
            latency: 'ZERO-COPY SHM',
            pct: 94,
            colorHex: '#38bdf8',
            label: 'Data Science & Analytical Pipelines',
            group: portfolioData.skills.data_analytics
        }
    ];

    const filterBarHtml = `
    <div class="skill-filter-bar" role="tablist">
        <button type="button" class="skill-filter-btn active" data-filter="all">ALL CAPACITORS</button>
        <button type="button" class="skill-filter-btn" data-filter="C1">C1 // AI & VISION</button>
        <button type="button" class="skill-filter-btn" data-filter="C2">C2 // BACKEND</button>
        <button type="button" class="skill-filter-btn" data-filter="C3">C3 // WEBGL 3D</button>
        <button type="button" class="skill-filter-btn" data-filter="C4">C4 // EMBEDDED</button>
    </div>`;

    const cardsHtml = skillCategories
        .map((cat) => {
            const items = cat.group || [];
            return `
            <div class="skill-group" data-bank="${cat.bank}" style="--bank-accent: ${cat.colorHex};">
                <div class="skill-group-head">
                    <div class="skill-head-top">
                        <span class="skill-group-code">${esc(cat.code)}</span>
                        <span class="skill-bank-spec">${esc(cat.spec)}</span>
                    </div>
                    <h3 class="skill-group-label">${esc(cat.label)}</h3>
                </div>
                <div class="skill-metric-row">
                    <span class="skill-metric-badge">⚡ ${esc(cat.metric)}</span>
                    <span class="skill-metric-badge">⏱ ${esc(cat.latency)}</span>
                </div>
                <div class="skill-energy-meter">
                    <div class="skill-energy-label">CAPACITY // CHARGE RESERVE</div>
                    <div class="skill-energy-track">
                        <div class="skill-energy-fill" style="width: ${cat.pct}%; background: linear-gradient(90deg, ${cat.colorHex}88, ${cat.colorHex});"></div>
                    </div>
                    <span class="skill-energy-val">${cat.pct}%</span>
                </div>
                ${items.map((item) => `
                    <div class="capability-block">
                        <div class="capability-title">${esc(item.capability)}</div>
                        <div class="skill-pills">
                            ${item.techs.map((tech) => {
                                const role = skillRoles[tech] || 'BUS';
                                return `<span class="skill-pill" tabindex="0" title="Click to test ${esc(tech)} subsystem"><span class="pill-pad"></span>${esc(tech)}<span class="skill-role">${esc(role)}</span></span>`;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>`;
        })
        .join('');

    wrap.innerHTML = filterBarHtml + cardsHtml;

    // 1. Filter bar interactive tabs
    wrap.querySelectorAll('.skill-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            wrap.querySelectorAll('.skill-filter-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.getAttribute('data-filter') || 'all';
            relayClick();

            // Toggle card visibility
            wrap.querySelectorAll('.skill-group').forEach((card) => {
                const el = /** @type {HTMLElement} */ (card);
                const b = el.getAttribute('data-bank');
                const show = filter === 'all' || b === filter;
                el.style.display = show ? 'block' : 'none';
            });

            // Focus and energize selected capacitor on 3D board
            if (filter !== 'all' && BANK_X[filter]) {
                energizeCapacitor(filter, 2.6);
                flyProbeTo(BANK_X[filter]);
                emitUartLog('ROBOT', `PROBE TARGETED TO CAPACITOR BANK ${filter} · SPOTLIGHT LOCK`);
            } else {
                ['C1', 'C2', 'C3', 'C4'].forEach((cid, i) => {
                    setTimeout(() => energizeCapacitor(cid, 2.0), i * 70);
                });
                flyProbeTo(3.2);
            }
        });
    });

    // 2. Wire bilateral 3D hover sync and tactile feedback
    wrap.querySelectorAll('.skill-group').forEach((card) => {
        const bank = card.getAttribute('data-bank') || 'C1';
        card.addEventListener('mouseenter', () => {
            energizeCapacitor(bank, 2.2);
            relayClick();
            const label = card.querySelector('.skill-group-label')?.textContent || '';
            emitUartLog('PWR', `ENERGIZING BANK ${bank} [${label}] · HIGH VOLTAGE RAIL ACTIVE`);
            if (BANK_X[bank]) flyProbeTo(BANK_X[bank]);
        });

        // 3. Interactive click-to-zap on individual skill pills
        card.querySelectorAll('.skill-pill').forEach((pill) => {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                energizeCapacitor(bank, 2.5);
                pill.classList.add('pill-zapped');
                setTimeout(() => pill.classList.remove('pill-zapped'), 600);
                clickBlip();
                const tech = pill.childNodes[1]?.textContent?.trim() || 'CORE';
                emitUartLog('EXEC', `ZAPPING SUBSYSTEM [${tech}] · BUS INTERCONNECT VERIFIED`);
                if (BANK_X[bank]) flyProbeTo(BANK_X[bank]);
            });
        });
    });
}

// Experience — FW UPDATE Timeline & Firmware Management Subsystem
function renderTimeline() {
    const list = document.getElementById('timeline-list');
    if (!list) return;

    const storageHeaderHtml = `
    <div class="rom-storage-bar">
        <div class="rom-storage-meta">
            <span class="rom-title">EEPROM // W25Q128 NOR FLASH</span>
            <span class="rom-stat">16.4 KB / 128 KB (12.8% ALLOCATED)</span>
        </div>
        <div class="rom-track">
            <div class="rom-fill" style="width: 12.8%;"></div>
        </div>
    </div>
    <div class="timeline-filter-bar" role="tablist">
        <button type="button" class="fw-filter-btn active" data-filter="all">ALL FIRMWARE</button>
        <button type="button" class="fw-filter-btn" data-filter="internship">v2.x INTERNSHIPS</button>
        <button type="button" class="fw-filter-btn" data-filter="hackathon">v1.5 HACKATHONS</button>
        <button type="button" class="fw-filter-btn" data-filter="academic">v1.0 ACADEMIC</button>
    </div>`;

    const cardsHtml = portfolioData.timeline
        .map((t, idx) => {
            const isLatest = idx === 0;
            const diffs = t.diffs || [];
            const metrics = t.metrics || [];
            return `
        <div class="tl-item" data-category="${esc(t.category || 'all')}">
            <div class="tl-marker ${isLatest ? 'tl-marker-latest' : ''}"><span class="tl-pulse"></span></div>
            <div class="tl-content ${isLatest ? 'tl-content-active' : ''}">
                <div class="tl-head-row">
                    <div class="tl-badge-group">
                        <span class="fw-badge ${isLatest ? 'fw-badge-latest' : ''}">${esc(t.version || 'FW UPDATE')}</span>
                        ${isLatest ? '<span class="fw-live-badge"><span class="live-dot"></span>ACTIVE ROM</span>' : ''}
                        <span class="fw-commit">${esc(t.commit || '')}</span>
                    </div>
                    <span class="tl-date">${esc(t.date)}</span>
                </div>
                <h3 class="tl-title">${esc(t.title)}</h3>
                <div class="tl-target-arch">TARGET: <code>${esc(t.target || 'ARM CORTEX')}</code> · SECTOR: <code>${esc(t.sector || '0x004000')}</code></div>
                <div class="tl-detail">${esc(t.detail)}</div>

                <div class="tl-metrics-row">
                    ${metrics.map(m => `<span class="tl-metric-chip">⚡ ${esc(m)}</span>`).join('')}
                </div>

                <div class="tl-diff-block">
                    <div class="diff-header">// FIRMWARE CHANGELOG DIFF</div>
                    <ul class="diff-list">
                        ${diffs.map(d => `
                            <li class="diff-line diff-${esc(d.type)}">
                                <span class="diff-sign">${d.type === 'add' ? '+' : d.type === 'mod' ? '~' : '*'}</span>
                                <span class="diff-text">${esc(d.text)}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>

                <div class="tl-actions-row">
                    <button type="button" class="btn-burn-fw" data-version="${esc(t.version)}" data-sector="${esc(t.sector || '0x004000')}">
                        <span class="burn-icon">⚡</span> BURN TO ROM
                    </button>
                    <button type="button" class="btn-toggle-hex" data-sector="${esc(t.sector || '0x004000')}">
                        [HEX DUMP]
                    </button>
                    <span class="fw-crc">${esc(t.checksum || 'CRC32: VALID')}</span>
                </div>

                <div class="tl-hex-drawer" style="display: none;">
                    <div class="hex-bar">// SECTOR ${esc(t.sector || '0x004000')} · BYTE DUMP</div>
                    <pre class="hex-pre"><code>${esc(t.hexDump || '')}</code></pre>
                </div>
            </div>
        </div>`;
        })
        .join('');

    list.innerHTML = storageHeaderHtml + cardsHtml;

    // 1. Wire filter tabs
    list.querySelectorAll('.fw-filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            list.querySelectorAll('.fw-filter-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.getAttribute('data-filter') || 'all';
            relayClick();
            list.querySelectorAll('.tl-item').forEach((item) => {
                const el = /** @type {HTMLElement} */ (item);
                const cat = el.getAttribute('data-category');
                const show = filter === 'all' || cat === filter;
                el.style.display = show ? 'block' : 'none';
            });
            emitUartLog('ROM', `FIRMWARE FILTER: [${filter.toUpperCase()}] · SECTORS LOADED`);
        });
    });

    // 2. Wire burn firmware actions
    list.querySelectorAll('.btn-burn-fw').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ver = btn.getAttribute('data-version') || 'FW';
            const sector = btn.getAttribute('data-sector') || '0x004000';
            clickBlip();
            triggerFirmwareFlashAnim(ver);
            emitUartLog('FLASH', `BURNING FIRMWARE [${ver}] TO SECTOR ${sector} · VERIFYING CHECKSUM`);
            const origText = btn.innerHTML;
            btn.innerHTML = '<span class="burn-icon">✓</span> FLASHED TO ROM';
            btn.classList.add('btn-burned');
            setTimeout(() => {
                btn.innerHTML = origText;
                btn.classList.remove('btn-burned');
            }, 1200);
        });
    });

    // 3. Wire Hex Dump toggle drawer
    list.querySelectorAll('.btn-toggle-hex').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const parent = btn.closest('.tl-content');
            if (!parent) return;
            const drawer = /** @type {HTMLElement | null} */ (parent.querySelector('.tl-hex-drawer'));
            if (!drawer) return;
            const isOpen = drawer.style.display === 'block';
            drawer.style.display = isOpen ? 'none' : 'block';
            btn.textContent = isOpen ? '[HEX DUMP]' : '[HIDE HEX]';
            clickBlip();
        });
    });

    // 4. Hover sync with 3D board
    list.querySelectorAll('.tl-item').forEach((card) => {
        card.addEventListener('mouseenter', () => {
            const ver = card.querySelector('.fw-badge')?.textContent || 'FW';
            emitUartLog('ROM', `PROBING FIRMWARE IMAGE [${ver}] · SPI BUS ACTIVE`);
        });
    });
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

