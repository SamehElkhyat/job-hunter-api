import { model, models, Schema, type HydratedDocument, type Model, type Types } from "mongoose";

export interface ICvVersion {
  /** Human label, e.g. "Full-Stack v3 – React focus". */
  label: string;
  /** Plain-text CV used for analysis and prompt context. */
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CvVersionRecord = ICvVersion & { _id: Types.ObjectId };
export type CvVersionDocument = HydratedDocument<ICvVersion>;

const cvVersionSchema = new Schema<ICvVersion>(
  {
    label: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    text: { type: String, default: "", maxlength: 100_000 },
  },
  { timestamps: true },
);

cvVersionSchema.index({ createdAt: 1 });

export const CvVersionModel: Model<ICvVersion> =
  (models.CvVersion as Model<ICvVersion> | undefined) ?? model<ICvVersion>("CvVersion", cvVersionSchema);
