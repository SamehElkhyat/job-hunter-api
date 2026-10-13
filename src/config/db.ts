import mongoose from "mongoose";

/**
 * MongoDB connection management (Mongoose).
 *  - retries the initial connection with exponential backoff,
 *  - logs every connection state change (never the credentials),
 *  - exposes a status snapshot for the health endpoint.
 */

export interface ConnectOptions {
  /** Database name; overrides the one in the URI. */
  dbName?: string;
  /** Initial connection attempts before giving up. */
  attempts?: number;
  /** Delay before the second attempt; doubles each time. */
  baseDelayMs?: number;
  /** How long the driver waits to find a server per attempt. */
  serverSelectionTimeoutMs?: number;
  /** Connection pool size (keep it small in serverless functions). */
  maxPoolSize?: number;
}

export type DatabaseState = "disconnected" | "connected" | "connecting" | "disconnecting" | "unknown";

export interface DatabaseStatus {
  state: DatabaseState;
  host: string | null;
  name: string | null;
}

const STATES: Record<number, DatabaseState> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

/** `mongodb+srv://user:secret@host/db` -> `mongodb+srv://***@host/db` */
export function redactUri(uri: string): string {
  return uri.replace(/\/\/([^@/]+)@/, "//***@");
}

let listenersAttached = false;

function attachListeners(log: (msg: string) => void): void {
  if (listenersAttached) return;
  listenersAttached = true;
  const { connection } = mongoose;
  connection.on("connected", () => log(`[mongo] connected to "${connection.name}" on ${connection.host}`));
  connection.on("disconnected", () => log("[mongo] disconnected"));
  connection.on("reconnected", () => log("[mongo] reconnected"));
  connection.on("close", () => log("[mongo] connection closed"));
  connection.on("error", (error: Error) => console.error(`[mongo] connection error: ${error.message}`));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function connectDatabase(uri: string, options: ConnectOptions = {}): Promise<typeof mongoose> {
  const { dbName, attempts = 5, baseDelayMs = 1000, serverSelectionTimeoutMs = 8000, maxPoolSize = 10 } = options;
  const log = (msg: string) => console.log(msg);

  mongoose.set("strictQuery", true);
  attachListeners(log);

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      log(`[mongo] connecting to ${redactUri(uri)} (attempt ${attempt}/${attempts})`);
      await mongoose.connect(uri, {
        dbName,
        serverSelectionTimeoutMS: serverSelectionTimeoutMs,
        maxPoolSize,
        retryWrites: true,
      });
      return mongoose;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[mongo] attempt ${attempt}/${attempts} failed: ${message}`);
      if (attempt < attempts) await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw new Error(
    `Could not connect to MongoDB after ${attempts} attempts. Check MONGODB_URI, network access (Atlas IP allow-list) and credentials. ` +
      `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}

export function getDatabaseStatus(): DatabaseStatus {
  const { connection } = mongoose;
  return {
    state: STATES[connection.readyState] ?? "unknown",
    host: connection.host || null,
    name: connection.name || null,
  };
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
