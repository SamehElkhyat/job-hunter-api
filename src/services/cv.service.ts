import type { CVVersion } from "@shared/types/cv";
import { CvVersionModel, type CvVersionRecord } from "../models";
import { toCvDto } from "../serializers";
import { HttpError, notFound, toObjectId } from "../utils/http-error";
import { getProfileRecord, setActiveCvId } from "./profile.service";

export async function listCvVersions(): Promise<CVVersion[]> {
  const rows = await CvVersionModel.find().sort({ createdAt: 1, _id: 1 }).lean<CvVersionRecord[]>();
  return rows.map(toCvDto);
}

export async function countCvVersions(): Promise<number> {
  return CvVersionModel.estimatedDocumentCount();
}

export async function getCvVersion(id: string): Promise<CvVersionRecord | null> {
  return CvVersionModel.findById(toObjectId(id, "CV version id")).lean<CvVersionRecord>();
}

/**
 * Returns the active CV. If the stored pointer is missing or dangling (e.g. the version was deleted)
 * it is repaired to the oldest remaining version.
 */
export async function getActiveCv(): Promise<CvVersionRecord | null> {
  const profile = await getProfileRecord();
  if (profile.activeCvId) {
    const active = await CvVersionModel.findById(profile.activeCvId).lean<CvVersionRecord>();
    if (active) return active;
  }
  const first = await CvVersionModel.findOne().sort({ createdAt: 1, _id: 1 }).lean<CvVersionRecord>();
  if (first) {
    await setActiveCvId(first._id);
    return first;
  }
  // A brand-new database without seed data: create an empty CV so the app is usable immediately.
  const created = await CvVersionModel.create({ label: "My CV", text: "" });
  await setActiveCvId(created._id);
  return created.toObject() as CvVersionRecord;
}

/** Creates a version and makes it the active one. */
export async function createCvVersion(label: string, text: string): Promise<{ cv: CVVersion; activeCvId: string }> {
  const created = await CvVersionModel.create({ label, text });
  await setActiveCvId(created._id);
  const cv = toCvDto(created.toObject() as CvVersionRecord);
  return { cv, activeCvId: cv.id };
}

export async function updateCvVersion(id: string, patch: { label?: string; text?: string }): Promise<CVVersion> {
  const updated = await CvVersionModel.findByIdAndUpdate(toObjectId(id, "CV version id"), { $set: patch }, { returnDocument: "after", runValidators: true }).lean<CvVersionRecord>();
  if (!updated) throw notFound("CV version");
  return toCvDto(updated);
}

export async function duplicateCvVersion(id: string): Promise<{ cv: CVVersion; activeCvId: string }> {
  const source = await getCvVersion(id);
  if (!source) throw notFound("CV version");
  return createCvVersion(`${source.label} (copy)`.slice(0, 120), source.text);
}

export async function deleteCvVersion(id: string): Promise<{ activeCvId: string | null }> {
  const objectId = toObjectId(id, "CV version id");
  if ((await countCvVersions()) <= 1) throw new HttpError(409, "You must keep at least one CV version.");
  const deleted = await CvVersionModel.findByIdAndDelete(objectId).lean<CvVersionRecord>();
  if (!deleted) throw notFound("CV version");
  const active = await getActiveCv();
  return { activeCvId: active ? active._id.toString() : null };
}

export async function activateCvVersion(id: string): Promise<string> {
  const objectId = toObjectId(id, "CV version id");
  if (!(await CvVersionModel.exists({ _id: objectId }))) throw notFound("CV version");
  await setActiveCvId(objectId);
  return objectId.toString();
}
