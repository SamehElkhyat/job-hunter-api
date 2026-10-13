import { createApp } from "./app";
import { connectDatabase, disconnectDatabase } from "./config/db";
import { EnvError, loadEnv } from "./config/env";
import { syncIndexes } from "./models";
import { seedIfEmpty } from "./seed";

async function main(): Promise<void> {
  const env = loadEnv();

  await connectDatabase(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME });
  await syncIndexes();
  if (env.SEED_DEMO_DATA && (await seedIfEmpty())) console.log("[server] new database seeded with a sample CV, profile and demo applications");

  const server = createApp({ webOrigin: env.WEB_ORIGIN, apiKey: env.API_ACCESS_KEY }).listen(env.PORT, () => {
    console.log(`[server] Job-Hunter API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`[server] ${signal} received, shutting down`);
    const force = setTimeout(() => process.exit(1), 8000);
    force.unref();
    server.close(async () => {
      try {
        await disconnectDatabase();
      } finally {
        process.exit(0);
      }
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  if (error instanceof EnvError) console.error(`[server] ${error.message}`);
  else console.error("[server] failed to start:", error instanceof Error ? error.message : error);
  process.exit(1);
});
