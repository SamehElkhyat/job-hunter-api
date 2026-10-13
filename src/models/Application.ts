import { model, models, Schema, type HydratedDocument, type Model, type Types } from "mongoose";
import type { CoverLetterTone, DraftAnswer, MatchAnalysis, WorkspaceJobInput } from "@shared/types/ai";
import type { ApplicationStatus, RecruiterLinkKind } from "@shared/types/job";
import { APPLICATION_STATUSES, LINK_KINDS, TONES } from "./constants";
import { answerSchema, createJobSchema } from "./shared";

export interface IRecruiterLink {
  /** Assigned by Mongoose when the subdocument is saved. */
  _id?: Types.ObjectId;
  label: string;
  url: string;
  kind: RecruiterLinkKind;
}

/** A job application moving through the pipeline. Its history lives in the ActivityLog collection. */
export interface IApplication {
  job: WorkspaceJobInput;
  status: ApplicationStatus;
  /** CV version used, pinned at creation. The label is copied so it survives deletion of the version. */
  cvVersionId: Types.ObjectId | null;
  cvVersionLabel: string;
  analysis: MatchAnalysis | null;
  /** Denormalised copy of analysis.overallScore (0-100) so lists can be sorted and filtered by it. */
  matchScore: number | null;
  coverLetter: string;
  tone: CoverLetterTone;
  answers: DraftAnswer[];
  recruiterLinks: IRecruiterLink[];
  notes: string;
  appliedAt: Date | null;
  /** True for seeded sample rows so they can be removed in one click. */
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ApplicationRecord = IApplication & { _id: Types.ObjectId };
export type ApplicationDocument = HydratedDocument<IApplication>;

const recruiterLinkSchema = new Schema<IRecruiterLink>(
  {
    label: { type: String, required: true, trim: true, maxlength: 200 },
    url: { type: String, required: true, trim: true, maxlength: 2000 },
    kind: { type: String, enum: LINK_KINDS, default: "other" },
  },
  { _id: true },
);

const applicationSchema = new Schema<IApplication>(
  {
    job: { type: createJobSchema(true), required: true },
    status: { type: String, enum: APPLICATION_STATUSES, required: true, default: "saved" },
    cvVersionId: { type: Schema.Types.ObjectId, ref: "CvVersion", default: null },
    cvVersionLabel: { type: String, default: "", maxlength: 120 },
    analysis: { type: Schema.Types.Mixed, default: null },
    matchScore: { type: Number, min: 0, max: 100, default: null },
    coverLetter: { type: String, default: "", maxlength: 20000 },
    tone: { type: String, enum: TONES, default: "professional" },
    answers: { type: [answerSchema], default: [] },
    recruiterLinks: { type: [recruiterLinkSchema], default: [] },
    notes: { type: String, default: "", maxlength: 20000 },
    appliedAt: { type: Date, default: null },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, minimize: false },
);

applicationSchema.index({ status: 1, updatedAt: -1 });
applicationSchema.index({ updatedAt: -1 });
applicationSchema.index({ isDemo: 1 });
applicationSchema.index({ matchScore: -1 });

// Keep the denormalised score in sync whenever the analysis changes.
applicationSchema.pre("validate", function () {
  const score = this.analysis?.overallScore;
  this.matchScore = typeof score === "number" ? Math.min(100, Math.max(0, Math.round(score))) : null;
});

export const ApplicationModel: Model<IApplication> =
  (models.Application as Model<IApplication> | undefined) ?? model<IApplication>("Application", applicationSchema);
