import type { RequestHandler } from "express";
import { isDatabaseConnected } from "../config/db";

/** Fails fast with 503 instead of letting Mongoose buffer queries while the database is down. */
export const requireDatabase: RequestHandler = (_req, res, next) => {
  if (isDatabaseConnected()) {
    next();
    return;
  }
  res.status(503).json({ error: "The database is not connected. Please try again shortly." });
};
