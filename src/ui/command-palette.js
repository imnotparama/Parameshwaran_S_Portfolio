// @ts-check
// ============================================================
// BIOS Terminal Command Palette — Ctrl+K / Cmd+K
//
// A retro phosphor-green terminal modal with fuzzy search over
// all portfolio sections, projects, utility toggles, and links.
// Keyboard navigation: ↑/↓ move selection, Enter executes,
// Esc closes.
//
// Usage: initCommandPalette(deps) once after DOM ready.
//        openCommandPalette() / closeCommandPalette() from keybind.
// ============================================================

/** @typedef {{ scrollToSection: (id: string) => void, togglePower: () => void, toggleSound: () => void, activateProbe: () => void, deactivateProbe: () => void, toggleSysinfo: () => void, toggleDebug: () => void, toggleTeardown?: () => void, toggleOverclock?: () => void, toggleRover?: () => void, cycleTheme?: () => void, linkedinUrl: string, githubUrl: string }} CPDeps */

/** @type {CPDeps | null} */
let deps = null;
/** @type {HTMLElement | null} */
let paletteEl = null;
/** @type {HTMLInputElement | null} */
let inputEl = null;
/** @type {HTMLElement | null} */
let resultsEl = null;
let activeIdx = -1;
let allCommands = /** @type {Array<{label: string, hint: string, icon: string, exec: () => void}>} */ ([]);

/** Build the command registry from deps. */
function buildCommands() {
    if (!deps) return;
    allCommands = [
        // ── Navigation — subsystems, not pages. Each hint keeps the ref so
        // the terminal reads as a bus map; the plain section names live in
        // the labels' parentheses so typing 'about' still finds its module.
        { icon: '▶', label: 'Core Processor (About)',        hint: 'U1 · CPU',      exec: () => deps && deps.scrollToSection('sec-about') },
        { icon: '▶', label: 'Expansion Modules (Projects)',  hint: 'U2 · GPU',      exec: () => deps && deps.scrollToSection('sec-projects') },
        { icon: '▶', label: 'Component Library (Skills)',    hint: 'C1–C4 · CAP',   exec: () => deps && deps.scrollToSection('sec-skills') },
        { icon: '▶', label: 'Signal History (Experience)',   hint: 'J1 · USB',      exec: () => deps && deps.scrollToSection('sec-experience') },
        { icon: '▶', label: 'Transmission Interface (Contact)', hint: 'ANT1 · RF',  exec: () => deps && deps.scrollToSection('sec-contact') },
        { icon: '⌂',  label: 'Go to Home',                    hint: 'HERO · BOARD',  exec: () => deps && deps.scrollToSection('sec-hero') },
        // ── Utilities
        { icon: '🏎️', label: 'Drive PCB Nano-Rover',           hint: 'R · Drive Mode', exec: () => deps && deps.toggleRover && deps.toggleRover() },
        { icon: '◫', label: '3D Hardware Teardown (Explode)', hint: 'E · 5-Layer',   exec: () => deps && deps.toggleTeardown && deps.toggleTeardown() },
        { icon: '⚡', label: 'Turbo Overclock (100MHz / 5V)', hint: 'T · High-Voltage', exec: () => deps && deps.toggleOverclock && deps.toggleOverclock() },
        { icon: '🎨', label: 'Cycle Board Theme',             hint: 'ENIG / 24K / Cyber / Stealth', exec: () => deps && deps.cycleTheme && deps.cycleTheme() },
        { icon: '◉', label: 'Toggle Night Bench',             hint: 'P · PWR LED',   exec: () => deps && deps.togglePower() },
        { icon: '♪', label: 'Toggle Sound',                   hint: 'SND toggle',    exec: () => deps && deps.toggleSound() },
        { icon: '✜', label: 'Fly Probe',                      hint: 'WASD · scope',  exec: () => deps && deps.activateProbe() },
        { icon: '⟳', label: 'Reset to Top',                   hint: 'HERO · BOARD',  exec: () => deps && deps.scrollToSection('sec-hero') },
        // ── Secret engineering readouts (easter eggs) — a reward for typing
        // beyond the obvious: serial, rail voltage, die temp, uptime, firmware,
        // and a raw FPS/frame debug view.
        { icon: '⚡', label: 'System Telemetry',               hint: 'SN · V · TEMP', exec: () => deps && deps.toggleSysinfo() },
        { icon: '⌬', label: 'Debug Overlay',                  hint: 'FPS · FRAME',   exec: () => deps && deps.toggleDebug() },
        // ── Links
        { icon: '⬡', label: 'Open LinkedIn',                  hint: 'Connect →',     exec: () => window.open(deps?.linkedinUrl, '_blank', 'noopener') },
        { icon: '⬡', label: 'Open GitHub',                    hint: 'Repos →',       exec: () => window.open(deps?.githubUrl, '_blank', 'noopener') },
    ];
}

/** @param {string} query */
function filteredCommands(query) {
    const q = query.toLowerCase().trim();
    if (!q) return allCommands;
    return allCommands.filter(c =>
        c.label.toLowerCase().includes(q) ||
        c.hint.toLowerCase().includes(q)
    );
}

function renderResults(query = '') {
    if (!resultsEl) return;
    const items = filteredCommands(query);
    activeIdx = items.length > 0 ? 0 : -1;
    resultsEl.innerHTML = '';
    items.forEach((cmd, i) => {
        const li = document.createElement('li');
        li.className = 'cmd-item' + (i === 0 ? ' cmd-active' : '');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === 0));
        li.innerHTML = `
            <span class="cmd-item-icon">${cmd.icon}</span>
            <span class="cmd-item-label">${cmd.label}</span>
            <span class="cmd-item-hint">${cmd.hint}</span>
        `;
        li.addEventListener('click', () => {
            cmd.exec();
            closeCommandPalette();
        });
        li.addEventListener('mouseover', () => {
            activeIdx = i;
            highlightActive();
        });
        if (resultsEl) resultsEl.appendChild(li);
    });
}

function highlightActive() {
    if (!resultsEl) return;
    const items = /** @type {NodeListOf<HTMLLIElement>} */ (resultsEl.querySelectorAll('.cmd-item'));
    items.forEach((el, i) => {
        el.classList.toggle('cmd-active', i === activeIdx);
        el.setAttribute('aria-selected', String(i === activeIdx));
        if (i === activeIdx) {
            el.scrollIntoView({ block: 'nearest' });
        }
    });
}

function executeActive() {
    if (!resultsEl) return;
    const query = inputEl ? inputEl.value : '';
    const items = filteredCommands(query);
    if (activeIdx >= 0 && activeIdx < items.length) {
        items[activeIdx].exec();
        closeCommandPalette();
    }
}

export function openCommandPalette() {
    if (!paletteEl || !inputEl) return;
    paletteEl.removeAttribute('hidden');
    paletteEl.classList.add('cmd-open');
    inputEl.value = '';
    renderResults('');
    inputEl.focus();
}

export function closeCommandPalette() {
    if (!paletteEl) return;
    paletteEl.classList.remove('cmd-open');
    paletteEl.setAttribute('hidden', '');
}

/** Wire up the command palette. Call once after DOM ready.
 * @param {CPDeps} depMap */
export function initCommandPalette(depMap) {
    deps = depMap;
    buildCommands();

    paletteEl  = document.getElementById('cmd-palette');
    inputEl    = /** @type {HTMLInputElement | null} */ (document.getElementById('cmd-input'));
    resultsEl  = document.getElementById('cmd-results');
    const overlay  = document.getElementById('cmd-overlay');
    const closeBtn = document.getElementById('cmd-close');

    if (!paletteEl || !inputEl || !resultsEl) return;

    // Overlay click closes
    if (overlay) overlay.addEventListener('click', closeCommandPalette);
    if (closeBtn) closeBtn.addEventListener('click', closeCommandPalette);

    // Input: filter results live
    inputEl.addEventListener('input', () => {
        renderResults(inputEl ? inputEl.value : '');
    });

    // Keyboard navigation inside the palette
    inputEl.addEventListener('keydown', (e) => {
        const items = filteredCommands(inputEl ? inputEl.value : '');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIdx = Math.min(activeIdx + 1, items.length - 1);
            highlightActive();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIdx = Math.max(activeIdx - 1, 0);
            highlightActive();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            executeActive();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeCommandPalette();
        }
    });

    renderResults('');
}
