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
        email: "hunterparama@gmail.com",
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
            { label: "MODULES", value: "8 ONLINE" },
            { label: "UPTIME", value: "100%" },
            { label: "BUILD", value: "2026.08" }
        ],
        heroLine: "ECE student specializing in Data Science with practical experience in Full Stack Development and Machine Learning.",
        bio: "Electronics and Communication Engineering student specializing in Data Science at SRM Institute of Science and Technology, Ramapuram, with practical experience in Full Stack Development and Machine Learning.\n\nSkilled in Python, Django, React.js, TensorFlow, and Scikit-learn, with hands-on experience building scalable web applications and AI-powered solutions through industry internships. Eager to apply software engineering and machine learning expertise to develop impactful, real-world technologies.",
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
            id: "crowd-pulse",
            ref: "CP1",
            category: "AI/ML",
            theme: "VISION PROCESSING UNIT",
            function: "Real-Time Crowd Analytics VPU",
            inputs: "Video Stream · RTSP Frames",
            outputs: "Density Heatmaps · Pedestrian Analytics",
            rail: "+3.3V Core",
            bus: "REST / WebSocket Stream",
            signal: "#38bdf8",
            spec: ["REAL-TIME CROWD ANALYTICS", "COMPUTER VISION DENSITY ESTIMATION", "INTERACTIVE ALERT DASHBOARD"],
            title: "CrowdPulse — AI Crowd Analytics",
            status: "shipped",
            statusText: "ONLINE / VERIFIED",
            problem: "Real-time crowd analytics platform using computer vision to estimate crowd density and analyze pedestrian movement.",
            state: "Building an interactive dashboard for live visualization, density heatmaps, and threshold-based alerts with scalable architecture for smart cities.",
            link: "https://github.com/imnotparama/CrowdPulse",
            linkLabel: "INSPECT REPOSITORY →",
            tags: ["Python", "Computer Vision", "OpenCV", "FastAPI"]
        },
        {
            id: "dialora",
            ref: "DL1",
            category: "AI/ML",
            theme: "VOICE DSP",
            function: "Local Voice DSP & Edge Agent",
            inputs: "Audio Ingest · Speech Commands",
            outputs: "Low-Latency Synthesized Audio Response",
            rail: "+3.3V Core",
            bus: "Local Loopback / DMA",
            signal: "#f97316",
            spec: ["LOCAL VOICE AGENT", "100% OFFLINE INFERENCE", "ORIGIN 26 BUILD"],
            title: "Dialora — Local Voice Agent",
            status: "shipped",
            statusText: "ONLINE / VERIFIED",
            problem: "Fully local AI calling agent with zero cloud dependency built in 24 hours at ORIGIN 26.",
            state: "Runs 100% offline with local LLM models, Python audio synthesis, and FastAPI endpoint orchestration.",
            link: GITHUB_URL,
            linkLabel: "INSPECT GITHUB →",
            tags: ["Python", "FastAPI", "Local AI", "NLP"]
        },
        {
            id: "smart-parking",
            ref: "SP1",
            category: "FULL-STACK",
            theme: "PARKING CONTROLLER IC",
            function: "Telemetry & Allocation Controller",
            inputs: "Vehicle Ingress Events · Sensor Status",
            outputs: "Real-Time Slot Allocations · Transaction Ledger",
            rail: "+5.0V Bus",
            bus: "HTTP / PostgreSQL Wire",
            signal: "#eab308",
            spec: ["DJANGO + POSTGRESQL", "DATABASE RESERVATIONS", "AI DETECTION ARCHITECTURE"],
            title: "Smart Parking — Beau Roi Pvt Ltd",
            status: "shipped",
            statusText: "ONLINE / VERIFIED",
            problem: "Full-stack smart parking application using Django and PostgreSQL for automated slot management and reservations.",
            state: "Deployed application with authentication and database-driven parking reservation management; designed architecture for future AI-powered parking detection.",
            link: "https://github.com/imnotparama/smart_parking",
            linkLabel: "INSPECT REPOSITORY →",
            tags: ["Django", "PostgreSQL", "Python", "RESTful APIs"]
        },
        {
            id: "bus-it",
            ref: "BT1",
            category: "SYSTEMS",
            theme: "GPS RECEIVER MODULE",
            function: "Telemetry & Geolocation Processor",
            inputs: "Live GPS Coordinates · Transit Pings",
            outputs: "Dynamic ETA Streams · Route Vector Map",
            rail: "+5.0V Bus",
            bus: "UART / Telemetry Stream",
            signal: "#22c55e",
            spec: ["LIVE GPS STREAM", "DYNAMIC ETA PIPELINE", "DJANGO SERVICE"],
            title: "BusIT — Live Transit Tracking",
            status: "shipped",
            statusText: "ONLINE / VERIFIED",
            problem: "Live campus transit tracking from GPS sensor streams with real-time ETA calculation.",
            state: "Tracking and dynamic ETA calculation pipeline functional on live GPS data; built as a Django telemetry service.",
            link: GITHUB_URL,
            linkLabel: "INSPECT GITHUB →",
            tags: ["Django", "Python", "GPS Telemetry", "IoT"]
        },
        {
            id: "blue-ground",
            ref: "AQD1",
            category: "SYSTEMS",
            theme: "WATER MONITORING IC",
            function: "Autonomous Solar IoT & Digital Twin",
            inputs: "5 Water-Quality ADC Probes · Solar Telemetry",
            outputs: "3D Digital Twin Stream · Automated Valves",
            rail: "+3.3V / +5.0V Dual",
            bus: "ESP32 Firmware / Next.js Twin",
            signal: "#06b6d4",
            spec: ["ESP32 FIRMWARE", "5 WATER-QUALITY SENSORS", "3D DIGITAL TWIN (THREE.JS)"],
            title: "Blue_Ground — Solar IoT Purification",
            status: "shipped",
            statusText: "ONLINE / VERIFIED",
            problem: "Autonomous solar-powered IoT water purification system using ESP32 with multi-stage filtration and 5 water-quality sensors.",
            state: "Automated pump and valve operations through embedded firmware, paired with a real-time 3D Digital Twin dashboard built using React, Next.js, and Three.js.",
            link: "https://blue-ground.vercel.app",
            linkLabel: "LIVE DIGITAL TWIN →",
            tags: ["ESP32", "Three.js", "React.js", "Next.js", "C++", "IoT"]
        },
        {
            id: "pawpal",
            ref: "PX1",
            category: "FULL-STACK",
            theme: "AI HEALTH CO-PROCESSOR",
            function: "AI Pet Health Assistant & 3D Dashboard",
            inputs: "Symptom Logs · Health Records · Vitals",
            outputs: "Gemini Clinical Analysis · 3D Pet Profiles",
            rail: "+3.3V Logic",
            bus: "Google Gemini API / Supabase",
            signal: "#6366f1",
            spec: ["GOOGLE GEMINI AI", "3D DASHBOARD (THREE.JS)", "SUPABASE AUTH & BACKEND"],
            title: "PawPal — AI Pet Health Assistant",
            status: "shipped",
            statusText: "ONLINE / VERIFIED",
            problem: "AI-powered pet health assistant using Google Gemini for symptom analysis and health record management.",
            state: "Built for Hack the Kitty 2026: features a 3D dashboard using React, Three.js, and Supabase for pet profile management with scalable secure backend architecture.",
            link: "https://pawpal-wheat.vercel.app/",
            linkLabel: "LIVE DEPLOYMENT →",
            tags: ["React.js", "Three.js", "Supabase", "Google Gemini", "FastAPI"]
        },
        {
            id: "eco-mentor",
            ref: "EM1",
            category: "AI/ML",
            theme: "ECO ANALYTICS MODULE",
            function: "Agentic Sustainability Coach",
            inputs: "User Consumption & Activity Telemetry",
            outputs: "Personalized Carbon Footprint Insights",
            rail: "+3.3V Logic",
            bus: "Claude AI Agentic Bus",
            signal: "#4ade80",
            spec: ["AGENTIC AI COACH", "FASTAPI + POSTGRESQL", "40+ AUTOMATED TESTS"],
            title: "EcoMentor AI — Sustainability Coach",
            status: "shipped",
            statusText: "ONLINE / VERIFIED",
            problem: "Agentic AI sustainability coach using Claude for personalized carbon footprint analysis.",
            state: "Google Agentic Wars Hackathon project: FastAPI backend with PostgreSQL, React frontend, 40+ automated tests, and AI-driven recommendation workflows.",
            link: "https://eco-mentor-nu.vercel.app/",
            linkLabel: "LIVE DEPLOYMENT →",
            tags: ["FastAPI", "React.js", "PostgreSQL", "Claude AI", "LLMs"]
        },
        {
            id: "ml-dsa",
            ref: "ML1",
            category: "AI/ML",
            theme: "CORE ML CO-PROCESSOR",
            function: "Algorithmic Verification Co-Processor",
            inputs: "DSA & ML Benchmark Problem Sets",
            outputs: "Optimal Computational Complexity Proofs",
            rail: "+1.8V VCCIO",
            bus: "Systems Benchmark Suite",
            signal: "#a3e635",
            spec: ["DAILY ML REPS", "ALGORITHMS PRACTICE", "ACTIVE STREAK"],
            title: "ML & Systems Daily Reps",
            status: "building",
            statusText: "IN BUILD / CONTINUOUS",
            problem: "Daily engineering practice in machine learning problem sets, data structures, and algorithms.",
            state: "Ongoing daily problem-solving streak in algorithmic efficiency, TensorFlow, Scikit-learn, and machine learning fundamentals.",
            link: GITHUB_URL + "?tab=repositories",
            linkLabel: "PUBLIC COMMITS →",
            tags: ["Machine Learning", "Algorithms", "Python", "TensorFlow"]
        }
    ],
    // Truthful Capabilities Stack
    skills: {
        ai_vision: [
            {
                capability: "Machine Learning & Computer Vision",
                techs: ["TensorFlow", "Scikit-learn", "OpenCV", "Computer Vision", "Deep Learning", "Model Fine-tuning"]
            },
            {
                capability: "Generative AI & Agentic Systems",
                techs: ["Google Gemini", "Claude AI", "LLMs", "RAG", "Prompt Engineering", "NLP"]
            }
        ],
        backend: [
            {
                capability: "Backend Engineering & REST APIs",
                techs: ["Django", "FastAPI", "Node.js", "RESTful APIs", "Python"]
            },
            {
                capability: "Databases & Persistence Engines",
                techs: ["PostgreSQL", "MongoDB", "MySQL", "Supabase", "SQL"]
            }
        ],
        webgl_ui: [
            {
                capability: "Interactive Web & 3D Systems",
                techs: ["Three.js", "React.js", "Next.js", "JavaScript", "HTML5", "CSS3"]
            }
        ],
        embedded_iot: [
            {
                capability: "Embedded Systems & Firmware",
                techs: ["ESP32", "Arduino", "C++", "Sensors", "UART Serial"]
            },
            {
                capability: "Version Control & Toolchain",
                techs: ["Git", "GitHub"]
            }
        ],
        data_analytics: [
            {
                capability: "Data Science & Analytics",
                techs: ["Pandas", "NumPy", "Data Modeling", "Power BI"]
            }
        ]
    },
    education: [
        {
            degree: "Bachelor of Technology in Electronics and Communication Engineering with Specialization in Data Science",
            institution: "SRM Institute of Science and Technology, Ramapuram, Chennai",
            duration: "2024 – 2028",
            grade: `CGPA: ${GPA} (Honors)`
        },
        {
            degree: "Higher Secondary Certificate (Class XII)",
            institution: "Vivekananda Vidyalaya, Chennai, Tamil Nadu",
            duration: "2024",
            grade: "Score: 82%"
        },
        {
            degree: "Secondary School Examination (Class X)",
            institution: "Vivekananda Vidyalaya, Chennai, Tamil Nadu",
            duration: "2022",
            grade: "Score: 92%"
        }
    ],
    // Experience — Structured as Firmware Updates
    timeline: [
        {
            version: "FW UPDATE 2.3",
            date: "JUN 2026 – SEP 2026",
            title: "Machine Learning Intern — Flyrank.ai (Chicago, IL, USA)",
            detail: "Developed and fine-tuned machine learning models for real-world AI applications. Preprocessed datasets, evaluated model performance, and performed feature engineering and model optimization to enhance prediction accuracy."
        },
        {
            version: "FW UPDATE 2.1",
            date: "JUN 2025 – JUL 2025",
            title: "Full stack Engineering Intern — Beau Roi Pvt Ltd (Chennai)",
            detail: "Developed and maintained full-stack web application features using modern web technologies. Collaborated with the engineering team to debug, test, deploy scalable solutions, and integrated REST APIs to optimize database interactions."
        },
        {
            version: "FW UPDATE 1.5",
            date: "MAY 2026 – JUL 2026",
            title: "Hackathons & Systems Deployments",
            detail: "Engineered autonomous solar IoT purification with 3D digital twin (Blue_Ground), built Gemini AI pet health assistant for Hack the Kitty 2026 (PawPal), and deployed Claude agentic sustainability coach for Google Agentic Wars (EcoMentor AI)."
        },
        {
            version: "FW UPDATE 1.0",
            date: "2024 – 2028",
            title: "B.Tech ECE (Data Science) — SRM Ramapuram",
            detail: `Foundational engineering curriculum in electronic circuits, microcontrollers, statistical machine learning, and computer vision. CGPA: ${GPA} (Honors).`
        }
    ],
    certifications: [
        {
            title: "Python for Generative AI and Machine Learning",
            issuer: "IIMB (Indian Institute of Management Bangalore)",
            year: "2026",
            badge: "REG_D1"
        },
        {
            title: "Data Analytics with Python",
            issuer: "NPTEL (Elite Certification)",
            year: "2025",
            badge: "REG_D2"
        },
        {
            title: "Full Stack (MERN) Development, Data Analytics",
            issuer: "Maiyyam (ISO-Certified)",
            year: "2025",
            badge: "REG_D3"
        },
        {
            title: "Foundation of Data Science",
            issuer: "Infosys Springboard",
            year: "2024",
            badge: "REG_D4"
        }
    ]
};

/** @type {Record<string, string>} */
export const skillRoles = {
    "TensorFlow": "TENSOR CORE",
    "Scikit-learn": "MATH FPU",
    "OpenCV": "VISION DSP",
    "Computer Vision": "SPATIAL VPU",
    "Deep Learning": "NEURAL NET",
    "Model Fine-tuning": "PARAM TUNER",
    "Google Gemini": "GEMINI BUS",
    "Claude AI": "AGENT CORE",
    "LLMs": "INFERENCE ENG",
    "RAG": "VECTOR LATCH",
    "Prompt Engineering": "CONTEXT REG",
    "NLP": "TOKEN PARSER",
    "FastAPI": "COMM BUS",
    "Django": "WEB CORE",
    "Node.js": "ASYNC ENGINE",
    "RESTful APIs": "RPC GATE",
    "REST APIs": "RPC GATE",
    "Python": "SYS MCU",
    "PostgreSQL": "ACID STORAGE",
    "MongoDB": "DOC STORE",
    "MySQL": "RELATIONAL DB",
    "Supabase": "BAAS GATE",
    "SQL": "STORAGE CTRL",
    "SQL Databases": "STORAGE CTRL",
    "Three.js": "3D PIPELINE",
    "Three.js (WebGL)": "3D PIPELINE",
    "React.js": "REACTIVE UI",
    "React": "REACTIVE UI",
    "Next.js": "SSR ENGINE",
    "JavaScript": "SCRIPT ENG",
    "Vanilla JavaScript": "SCRIPT ENG",
    "HTML5": "MARKUP LYR",
    "CSS3": "STYLE LYR",
    "Modern CSS": "STYLE LYR",
    "GSAP": "MOTION FPU",
    "ESP32": "RF MODULE",
    "Arduino": "MCU",
    "Sensors": "ADC SENSOR",
    "IR Sensors": "SENSOR IN",
    "UART Serial": "BUS COMM",
    "C++": "KERNEL",
    "C/C++": "KERNEL",
    "Git": "VERSION REG",
    "GitHub": "REMOTE REPO",
    "Pandas": "DATA LATCH",
    "NumPy": "MATH FPU",
    "Data Modeling": "SCHEMA CTRL",
    "Power BI": "DISPLAY CTRL",
    "YOLOv8": "DETECT NET",
    "Video Frame Detection": "FRAME BUFFER",
    "Object Tracking": "TRACK LATCH",
    "Machine Learning": "ML ENGINE",
    "Algorithms": "ALGO CORE",
    "GPS Telemetry": "GPS TELEM",
    "IoT": "IOT GATEWAY",
    "Local AI": "EDGE INFER"
};
