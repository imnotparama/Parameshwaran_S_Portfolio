// @ts-check
// ============================================================
// Primary Uplink Contact Terminal & Aerospace Telemetry Engine
// Handles live RTT jitter, Chennai station clock, dual-mode tabs,
// one-click clipboard copy with badges, frequency band switching,
// interactive packet injection form, and raw UART terminal console.
// ============================================================
import { triggerRfBurst } from '../three/rf-wavefront.js';
import { toggleDelidCpu } from '../three/components.js';
import { launchPaperAirplane } from '../three/paper-airplane.js';
import { RESUME_URL, LINKEDIN_URL, GITHUB_URL } from '../config.js';

const VCARD_DATA = {
    name: 'Parameshwaran S',
    callsign: 'PARAMA CORE-X',
    title: 'Software Engineer & AI/ML Systems Specialist',
    location: 'Chennai, Tamil Nadu, India',
    email: 'hunterparama@gmail.com',
    phone: '+91 9176020504',
    linkedin: LINKEDIN_URL || 'https://linkedin.com/in/imnotparama',
    github: GITHUB_URL || 'https://github.com/imnotparama',
    station: 'SRM Ramapuram ECE-2026 // Parama Labs'
};

/** @type {ReturnType<typeof setInterval> | null} */
let clockInterval = null;
/** @type {ReturnType<typeof setInterval> | null} */
let rttInterval = null;

/**
 * Initialize all interactive transmission elements on #panel-contact.
 */
export function initContactTerminal() {
    const contactPanel = document.getElementById('panel-contact');
    if (!contactPanel) return;

    // 1. Live Chennai IST Clock
    const clockEl = document.getElementById('chennai-clock');
    if (clockEl) {
        const updateClock = () => {
            try {
                const now = new Date();
                const istTime = now.toLocaleTimeString('en-GB', {
                    timeZone: 'Asia/Kolkata',
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                clockEl.textContent = `${istTime} IST`;
            } catch {
                clockEl.textContent = '11:42:00 IST';
            }
        };
        updateClock();
        if (clockInterval) clearInterval(clockInterval);
        clockInterval = setInterval(updateClock, 1000);
    }

    // 2. Live Ping / RTT Latency Jitter
    const rttEl = document.getElementById('rtt-counter');
    if (rttEl) {
        if (rttInterval) clearInterval(rttInterval);
        rttInterval = setInterval(() => {
            const jitter = Math.floor(11 + Math.random() * 5);
            rttEl.textContent = `${jitter}ms`;
        }, 2400);
    }

    // 3. Dual-Mode View Tabs (Direct Uplink vs Raw UART Console)
    const tabCards = document.getElementById('tab-uplink-cards');
    const tabTerminal = document.getElementById('tab-uplink-terminal');
    const cardsView = document.getElementById('uplink-cards-view');
    const terminalView = document.getElementById('uplink-terminal-view');

    if (tabCards && tabTerminal && cardsView && terminalView) {
        tabCards.addEventListener('click', () => {
            tabCards.classList.add('active');
            tabTerminal.classList.remove('active');
            cardsView.classList.remove('hidden');
            terminalView.classList.add('hidden');
        });

        tabTerminal.addEventListener('click', () => {
            tabTerminal.classList.add('active');
            tabCards.classList.remove('active');
            terminalView.classList.remove('hidden');
            cardsView.classList.add('hidden');
            const termInput = document.getElementById('uart-terminal-input');
            if (termInput) termInput.focus();
        });
    }

    // 4. Frequency Band Selector Toggle
    const freqBtns = document.querySelectorAll('.freq-band-chip');
    const freqLabel = document.getElementById('current-rf-band');
    freqBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            freqBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const band = btn.getAttribute('data-band') || '2.4GHz ISM';
            if (freqLabel) freqLabel.textContent = band;
            triggerRfBurst();
        });
    });

    // 5. One-Click Clipboard Copy Buttons
    const copyBtns = document.querySelectorAll('.js-copy-btn');
    copyBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const textToCopy = btn.getAttribute('data-copy') || '';
            if (!textToCopy) return;

            copyToClipboard(textToCopy, btn);
        });
    });

    // 6. One-Click Copy vCard Packet (JSON)
    const copyVcardBtn = document.getElementById('btn-copy-vcard');
    if (copyVcardBtn) {
        copyVcardBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const jsonPacket = JSON.stringify(VCARD_DATA, null, 2);
            copyToClipboard(jsonPacket, copyVcardBtn, '[PACKET COPIED]');
        });
    }

    // 7. Interactive Raw UART Terminal Form
    const termInput = /** @type {HTMLInputElement | null} */ (document.getElementById('uart-terminal-input'));
    const termLog = document.getElementById('uart-terminal-log');
    if (termInput && termLog) {
        termInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const cmd = termInput.value.trim();
                if (!cmd) return;
                executeTerminalCommand(cmd, termLog);
                termInput.value = '';
                termLog.scrollTop = termLog.scrollHeight;
            }
        });
    }

    // 8. Quick Packet Injection Form
    const packetForm = document.getElementById('packet-injection-form');
    const packetStatus = document.getElementById('packet-dispatch-status');
    if (packetForm) {
        packetForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const emailInput = /** @type {HTMLInputElement | null} */ (document.getElementById('packet-sender-email'));
            const msgInput = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('packet-message'));

            const sender = emailInput ? emailInput.value.trim() : '';
            const msg = msgInput ? msgInput.value.trim() : '';

            if (!sender || !msg) return;

            triggerRfBurst();

            if (packetStatus) {
                packetStatus.innerHTML = `<span class="text-emerald">PACKET_TRANSMITTED:</span> CRC32 verified. Opening mail client to dispatch...`;
            }

            // Launch mail client with pre-filled subject and body
            const subject = encodeURIComponent(`Transmission from ${sender} [Primary Uplink]`);
            const body = encodeURIComponent(`Sender: ${sender}\n\nMessage:\n${msg}\n\n---\nDispatched via Parameshwaran S Portfolio Transmission Interface`);
            setTimeout(() => {
                window.location.href = `mailto:hunterparama@gmail.com?subject=${subject}&body=${body}`;
            }, 600);
        });
    }
}

/**
 * Copy text to clipboard and temporarily show feedback badge.
 * @param {string} text
 * @param {Element} btn
 * @param {string} [feedbackMsg]
 */
function copyToClipboard(text, btn, feedbackMsg = '[COPIED]') {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = btn.textContent;
        btn.textContent = feedbackMsg;
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 1800);
    }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);

        const originalText = btn.textContent;
        btn.textContent = feedbackMsg;
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('copied');
        }, 1800);
    });
}

/**
 * Execute command in Raw UART Console.
 * @param {string} rawCmd
 * @param {HTMLElement} logEl
 */
function executeTerminalCommand(rawCmd, logEl) {
    const cmd = rawCmd.toLowerCase();
    const line = document.createElement('div');
    line.className = 'term-line';
    line.innerHTML = `<span class="term-prompt">UART_TX&gt;</span> <span class="term-input-echo">${escapeHtml(rawCmd)}</span>`;
    logEl.appendChild(line);

    const resp = document.createElement('div');
    resp.className = 'term-resp';

    switch (cmd) {
        case 'help':
            resp.innerHTML = `Available commands:<br>
  - <span class="text-emerald">ping</span> : Check round-trip time to Chennai station<br>
  - <span class="text-emerald">status</span> : Report board power rails and thermal state<br>
  - <span class="text-emerald">email</span> : Print primary email address<br>
  - <span class="text-emerald">phone</span> : Print direct telecom line<br>
  - <span class="text-emerald">linkedin</span> : Print LinkedIn uplink URL<br>
  - <span class="text-emerald">github</span> : Print GitHub repository URL<br>
  - <span class="text-emerald">resume</span> : Launch firmware specification download<br>
  - <span class="text-emerald">delid</span> : Inspect bare silicon die on U1 CPU<br>
  - <span class="text-emerald">clear</span> : Clear console buffer`;
            break;
        case 'ping':
            resp.innerHTML = `PONG! Round-trip latency: <span class="text-emerald">12ms</span> // Station: CHENNAI, INDIA // Link: ACTIVE`;
            triggerRfBurst();
            break;
        case 'status':
            resp.innerHTML = `SYSTEM_STATUS: ALL NOMINAL<br>
  - CORE_VCC: 3.30V STABLE<br>
  - DIE_TEMP: 42.1°C (SAFE)<br>
  - RF_CARRIER: 2.4GHz ISM<br>
  - RECRUITING_FLAG: OPEN_FOR_HIRE (AI/ML & SWE)`;
            break;
        case 'email':
            resp.innerHTML = `PRIMARY // SMTP: <a href="mailto:hunterparama@gmail.com" class="text-emerald">hunterparama@gmail.com</a>`;
            break;
        case 'phone':
            resp.innerHTML = `VOICE // TELECOM: <a href="tel:+919176020504" class="text-emerald">+91 9176020504</a>`;
            break;
        case 'linkedin':
            resp.innerHTML = `UPLINK // NETWORK: <a href="${VCARD_DATA.linkedin}" target="_blank" class="text-emerald">${VCARD_DATA.linkedin}</a>`;
            break;
        case 'github':
            resp.innerHTML = `REPOSITORY // VCS: <a href="${VCARD_DATA.github}" target="_blank" class="text-emerald">${VCARD_DATA.github}</a>`;
            break;
        case 'resume':
        case 'firmware':
            resp.innerHTML = `LAUNCHING_FIRMWARE_SPEC... (<span class="text-emerald">resume.pdf</span>)`;
            launchPaperAirplane(RESUME_URL);
            break;
        case 'delid':
            toggleDelidCpu();
            resp.innerHTML = `IHS_TOGGLE: Bare silicon die inspection state altered.`;
            break;
        case 'clear':
            logEl.innerHTML = '';
            return;
        default:
            resp.innerHTML = `<span class="text-rose">Command not recognized: '${escapeHtml(cmd)}'.</span> Type '<span class="text-emerald">help</span>' for available telemetry instructions.`;
            break;
    }
    logEl.appendChild(resp);
}

/**
 * Escape HTML to prevent injection in terminal log.
 * @param {string} str
 */
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
