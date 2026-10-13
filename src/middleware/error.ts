import type { ErrorRequestHandler, RequestHandler } from "express";
import { Error as MongooseError } from "mongoose";
import { HttpError } from "../utils/http-error";

export const apiNotFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
};

interface MongoLikeError {
  name?: string;
  code?: number;
  keyPattern?: Record<string, unknown>;
  status?: number;
  message?: string;
}

/** Maps any thrown error to a JSON response. Never leaks internals for unexpected (500) errors. */
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, issues: error.issues });
    return;
  }

  if (error instanceof MongooseError.ValidationError) {
    res.status(400).json({ error: "Validation failed", issues: Object.values(error.errors).map((e) => e.message) });
    return;
  }

  if (error instanceof MongooseError.CastError) {
    res.status(400).json({ error: `Invalid value for "${error.path}"` });
    return;
  }

  const e = (error ?? {}) as MongoLikeError;

  if (e.code === 11000) {
    res.status(409).json({ error: "A record with the same unique value already exists.", issues: Object.keys(e.keyPattern ?? {}) });
    return;
  }

  // Database unreachable (server selection timeout, network loss, pool cleared).
  if (/^Mongo(Server|Network|Pool)/.test(e.name ?? "") || e.name === "MongooseServerSelectionError") {
    console.error(`[server] database unavailable: ${e.message}`);
    res.status(503).json({ error: "The database is temporarily unavailable. Please try again." });
    return;
  }

  // body-parser errors (malformed JSON, payload too large) carry a 4xx status.
  if (typeof e.status === "number" && e.status >= 400 && e.status < 500) {
    res.status(e.status).json({ error: String(e.message ?? "Bad request") });
    return;
  }

  console.error("[server] unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
};
