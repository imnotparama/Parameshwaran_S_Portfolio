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
        socials: {
            github: GITHUB_URL,
            linkedin: LINKEDIN_URL
        },
        stats: [
            { label: "GPA", value: "9.51/10" },
            { label: "PROJECTS", value: "6+" },
            { label: "HACKATHONS", value: "3+" },
            { label: "CERTS", value: "7+" }
        ],
        heroLine: "I ship real, working projects — ML, DSA, flyrank.ai — and give full effort into everything I build. Still figuring the rest out.",
        bio: "Hi, I'm Parameshwaran — a 3rd-year ECE student specializing in Data Science at SRM Ramapuram. I'm still learning, and I don't pretend to have it all figured out — but I show up daily: working through ML and DSA problems, prepping for my Azure Data Fundamentals certification, and building flyrank.ai, my own startup project, from the ground up. Outside of code, I'm teaching myself Blender because I like understanding how things work end to end, not just the parts I'm comfortable with. If you're looking for someone who's genuinely curious and puts in real effort, that's me.",
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
            title: "flyrank.ai",
            status: "building",
            problem: "My own startup project — an AI-powered ranking and visibility engine, built solo from the ground up.",
            state: "Core build in active development; architecture and matching logic in progress — not publicly launched yet.",
            link: LINKEDIN_URL,
            linkLabel: "ASK ME ABOUT IT →",
            tags: ["Startup", "AI", "In Build"]
        },
        {
            id: "crowd-pulse",
            ref: "CP1",
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
            title: "BusIT — Live Bus Tracking",
            status: "shipped",
            problem: "Live campus bus tracking from GPS sensor streams with ETA calculation for students.",
            state: "Tracking + ETA pipeline functional on live GPS data; built as a Django service.",
            link: GITHUB_URL,
            linkLabel: "VIEW GITHUB →",
            tags: ["Django", "Python", "GPS APIs"]
        },
        {
            id: "ml-dsa",
            ref: "ML1",
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
