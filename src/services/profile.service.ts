import type { Types } from "mongoose";
import type { CandidateProfile } from "@shared/types/cv";
import { ProfileModel, SINGLETON_KEY, type ProfileRecord } from "../models";
import type { ProfilePatchInput } from "../schemas";
import { toProfileDto } from "../serializers";

/** Returns the singleton profile document, creating it on first use. */
export async function getProfileRecord(): Promise<ProfileRecord> {
  const existing = await ProfileModel.findOne({ key: SINGLETON_KEY }).lean<ProfileRecord>();
  if (existing) return existing;
  try {
    const created = await ProfileModel.create({ key: SINGLETON_KEY });
    return created.toObject() as ProfileRecord;
  } catch (error) {
    // Two requests raced to create the singleton; the unique index made one of them fail. Read the winner.
    if ((error as { code?: number }).code === 11000) {
      const winner = await ProfileModel.findOne({ key: SINGLETON_KEY }).lean<ProfileRecord>();
      if (winner) return winner;
    }
    throw error;
  }
}

export async function getProfile(): Promise<CandidateProfile> {
  return toProfileDto(await getProfileRecord());
}

export async function patchProfile(patch: ProfilePatchInput): Promise<CandidateProfile> {
  await getProfileRecord();
  const updated = await ProfileModel.findOneAndUpdate(
    { key: SINGLETON_KEY },
    { $set: patch },
    { returnDocument: "after", runValidators: true },
  ).lean<ProfileRecord>();
  return toProfileDto(updated);
}

export async function setActiveCvId(id: Types.ObjectId): Promise<void> {
  await getProfileRecord();
  await ProfileModel.updateOne({ key: SINGLETON_KEY }, { $set: { activeCvId: id } });
}
