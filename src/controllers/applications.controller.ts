import type { RequestHandler } from "express";
import {
  activitySchema,
  applicationCreateSchema,
  applicationPatchSchema,
  linkSchema,
  moveSchema,
} from "../schemas";
import {
  addActivity,
  addRecruiterLink,
  createFromWorkspace,
  deleteApplication,
  deleteDemoApplications,
  getApplication,
  listApplications,
  moveApplication,
  patchApplication,
  removeRecruiterLink,
  submitApplication,
} from "../services/applications.service";
import { HttpError, parse } from "../utils/http-error";

const id = (req: { params: Record<string, string | string[] | undefined> }): string => String(req.params.id);

export const list: RequestHandler = async (_req, res) => {
  res.json({ applications: await listApplications() });
};

export const read: RequestHandler = async (req, res) => {
  res.json({ application: await getApplication(id(req)) });
};

export const create: RequestHandler = async (req, res) => {
  const { status, workspace } = parse(applicationCreateSchema, req.body);
  res.status(201).json(await createFromWorkspace(status, workspace));
};

export const patch: RequestHandler = async (req, res) => {
  const body = parse(applicationPatchSchema, req.body);
  res.json({ application: await patchApplication(id(req), body) });
};

export const move: RequestHandler = async (req, res) => {
  const { status } = parse(moveSchema, req.body);
  res.json({ application: await moveApplication(id(req), status) });
};

export const submit: RequestHandler = async (req, res) => {
  res.json({ application: await submitApplication(id(req)) });
};

export const logActivity: RequestHandler = async (req, res) => {
  const { kind, message } = parse(activitySchema, req.body);
  res.json({ application: await addActivity(id(req), kind, message) });
};

export const addLink: RequestHandler = async (req, res) => {
  const link = parse(linkSchema, req.body);
  res.status(201).json({ application: await addRecruiterLink(id(req), link) });
};

export const removeLink: RequestHandler = async (req, res) => {
  res.json({ application: await removeRecruiterLink(id(req), String(req.params.linkId)) });
};

export const remove: RequestHandler = async (req, res) => {
  await deleteApplication(id(req));
  res.json({ ok: true });
};

export const removeDemo: RequestHandler = async (req, res) => {
  if (req.query.demo !== "true") throw new HttpError(400, "Only ?demo=true bulk deletion is supported.");
  res.json({ removed: await deleteDemoApplications() });
};
