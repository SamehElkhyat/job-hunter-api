import type { RequestHandler } from "express";
import { profilePatchSchema } from "../schemas";
import { getProfile, patchProfile } from "../services/profile.service";
import { parse } from "../utils/http-error";

export const readProfile: RequestHandler = async (_req, res) => {
  res.json({ profile: await getProfile() });
};

export const updateProfile: RequestHandler = async (req, res) => {
  const patch = parse(profilePatchSchema, req.body);
  res.json({ profile: await patchProfile(patch) });
};
