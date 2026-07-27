// Data Schema and Content for the Portfolio

export interface Project {
    id: string;
    title: string;
    description: string;
    technologies: string[];
    githubUrl?: string;
    liveUrl?: string;
    threeJsDetails?: {
        color: number;       // Base color representation in hex for 3D interactives
        shape: 'cube' | 'sphere' | 'torus' | 'cone' | 'cylinder'; // 3D geometry shape mapping
        scale: number;
    };
}

export interface Experience {
    id: string;
    jobTitle: string;
    company: string;
    duration: string;
    location: string;
    type: string;
    details: string[];
}

export interface Education {
    id: string;
    degree: string;
    institution: string;
    duration: string;
    location: string;
    grade: string;
}

export interface Certification {
    id: string;
    title: string;
    provider: string;
    year?: string;
    details?: string[];
}

export interface Language {
    name: string;
    proficiency: 'Native' | 'Fluent' | 'Advanced' | 'Intermediate' | 'Beginner';
    rating: number; // 1-5 scale for visual representations
}

export interface PersonalInfo {
    name: string;
    tagline: string;
    location: string;
    email: string;
    phone: string;
    socials: {
        linkedin: string;
        github: string;
    };
    summary: string;
}

// Portfolio Data Instance
export const portfolioData: {
    personalInfo: PersonalInfo;
    experience: Experience[];
    projects: Project[];
    skills: string[];
    education: Education[];
    certifications: Certification[];
    languages: Language[];
} = {
    personalInfo: {
        name: "Parameshwaran S",
        tagline: "Data Science-focused Electronics and Communication Engineering Student",
        location: "Chennai, Tamilnadu",
        email: "pw2491@srmist.edu.in",
        phone: "9176020504",
        socials: {
            linkedin: "https://linkedin.com",
            github: "https://github.com"
        },
        summary: "Data Science-focused Electronics and Communication Engineering student skilled in Python, Django, and machine learning. Experienced in developing real-world applications including smart parking systems, bus tracking solutions, and AI-based crowd monitoring using OpenCV and YOLO. Interested in building scalable, data-driven technology solutions."
    },
    experience: [
        {
            id: "intern-beau-roi",
            jobTitle: "Intern",
            company: "Beau Roi",
            duration: "05/2025 - 06/2025",
            location: "Chennai, India",
            type: "Project-based Internship",
            details: [
                "Assisted in backend development using Python and Django",
                "Participated in debugging, feature implementation, and team discussions"
            ]
        }
    ],
    projects: [
        {
            id: "smart-parking",
            title: "Smart Parking Management System",
            description: "Built a Django web application for managing parking slots with real-time availability, slot booking, and vehicle-slot mapping.",
            technologies: ["Python", "Django", "SQL"],
            threeJsDetails: {
                color: 0x3b82f6, // Blue
                shape: "cube",
                scale: 1
            }
        },
        {
            id: "crowd-pulse",
            title: "CrowdPulse – AI Crowd Safety System",
            description: "Designed an AI-based crowd monitoring system to analyze crowd density and movement for real-time safety alerts in public spaces.",
            technologies: ["Python", "OpenCV", "YOLO", "Machine Learning"],
            threeJsDetails: {
                color: 0xef4444, // Red
                shape: "sphere",
                scale: 1.1
            }
        },
        {
            id: "bus-it",
            title: "BusIT – Smart Bus Tracking System",
            description: "Developed a Django-based bus tracking system integrating GPS data to monitor live bus locations and provide ETA updates for students.",
            technologies: ["Python", "Django", "GPS APIs", "IoT"],
            threeJsDetails: {
                color: 0x10b981, // Green
                shape: "cylinder",
                scale: 1
            }
        },
        {
            id: "forensiq",
            title: "Forensiq – Criminal Records Management System",
            description: "Built a database-based application to store, manage, and analyze records of past and current criminal cases for efficient data tracking and retrieval.",
            technologies: ["Python", "Django", "SQL", "Database Design"],
            threeJsDetails: {
                color: 0xf59e0b, // Amber
                shape: "cone",
                scale: 0.9
            }
        },
        {
            id: "driver-alarm",
            title: "Anti-Sleep Driver Alarm",
            description: "Developed an Arduino-based driver safety system using IR sensors to detect drowsiness and trigger buzzer alerts.",
            technologies: ["Arduino", "Sensors", "IoT", "C++"],
            threeJsDetails: {
                color: 0x8b5cf6, // Purple
                shape: "torus",
                scale: 1.2
            }
        }
    ],
    skills: [
        "Python", "Django", "SQL", "Data Analysis",
        "Pandas", "NumPy", "Power BI", "Git",
        "Arduino & Microcontrollers", "IoT",
        "JavaScript", "HTML", "CSS", "APIs",
        "Machine Learning", "OpenCV", "YOLO"
    ],
    education: [
        {
            id: "btech-srm",
            degree: "Bachelor of Technology in Electronics and Communication Engineering with Specialization in Data Science",
            institution: "SRM Institute of Science and Technology",
            duration: "08/2024 - 05/2028",
            location: "Chennai, India",
            grade: "GPA: 9.51 / 10"
        },
        {
            id: "class-xii",
            degree: "Class XII",
            institution: "Chennai, India",
            duration: "06/2023 - 05/2024",
            location: "Chennai, India",
            grade: "Percentage: 82%"
        },
        {
            id: "class-x",
            degree: "Class X",
            institution: "Chennai, India",
            duration: "06/2021 - 05/2022",
            location: "Chennai, India",
            grade: "Percentage: 92%"
        }
    ],
    certifications: [
        {
            id: "cert-nptel",
            title: "Data Analytics with Python",
            provider: "NPTEL (Elite, 2025)"
        },
        {
            id: "cert-infosys",
            title: "Foundation of Data Science",
            provider: "Infosys Springboard"
        },
        {
            id: "cert-maiyyam",
            title: "Professional Certification Programs",
            provider: "Maiyyam Learning Platform (ISO Certified)",
            details: [
                "Data Analytics (Power BI, SQL, Excel)",
                "Full Stack Web Development (HTML, CSS, JavaScript)",
                "UI/UX Design (Figma, Wireframing)"
            ]
        },
        {
            id: "cert-accenture",
            title: "Digital Skills: Artificial Intelligence",
            provider: "Accenture"
        },
        {
            id: "cert-ibm",
            title: "Getting Started with Artificial Intelligence",
            provider: "IBM SkillsBuild"
        }
    ],
    languages: [
        { name: "English", proficiency: "Fluent", rating: 5 },
        { name: "Tamil", proficiency: "Native", rating: 5 },
        { name: "Hindi", proficiency: "Advanced", rating: 3 },
        { name: "Japanese", proficiency: "Beginner", rating: 1 }
    ]
};
