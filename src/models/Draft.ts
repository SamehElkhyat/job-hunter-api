import { model, models, Schema, type HydratedDocument, type Model, type Types } from "mongoose";
import type { CoverLetterTone, DraftAnswer, MatchAnalysis, WorkspaceJobInput } from "@shared/types/ai";
import { ENGINES, SINGLETON_KEY, TONES } from "./constants";
import { answerSchema, createJobSchema } from "./shared";

/** The in-progress job / analysis / cover letter the user is working on (single-user singleton). */
export interface IDraft {
  key: string;
  job: WorkspaceJobInput;
  tone: CoverLetterTone;
  instructions: string;
  analysis: MatchAnalysis | null;
  coverLetter: string;
  coverLetterEngine: "claude" | "local" | null;
  questions: string[];
  answers: DraftAnswer[];
  /** Id of the CV version the current analysis was run against. */
  analysedCvId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DraftRecord = IDraft & { _id: Types.ObjectId };
export type DraftDocument = HydratedDocument<IDraft>;

const draftSchema = new Schema<IDraft>(
  {
    key: { type: String, required: true, unique: true, default: SINGLETON_KEY },
    job: { type: createJobSchema(false), default: () => ({}) },
    tone: { type: String, enum: TONES, default: "professional" },
    instructions: { type: String, default: "", maxlength: 2000 },
    // Analyses are produced by our own engine and validated by Zod at the API edge.
    analysis: { type: Schema.Types.Mixed, default: null },
    coverLetter: { type: String, default: "", maxlength: 20000 },
    coverLetterEngine: { type: String, enum: [...ENGINES, null], default: null },
    questions: { type: [{ type: String, maxlength: 500 }], default: [] },
    answers: { type: [answerSchema], default: [] },
    analysedCvId: { type: String, default: null, maxlength: 80 },
  },
  { timestamps: true, minimize: false },
);

export const DraftModel: Model<IDraft> = (models.Draft as Model<IDraft> | undefined) ?? model<IDraft>("Draft", draftSchema);
