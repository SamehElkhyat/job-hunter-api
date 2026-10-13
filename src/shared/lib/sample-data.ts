import type { WorkspaceJobInput } from "@shared/types/ai";
import type { CandidateProfile } from "@shared/types/cv";
import type { Application, ApplicationStatus } from "@shared/types/job";
import { analyzeLocal, generateCoverLetterLocal } from "@shared/lib/ai/local-engine";
import { uid } from "@shared/lib/utils";

export { DEFAULT_QUESTIONS, SAMPLE_JOB } from "@shared/lib/workspace-defaults";

export const SAMPLE_CV = `Alex Morgan
Senior Full-Stack Engineer · Berlin, Germany
alex.morgan@example.com · github.com/alexmorgan · linkedin.com/in/alexmorgan

SUMMARY
Full-stack engineer with 7+ years of experience building SaaS products with TypeScript, React and Node.js. Strong in API design, performance work and mentoring engineers.

EXPERIENCE
Senior Software Engineer — Northwind Pay (fintech) · Mar 2021 – Present
- Led a team of 4 engineers to rebuild the merchant dashboard in React and Next.js, cutting time-to-interactive by 46% and lifting conversion by 12%.
- Designed a REST and GraphQL API layer on Node.js and PostgreSQL serving 3M requests per day with p95 latency under 180ms.
- Introduced CI/CD with GitHub Actions and Docker, reducing release time from 2 days to 25 minutes.
- Mentored 5 junior engineers through code reviews and weekly pairing sessions.
- Owned the migration of 14 services to AWS (ECS, S3, CloudFront) and set up Datadog monitoring and alerting.

Software Engineer — Brightcart (e-commerce) · Jun 2018 – Feb 2021
- Built checkout and payments flows with React, Redux and Stripe, processing $8M in monthly volume.
- Wrote Jest and Cypress test suites that raised coverage from 31% to 84%.
- Partnered with product managers and designers in an Agile team to ship 40+ features.
- Optimised PostgreSQL queries and added Redis caching, cutting page load time by 38%.

PROJECTS
- Open-source CLI "shipit" (TypeScript, 1.2k GitHub stars) for automating release notes.
- Side project: RAG-based documentation search using OpenAI embeddings and pgvector.

SKILLS
TypeScript, JavaScript, React, Next.js, Node.js, Express, Redux, GraphQL, REST, PostgreSQL, MongoDB, Redis, Docker, AWS, Git, Jest, Cypress, Tailwind CSS, Agile

EDUCATION
B.Sc. Computer Science — Technical University of Berlin, 2018
`;

export const SAMPLE_PROFILE: CandidateProfile = {
  fullName: "Alex Morgan",
  email: "alex.morgan@example.com",
  phone: "+49 170 0000000",
  location: "Berlin, Germany",
  linkedin: "https://linkedin.com/in/alexmorgan",
  github: "https://github.com/alexmorgan",
  portfolio: "https://alexmorgan.dev",
  currentTitle: "Senior Software Engineer",
  currentCompany: "Northwind Pay",
  yearsExperience: "7",
  expectedSalary: "95,000",
  salaryCurrency: "EUR",
  noticePeriod: "1 month",
  workAuthorization: "Authorised to work in the EU (German citizen)",
  willingToRelocate: false,
  requiresSponsorship: false,
  referralSource: "Company careers page",
};

interface DemoSeed {
  job: WorkspaceJobInput;
  status: ApplicationStatus;
  daysAgo: number;
  notes?: string;
}

const DEMO_SEEDS: DemoSeed[] = [
  {
    status: "queue",
    daysAgo: 0,
    job: {
      title: "Senior Full-Stack Engineer",
      company: "Orbit Commerce",
      location: "Remote (EU)",
      url: "https://example.com/jobs/orbit-fullstack",
      description: `Senior Full-Stack Engineer
Requirements
- 5+ years building production web applications
- Strong TypeScript, React and Node.js
- Experience with PostgreSQL and Redis
- Experience with AWS and Docker
- Experience with e-commerce or payments platforms
Nice to have
- GraphQL, Kubernetes
We are a fast-paced startup with high ownership.`,
    },
  },
  {
    status: "queue",
    daysAgo: 1,
    job: {
      title: "Staff Software Engineer, Platform",
      company: "Helix Systems",
      location: "Berlin, Germany",
      url: "https://example.com/jobs/helix-staff",
      description: `Staff Software Engineer, Platform
Requirements
- 9+ years of software engineering experience
- Deep knowledge of distributed systems and microservices
- Strong Go or Java, plus Kubernetes and Terraform
- Track record of technical leadership and mentoring
- Experience with Kafka and observability tooling
Nice to have
- Experience with security and compliance in regulated industries`,
    },
  },
  {
    status: "saved",
    daysAgo: 2,
    job: {
      title: "Frontend Engineer",
      company: "Pixelforge",
      location: "Remote",
      url: "https://example.com/jobs/pixelforge-frontend",
      description: `Frontend Engineer
Requirements
- 3+ years of experience with React and TypeScript
- Experience with design systems and Storybook
- Strong CSS skills and Tailwind CSS
- Knowledge of accessibility and web performance
Nice to have
- Figma, Cypress`,
    },
  },
  {
    status: "applied",
    daysAgo: 6,
    notes: "Applied via referral from Sam. Follow up on Friday.",
    job: {
      title: "Full-Stack Developer",
      company: "Northlight Health",
      location: "Hamburg, Germany",
      url: "https://example.com/jobs/northlight",
      description: `Full-Stack Developer
Requirements
- 4+ years with Node.js, React and PostgreSQL
- Experience with healthcare or regulated software
- Experience with REST APIs and automated testing
- Good communication and collaboration
Nice to have
- Docker, AWS`,
    },
  },
  {
    status: "interview",
    daysAgo: 11,
    notes: "Technical interview Thursday 14:00 CET: system design + live coding.",
    job: {
      title: "Senior Software Engineer",
      company: "Vantage Analytics",
      location: "Remote (EU)",
      url: "https://example.com/jobs/vantage",
      description: `Senior Software Engineer
Requirements
- 6+ years of experience with TypeScript and Node.js
- Experience designing APIs (REST and GraphQL)
- Experience with PostgreSQL, Redis and AWS
- Mentoring and cross-functional collaboration
Nice to have
- Experience with analytics products, Kafka`,
    },
  },
  {
    status: "offer",
    daysAgo: 20,
    notes: "Offer received: negotiating equity. Decision due in 7 days.",
    job: {
      title: "Lead Frontend Engineer",
      company: "Cobalt Studio",
      location: "Remote",
      url: "https://example.com/jobs/cobalt",
      description: `Lead Frontend Engineer
Requirements
- 6+ years with React, TypeScript and Next.js
- Leadership experience mentoring engineers
- Web performance and accessibility expertise
- CI/CD and testing experience with Jest and Cypress
Nice to have
- Design systems`,
    },
  },
  {
    status: "rejected",
    daysAgo: 15,
    notes: "Rejected after screening: they wanted deep Rust experience.",
    job: {
      title: "Backend Engineer (Rust)",
      company: "Ferrous Labs",
      location: "Remote",
      url: "https://example.com/jobs/ferrous",
      description: `Backend Engineer
Requirements
- 5+ years of systems programming experience
- Strong Rust, C++ or Go
- Experience with Kafka and Kubernetes
- Linux internals and networking knowledge`,
    },
  },
];

export function createDemoApplications(cvId: string, cvLabel: string, cvText: string): Application[] {
  return DEMO_SEEDS.map((seed) => {
    const created = new Date(Date.now() - seed.daysAgo * 86_400_000).toISOString();
    const analysis = analyzeLocal({ cvText, job: seed.job });
    const coverLetter = generateCoverLetterLocal({
      cvText,
      job: seed.job,
      tone: "professional",
      candidateName: SAMPLE_PROFILE.fullName,
      analysis,
      instructions: "",
    });
    const appliedAt = ["applied", "interview", "offer", "rejected"].includes(seed.status) ? created : null;
    return {
      id: uid("app"),
      job: seed.job,
      status: seed.status,
      cvVersionId: cvId,
      cvVersionLabel: cvLabel,
      analysis,
      coverLetter,
      tone: "professional" as const,
      answers: [],
      recruiterLinks: [],
      notes: seed.notes ?? "",
      activity: [
        { id: uid("log"), kind: "created" as const, message: "Application created", at: created },
        ...(appliedAt
          ? [{ id: uid("log"), kind: "submitted" as const, message: "Marked as submitted", at: appliedAt }]
          : []),
      ],
      createdAt: created,
      updatedAt: created,
      appliedAt,
      isDemo: true,
    };
  });
}
