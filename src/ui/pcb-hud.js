// ============================================================
// PCB HUD — renders diagnostic terminal and tooltip overlays
// ============================================================
import { portfolioData } from '../data/portfolio.js';
import { activeComponentRef } from '../utils/camera-states.js';

let hudTooltip = null;

// ─── Init ───────────────────────────────────────────────────

export function initHud() {
    hudTooltip = document.getElementById('hud-terminal');
    if (!hudTooltip) {
        hudTooltip = document.createElement('div');
        hudTooltip.id = 'hud-terminal';
        hudTooltip.className = 'pcb-hud-layout';
        document.body.appendChild(hudTooltip);
    }
    hudTooltip.style.opacity = '0';
    hudTooltip.style.transform = 'translateY(10px)';
}

export function hideHud() {
    if (!hudTooltip) return;
    hudTooltip.style.opacity = '0';
    hudTooltip.style.transform = 'translateY(10px)';
}

// ─── Top-Level PCB Hover HUD ────────────────────────────────

export function renderComponentHUD(name) {
    if (!hudTooltip) return;

    hudTooltip.style.opacity = '1';
    hudTooltip.style.transform = 'translateY(0)';

    const HUD_MAP = {
        'U1': {
            title: '// DEVICE: U1 MAIN PROCESSOR (MCU)',
            rows: [
                ['SYS REG :', 'ECE_MCU_v2.0'],
                ['SECTION :', 'ABOUT ME & GENERAL SKILLS'],
                ['SIGNAL  :', '97.4% (ACTIVE)'],
            ],
            action: '>> CLICK COMPONENT TO EXPLORE SILICON CORES...'
        },
        'U2': {
            title: '// DEVICE: U2 GRAPHICS CO-PROCESSOR',
            rows: [
                ['SYS REG :', 'GPU_CORE_v1.0'],
                ['SECTION :', 'PROJECTS REGISTRY'],
                ['PIPELINE:', 'OPTIMIZED PARALLEL'],
            ],
            action: '>> CLICK COMPONENT TO INSPECT COMPILED WORK...'
        },
        'Y1': {
            title: '// DEVICE: Y1 SYSTEM CLOCK GENERATOR',
            rows: [
                ['SYS REG :', 'CLK_OSC_27.000MHz'],
                ['SECTION :', 'EDUCATION CHRONOLOGY'],
                ['ACCURACY:', '+- 5 PPM (HIGH)'],
            ],
            action: '>> CLICK COMPONENT TO VIEW TIMED MILESTONES...'
        },
        'ANT1': {
            title: '// DEVICE: ANT1 TRANSCEIVER ANTENNA',
            rows: [
                ['SYS REG :', 'RF_ANT_TRANSCEIVER'],
                ['SECTION :', 'CONTACTS & GATEWAY'],
                ['LINK    :', 'ESTABLISHED (100% QUALITY)'],
            ],
            action: '>> CLICK COMPONENT TO ROUTE CHANNELS...'
        },
        'J1': {
            title: '// DEVICE: J1 USB-C SYSTEM BUS',
            rows: [
                ['SYS REG :', 'USB_PD_CONTROL'],
                ['SECTION :', 'INTERNSHIPS & WORK LOGS'],
                ['SPEED   :', '10 GBPS (USB 3.1)'],
            ],
            action: '>> CLICK COMPONENT TO FETCH SYSTEM LOGS...'
        },
        'VR1': {
            title: '// DEVICE: VR1 VOLTAGE REGULATOR',
            rows: [
                ['SYS REG :', 'BUCK_BOOST_1.8V_3.3V'],
                ['SECTION :', 'TOOLS & LANGUAGES STACK'],
                ['TEMP    :', '38.6 C (STABLE)'],
            ],
            action: '>> CLICK COMPONENT TO SOLVE THERMALS...'
        },
        'D1-D7': {
            title: '// DEVICE: LED ARRAY D1-D7',
            rows: [
                ['SYS REG :', 'LED_BAR_INDICATOR'],
                ['SECTION :', 'VALIDATED CERTIFICATIONS'],
                ['BUS     :', 'SPI CONTROLLED'],
            ],
            action: '>> CLICK COMPONENT TO BLINK STATUS REGISTERS...'
        },
        'RN1': {
            title: '// DEVICE: RN1 RESISTOR NETWORK',
            rows: [
                ['SYS REG :', 'PULL_UP_RES_10K'],
                ['SECTION :', 'LANGUAGES BUS'],
                ['STAT    :', 'PULL-UPS ENERGISED'],
            ],
            action: '>> STABLE INTERCONNECTION REFERENCE'
        }
    };

    // Handle test points dynamically
    if (name.startsWith('TP')) {
        hudTooltip.innerHTML = buildHudHtml(
            `// DEVICE: ${name} TEST PAD`,
            [['SYS REG :', 'DIAGNOSTIC_PAD'], ['VOLTAGE :', name === 'TP1' ? '5.01 V' : '0.00 V']],
            '>> STABILIZED TEST VOLTAGE LEVEL'
        );
        return;
    }

    const entry = HUD_MAP[name];
    if (!entry) {
        hideHud();
        return;
    }

    hudTooltip.innerHTML = buildHudHtml(entry.title, entry.rows, entry.action);
}

// ─── Zoomed Sub-Core HUD ────────────────────────────────────

export function renderSubcoreHUD(name) {
    if (!hudTooltip) return;

    hudTooltip.style.opacity = '1';
    hudTooltip.style.transform = 'translateY(0)';

    const data = portfolioData;

    if (name.startsWith('core_')) {
        renderCoreHud(name, data);
    } else if (name.startsWith('proj_core_')) {
        renderProjectHud(name, data);
    } else if (name.startsWith('edu_plate_')) {
        renderEducationHud(name, data);
    } else if (name.startsWith('usb_contact_')) {
        renderExperienceHud(name, data);
    } else if (name.startsWith('vr_fin_')) {
        renderStackHud(name, data);
    } else if (name === 'ant_receiver') {
        renderContactHud(data);
    }
}

export function renderZoomedDefaultHUD() {
    if (!hudTooltip) return;

    hudTooltip.style.opacity = '1';
    hudTooltip.style.transform = 'translateY(0)';

    const LABEL_MAP = {
        'U1': ['U1 CPU REGISTER INSPECT', 'Hover over CPU core blocks (ALU, NPU, Control Unit, I/O Core) to explore skills registers.'],
        'U2': ['U2 GPU PROJECTS CORES', 'Hover over the 6 execution units of the GPU to inspect project codebases.'],
        'Y1': ['Y1 CRYSTAL TIMELINE', 'Hover over quartz timing plates to trace education frequencies.'],
        'ANT1': ['ANT1 ANTENNA CHIP', 'Hover over transceiver core to display broadcast links.'],
        'J1': ['J1 USB BUS PINS', 'Hover over metal contact connections to list intern role details.'],
        'VR1': ['VR1 REGULATOR STACK', 'Hover over metal regulator fins to filter engineering stack utilities.']
    };

    const entry = LABEL_MAP[activeComponentRef];
    const title = entry ? entry[0] : 'MICROARCHITECTURE CORE';
    const label = entry ? entry[1] : 'Hover over silicon core blocks or pins to analyze architecture.';

    hudTooltip.innerHTML = `
        <div class="hud-system-status">[DIAGNOSTICS ONLINE]</div>
        <div class="hud-component-title">${title}</div>
        <div style="font-size:11px;margin-top:6px;color:#94a3b8;line-height:1.4;">${label}</div>
    `;
}

// ─── Private Helpers ────────────────────────────────────────

function buildHudHtml(title, rows, action) {
    return `
        <div class="hud-title">${title}</div>
        ${rows.map(([lbl, val]) =>
            `<div class="hud-row"><span class="hud-lbl">${lbl}</span> ${val}</div>`
        ).join('')}
        <div class="hud-action">${action}</div>
    `;
}

function renderCoreHud(name, data) {
    const CORE_MAP = {
        core_alu: {
            title: 'ALU CORE - DATA SCIENCE & ANALYTICS',
            desc: 'Runs calculations, database transforms, and statistical analytics.',
            skills: data.skills.data
        },
        core_npu: {
            title: 'NPU NEURAL ENGINE - AI / ML',
            desc: 'Handles vision networks, tensor matrix operations, and inference.',
            skills: data.skills.ai_ml
        },
        core_cu: {
            title: 'CU CORE - LANGUAGES & WEB DEV',
            desc: 'Coordinates execution stacks, API structures, and servers.',
            skills: data.skills.web
        },
        core_io: {
            title: 'I/O CORE - HARDWARE & IoT',
            desc: 'Interfaces board signals with physical hardware, sensors, and DOM.',
            skills: data.skills.hardware
        }
    };
    const core = CORE_MAP[name] || CORE_MAP.core_io;
    hudTooltip.innerHTML = `
        <div class="hud-system-status">[U1 CORE: ACTIVE]</div>
        <div class="hud-component-title">${core.title}</div>
        <div class="hud-core-desc">${core.desc}</div>
        <div class="hud-skills-title">Active Registers (Skills):</div>
        <ul class="hud-skills-items">${core.skills.map(s => `<li>${s}</li>`).join('')}</ul>
    `;
}

function renderProjectHud(name, data) {
    const index = parseInt(name.split('_').pop()) - 1;
    const proj = data.projects[index];
    if (!proj) return;

    hudTooltip.innerHTML = `
        <div class="hud-system-status">[U2 CORE PROJECT 0${index + 1}: ONLINE]</div>
        <div class="hud-component-title">${proj.title}</div>
        <div class="hud-core-desc">${proj.description}</div>
        <div class="hud-skills-title">Project Stack / Tags:</div>
        <ul class="hud-skills-items">${proj.tags.map(t => `<li>${t}</li>`).join('')}</ul>
        <div style="margin-top:12px;font-size:11px;">
            <a href="${proj.github}" target="_blank" style="color:#60a5fa;text-decoration:none;" rel="noopener noreferrer">&gt; VISIT GITHUB REPOSITORY</a>
        </div>
    `;
}

function renderEducationHud(name, data) {
    const idx = parseInt(name.split('_').pop()) - 1;
    const edu = data.education[idx];
    if (!edu) return;

    hudTooltip.innerHTML = `
        <div class="hud-system-status">[Y1 CRYSTAL NODE: SYNCHRONIZED]</div>
        <div class="hud-component-title">${edu.degree}</div>
        <div class="hud-core-desc">
            <strong>Institution:</strong> ${edu.institution}<br>
            <strong>Duration:</strong> ${edu.duration}
        </div>
        <div class="hud-skills-title">Result Score:</div>
        <div style="color:#00ff88;font-weight:bold;">${edu.grade}</div>
    `;
}

function renderExperienceHud(name, data) {
    const exp = data.experience[0];
    if (!exp) return;

    const TOPIC_MAP = {
        usb_contact_1: ['Role & Company', `${exp.role} @ <span style="color:#00ff88;">${exp.company}</span><br>Duration: ${exp.duration}<br>Location: ${exp.location}`],
        usb_contact_2: ['Project Work', 'Backend API development using Python and Django. Integrated services and managed schemas.'],
        usb_contact_3: ['Collaboration & Debugging', 'Participated in bug testing, feature implementation, and engineering scrum team discussions.']
    };
    const [topic, info] = TOPIC_MAP[name] || ['General', 'Experience log entry'];

    hudTooltip.innerHTML = `
        <div class="hud-system-status">[J1 PIN BUS: LOCKED]</div>
        <div class="hud-component-title">Experience Node</div>
        <div class="hud-core-desc">${info}</div>
        <div class="hud-skills-title">Data Category:</div>
        <div style="color:#ff8800;font-size:11px;">${topic}</div>
    `;
}

function renderStackHud(name, data) {
    const finIdx = parseInt(name.split('_').pop()) - 1;
    const categories = ['languages', 'frameworks', 'ai_ml', 'tools', 'cloud'];
    const catName = categories[finIdx] || 'tools';
    const tags = data.stack[catName];

    hudTooltip.innerHTML = `
        <div class="hud-system-status">[VR1 HEATSINK FIN 0${finIdx + 1}: STABLE]</div>
        <div class="hud-component-title">${catName.toUpperCase()} REGISTER</div>
        <div class="hud-core-desc">Cooling stack for system software configurations.</div>
        <div class="hud-skills-title">Integrated Tools:</div>
        <ul class="hud-skills-items">${tags.map(t => `<li>${t}</li>`).join('')}</ul>
    `;
}

function renderContactHud(data) {
    const info = data.personalInfo;
    hudTooltip.innerHTML = `
        <div class="hud-system-status">[ANT1 BROADCASTER ACTIVE]</div>
        <div class="hud-component-title">Contact Channels</div>
        <div class="hud-core-desc" style="font-size:11px;line-height:1.6;">
            <strong>Email:</strong> ${info.email}<br>
            <strong>Phone:</strong> ${info.phone}<br>
            <strong>Location:</strong> ${info.location}<br>
            <strong>Status:</strong> Open to Collaborations
        </div>
        <div class="hud-skills-title">Transmission Paths:</div>
        <div style="font-size:11px;margin-top:5px;">
            <a href="${info.socials.github}" target="_blank" style="color:#60a5fa;text-decoration:none;" rel="noopener noreferrer">GitHub</a> |
            <a href="${info.socials.linkedin}" target="_blank" style="color:#60a5fa;text-decoration:none;" rel="noopener noreferrer">LinkedIn</a>
        </div>
    `;
}
