import type { WorkspaceJobInput } from "@shared/types/ai";
import type { WorkspaceState } from "@shared/types/state";

/** Defaults shared by the web app and the Node.js backend. No browser or server-only imports here. */

export const SAMPLE_JOB: WorkspaceJobInput = {
  title: "Senior Frontend Engineer",
  company: "Lumen Labs",
  location: "Remote (EU)",
  url: "https://example.com/jobs/senior-frontend-engineer",
  description: `Senior Frontend Engineer

About us
Lumen Labs builds analytics tools for product teams. We are a fast-paced, remote-first company with high ownership and small teams.

What you'll do
- Own the architecture of our customer-facing web app built with React, TypeScript and Next.js
- Design performant, accessible UI and improve Core Web Vitals across the product
- Collaborate with designers and product managers to ship features end to end
- Mentor engineers and raise the quality bar through code reviews

Requirements
- 5+ years of professional experience building web applications
- Strong proficiency in React and TypeScript
- Experience with GraphQL APIs and REST
- Solid understanding of web performance and accessibility (WCAG)
- Experience writing automated tests with Jest and Playwright
- Experience with CI/CD pipelines and Docker
- Excellent communication skills and a track record of working cross-functionally

Nice to have
- Experience with Storybook and design systems
- Familiarity with AWS or Vercel
- Experience with Kubernetes or Terraform
- Background in analytics or developer tools

Benefits
Competitive salary, equity, 30 days holiday and a home-office budget.`,
};

export const DEFAULT_QUESTIONS: string[] = [
  "How many years of experience do you have with React?",
  "How many years of experience do you have with TypeScript?",
  "What are your salary expectations?",
  "What is your notice period?",
  "Are you legally authorized to work in this country?",
  "Will you now or in the future require visa sponsorship?",
  "Why do you want to work at this company?",
];

export function emptyWorkspace(): WorkspaceState {
  return {
    job: { title: "", company: "", location: "", url: "", description: "" },
    tone: "professional",
    instructions: "",
    analysis: null,
    coverLetter: "",
    coverLetterEngine: null,
    questions: DEFAULT_QUESTIONS,
    answers: [],
    analysedCvId: null,
  };
}

export function sampleWorkspace(): WorkspaceState {
  return { ...emptyWorkspace(), job: SAMPLE_JOB };
}
