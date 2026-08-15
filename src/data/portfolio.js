// Portfolio Data Schema - Source of truth for personal information and content
import { LINKEDIN_URL, GITHUB_URL } from '../config.js';

export const portfolioData = {
    personalInfo: {
        name: "PARAMESHWARAN S",
        tagline: "ECE + Data Science · Builds Real, Working Projects",
        institution: "SRM INSTITUTE OF SCIENCE AND TECHNOLOGY, RAMAPURAM",
        location: "Chennai, Tamilnadu",
        email: "pw2491@srmist.edu.in",
        phone: "+91 9176020504",
        // Board identity — easter-egg telemetry (command palette → SYSTEM
        // TELEMETRY) and the contact footer. Same silicon, same serial.
        boardSerial: "PARAMA-2026-0042",
        firmwareVersion: "FW 1.4.2-REV1",
        socials: {
            github: GITHUB_URL,
            linkedin: LINKEDIN_URL
        },
        stats: [
            { label: "GPA", value: "9.51/10" },
            { label: "MODULES", value: "9" }
        ],
        heroLine: "One board. Three domains — AI, full-stack, embedded. Everything here is built for real, shipped, and working. No tutorials. No filler.",
        bio: "PARAM-CORE is a single-substrate system built for one purpose: shipping real products at the intersection of software, AI, and hardware.\n\nThe core cluster runs on a data-science specialization — machine learning pipelines, computer vision, and full-stack applications are the three main buses, and every one of them has reached production: deployed APIs, live tracking, a working startup. When the problem touches silicon, the stack extends down — embedded systems, VLSI fundamentals, and low-level architecture are part of the same design flow, not a separate board.\n\nTutorials are reference manuals, not products. The parts that make it onto this board are the ones that survived real builds — debugging, integration, deployment. Continuous learning is a hardware feature here: it ships in every revision.\n\nAuxiliary system: the operator keeps a training schedule. Heavy compound lifts, three times a week — same discipline as the code. Consistent, logged, load-incremented.",
        languages: [
            { name: "English", level: "Fluent" },
            { name: "Tamil", level: "Native" },
            { name: "Hindi", level: "Advanced" },
            { name: "Japanese", level: "Beginner" }
        ]
    },
    // Projects — each is a distinct component on the board.
    // status: 'shipped' (soldered, steady glow) | 'building' (breadboard patch, flickering)
    // Datasheet fields: problem / state / link — exactly three, no more.
    projects: [
        {
            id: "flyrank",
            ref: "FR1",
            category: "AI/ML",
            theme: "RANKING CORE",
            signal: "#f43f5e",
            spec: ["AI RANKING PIPELINE", "SOLO-FOUNDED · NO RUNWAY", "ARCHITECTURE IN DEV"],
            title: "flyrank.ai",
            status: "building",
            problem: "My own startup — an AI-powered ranking and visibility engine, built solo from the ground up.",
            state: "Core build in active development; architecture and matching logic in progress — not publicly launched yet.",
            link: LINKEDIN_URL,
            linkLabel: "ASK ME ABOUT IT →",
            tags: ["Startup", "AI", "In Build"]
        },
        {
            id: "crowd-pulse",
            ref: "CP1",
            category: "AI/ML",
            theme: "SENSOR GRID",
            signal: "#fb923c",
            spec: ["YOLOv8 · 60FPS DETECTION", "BYTETRACK MULTI-OBJECT", "FASTAPI + REACT LIVE"],
            title: "CrowdPulse — AI Crowd Safety",
            status: "shipped",
            problem: "Real-time crowd density monitoring and safety alerts for public spaces.",
            state: "Working end-to-end: YOLOv8 detection, ByteTrack tracking, and density alerts run live on video streams via FastAPI + React.",
            link: "https://github.com/imnotparama/CrowdPulse",
            linkLabel: "VIEW REPO →",
            tags: ["Python", "YOLOv8", "OpenCV", "FastAPI", "React"]
        },
        {
            id: "dialora",
            ref: "DL1",
            category: "AI/ML",
            theme: "VOICE PROCESSING UNIT",
            signal: "#a78bfa",
            spec: ["LLM VOICE AGENT", "100% LOCAL · ZERO CLOUD", "24H BUILD · ORIGIN 26"],
            title: "Dialora — AI Tele-Calling Agent",
            status: "shipped",
            problem: "A fully local AI calling agent — LLM-driven voice calls with zero cloud dependency.",
            state: "Built and demoed in 24 hours at ORIGIN 26 hackathon; runs fully offline via Ollama (llama3.2) + pyttsx3.",
            link: GITHUB_URL,
            linkLabel: "VIEW GITHUB →",
            tags: ["FastAPI", "Ollama", "React", "SQLite"]
        },
        {
            id: "eco-mentor",
            ref: "EM1",
            category: "AI/ML",
            theme: "ECO ANALYTICS MODULE",
            signal: "#4ade80",
            spec: ["AGENTIC SUSTAINABILITY", "REACT 19 + FASTAPI", "LIVE · VERCEL + RENDER"],
            title: "EcoMentor AI",
            status: "shipped",
            problem: "Agentic AI sustainability advisor that turns habits into actionable eco plans.",
            state: "Deployed live on Vercel + Render — built for the Google Agentic Wars hackathon with React 19, FastAPI, and Claude API.",
            link: GITHUB_URL,
            linkLabel: "VIEW GITHUB →",
            tags: ["React", "FastAPI", "Claude API", "Vercel"]
        },
        {
            id: "prmxa",
            ref: "PX1",
            category: "FULL-STACK",
            theme: "MEDIA STREAMING CHIP",
            signal: "#22d3ee",
            spec: ["PWA · OFFLINE READY", "TRAKT + JIKAN + FANART", "PERSONAL MEDIA HUB"],
            title: "PRMxA — Streaming Hub",
            status: "shipped",
            problem: "A personal streaming platform for movies, TV, anime, and sports with rich metadata.",
            state: "PWA live for personal use — Trakt, Fanart.tv, and Jikan API integrations working; new sources added incrementally.",
            link: GITHUB_URL,
            linkLabel: "VIEW GITHUB →",
            tags: ["React", "Vite", "Tailwind", "PWA"]
        },
        {
            id: "smart-parking",
            ref: "SP1",
            category: "FULL-STACK",
            theme: "NAVIGATION CONTROLLER",
            signal: "#facc15",
            spec: ["AUTO SLOT ALLOCATION", "LIVE BOOKING FLOW", "DJANGO + SQL"],
            title: "Smart Parking System",
            status: "shipped",
            problem: "Automated parking slot allocation with real-time booking availability.",
            state: "Working Django web app — vehicle-slot mapping and live booking flows complete.",
            link: GITHUB_URL,
            linkLabel: "VIEW GITHUB →",
            tags: ["Django", "Python", "SQL"]
        },
        {
            id: "bus-it",
            ref: "BT1",
            category: "SYSTEMS",
            theme: "GPS RECEIVER",
            signal: "#3b82f6",
            spec: ["LIVE GPS STREAM", "ETA PIPELINE", "DJANGO SERVICE"],
            title: "BusIT — Live Bus Tracking",
            status: "shipped",
            problem: "Live campus bus tracking from GPS sensor streams with ETA calculation for students.",
            state: "Tracking + ETA pipeline functional on live GPS data; built as a Django service.",
            link: GITHUB_URL,
            linkLabel: "VIEW GITHUB →",
            tags: ["Django", "Python", "GPS APIs"]
        },
        {
            id: "aqua-dot",
            ref: "AQD1",
            category: "SYSTEMS",
            theme: "WATER MONITORING MODULE",
            signal: "#2dd4bf",
            spec: ["ESP32 SENSOR NODE", "LIVE QUALITY DASHBOARD", "THRESHOLD ALERTS"],
            title: "AquaDot — Water Monitoring",
            status: "shipped",
            problem: "Real-time water quality and level monitoring for tanks and streams — sensor to dashboard.",
            state: "ESP32 node streaming readings to a live dashboard with threshold breach alerts.",
            link: GITHUB_URL,
            linkLabel: "VIEW GITHUB →",
            tags: ["ESP32", "IoT", "Sensors", "C"]
        },
        {
            id: "ml-dsa",
            ref: "ML1",
            category: "AI/ML",
            theme: "TRAINING REGIMEN",
            signal: "#a3e635",
            spec: ["DAILY ML REPS", "DSA + DP-900 PREP", "STREAK LIVE"],
            title: "ML + DSA Daily Reps",
            status: "building",
            problem: "Daily practice: ML problem sets and DSA fundamentals — plus prep for the Azure Data Fundamentals certification.",
            state: "Ongoing daily — practice streak live; Azure DP-900 exam not yet scheduled.",
            link: GITHUB_URL + "?tab=repositories",
            linkLabel: "PUBLIC COMMITS →",
            tags: ["ML", "DSA", "Azure DP-900"]
        }
    ],
    skills: {
        ai_ml: ["Python", "Machine Learning", "OpenCV", "YOLO", "Pandas", "NumPy", "Scikit-learn"],
        web: ["Django", "FastAPI", "React", "JavaScript", "HTML", "CSS", "Vite", "Tailwind"],
        data: ["SQL", "Power BI", "Data Analysis", "Excel", "Git"],
        hardware: ["Arduino", "IoT", "IR Sensors", "ESP32", "C"]
    },
    education: [
        {
            degree: "B.Tech ECE with Specialization in Data Science",
            institution: "SRM Institute of Science and Technology, Ramapuram, Chennai",
            duration: "2024 – 2028",
            grade: "GPA: 9.51 / 10"
        }
    ],
    // Experience — timeline etched into copper. Time-stamped junctions.
    timeline: [
        {
            date: "2024",
            title: "B.Tech ECE (Data Science) — SRM Ramapuram",
            detail: "Enrolled; currently 3rd year. GPA 9.51/10."
        },
        {
            date: "2025",
            title: "Certification Stack — 7 earned",
            detail: "NPTEL Data Analytics with Python (Elite) · Infosys Springboard Data Science · Maiyyam Data Analytics, Full Stack, UI/UX (ISO) · Accenture Digital Skills: AI · IBM SkillsBuild AI."
        },
        {
            date: "MAY–JUN 2025",
            title: "Backend Intern — Beau Roi, Chennai",
            detail: "Python + Django backend work: debugging, feature implementation, engineering team collaboration."
        },
        {
            date: "2025",
            title: "ORIGIN 26 Hackathon — Dialora",
            detail: "Built a fully local AI tele-calling agent in 24 hours. It worked."
        },
        {
            date: "2025",
            title: "Google Agentic Wars Hackathon — EcoMentor AI",
            detail: "Agentic sustainability advisor, deployed live on Vercel + Render."
        },
        {
            date: "NOW",
            title: "Building flyrank.ai · Azure DP-900 prep",
            detail: "Daily ML/DSA reps, startup build from the ground up, teaching myself Blender on the side."
        }
    ],
    certifications: [
        "Data Analytics with Python – NPTEL (Elite, 2025)",
        "Foundation of Data Science – Infosys Springboard",
        "Data Analytics (Power BI, SQL, Excel) – Maiyyam (ISO Certified)",
        "Full Stack Web Development – Maiyyam (ISO Certified)",
        "UI/UX Design (Figma, Wireframing) – Maiyyam (ISO Certified)",
        "Digital Skills: AI – Accenture",
        "Getting Started with AI – IBM SkillsBuild"
    ]
};

// Component Library roles — every skill is a PCB component on the board, so
// each one carries its component class (the part it plays in a system):
// Python = MCU, Machine Learning = AI ACCEL, React = DISPLAY CTRL, etc.
// sections.js renders these as tiny component tags under the pill label.
/** @type {Record<string, string>} */
export const skillRoles = {
    // C1 — AI ACCELERATOR BANK
    "Python": "MCU",
    "Machine Learning": "AI ACCEL",
    "OpenCV": "VISION DSP",
    "YOLO": "DETECT NET",
    "Pandas": "DATA LATCH",
    "NumPy": "MATH FPU",
    "Scikit-learn": "AI ACCEL",
    // C2 — DISPLAY & I/O BANK
    "Django": "WEB CORE",
    "FastAPI": "COMM BUS",
    "React": "DISPLAY CTRL",
    "JavaScript": "SCRIPT ENG",
    "HTML": "MARKUP LYR",
    "CSS": "STYLE LYR",
    "Vite": "BUILD BUS",
    "Tailwind": "STYLE LYR",
    // C3 — STORAGE CONTROLLER BANK
    "SQL": "STORAGE CTRL",
    "Power BI": "DISPLAY CTRL",
    "Data Analysis": "DATA LATCH",
    "Excel": "DATA LATCH",
    "Git": "VERSION REG",
    // C4 — FIRMWARE & RF MODULES
    "Arduino": "MCU",
    "IoT": "NET NODE",
    "IR Sensors": "SENSOR IN",
    "ESP32": "RF MODULE",
    "C": "KERNEL"
};
