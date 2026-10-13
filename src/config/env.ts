import { z } from "zod";

/**
 * Environment configuration, validated once at startup so a missing or malformed value fails fast
 * with a readable message instead of surfacing later as an obscure connection error.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z
    .string({ error: "MONGODB_URI is required. Add it to your .env file (see .env.example)." })
    .trim()
    .regex(/^mongodb(\+srv)?:\/\/.+/, "MONGODB_URI must start with mongodb:// or mongodb+srv://"),
  /** Overrides the database name in the URI (optional). */
  MONGODB_DB_NAME: z.string().trim().min(1).optional(),
  /** Comma separated list of origins allowed to call the API directly (CORS). */
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  /**
   * Shared secret the web app sends in the `x-api-key` header. When set, every /api route except
   * /api/health requires it. On Vercel the API refuses to serve data until this is configured.
   */
  API_ACCESS_KEY: z.string().trim().min(16, "API_ACCESS_KEY must be at least 16 characters").optional(),
  /** Seed the sample CV/profile/demo applications into an empty database. Default: on in development only. */
  SEED_DEMO_DATA: z.enum(["true", "false"]).optional(),
});

type ParsedEnv = z.infer<typeof envSchema>;

export type Env = Omit<ParsedEnv, "SEED_DEMO_DATA"> & {
  SEED_DEMO_DATA: boolean;
  /** True when running as a Vercel Function. */
  IS_VERCEL: boolean;
};

export class EnvError extends Error {}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Treat empty strings (e.g. `MONGODB_DB_NAME=` in a .env file) as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`);
    throw new EnvError(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  const data = result.data;
  return {
    ...data,
    SEED_DEMO_DATA: data.SEED_DEMO_DATA ? data.SEED_DEMO_DATA === "true" : data.NODE_ENV !== "production",
    IS_VERCEL: Boolean(cleaned.VERCEL),
  };
}
