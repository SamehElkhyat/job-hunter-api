import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Types } from "mongoose";
import type { CandidateProfile } from "@shared/types/cv";
import type { Application } from "@shared/types/job";
import type { WorkspaceState } from "@shared/types/state";
import { connectDatabase, disconnectDatabase } from "../src/config/db";
import { loadEnv } from "../src/config/env";
import {
  ActivityLogModel,
  ApplicationModel,
  CvVersionModel,
  DraftModel,
  ProfileModel,
  SINGLETON_KEY,
  syncIndexes,
} from "../src/models";

/**
 * One-off import of an existing SQLite database (the previous storage layer) into MongoDB.
 *
 *   npm run migrate:sqlite                       # imports data/job-hunter.db
 *   npm run migrate:sqlite -- path/to/file.db    # imports another file
 *   npm run migrate:sqlite -- --dry-run          # counts only, writes nothing
 *   npm run migrate:sqlite -- --force            # wipes the MongoDB collections first
 *
 * Old pipeline names are mapped: draft -> saved, ready -> queue. Ids become ObjectIds.
 */

const STATUS_MAP: Record<string, Application["status"]> = {
  draft: "saved",
  ready: "queue",
  saved: "saved",
  queue: "queue",
  applied: "applied",
  interview: "interview",
  offer: "offer",
  rejected: "rejected",
};

interface CvRow {
  id: string;
  label: string;
  text: string;
  created_at: string;
  updated_at: string;
}

function readSetting<T>(db: DatabaseSync, key: string): T | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const fileArg = args.find((a) => !a.startsWith("--"));
  const sqlitePath = resolve(fileArg ?? process.env.DATABASE_PATH ?? "data/job-hunter.db");

  if (!existsSync(sqlitePath)) {
    console.error(`SQLite file not found: ${sqlitePath}\nNothing to migrate. Start the server to create a fresh MongoDB database instead.`);
    process.exit(1);
  }

  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const cvRows = sqlite.prepare("SELECT * FROM cv_versions ORDER BY created_at ASC, rowid ASC").all() as unknown as CvRow[];
  const appRows = sqlite.prepare("SELECT data FROM applications").all() as unknown as { data: string }[];
  const applications = appRows.map((r) => JSON.parse(r.data) as Application);
  const profile = readSetting<Partial<CandidateProfile>>(sqlite, "profile");
  const workspace = readSetting<WorkspaceState>(sqlite, "workspace");
  const activeCvOldId = readSetting<string>(sqlite, "activeCvId");

  console.log(`Found in ${sqlitePath}: ${cvRows.length} CV versions, ${applications.length} applications, profile: ${profile ? "yes" : "no"}, draft: ${workspace ? "yes" : "no"}`);
  if (dryRun) {
    console.log("Dry run: nothing written.");
    return;
  }

  const env = loadEnv();
  await connectDatabase(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME });
  try {
    await syncIndexes();
    const existing = (await CvVersionModel.estimatedDocumentCount()) + (await ApplicationModel.estimatedDocumentCount());
    if (existing > 0 && !force) {
      console.error("MongoDB already contains data. Re-run with --force to wipe it first, or point MONGODB_URI at an empty database.");
      process.exitCode = 1;
      return;
    }
    if (force) {
      await Promise.all([CvVersionModel.deleteMany({}), ApplicationModel.deleteMany({}), ActivityLogModel.deleteMany({}), ProfileModel.deleteMany({}), DraftModel.deleteMany({})]);
      console.log("Existing MongoDB data removed (--force).");
    }

    // CV versions (old string id -> new ObjectId)
    const cvIds = new Map<string, Types.ObjectId>();
    for (const row of cvRows) {
      const _id = new Types.ObjectId();
      cvIds.set(row.id, _id);
      await CvVersionModel.collection.insertOne({ _id, label: row.label, text: row.text, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) });
    }

    // Profile + active CV
    const activeCv = (activeCvOldId && cvIds.get(activeCvOldId)) || [...cvIds.values()][0] || null;
    await ProfileModel.create({ ...(profile ?? {}), key: SINGLETON_KEY, activeCvId: activeCv });

    // Draft
    if (workspace) {
      await DraftModel.create({
        ...workspace,
        key: SINGLETON_KEY,
        analysedCvId: workspace.analysedCvId ? (cvIds.get(workspace.analysedCvId)?.toString() ?? null) : null,
      });
    }

    // Applications and their activity history
    let activityCount = 0;
    for (const app of applications) {
      const _id = new Types.ObjectId();
      const status = STATUS_MAP[app.status] ?? "saved";
      const doc = new ApplicationModel({
        _id,
        job: app.job,
        status,
        cvVersionId: cvIds.get(app.cvVersionId) ?? null,
        cvVersionLabel: app.cvVersionLabel,
        analysis: app.analysis,
        coverLetter: app.coverLetter,
        tone: app.tone,
        answers: app.answers,
        recruiterLinks: app.recruiterLinks.map(({ label, url, kind }) => ({ label, url, kind })),
        notes: app.notes,
        appliedAt: app.appliedAt ? new Date(app.appliedAt) : null,
        isDemo: Boolean(app.isDemo),
        createdAt: new Date(app.createdAt),
        updatedAt: new Date(app.updatedAt),
      });
      await doc.save({ timestamps: false });
      const logs = app.activity.map((a) => ({
        applicationId: _id,
        kind: a.kind,
        // Old status names may appear inside history messages.
        message: a.message.replace(/Ready to Apply/g, "In Queue").replace(/\bDraft\b/g, "Saved"),
        at: new Date(a.at),
      }));
      if (logs.length) await ActivityLogModel.insertMany(logs);
      activityCount += logs.length;
    }

    console.log(`Imported ${cvRows.length} CV versions, ${applications.length} applications, ${activityCount} activity entries.`);
    console.log("Done. You can now delete the data/ folder (see README).");
  } finally {
    await disconnectDatabase();
    sqlite.close();
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
