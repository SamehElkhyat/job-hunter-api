import { Schema } from "mongoose";
import type { DraftAnswer, WorkspaceJobInput } from "@shared/types/ai";
import { CONFIDENCE_LEVELS, ENGINES } from "./constants";

/** Job description fields. `requireTitle` is true for applications, false for the in-progress draft. */
export function createJobSchema(requireTitle: boolean): Schema<WorkspaceJobInput> {
  return new Schema<WorkspaceJobInput>(
    {
      title: { type: String, trim: true, maxlength: 200, default: "", required: requireTitle },
      company: { type: String, trim: true, maxlength: 200, default: "" },
      location: { type: String, trim: true, maxlength: 200, default: "" },
      url: { type: String, trim: true, maxlength: 2000, default: "" },
      description: { type: String, maxlength: 30000, default: "" },
    },
    { _id: false },
  );
}

/** A drafted answer to a recruiter/application-form question. `id` is the client-visible key. */
export const answerSchema = new Schema<DraftAnswer>(
  {
    id: { type: String, required: true, maxlength: 80 },
    question: { type: String, required: true, maxlength: 500 },
    answer: { type: String, default: "", maxlength: 5000 },
    confidence: { type: String, enum: CONFIDENCE_LEVELS, default: "low" },
    needsReview: { type: Boolean, default: true },
    engine: { type: String, enum: ENGINES, default: "local" },
  },
  { _id: false },
);
