import { model, models, Schema, type HydratedDocument, type Model, type Types } from "mongoose";
import type { ActivityKind } from "@shared/types/job";
import { ACTIVITY_KINDS } from "./constants";

/** One line of an application's history (created, moved, link added, submitted…). Append-only. */
export interface IActivityLog {
  applicationId: Types.ObjectId;
  kind: ActivityKind;
  message: string;
  at: Date;
}

export type ActivityLogRecord = IActivityLog & { _id: Types.ObjectId };
export type ActivityLogDocument = HydratedDocument<IActivityLog>;

const activityLogSchema = new Schema<IActivityLog>(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: "Application", required: true },
    kind: { type: String, enum: ACTIVITY_KINDS, required: true },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false },
);

activityLogSchema.index({ applicationId: 1, at: 1 });

export const ActivityLogModel: Model<IActivityLog> =
  (models.ActivityLog as Model<IActivityLog> | undefined) ?? model<IActivityLog>("ActivityLog", activityLogSchema);
