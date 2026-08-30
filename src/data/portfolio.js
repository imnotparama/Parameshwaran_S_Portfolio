// Portfolio Data Schema - Source of truth for personal information and content
import { LINKEDIN_URL, GITHUB_URL } from '../config.js';

// Single source of truth for the GPA value
const GPA = '9.48/10';

export const portfolioData = {
    personalInfo: {
        name: "PARAMESHWARAN S",
        tagline: "ECE + Data Science · AI Hardware & Systems Developer",
        institution: "SRM INSTITUTE OF SCIENCE AND TECHNOLOGY, RAMAPURAM",
        location: "Chennai, Tamil Nadu, India",
        email: "pw2491@srmist.edu.in",
        phone: "+91 9176020504",
        // Board Identity — Motherboard Serial & Build Specifications
        boardSerial: "PRM-2026-DEV-001",
        boardModel: "PRM-DEV-BOARD V2.0",
        boardRevision: "R2.0",
        firmwareVersion: "v2.3.1",
        buildDate: "2026.08",
        manufacturingLabel: {
            brand: "PARAMA LABS",
            model: "PRM-DEV-BOARD V2.0",
            revision: "R2.0",
            serial: "PRM-2026-DEV-001",
            assembled: "Chennai, India",
            status: "ENGINEERING SAMPLE"
        },
        socials: {
            github: GITHUB_URL,
            linkedin: LINKEDIN_URL
        },
        // Motherboard BIOS Diagnostics Stats
        stats: [
            { label: "CORE", value: "ONLINE" },
            { label: "MODULES", value: "9 ONLINE" },
            { label: "UPTIME", value: "100%" },
            { label: "BUILD", value: "2026.08" }
        ],
        heroLine: "ECE student and systems developer specializing in computer vision, backend engineering, and high-performance interactive software.",
        bio: "ECE student specializing in Data Science at SRM Institute of Science and Technology, Ramapuram.\n\nInterested in AI systems, computer vision, backend engineering, and interactive web experiences. I enjoy building software that people actually use, from machine-learning APIs to immersive browser experiences.",
        languages: [
            { name: "English", level: "Fluent" },
            { name: "Tamil", level: "Native" },
            { name: "Hindi", level: "Advanced" },
            { name: "Japanese", level: "Beginner" }
        ]
    },
    // Installed Hardware Modules — each is a distinct physical component on the board
    projects: [
        {
            id: "flyrank",
            ref: "FR1",
            category: "AI/ML",
            theme: "AI ACCELERATOR IC",
            signal: "#a855f7",
            spec: ["ML SEARCH & RANKING", "DATA PIPELINES", "MODEL INTEGRATION"],
            title: "FlyRank — Search & Ranking Engine",
            status: "building",
            problem: "Machine learning ranking features and search indexing infrastructure.",
            state: "Contributed to machine-learning search and ranking features, supporting data pipelines, backend services, and model integration as part of the engineering team.",
            link: LINKEDIN_URL,
            linkLabel: "ASK ME ABOUT IT →",
            tags: ["Python", "FastAPI", "ML Pipelines"]
        },
        {
            id: "crowd-pulse",
            ref: "CP1",
            category: "AI/ML",
            theme: "VISION PROCESSING UNIT",
            signal: "#38bdf8",
            spec: ["YOLOv8 60FPS DETECTION", "REAL-TIME TRACKING", "FASTAPI STREAMING"],
            title: "CrowdPulse — AI Crowd Safety",
            status: "shipped",
            problem: "Real-time crowd density monitoring and safety alerts for public spaces.",
            state: "Working end-to-end: YOLOv8 video frame detection and density alerts running live via FastAPI + OpenCV.",
            link: "https://github.com/imnotparama/CrowdPulse",
            linkLabel: "VIEW REPO →",
            tags: ["Python", "YOLOv8", "OpenCV", "FastAPI"]
        },
        {
            id: "dialora",
            ref: "DL1",
            category: "AI/ML",
            theme: "VOICE DSP",
            signal: "#f97316",
            spec: ["LOCAL VOICE AGENT", "100% OFFLINE INFERENCE", "ORIGIN 26 BUILD"],
            title: "Dialora — Local Voice Agent",
            status: "shipped",
            problem: "A fully local AI calling agent with zero cloud dependency.",
            state: "Built and demoed in 24 hours at ORIGIN 26; runs fully offline with local LLM models and Python audio synthesis.",
            link: GITHUB_URL,
            linkLabel: "VIEW GITHUB →",
            tags: ["Python", "FastAPI", "Local AI", "SQLite"]
        },
        {
            id: "smart-parking",
            ref: "SP1",
            category: "FULL-STACK",
            theme: "PARKING CONTROLLER IC",
            signal: "#eab308",
            spec: ["SLOT ALLOCATION", "LIVE BOOKING FLOW", "DJANGO + SQL"],
            title: "Smart Parking System",
            status: "shipped",
            problem: "Automated parking slot allocation with real-time booking availability.",
            state: "Working Django web app with vehicle-slot allocation and database transaction management.",
            link: GITHUB_URL,
            linkLabel: "VIEW GITHUB →",
            tags: ["Django", "Python", "SQL"]
        },
        {
            id: "bus-it",
            ref: "BT1",
            category: "SYSTEMS",
            theme: "GPS RECEIVER MODULE",
            signal: "#22c55e",
            spec: ["LIVE GPS STREAM", "ETA PIPELINE", "DJANGO SERVICE"],
            title: "BusIT — Live Transit Tracking",
            status: "shipped",
            problem: "Live campus transit tracking from GPS sensor streams with ETA calculation.",
            state: "Tracking and ETA calculation pipeline functional on live GPS data; built as a Django service.",
            link: GITHUB_URL,
            linkLabel: "VIEW GITHUB →",
            tags: ["Django", "Python", "GPS Telemetry"]
        },
        {
            id: "aqua-dot",
            ref: "AQD1",
            category: "SYSTEMS",
            theme: "WATER MONITORING IC",
            signal: "#06b6d4",
            spec: ["ESP32 SENSOR NODE", "LIVE METRICS DASHBOARD", "THRESHOLD ALERTS"],
            title: "AquaDot — IoT Sensor Node",
            status: "shipped",
            problem: "Real-time water quality and level monitoring for tanks and streams.",
            state: "ESP32 microcontroller node streaming readings to a live dashboard with threshold breach alerts.",
            link: GITHUB_URL,
            linkLabel: "VIEW GITHUB →",
            tags: ["ESP32", "IoT", "Sensors", "C"]
        },
        {
            id: "prmxa",
            ref: "PX1",
            category: "FULL-STACK",
            theme: "STREAMING MEDIA PROCESSOR",
            signal: "#6366f1",
            spec: ["PWA OFFLINE READY", "METADATA PIPELINE", "MEDIA HUB"],
            title: "PRMxA — Streaming Media Hub",
            status: "shipped",
            problem: "A personal media platform for video and animation with rich metadata aggregation.",
            state: "Progressive Web App with live third-party metadata API integrations and offline caching.",
            link: GITHUB_URL,
            linkLabel: "VIEW GITHUB →",
            tags: ["JavaScript", "Vite", "PWA", "APIs"]
        },
        {
            id: "eco-mentor",
            ref: "EM1",
            category: "AI/ML",
            theme: "ECO ANALYTICS MODULE",
            signal: "#4ade80",
            spec: ["SUSTAINABILITY AI", "FASTAPI + REACT", "LIVE DEPLOYMENT"],
            title: "EcoMentor AI",
            status: "shipped",
            problem: "Agentic AI sustainability advisor turning habits into actionable eco plans.",
            state: "Deployed live web application built for the Google Agentic Wars hackathon with FastAPI and React.",
            link: GITHUB_URL,
            linkLabel: "VIEW GITHUB →",
            tags: ["FastAPI", "React", "AI APIs"]
        },
        {
            id: "ml-dsa",
            ref: "ML1",
            category: "AI/ML",
            theme: "CORE ML CO-PROCESSOR",
            signal: "#a3e635",
            spec: ["DAILY ML REPS", "ALGORITHMS PRACTICE", "ACTIVE STREAK"],
            title: "ML & Systems Daily Reps",
            status: "building",
            problem: "Daily engineering practice in machine learning problem sets, data structures, and algorithms.",
            state: "Ongoing daily problem-solving streak in algorithmic efficiency and machine learning fundamentals.",
            link: GITHUB_URL + "?tab=repositories",
            linkLabel: "PUBLIC COMMITS →",
            tags: ["ML", "Algorithms", "Python"]
        }
    ],
    // Truthful Capabilities Stack
    skills: {
        ai_vision: [
            { capability: "AI & Computer Vision", techs: ["YOLOv8", "OpenCV", "Video Frame Detection", "Object Tracking"] }
        ],
        backend: [
            { capability: "Backend Engineering", techs: ["FastAPI", "Django", "REST APIs", "Python", "SQL Databases"] }
        ],
        webgl_ui: [
            { capability: "Interactive Web & Graphics", techs: ["Three.js (WebGL)", "GSAP", "Vanilla JavaScript", "Modern CSS", "HTML5"] }
        ],
        embedded_iot: [
            { capability: "Embedded & IoT Systems", techs: ["ESP32", "Arduino", "IR Sensors", "UART Serial", "C/C++", "Git"] }
        ],
        data_analytics: [
            { capability: "Data Analytics & Modeling", techs: ["Pandas", "NumPy", "SQL", "Power BI", "Data Modeling"] }
        ]
    },
    education: [
        {
            degree: "B.Tech ECE with Specialization in Data Science",
            institution: "SRM Institute of Science and Technology, Ramapuram, Chennai",
            duration: "2024 – 2028",
            grade: `GPA: ${GPA}`
        }
    ],
    // Experience — Structured as Firmware Updates
    timeline: [
        {
            version: "FW UPDATE 1.3",
            date: "2025 – PRESENT",
            title: "ML Engineering Intern — FlyRank.ai",
            detail: "Contributed to machine-learning search and ranking features, supporting data pipelines, backend services, and model integration as part of the engineering team."
        },
        {
            version: "FW UPDATE 1.2",
            date: "MAY – JUN 2025",
            title: "Backend Intern — Beau Roi, Chennai",
            detail: "Python + Django backend engineering: REST API development, feature implementation, and collaborative debugging within the engineering team."
        },
        {
            version: "FW UPDATE 1.1",
            date: "2025",
            title: "Systems Deployments — Dialora & EcoMentor",
            detail: "Engineered Dialora offline voice agent at ORIGIN 26 (24-hour sprint) and deployed EcoMentor AI sustainability service."
        },
        {
            version: "FW UPDATE 1.0",
            date: "2024 – 2028",
            title: "B.Tech ECE (Data Science) — SRM Ramapuram",
            detail: `Foundational engineering curriculum in electronic circuits, digital signal processing, microcontrollers, and statistical machine learning. GPA: ${GPA}.`
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

/** @type {Record<string, string>} */
export const skillRoles = {
    "YOLOv8": "DETECT NET",
    "OpenCV": "VISION DSP",
    "Video Frame Detection": "FRAME BUFFER",
    "Object Tracking": "TRACK LATCH",
    "FastAPI": "COMM BUS",
    "Django": "WEB CORE",
    "REST APIs": "RPC GATE",
    "Python": "MCU",
    "SQL Databases": "STORAGE CTRL",
    "Three.js (WebGL)": "3D PIPELINE",
    "GSAP": "MOTION FPU",
    "Vanilla JavaScript": "SCRIPT ENG",
    "Modern CSS": "STYLE LYR",
    "HTML5": "MARKUP LYR",
    "ESP32": "RF MODULE",
    "Arduino": "MCU",
    "IR Sensors": "SENSOR IN",
    "UART Serial": "BUS COMM",
    "C/C++": "KERNEL",
    "Git": "VERSION REG",
    "Pandas": "DATA LATCH",
    "NumPy": "MATH FPU",
    "SQL": "STORAGE CTRL",
    "Power BI": "DISPLAY CTRL",
    "Data Modeling": "SCHEMA CTRL"
};
