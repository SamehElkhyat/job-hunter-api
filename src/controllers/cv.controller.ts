import type { RequestHandler } from "express";
import { activeCvSchema, cvCreateSchema, cvPatchSchema } from "../schemas";
import { activateCvVersion, createCvVersion, deleteCvVersion, duplicateCvVersion, updateCvVersion } from "../services/cv.service";
import { parse } from "../utils/http-error";

export const createCv: RequestHandler = async (req, res) => {
  const { label, text } = parse(cvCreateSchema, req.body);
  res.status(201).json(await createCvVersion(label, text));
};

export const patchCv: RequestHandler = async (req, res) => {
  const patch = parse(cvPatchSchema, req.body);
  res.json({ cv: await updateCvVersion(String(req.params.id), patch) });
};

export const duplicateCv: RequestHandler = async (req, res) => {
  res.status(201).json(await duplicateCvVersion(String(req.params.id)));
};

export const deleteCv: RequestHandler = async (req, res) => {
  res.json(await deleteCvVersion(String(req.params.id)));
};

export const setActiveCv: RequestHandler = async (req, res) => {
  const { id } = parse(activeCvSchema, req.body);
  res.json({ activeCvId: await activateCvVersion(id) });
};
