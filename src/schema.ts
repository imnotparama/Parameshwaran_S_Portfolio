// ============================================================
// Portfolio Data Schema — Type definitions only
// Runtime data lives in src/data/portfolio.js
// ============================================================

export interface PersonalInfo {
    name: string;
    tagline: string;
    institution: string;
    location: string;
    email: string;
    phone: string;
    socials: {
        github: string;
        linkedin: string;
    };
    stats: { label: string; value: string }[];
    bio: string;
    languages: { name: string; level: string }[];
}

export interface Project {
    id: string;
    title: string;
    description: string;
    tags: string[];
    github: string;
}

export interface SkillCategory {
    ai_ml: string[];
    web: string[];
    data: string[];
    hardware: string[];
}

export interface EducationEntry {
    degree: string;
    institution: string;
    duration: string;
    grade: string;
}

export interface ExperienceEntry {
    role: string;
    company: string;
    duration: string;
    location: string;
    details: string[];
}

export interface StackCategory {
    languages: string[];
    frameworks: string[];
    ai_ml: string[];
    tools: string[];
    cloud: string[];
}

export interface PortfolioData {
    personalInfo: PersonalInfo;
    projects: Project[];
    skills: SkillCategory;
    education: EducationEntry[];
    experience: ExperienceEntry[];
    certifications: string[];
    stack: StackCategory;
}
