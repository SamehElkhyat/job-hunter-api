import cors from "cors";
import express, { type Express } from "express";
import { apiKeyGuard } from "./middleware/auth";
import { apiNotFound, errorHandler } from "./middleware/error";
import { aiRouter, dataRouter, getHealth } from "./routes";

export interface AppOptions {
  /** Origins allowed to call the API directly (CORS). */
  webOrigin?: string;
  /** Shared secret required in the x-api-key header (omit for open local development). */
  apiKey?: string;
  /** Reject every request while `apiKey` is missing. Enabled on Vercel. */
  failClosed?: boolean;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");

  // The web app normally reaches this server through Next's same-origin /api rewrite; direct calls
  // from the configured origin(s) are allowed too.
  const origins = (options.webOrigin ?? "http://localhost:3000").split(",").map((o) => o.trim());
  app.use(cors({ origin: origins, exposedHeaders: ["X-Engine", "X-Warning"] }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", getHealth);
  app.use("/api", apiKeyGuard({ key: options.apiKey, failClosed: options.failClosed }));
  app.use("/api", aiRouter());
  app.use("/api", dataRouter());
  app.use("/api", apiNotFound);
  app.use(errorHandler);
  return app;
}
