// Portfolio Data Schema - Source of truth for personal information and content
export const portfolioData = {
    personalInfo: {
        name: "PARAMESHWARAN S",
        tagline: "AI Engineer · ML Developer · ECE Student",
        institution: "SRM INSTITUTE OF SCIENCE AND TECHNOLOGY",
        location: "Chennai, Tamilnadu",
        email: "pw2491@srmist.edu.in",
        phone: "+91 9176020504",
        socials: {
            github: "https://github.com/imnotparama",
            linkedin: "https://linkedin.com/in/parameshwaran-s"
        },
        stats: [
            { label: "GPA", value: "9.51/10" },
            { label: "PROJECTS", value: "6+" },
            { label: "HACKATHONS", value: "3+" },
            { label: "CERTS", value: "7+" }
        ],
        bio: "Data Science-focused ECE student from Chennai. I build AI systems, real-world intelligent solutions, and web applications using Python, ML, and modern web technologies.",
        languages: [
            { name: "English", level: "Fluent" },
            { name: "Tamil", level: "Native" },
            { name: "Hindi", level: "Advanced" },
            { name: "Japanese", level: "Beginner" }
        ]
    },
    projects: [
        {
            id: "crowd-pulse",
            title: "CrowdPulse – AI Crowd Safety System",
            description: "AI crowd monitoring using YOLOv8, ByteTrack, OpenCV, FastAPI, and React. Calculates real-time crowd density and issues safety alerts for public spaces.",
            tags: ["Python", "YOLOv8", "OpenCV", "FastAPI", "React"],
            github: "https://github.com/imnotparama/CrowdPulse"
        },
        {
            id: "dialora",
            title: "Dialora – AI Tele-Calling Agent",
            description: "Fully local AI calling agent built in 24hrs at ORIGIN 26 hackathon. Powered by FastAPI, Ollama (llama3.2), pyttsx3, browser speech-to-text, and React/Vite/Tailwind.",
            tags: ["FastAPI", "Ollama", "React", "Tailwind", "SQLite"],
            github: "https://github.com/imnotparama"
        },
        {
            id: "eco-mentor",
            title: "EcoMentor AI",
            description: "Agentic AI sustainability advisor built for Google Agentic Wars Hackathon. Developed with React 19, FastAPI, and Claude API. Deployed on Vercel and Render.",
            tags: ["React", "FastAPI", "Claude API", "Vercel"],
            github: "https://github.com/imnotparama"
        },
        {
            id: "prmxa",
            title: "PRMxA – Personal Streaming Site",
            description: "Streaming platform for movies, TV shows, anime, and sports. Integrates Trakt API, Fanart.tv, Jikan API, and VidLink embeds inside a PWA-enabled React + Vite + Tailwind interface.",
            tags: ["React", "Vite", "Tailwind", "Trakt API", "PWA"],
            github: "https://github.com/imnotparama"
        },
        {
            id: "smart-parking",
            title: "Smart Parking Management System",
            description: "Django web application for automated parking slots management, mapping vehicle-slot allocations with real-time slot booking availability.",
            tags: ["Django", "Python", "SQL"],
            github: "https://github.com/imnotparama"
        },
        {
            id: "bus-it",
            title: "BusIT – Smart Bus Tracking System",
            description: "Django-based vehicle tracking system integrating GPS sensor streams to monitor live bus locations and calculate ETA updates for college students.",
            tags: ["Django", "Python", "GPS APIs"],
            github: "https://github.com/imnotparama"
        }
    ],
    skills: {
        ai_ml: ["Python", "Machine Learning", "OpenCV", "YOLO", "Pandas", "NumPy"],
        web: ["Django", "FastAPI", "React", "JavaScript", "HTML", "CSS", "Vite"],
        data: ["SQL", "Power BI", "Data Analysis", "Git"],
        hardware: ["Arduino", "IoT", "IR Sensors", "ESP32"]
    },
    education: [
        {
            degree: "B.Tech Electronics and Communication Engineering with Specialization in Data Science",
            institution: "SRM Institute of Science and Technology, Chennai",
            duration: "2024 – 2028",
            grade: "GPA: 9.51 / 10"
        },
        {
            degree: "Class XII",
            institution: "Chennai, India",
            duration: "2023 – 2024",
            grade: "Percentage: 82%"
        },
        {
            degree: "Class X",
            institution: "Chennai, India",
            duration: "2021 – 2022",
            grade: "Percentage: 92%"
        }
    ],
    experience: [
        {
            role: "Intern",
            company: "Beau Roi",
            duration: "May 2025 – June 2025",
            location: "Chennai, India",
            details: [
                "Assisted in backend development using Python and Django.",
                "Participated in debugging, feature implementation, and engineering team collaboration."
            ]
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
    ],
    stack: {
        languages: ["Python", "JavaScript", "C", "SQL"],
        frameworks: ["Django", "FastAPI", "React", "Vite", "Tailwind"],
        ai_ml: ["YOLOv8", "OpenCV", "Pandas", "NumPy", "Scikit-learn"],
        tools: ["Git", "Power BI", "Figma", "Arduino IDE", "VS Code"],
        cloud: ["Vercel", "Render", "GitHub Pages"]
    }
};
