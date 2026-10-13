import type { RequestHandler } from "express";
import { getDatabaseStatus, isDatabaseConnected } from "../config/db";
import { buildBootstrap } from "../services/bootstrap.service";

export const getBootstrap: RequestHandler = async (_req, res) => {
  res.json(await buildBootstrap());
};

export const getHealth: RequestHandler = (_req, res) => {
  const connected = isDatabaseConnected();
  res.status(connected ? 200 : 503).json({ ok: connected, uptime: Math.round(process.uptime()), database: getDatabaseStatus() });
};
