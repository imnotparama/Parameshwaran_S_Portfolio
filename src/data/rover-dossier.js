// @ts-check
// ============================================================
// Rover Motherboard Proximity Dossier Catalog
//
// Real-world developer accomplishments, academic credentials,
// and project specifications mapped to physical PCB coordinates.
//
// NOTE: Raw schematic labels (e.g. "U1 Microcontroller") are
// strictly omitted from titles — only rich, authentic portfolio
// accomplishments and engineering details are surfaced.
// ============================================================

/**
 * @typedef {{
 *   id: string,
 *   pos: { x: number, y: number, z?: number },
 *   radius?: number,
 *   badge: string,
 *   title: string,
 *   summary: string,
 *   metrics: string[],
 *   actionLabel: string,
 *   actionType: 'section' | 'project' | 'modal' | 'function',
 *   actionTarget: string
 * }} RoverDossierItem
 */

/** @type {RoverDossierItem[]} */
export const ROVER_DOSSIER = [
    // ─── 1. Main Core Computing Center (U1) ───────────────────────
    {
        id: 'U1',
        pos: { x: 0, y: 1.0, z: 0.12 },
        radius: 1.25,
        badge: 'ACADEMIC HONORS // SRM UNIVERSITY',
        title: 'B.Tech Electronics & Communication (Data Science)',
        summary: '4-year rigorous engineering curriculum at SRM Institute of Science and Technology, Ramapuram. Graduating Class of 2026 with 9.48 / 10.0 CGPA Honors.',
        metrics: ['CGPA: 9.48 / 10.0', 'Class Rank: Top 2%', 'Specialization: Data Science', 'Graduation: 2026'],
        actionLabel: 'INSPECT EDUCATION DOSSIER [ENTER]',
        actionType: 'section',
        actionTarget: 'sec-about'
    },

    // ─── 2. Computer Vision & Edge AI Hub (U2) ───────────────────
    {
        id: 'U2',
        pos: { x: -3.2, y: 4.5, z: 0.12 },
        radius: 1.15,
        badge: 'APPLIED AI & COMPUTER VISION CLUSTER',
        title: 'Autonomous Systems & Edge Machine Learning Hub',
        summary: 'Central pipeline coordinator for high-throughput computer vision models, real-time edge neural inference, and interactive sensor telemetry architectures.',
        metrics: ['8 Modules Online', 'Zero Cloud Latency', 'FP16 TensorRT Acceleration', 'Real-Time 60 FPS'],
        actionLabel: 'EXPLORE INSTALLED MODULES [ENTER]',
        actionType: 'section',
        actionTarget: 'sec-projects'
    },

    // ─── 3. Project Chips: CrowdPulse (CP1) ───────────────────────
    {
        id: 'CP1',
        pos: { x: -4.88, y: 2.9, z: 0.12 },
        radius: 0.65,
        badge: 'AI/ML VISION PROCESSING UNIT',
        title: 'CrowdPulse — Real-Time Crowd Density AI',
        summary: 'Computer vision platform using YOLOv8 pedestrian tracking to compute live density heatmaps and automated emergency evacuation routing.',
        metrics: ['Vision: YOLOv8', 'Stream: 60 FPS RTSP', 'Backend: FastAPI', 'Status: Verified Shipped'],
        actionLabel: 'OPEN CROWDPULSE DATASHEET [ENTER]',
        actionType: 'project',
        actionTarget: 'CP1'
    },

    // ─── 4. Project Chips: Dialora (DL1) ──────────────────────────
    {
        id: 'DL1',
        pos: { x: -4.20, y: 2.9, z: 0.12 },
        radius: 0.65,
        badge: 'VOICE DSP // EDGE INTELLIGENCE',
        title: 'Dialora — 100% Local Offline AI Voice Agent',
        summary: 'Private, zero-cloud dependency speech intelligence agent built in 24 hours at ORIGIN 26. Local quantized LLMs with sub-200ms audio pipeline.',
        metrics: ['Zero Cloud Dependency', 'FastAPI Loopback', '100% Offline Inference', 'Origin 26 Hackathon'],
        actionLabel: 'OPEN DIALORA DATASHEET [ENTER]',
        actionType: 'project',
        actionTarget: 'DL1'
    },

    // ─── 5. Project Chips: Smart Parking (SP1) ────────────────────
    {
        id: 'SP1',
        pos: { x: -3.52, y: 2.9, z: 0.12 },
        radius: 0.65,
        badge: 'FULL-STACK SYSTEMS ARCHITECTURE',
        title: 'Smart Parking Automation Platform',
        summary: 'Full-stack automated parking controller for Beau Roi Pvt Ltd. High-concurrency PostgreSQL transaction ledger, JWT authentication, and automated bay routing.',
        metrics: ['Framework: Django', 'Database: PostgreSQL', 'RESTful API Services', 'Commercial Pilot'],
        actionLabel: 'OPEN SMART PARKING DATASHEET [ENTER]',
        actionType: 'project',
        actionTarget: 'SP1'
    },

    // ─── 6. Project Chips: Bus It (BT1) ───────────────────────────
    {
        id: 'BT1',
        pos: { x: -2.84, y: 2.9, z: 0.12 },
        radius: 0.65,
        badge: 'IOT TELEMETRY & GEOLOCATION',
        title: 'Bus It — Real-Time Transit GPS Tracking Engine',
        summary: 'Live transit geolocation tracker computing real-time ETA predictions and route telemetry across active urban bus fleets.',
        metrics: ['GPS Telemetry', 'Latency: <50ms', 'Route Forecasting', 'Leaflet GeoJSON'],
        actionLabel: 'OPEN BUS-IT DATASHEET [ENTER]',
        actionType: 'project',
        actionTarget: 'BT1'
    },

    // ─── 7. Project Chips: Air Quality Diagnostics (AQD1) ─────────
    {
        id: 'AQD1',
        pos: { x: -2.16, y: 2.9, z: 0.12 },
        radius: 0.65,
        badge: 'ENVIRONMENTAL SENSOR ANALYTICS',
        title: 'Atmospheric Diagnostics & Air Quality Monitor',
        summary: 'Multivariate environmental sensor network logging AQI, PM2.5, and volatile organic compounds with time-series hazard forecasting.',
        metrics: ['Time-Series Forecasting', 'Microcontroller I2C', 'PM2.5 / VOC Analysis', 'Anomaly Detection'],
        actionLabel: 'OPEN AIR QUALITY DATASHEET [ENTER]',
        actionType: 'project',
        actionTarget: 'AQD1'
    },

    // ─── 8. Project Chips: 3D PCB Engine (PX1) ────────────────────
    {
        id: 'PX1',
        pos: { x: -1.48, y: 2.9, z: 0.12 },
        radius: 0.65,
        badge: '3D WEBGL GRAPHICS ARCHITECTURE',
        title: 'Parametric 3D Motherboard Portfolio Engine',
        summary: 'Custom 3D WebGL circuit board simulator built from first principles in Three.js. 800+ hardware meshes, PBR shaders, dynamic raycasting, and zero external templates.',
        metrics: ['Renderer: WebGL 2.0', 'Performance: 60 FPS', 'Meshes: 813 Active', 'Zero CSS Frameworks'],
        actionLabel: 'INSPECT ENGINE ARCHITECTURE [ENTER]',
        actionType: 'project',
        actionTarget: 'PX1'
    },

    // ─── 9. Project Chips: Embedded Lab (EM1) ─────────────────────
    {
        id: 'EM1',
        pos: { x: -0.80, y: 2.9, z: 0.12 },
        radius: 0.65,
        badge: 'EMBEDDED SYSTEMS LAB',
        title: 'ARM Cortex & ESP32 Embedded Microcontroller Suite',
        summary: 'Low-level firmware development in C/C++ covering SPI/I2C peripheral drivers, DMA buffers, RTOS scheduling, and hardware-accelerated serial buses.',
        metrics: ['ARM Cortex-M4', 'FreeRTOS Kernel', 'SPI / I2C / UART Buses', 'DMA Optimization'],
        actionLabel: 'OPEN EMBEDDED SUITE [ENTER]',
        actionType: 'project',
        actionTarget: 'EM1'
    },

    // ─── 10. Project Chips: Algorithmic Bench (ML1) ───────────────
    {
        id: 'ML1',
        pos: { x: -0.12, y: 2.9, z: 0.12 },
        radius: 0.65,
        badge: 'RESEARCH & ALGORITHMIC OPTIMIZATION',
        title: 'Neural Architecture Search & Algorithmic Bench',
        summary: 'Benchmarking suite evaluating model compression, INT8 quantization, gradient boosting ensembles (XGBoost/LightGBM), and deep learning convergence.',
        metrics: ['PyTorch / TensorRT', 'XGBoost Ensembles', 'INT8 Quantization', 'Cross-Entropy: 0.041'],
        actionLabel: 'OPEN ALGORITHMIC BENCH [ENTER]',
        actionType: 'project',
        actionTarget: 'ML1'
    },

    // ─── 11. Capacitive Energy Banks (C1-C4) ──────────────────────
    {
        id: 'C1-C4',
        pos: { x: 3.2, y: 4.5, z: 0.12 },
        radius: 1.35,
        badge: 'TECHNICAL COMPETENCY RESERVOIR',
        title: 'Core Technical Skills & High-Current Capacitance',
        summary: 'Four dedicated energy banks representing deep expertise in Machine Learning, Full-Stack Architecture, Embedded Hardware, and Numerical Computing.',
        metrics: ['Python / PyTorch', 'Django / React', 'C/C++ Embedded', 'SQL / Docker / Linux'],
        actionLabel: 'INSPECT SKILLS BANKS [ENTER]',
        actionType: 'section',
        actionTarget: 'sec-skills'
    },

    // ─── 12. Chrono-Oscillator (Y1) ───────────────────────────────
    {
        id: 'Y1',
        pos: { x: -3.5, y: 0.5, z: 0.12 },
        radius: 0.95,
        badge: 'DEVELOPER WORK HISTORY & RESEARCH',
        title: 'Professional Experience & Chronological Milestones',
        summary: 'Track record of high-impact technical roles including industry Computer Vision AI Internship at Maiyyam and freelance full-stack production deployments.',
        metrics: ['Maiyyam AI Intern', 'Freelance Full-Stack', 'SRM Research Labs', 'Production Code Deployed'],
        actionLabel: 'VIEW EXPERIENCE TIMELINE [ENTER]',
        actionType: 'section',
        actionTarget: 'sec-experience'
    },

    // ─── 13. Telemetry Antenna & RF (ANT1) ────────────────────────
    {
        id: 'ANT1',
        pos: { x: 3.5, y: 0.5, z: 0.12 },
        radius: 0.95,
        badge: 'DIRECT UPLINK & VERIFIED PROFILES',
        title: 'Contact Terminal & Professional Network Uplink',
        summary: 'Direct channels for technical collaborations, full-time engineering roles, and open-source inquiries. Verified LinkedIn, GitHub, and email uplinks.',
        metrics: ['Email: hunterparama@gmail.com', 'Phone: +91 9176020504', 'GitHub: imnotparama', 'LinkedIn: Active'],
        actionLabel: 'OPEN UPLINK TERMINAL [ENTER]',
        actionType: 'section',
        actionTarget: 'sec-contact'
    },

    // ─── 14. Primary USB Interface Bus (J1) ───────────────────────
    {
        id: 'J1',
        pos: { x: 0, y: -7.3, z: 0.12 },
        radius: 1.10,
        badge: 'HIGH-THROUGHPUT SYSTEM BUS',
        title: 'Production Deployment & Data Pipelines',
        summary: 'High-speed interface connecting embedded intelligence models with external REST and WebSocket client pipelines.',
        metrics: ['Throughput: 480 Mbps', 'Bus: USB 2.0 / High-Speed', 'Data Integrity: CRC32', 'Latency: <2ms'],
        actionLabel: 'INSPECT SYSTEM BUS [ENTER]',
        actionType: 'section',
        actionTarget: 'sec-experience'
    },

    // ─── 15. Credential LED Array (D1-D7) ─────────────────────────
    {
        id: 'D1-D7',
        pos: { x: -3.5, y: -4.5, z: 0.12 },
        radius: 1.15,
        badge: 'INDUSTRY ACCREDITATIONS & AWARDS',
        title: 'Verified Engineering Certifications',
        summary: 'Seven verified professional credentials including IIM Bangalore Generative AI, ISO-certified Maiyyam Computer Vision Internship, and NPTEL Elite certification in C.',
        metrics: ['IIM Bangalore: Generative AI', 'NPTEL: Elite Certification', 'Maiyyam: ISO 9001:2015', '7 Diodes Active'],
        actionLabel: 'INSPECT ALL CERTIFICATIONS [ENTER]',
        actionType: 'section',
        actionTarget: 'sec-experience'
    },

    // ─── 16. SPI NOR Flash ROM (U3) ───────────────────────────────
    {
        id: 'U3',
        pos: { x: 0.9, y: -4.6, z: 0.12 },
        radius: 0.75,
        badge: 'SYSTEM FIRMWARE STORAGE',
        title: 'Production Software Architecture & EEPROM Storage',
        summary: 'Permanent non-volatile storage holding validated portfolio codebases, unit test suites, and high-performance WebGL state logic.',
        metrics: ['Flash Bus: 104MHz SPI', 'Firmware: v2.3.1', 'CRC32: Verified', '128Mb Capacity'],
        actionLabel: 'INSPECT ARCHITECTURE [ENTER]',
        actionType: 'modal',
        actionTarget: 'arch'
    },

    // ─── 17. 2.4" Embedded Arcade Display (LCD1) ──────────────────
    {
        id: 'LCD1',
        pos: { x: 0, y: -0.9, z: 0.12 },
        radius: 0.85,
        badge: 'INTERACTIVE HARDWARE RUNNER',
        title: 'Signal Runner 2.4" Embedded Arcade Engine',
        summary: 'Custom 128x64 monochrome retro running game simulated in real-time on the board embedded LCD display. Jump over logic obstacles and set high scores!',
        metrics: ['Pure Simulation Seam', 'Deterministic Physics', 'High Score Persistence', 'Retro Monospace HUD'],
        actionLabel: 'PLAY SIGNAL RUNNER [ENTER]',
        actionType: 'function',
        actionTarget: 'lcd'
    },

    // ─── 18. Acoustic Piezo Horn (BZ1) ────────────────────────────
    {
        id: 'BZ1',
        pos: { x: -1.0, y: -5.5, z: 0.12 },
        radius: 0.75,
        badge: 'ACOUSTIC TRANSDUCER',
        title: 'Interactive WebAudio Synthesis & Hardware Horn',
        summary: 'Dual-oscillator WebAudio API engine synthesizing mechanical switch clacks, resonant piezo frequencies, and rover motor hum.',
        metrics: ['Resonance: 2.7kHz', 'Dynamic Harmonics', 'WebAudio API', 'Zero Audio Latency'],
        actionLabel: 'TEST PIEZO HORN [ENTER]',
        actionType: 'function',
        actionTarget: 'buzzer'
    },

    // ─── 19. Voltage Regulator (VR1) ──────────────────────────────
    {
        id: 'VR1',
        pos: { x: 3.5, y: -4.5, z: 0.12 },
        radius: 0.85,
        badge: 'SYSTEM POWER REGULATION',
        title: 'Hardware-Aware AI Optimization & Efficient Compute',
        summary: 'Techniques in low-power neural deployment, parameter pruning, batch throughput balancing, and thermal throttling prevention.',
        metrics: ['Power: 5V -> 3.3V Step-Down', 'Efficiency: 94.2%', 'Thermal Dissipation: Nominal', 'Low-Power ML'],
        actionLabel: 'INSPECT TECH STACK [ENTER]',
        actionType: 'section',
        actionTarget: 'sec-skills'
    },

    // ─── 20. Resistor Network (RN1) ───────────────────────────────
    {
        id: 'RN1',
        pos: { x: 0, y: -3.5, z: 0.12 },
        radius: 0.75,
        badge: 'ALGORITHMIC ARCHITECTURE',
        title: 'Data Structures & Algorithmic Problem Solving',
        summary: 'Strong foundations in data structures, graph theory, dynamic programming, and computational complexity optimization.',
        metrics: ['C / C++ Logic', 'LeetCode Solutions', 'Time Complexity: O(N log N)', 'Space Efficient'],
        actionLabel: 'INSPECT TECHNICAL SKILLS [ENTER]',
        actionType: 'section',
        actionTarget: 'sec-skills'
    },

    // ─── 21. Crystalline Power Substation (RF1) ───────────────────
    {
        id: 'RF1',
        pos: { x: 4.1, y: 6.0, z: 0.12 },
        radius: 0.95,
        badge: 'RF & WIRELESS SUBSYSTEM',
        title: 'Dual-Phase RF Substation & Real-Time Telemetry',
        summary: 'Shielded 2.4GHz communication stage simulating packet telemetry, RSSI wireless field propagation, and high-frequency filtering.',
        metrics: ['Frequency: 2.4GHz', 'RSSI: -42dBm', 'Dual Inductor Stage', 'Sapphire Viewport'],
        actionLabel: 'INSPECT TELEMETRY [ENTER]',
        actionType: 'section',
        actionTarget: 'sec-contact'
    },

    // ─── 22. Electrolytic Bulk Power Capacitor (C5) ───────────────
    {
        id: 'C5',
        pos: { x: 2.6, y: -6.5, z: 0.12 },
        radius: 0.75,
        badge: 'HIGH-VOLTAGE ENERGY BUFFER',
        title: 'Large-Scale Distributed Training & Model Scaling',
        summary: 'Infrastructure expertise in handling high-demand computation bursts, dataset streaming, and GPU batch throughput.',
        metrics: ['Voltage: 16V Bulk', 'Capacitance: 100µF', 'Ripple Filter: Low ESR', 'Burstable Compute'],
        actionLabel: 'INSPECT INFRASTRUCTURE [ENTER]',
        actionType: 'section',
        actionTarget: 'sec-skills'
    },

    // ─── 23. Test Points (TP1 / TP2) ──────────────────────────────
    {
        id: 'TP1',
        pos: { x: -1.5, y: 3.2, z: 0.12 },
        radius: 0.65,
        badge: 'HARDWARE DIAGNOSTIC TEST POINT',
        title: 'Precision DC Logic Rail Verification',
        summary: 'Direct oscilloscope contact verifying steady 5.00V logic rails with sub-8mV ripple for zero-drift neural execution.',
        metrics: ['Rail: +5.02V VCC', 'Ripple: 7.4mV', 'Stability: Nominal', 'Logic Analyzer Active'],
        actionLabel: 'MEASURE VCC RAIL [ENTER]',
        actionType: 'function',
        actionTarget: 'tp1'
    },
    {
        id: 'TP2',
        pos: { x: 2.2, y: -3.0, z: 0.12 },
        radius: 0.65,
        badge: 'GROUND REFERENCE TEST POINT',
        title: 'Low-Impedance System Ground Plane',
        summary: 'Solid copper ground plane reference providing zero-potential stability and electromagnetic shielding across all high-speed buses.',
        metrics: ['Potential: 0.00V GND', 'Impedance: 0.02Ω', 'Noise Floor: -92dBm', 'Shielded Layer'],
        actionLabel: 'MEASURE GROUND RAIL [ENTER]',
        actionType: 'function',
        actionTarget: 'tp2'
    }
];

/**
 * Locate the nearest motherboard component to the rover's current 2D coordinates.
 * @param {number} roverX
 * @param {number} roverY
 * @param {number} [overrideRadius]
 * @returns {{ item: RoverDossierItem, dist: number } | null}
 */
export function findNearbyRoverComponent(roverX, roverY, overrideRadius = 0.85) {
    let closestItem = null;
    let closestDist = Infinity;

    for (let i = 0; i < ROVER_DOSSIER.length; i++) {
        const item = ROVER_DOSSIER[i];
        const maxDist = item.radius || overrideRadius;
        const dist = Math.hypot(roverX - item.pos.x, roverY - item.pos.y);
        if (dist <= maxDist && dist < closestDist) {
            closestDist = dist;
            closestItem = item;
        }
    }

    if (closestItem) {
        return { item: closestItem, dist: closestDist };
    }
    return null;
}
