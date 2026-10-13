import { z } from "zod";

/**
 * Zod schemas describing what Claude must return. They are passed to the SDK via
 * `zodOutputFormat`, so the response is constrained to this exact shape.
 * Ranges (0-100) are enforced in the prompt and clamped after parsing, because
 * structured outputs do not support numeric min/max constraints.
 */

const scoreCategory = z.object({
  score: z.number(),
  summary: z.string(),
  matched: z.array(z.string()),
  missing: z.array(z.string()),
});

export const analysisOutputSchema = z.object({
  headline: z.string(),
  job: z.object({
    title: z.string(),
    company: z.string(),
    seniority: z.enum([
      "intern",
      "junior",
      "mid",
      "senior",
      "staff",
      "principal",
      "lead",
      "unspecified",
    ]),
    /** 0 when the job description does not state a number of years. */
    requiredYears: z.number(),
    tone: z.string(),
    mustHaves: z.array(z.string()),
  }),
  breakdown: z.object({
    hardSkills: scoreCategory,
    softSkills: scoreCategory,
    experience: scoreCategory,
    tools: scoreCategory,
  }),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(
    z.object({
      keyword: z.string(),
      importance: z.enum(["critical", "important", "nice"]),
      suggestion: z.string(),
    }),
  ),
  gaps: z.array(
    z.object({
      title: z.string(),
      severity: z.enum(["critical", "moderate", "minor"]),
      detail: z.string(),
    }),
  ),
  recommendations: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      impact: z.enum(["high", "medium", "low"]),
      section: z.enum(["summary", "skills", "experience", "projects", "education", "headline"]),
    }),
  ),
});

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

export const answersOutputSchema = z.object({
  answers: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
      needsReview: z.boolean(),
    }),
  ),
});

export type AnswersOutput = z.infer<typeof answersOutputSchema>;

/** Validation for request bodies hitting the API routes. */
const jobInput = z.object({
  title: z.string().max(200),
  company: z.string().max(200),
  location: z.string().max(200),
  url: z.string().max(2000),
  description: z.string().min(1).max(30000),
});

export const analyzeRequestSchema = z.object({
  cvText: z.string().min(1).max(40000),
  job: jobInput,
});

const matchAnalysisLoose = z.custom<import("@shared/types/ai").MatchAnalysis>(
  (value) => typeof value === "object" && value !== null && "overallScore" in value,
);

export const coverLetterRequestSchema = z.object({
  cvText: z.string().min(1).max(40000),
  job: jobInput,
  tone: z.enum(["professional", "confident", "startup", "technical"]),
  candidateName: z.string().max(200),
  analysis: matchAnalysisLoose.nullable(),
  instructions: z.string().max(2000),
});

export const answersRequestSchema = z.object({
  cvText: z.string().min(1).max(40000),
  job: jobInput,
  profileFacts: z.record(z.string(), z.string()),
  questions: z.array(z.string().min(1).max(500)).min(1).max(20),
});
