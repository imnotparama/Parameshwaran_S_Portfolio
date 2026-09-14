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
    initHeroSiliconStation();
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

// ─── Hero Silicon Station & Dual-Core Live Telemetry ─────────
/** @type {any} */
let siliconTelemetryInterval = null;
let currentClockMult = 1.0;
let isBenchmarkRunning = false;

export function initHeroSiliconStation() {
    const station = document.getElementById('hero-silicon-station');
    if (!station) return;

    const core0Freq = document.getElementById('core0-freq');
    const core0Bar = document.getElementById('core0-bar');
    const core0Load = document.getElementById('core0-load');
    const core0Temp = document.getElementById('core0-temp');
    const core0Volt = document.getElementById('core0-volt');

    const core1Freq = document.getElementById('core1-freq');
    const core1Bar = document.getElementById('core1-bar');
    const core1Load = document.getElementById('core1-load');
    const core1Temp = document.getElementById('core1-temp');
    const core1Volt = document.getElementById('core1-volt');

    const clockSlider = /** @type {HTMLInputElement | null} */ (document.getElementById('hero-clock-slider'));
    const clockMultVal = document.getElementById('hero-clock-mult-val');
    const btnBenchmark = document.getElementById('btn-run-benchmark');
    const rtosLogs = document.getElementById('hero-rtos-logs');

    // Fluctuating live telemetry loop
    if (siliconTelemetryInterval) clearInterval(siliconTelemetryInterval);
    siliconTelemetryInterval = setInterval(() => {
        if (isBenchmarkRunning) return;

        // Micro variations
        const jitter0 = (Math.random() - 0.5) * 0.08;
        const jitter1 = (Math.random() - 0.5) * 0.06;
        const f0 = (4.80 * currentClockMult + jitter0).toFixed(2);
        const f1 = (3.60 * currentClockMult + jitter1).toFixed(2);

        const load0 = Math.min(98, Math.max(35, Math.round(65 * (currentClockMult > 1.2 ? 1.25 : 1.0) + (Math.random() - 0.5) * 20)));
        const load1 = Math.min(95, Math.max(25, Math.round(40 * (currentClockMult > 1.2 ? 1.2 : 1.0) + (Math.random() - 0.5) * 16)));

        const temp0 = Math.round(42 + (currentClockMult - 1.0) * 28 + load0 * 0.12);
        const temp1 = Math.round(38 + (currentClockMult - 1.0) * 22 + load1 * 0.10);

        const volt0 = (1.12 + (currentClockMult - 1.0) * 0.22 + (Math.random() - 0.5) * 0.02).toFixed(2);
        const volt1 = (1.02 + (currentClockMult - 1.0) * 0.18 + (Math.random() - 0.5) * 0.02).toFixed(2);

        if (core0Freq) core0Freq.textContent = `${f0} GHz`;
        if (core0Bar) core0Bar.style.width = `${load0}%`;
        if (core0Load) core0Load.textContent = `${load0}%`;
        if (core0Temp) core0Temp.textContent = `${temp0}°C`;
        if (core0Volt) core0Volt.textContent = `${volt0}V`;

        if (core1Freq) core1Freq.textContent = `${f1} GHz`;
        if (core1Bar) core1Bar.style.width = `${load1}%`;
        if (core1Load) core1Load.textContent = `${load1}%`;
        if (core1Temp) core1Temp.textContent = `${temp1}°C`;
        if (core1Volt) core1Volt.textContent = `${volt1}V`;
    }, 700);

    // Clock Multiplier Slider
    if (clockSlider) {
        clockSlider.addEventListener('input', () => {
            currentClockMult = parseFloat(clockSlider.value) || 1.0;
            let label = '1.0x (NOMINAL)';
            if (currentClockMult >= 2.2) label = `${currentClockMult.toFixed(1)}x (EXTREME OC)`;
            else if (currentClockMult >= 1.6) label = `${currentClockMult.toFixed(1)}x (TURBO BOOST)`;
            else if (currentClockMult > 1.0) label = `${currentClockMult.toFixed(1)}x (OVERCLOCKED)`;

            if (clockMultVal) clockMultVal.textContent = label;
        });
    }

    // Benchmark Stress Test Action
    if (btnBenchmark && rtosLogs) {
        btnBenchmark.addEventListener('click', () => {
            if (isBenchmarkRunning) return;
            isBenchmarkRunning = true;
            btnBenchmark.setAttribute('disabled', 'true');
            btnBenchmark.style.opacity = '0.6';

            // Flare bars to 99% load & amber/red
            if (core0Bar) {
                core0Bar.style.width = '100%';
                core0Bar.style.background = 'linear-gradient(90deg, #ff8800, #ff4444)';
            }
            if (core1Bar) {
                core1Bar.style.width = '98%';
                core1Bar.style.background = 'linear-gradient(90deg, #ff8800, #ff4444)';
            }
            if (core0Load) core0Load.textContent = '100%';
            if (core1Load) core1Load.textContent = '98%';
            if (core0Temp) core0Temp.textContent = '86°C';
            if (core1Temp) core1Temp.textContent = '79°C';

            // Emit rolling log lines
            const appendLog = (/** @type {string} */ msg) => {
                const line = document.createElement('div');
                line.className = 'log-line';
                line.textContent = msg;
                rtosLogs.appendChild(line);
                if (rtosLogs.children.length > 5) {
                    rtosLogs.removeChild(rtosLogs.children[0]);
                }
            };

            appendLog(`[STRESS] Running 64-bit FP16 matrix GEMM benchmark...`);
            setTimeout(() => appendLog(`[STRESS] Neural DMA throughput: 14.8 TFLOPS`), 1000);
            setTimeout(() => appendLog(`[STRESS] Memory bandwidth verified: 51.2 GB/s (99.8% hit rate)`), 2200);
            setTimeout(() => {
                appendLog(`[STRESS] BENCHMARK COMPLETE: 9,942 DMIPS // STABILITY: 100%`);
                isBenchmarkRunning = false;
                btnBenchmark.removeAttribute('disabled');
                btnBenchmark.style.opacity = '1.0';
                if (core0Bar) core0Bar.style.background = 'linear-gradient(90deg, #14b8a6, #3ee6a0)';
                if (core1Bar) core1Bar.style.background = 'linear-gradient(90deg, #14b8a6, #3ee6a0)';
            }, 3800);
        });
    }
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

