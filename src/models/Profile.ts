import { model, models, Schema, type HydratedDocument, type Model, type Types } from "mongoose";
import type { CandidateProfile } from "@shared/types/cv";
import { SINGLETON_KEY } from "./constants";

/**
 * The candidate's profile (facts used for auto-fill and recruiter answers) plus which CV version is active.
 * The app is single-user, so there is exactly one document, identified by `key`.
 */
export interface IProfile extends CandidateProfile {
  key: string;
  activeCvId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ProfileRecord = IProfile & { _id: Types.ObjectId };
export type ProfileDocument = HydratedDocument<IProfile>;

const text = (max: number) => ({ type: String, trim: true, maxlength: max, default: "" });

const profileSchema = new Schema<IProfile>(
  {
    key: { type: String, required: true, unique: true, default: SINGLETON_KEY },
    activeCvId: { type: Schema.Types.ObjectId, ref: "CvVersion", default: null },
    fullName: text(200),
    email: text(200),
    phone: text(80),
    location: text(200),
    linkedin: text(500),
    github: text(500),
    portfolio: text(500),
    currentTitle: text(200),
    currentCompany: text(200),
    yearsExperience: text(20),
    expectedSalary: text(60),
    salaryCurrency: { ...text(10), default: "USD" },
    noticePeriod: text(120),
    workAuthorization: text(300),
    willingToRelocate: { type: Boolean, default: false },
    requiresSponsorship: { type: Boolean, default: false },
    referralSource: text(300),
  },
  { timestamps: true },
);

export const ProfileModel: Model<IProfile> =
  (models.Profile as Model<IProfile> | undefined) ?? model<IProfile>("Profile", profileSchema);
