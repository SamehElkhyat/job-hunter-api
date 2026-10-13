import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time string comparison (hashes first so the lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export interface ApiKeyOptions {
  /** The expected key. When undefined the guard is open (local development). */
  key?: string;
  /** Refuse all requests while no key is configured (used on Vercel so a forgotten secret fails closed). */
  failClosed?: boolean;
}

/**
 * Protects the API with a shared secret sent as `x-api-key` (or `Authorization: Bearer <key>`).
 * `/api/health` stays public so uptime checks work.
 */
export function apiKeyGuard({ key, failClosed = false }: ApiKeyOptions): RequestHandler {
  return (req, res, next) => {
    if (req.path === "/health" || req.method === "OPTIONS") {
      next();
      return;
    }
    if (!key) {
      if (failClosed) {
        res.status(503).json({ error: "The API is not configured: set API_ACCESS_KEY in the backend project's environment variables." });
        return;
      }
      next();
      return;
    }
    const bearer = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const provided = req.header("x-api-key") ?? bearer ?? "";
    if (!provided || !safeEqual(provided, key)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}
