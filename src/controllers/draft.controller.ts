import type { RequestHandler } from "express";
import { draftSchema } from "../schemas";
import { clearDraft, getDraft, saveDraft } from "../services/draft.service";
import { parse } from "../utils/http-error";

export const readDraft: RequestHandler = async (_req, res) => {
  res.json({ workspace: await getDraft() });
};

export const replaceDraft: RequestHandler = async (req, res) => {
  const workspace = parse(draftSchema, req.body);
  await saveDraft(workspace);
  res.json({ ok: true });
};

export const resetDraft: RequestHandler = async (_req, res) => {
  res.json({ workspace: await clearDraft() });
};
