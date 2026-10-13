import { Types } from "mongoose";
import type { Application, ActivityKind, ApplicationStatus, CreatableStatus, RecruiterLinkKind } from "@shared/types/job";
import { STATUS_LABEL } from "@shared/types/job";
import type { WorkspaceState } from "@shared/types/state";
import {
  ActivityLogModel,
  ApplicationModel,
  type ActivityLogRecord,
  type ApplicationDocument,
  type ApplicationRecord,
} from "../models";
import type { ApplicationPatchInput } from "../schemas";
import { toApplicationDto } from "../serializers";
import { HttpError, notFound, toObjectId } from "../utils/http-error";
import { getActiveCv } from "./cv.service";
import { clearDraft } from "./draft.service";

/* ---------------------------------- helpers ---------------------------------- */

const SORT_ACTIVITY = { at: 1, _id: 1 } as const;

async function logActivity(applicationId: Types.ObjectId, kind: ActivityKind, message: string, at = new Date()): Promise<void> {
  await ActivityLogModel.create({ applicationId, kind, message, at });
}

async function touch(applicationId: Types.ObjectId): Promise<void> {
  await ApplicationModel.updateOne({ _id: applicationId }, { $set: { updatedAt: new Date() } });
}

async function loadDto(record: ApplicationRecord): Promise<Application> {
  const logs = await ActivityLogModel.find({ applicationId: record._id }).sort(SORT_ACTIVITY).lean<ActivityLogRecord[]>();
  return toApplicationDto(record, logs);
}

async function findDocument(id: string): Promise<ApplicationDocument> {
  const doc = await ApplicationModel.findById(toObjectId(id, "application id"));
  if (!doc) throw notFound("Application");
  return doc;
}

/** Re-reads a document and returns it as the API shape (with its activity log). */
async function reload(id: Types.ObjectId): Promise<Application> {
  const fresh = await ApplicationModel.findById(id).lean<ApplicationRecord>();
  if (!fresh) throw notFound("Application");
  return loadDto(fresh);
}

/** Accepts only http(s) links, or an email address for `kind: "email"` (stored as mailto:). */
export function normaliseLinkUrl(url: string, kind: RecruiterLinkKind): string | null {
  if (kind === "email" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(url)) return `mailto:${url}`;
  if (kind === "email" && /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(url)) return url;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/* ------------------------------------ reads ------------------------------------ */

export async function listApplications(): Promise<Application[]> {
  const records = await ApplicationModel.find().sort({ updatedAt: -1, _id: -1 }).lean<ApplicationRecord[]>();
  if (!records.length) return [];
  const logs = await ActivityLogModel.find({ applicationId: { $in: records.map((r) => r._id) } })
    .sort(SORT_ACTIVITY)
    .lean<ActivityLogRecord[]>();
  const byApp = new Map<string, ActivityLogRecord[]>();
  for (const log of logs) {
    const key = log.applicationId.toString();
    const bucket = byApp.get(key);
    if (bucket) bucket.push(log);
    else byApp.set(key, [log]);
  }
  return records.map((r) => toApplicationDto(r, byApp.get(r._id.toString()) ?? []));
}

export async function getApplication(id: string): Promise<Application> {
  const record = await ApplicationModel.findById(toObjectId(id, "application id")).lean<ApplicationRecord>();
  if (!record) throw notFound("Application");
  return loadDto(record);
}

/* ----------------------------------- writes ----------------------------------- */

/**
 * Creates an application from the posted workspace snapshot, then clears the saved draft.
 * The draft is cleared last, so if anything fails halfway the user's work is still in the draft.
 */
export async function createFromWorkspace(
  status: CreatableStatus,
  workspace: WorkspaceState,
): Promise<{ application: Application; workspace: WorkspaceState }> {
  if (!workspace.job.description.trim()) throw new HttpError(400, "A job description is required.");
  if (!workspace.job.title.trim()) throw new HttpError(400, "A job title is required.");
  const cv = await getActiveCv();
  if (!cv) throw new HttpError(409, "Add a CV first.");

  const doc = await ApplicationModel.create({
    job: workspace.job,
    status,
    cvVersionId: cv._id,
    cvVersionLabel: cv.label,
    analysis: workspace.analysis,
    coverLetter: workspace.coverLetter,
    tone: workspace.tone,
    answers: workspace.answers,
    recruiterLinks: workspace.job.url ? [{ label: "Job posting", url: workspace.job.url, kind: "posting" }] : [],
  });

  const entries: { kind: ActivityKind; message: string }[] = [{ kind: "created", message: "Application created from workspace" }];
  if (workspace.analysis) entries.push({ kind: "document", message: `Match analysis attached (${workspace.analysis.overallScore}%)` });
  if (workspace.coverLetter.trim()) entries.push({ kind: "document", message: "Cover letter attached" });
  if (status === "queue") entries.push({ kind: "status", message: "Added to the queue" });
  const base = Date.now();
  await ActivityLogModel.insertMany(entries.map((e, i) => ({ applicationId: doc._id, ...e, at: new Date(base + i) })));

  const cleared = await clearDraft();
  return { application: await reload(doc._id), workspace: cleared };
}

export async function patchApplication(id: string, patch: ApplicationPatchInput): Promise<Application> {
  const doc = await findDocument(id);
  doc.set(patch);
  if (patch.analysis !== undefined) doc.markModified("analysis");
  await doc.save();
  return reload(doc._id);
}

export async function moveApplication(id: string, status: ApplicationStatus): Promise<Application> {
  const doc = await findDocument(id);
  if (doc.status === status) return reload(doc._id);
  const from = doc.status;
  doc.status = status;
  if (status === "applied" && !doc.appliedAt) doc.appliedAt = new Date();
  await doc.save();
  await logActivity(doc._id, "status", `Moved from ${STATUS_LABEL[from]} to ${STATUS_LABEL[status]}`);
  return reload(doc._id);
}

export async function submitApplication(id: string): Promise<Application> {
  const doc = await findDocument(id);
  doc.status = "applied";
  if (!doc.appliedAt) doc.appliedAt = new Date();
  await doc.save();
  await logActivity(doc._id, "submitted", "Confirmed submitted");
  return reload(doc._id);
}

export async function addActivity(id: string, kind: ActivityKind, message: string): Promise<Application> {
  const objectId = toObjectId(id, "application id");
  if (!(await ApplicationModel.exists({ _id: objectId }))) throw notFound("Application");
  await logActivity(objectId, kind, message);
  await touch(objectId);
  return reload(objectId);
}

export async function addRecruiterLink(
  id: string,
  link: { label: string; url: string; kind: RecruiterLinkKind },
): Promise<Application> {
  const url = normaliseLinkUrl(link.url, link.kind);
  if (!url) {
    throw new HttpError(400, link.kind === "email" ? "Enter an email address or an http(s) URL." : "Links must start with http:// or https://");
  }
  const doc = await findDocument(id);
  doc.recruiterLinks.push({ label: link.label, url, kind: link.kind });
  await doc.save();
  await logActivity(doc._id, "link", `Added link: ${link.label}`);
  return reload(doc._id);
}

export async function removeRecruiterLink(id: string, linkId: string): Promise<Application> {
  const objectId = toObjectId(id, "application id");
  const result = await ApplicationModel.updateOne({ _id: objectId }, { $pull: { recruiterLinks: { _id: toObjectId(linkId, "link id") } }, $set: { updatedAt: new Date() } });
  if (result.matchedCount === 0) throw notFound("Application");
  return reload(objectId);
}

export async function deleteApplication(id: string): Promise<void> {
  const objectId = toObjectId(id, "application id");
  const deleted = await ApplicationModel.findByIdAndDelete(objectId);
  if (!deleted) throw notFound("Application");
  await ActivityLogModel.deleteMany({ applicationId: objectId });
}

export async function deleteDemoApplications(): Promise<number> {
  const demo = await ApplicationModel.find({ isDemo: true }, { _id: 1 }).lean<{ _id: Types.ObjectId }[]>();
  if (!demo.length) return 0;
  const ids = demo.map((d) => d._id);
  await ApplicationModel.deleteMany({ _id: { $in: ids } });
  await ActivityLogModel.deleteMany({ applicationId: { $in: ids } });
  return ids.length;
}
