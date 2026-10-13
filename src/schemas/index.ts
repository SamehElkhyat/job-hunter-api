import { z } from "zod";
import type { DraftAnswer, MatchAnalysis } from "@shared/types/ai";
import { ACTIVITY_KINDS, APPLICATION_STATUSES, CONFIDENCE_LEVELS, CREATABLE_STATUSES, ENGINES, LINK_KINDS, TONES } from "../models/constants";

/** Zod request schemas for the data endpoints. (AI request schemas live in lib/ai/schemas.ts.) */

const status = z.enum(APPLICATION_STATUSES);
const tone = z.enum(TONES);
const engine = z.enum(ENGINES);
const objectIdString = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

const job = z.object({
  title: z.string().max(200),
  company: z.string().max(200),
  location: z.string().max(200),
  url: z.string().max(2000),
  description: z.string().max(30000),
});

/** Analyses are produced by our own engine and stored verbatim; only the envelope is checked. */
const analysis = z.custom<MatchAnalysis>(
  (v) => typeof v === "object" && v !== null && typeof (v as MatchAnalysis).overallScore === "number" && "breakdown" in v,
  "Invalid analysis",
);

const answer = z.object({
  id: z.string().min(1).max(80),
  question: z.string().max(500),
  answer: z.string().max(5000),
  confidence: z.enum(CONFIDENCE_LEVELS),
  needsReview: z.boolean(),
  engine,
}) satisfies z.ZodType<DraftAnswer>;

/* ------------------------------- draft / workspace ------------------------------- */

export const draftSchema = z.object({
  job,
  tone,
  instructions: z.string().max(2000),
  analysis: analysis.nullable(),
  coverLetter: z.string().max(20000),
  coverLetterEngine: engine.nullable(),
  questions: z.array(z.string().max(500)).max(50),
  answers: z.array(answer).max(50),
  analysedCvId: z.string().max(80).nullable(),
});

/* --------------------------------- CV versions --------------------------------- */

export const cvCreateSchema = z.object({
  label: z.string().trim().min(1).max(120),
  text: z.string().max(100_000),
});

export const cvPatchSchema = z
  .object({ label: z.string().trim().min(1).max(120), text: z.string().max(100_000) })
  .partial()
  .strict();

export const activeCvSchema = z.object({ id: objectIdString });

/* ----------------------------------- profile ----------------------------------- */

export const profilePatchSchema = z
  .object({
    fullName: z.string().max(200),
    email: z.string().max(200),
    phone: z.string().max(80),
    location: z.string().max(200),
    linkedin: z.string().max(500),
    github: z.string().max(500),
    portfolio: z.string().max(500),
    currentTitle: z.string().max(200),
    currentCompany: z.string().max(200),
    yearsExperience: z.string().max(20),
    expectedSalary: z.string().max(60),
    salaryCurrency: z.string().max(10),
    noticePeriod: z.string().max(120),
    workAuthorization: z.string().max(300),
    willingToRelocate: z.boolean(),
    requiresSponsorship: z.boolean(),
    referralSource: z.string().max(300),
  })
  .partial()
  .strict();

/* --------------------------------- applications --------------------------------- */

export const applicationCreateSchema = z.object({
  status: z.enum(CREATABLE_STATUSES),
  workspace: draftSchema,
});

export const applicationPatchSchema = z
  .object({
    job,
    coverLetter: z.string().max(20000),
    notes: z.string().max(20000),
    tone,
    answers: z.array(answer).max(50),
    analysis: analysis.nullable(),
  })
  .partial()
  .strict();

export const moveSchema = z.object({ status });

export const activitySchema = z.object({
  kind: z.enum(ACTIVITY_KINDS),
  message: z.string().trim().min(1).max(500),
});

export const linkSchema = z.object({
  label: z.string().trim().min(1).max(200),
  url: z.string().trim().min(1).max(2000),
  kind: z.enum(LINK_KINDS),
});

export type ApplicationPatchInput = z.infer<typeof applicationPatchSchema>;
export type DraftInput = z.infer<typeof draftSchema>;
export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;
