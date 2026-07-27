let tooltipEl;

export function initTooltip() {
    tooltipEl = document.getElementById('pcb-tooltip');
    
    // Create tooltip dynamically if it doesn't exist
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'pcb-tooltip';
        tooltipEl.className = 'pcb-tooltip-hud';
        tooltipEl.style.position = 'fixed';
        tooltipEl.style.pointerEvents = 'none';
        tooltipEl.style.opacity = '0';
        tooltipEl.style.zIndex = '2000';
        tooltipEl.style.transition = 'opacity 0.2s ease';
        document.body.appendChild(tooltipEl);
    }

    // Follow mouse cursor
    window.addEventListener('mousemove', (e) => {
        if (tooltipEl && tooltipEl.style.opacity === '1') {
            const width = tooltipEl.offsetWidth;
            const height = tooltipEl.offsetHeight;
            
            // Adjust position offsets so it doesn't overflow screen boundaries
            let left = e.clientX + 16;
            let top = e.clientY - height - 12;

            if (left + width > window.innerWidth) {
                left = e.clientX - width - 16;
            }
            if (top < 0) {
                top = e.clientY + 20;
            }

            tooltipEl.style.left = `${left}px`;
            tooltipEl.style.top = `${top}px`;
        }
    });
}

export function showTooltip(refDesignator, componentName) {
    if (!tooltipEl) return;
    
    // Determine detailed datasheet fields based on designator reference
    let partType = 'MODULE';
    let desc = 'SMD Component';
    if (refDesignator === 'U1') { partType = 'MAIN CPU'; desc = 'About & Skills'; }
    else if (refDesignator === 'U2') { partType = 'DSP GPU'; desc = 'Projects Registry'; }
    else if (refDesignator === 'Y1') { partType = 'OSCILLATOR'; desc = 'Education'; }
    else if (refDesignator === 'ANT1') { partType = 'ANTENNA'; desc = 'Contact Details'; }
    else if (refDesignator === 'J1') { partType = 'USB-C PORT'; desc = 'Work Experience'; }
    else if (refDesignator === 'VR1') { partType = 'REGULATOR'; desc = 'Tech Stack'; }
    else if (refDesignator === 'D1-D7') { partType = 'LED ARRAY'; desc = 'Certifications'; }
    else if (refDesignator === 'RN1') { partType = 'RESISTOR NET'; desc = 'Languages Bus'; }
    else if (refDesignator.startsWith('TP')) { partType = 'TEST POINT'; desc = 'Diagnostic node'; }

    tooltipEl.innerHTML = `
        <div class="tooltip-frame">
            <span class="tooltip-label">REF:</span> <span class="tooltip-value">${refDesignator}</span>
            <span class="tooltip-label">PART:</span> <span class="tooltip-value">${partType}</span>
            <span class="tooltip-label">DESC:</span> <span class="tooltip-value">${desc}</span>
            <span class="tooltip-divider"></span>
            <span class="tooltip-hint">◈ Click to inspect</span>
        </div>
    `;
    tooltipEl.style.opacity = '1';
}

export function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.style.opacity = '0';
}
