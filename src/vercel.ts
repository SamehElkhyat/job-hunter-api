import type { IncomingMessage, ServerResponse } from "node:http";
import type { Express } from "express";
import { createApp } from "./app";
import { connectDatabase, isDatabaseConnected } from "./config/db";
import { loadEnv } from "./config/env";
import { seedIfEmpty } from "./seed";

/**
 * Vercel Function entry. The Express app is created once per warm instance and the MongoDB connection
 * is reused across invocations (serverless instances are frozen between requests, so we also re-connect
 * if the connection was dropped while frozen).
 *
 * Bundled to `.vercel/output/functions/api.func/index.js` by scripts/build-vercel-api.mjs.
 */

let ready: Promise<Express> | null = null;

async function init(): Promise<Express> {
  const env = loadEnv();
  // Short retries: a function invocation has a hard time limit, unlike a long-running server.
  await connectDatabase(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    attempts: 2,
    baseDelayMs: 300,
    serverSelectionTimeoutMs: 6000,
    maxPoolSize: 5,
  });
  if (env.SEED_DEMO_DATA) await seedIfEmpty();
  return createApp({
    webOrigin: env.WEB_ORIGIN,
    apiKey: env.API_ACCESS_KEY,
    // Never serve personal data from a public URL without a configured secret.
    failClosed: env.IS_VERCEL,
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (ready && !isDatabaseConnected()) ready = null;
    ready ??= init().catch((error: unknown) => {
      ready = null; // let the next request try again
      throw error;
    });
    const app = await ready;
    app(req, res);
  } catch (error) {
    console.error("[vercel] startup failed:", error instanceof Error ? error.message : error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "The API failed to start. Check MONGODB_URI and the function logs." }));
  }
}
