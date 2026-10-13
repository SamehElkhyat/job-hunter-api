import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Application } from "@shared/types/job";
import type { BootstrapPayload } from "@shared/types/state";
import { createApp } from "../src/app";
import { connectDatabase, disconnectDatabase } from "../src/config/db";
import { ActivityLogModel, ApplicationModel, CvVersionModel, ProfileModel, syncIndexes } from "../src/models";
import { seedIfEmpty } from "../src/seed";

let mongod: MongoMemoryServer;
let server: Server;
let base = "";

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

const bootstrap = async () => (await call<BootstrapPayload>("GET", "/bootstrap")).body;

before(async () => {
  // The first launch can be slow while the OS scans the freshly downloaded mongod binary.
  mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 90_000 } });
  await connectDatabase(mongod.getUri(), { dbName: "job-hunter-test", attempts: 1 });
  await syncIndexes();
  await seedIfEmpty();
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, { timeout: 120_000 });

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await disconnectDatabase();
  if (mongod) await mongod.stop();
});

describe("health, bootstrap & seed", () => {
  it("reports database health", async () => {
    const res = await call<{ ok: boolean; database: { state: string; name: string } }>("GET", "/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.database.state, "connected");
    assert.equal(res.body.database.name, "job-hunter-test");
  });

  it("seeds a fresh database exactly once", async () => {
    assert.equal(await seedIfEmpty(), false);
    const data = await bootstrap();
    assert.equal(data.cvVersions.length, 1);
    assert.equal(data.applications.length, 7);
    assert.ok(data.applications.every((a) => a.isDemo));
    assert.equal(data.profile.fullName, "Alex Morgan");
    assert.equal(data.activeCvId, data.cvVersions[0].id);
    assert.match(data.activeCvId, /^[a-f0-9]{24}$/, "ids are ObjectId strings");
  });

  it("returns demo applications newest first with their activity history", async () => {
    const { applications } = await bootstrap();
    const times = applications.map((a) => a.updatedAt);
    assert.deepEqual(times, [...times].sort().reverse());
    const interview = applications.find((a) => a.status === "interview")!;
    assert.ok(interview.activity.length >= 2);
    assert.equal(interview.activity[0].message, "Application created");
    assert.ok(interview.appliedAt);
    const offer = applications.find((a) => a.status === "offer")!;
    const ageDays = (Date.now() - Date.parse(offer.createdAt)) / 86_400_000;
    assert.ok(ageDays > 19 && ageDays < 21, `seed timestamps are preserved (got ${ageDays.toFixed(1)} days)`);
  });

  it("denormalises the match score for sorting", async () => {
    const docs = await ApplicationModel.find({ matchScore: { $ne: null } }).lean();
    assert.equal(docs.length, 7);
    assert.ok(docs.every((d) => typeof d.matchScore === "number" && d.matchScore === (d.analysis as { overallScore: number }).overallScore));
  });
});

describe("applications lifecycle", () => {
  let workspace: BootstrapPayload["workspace"];
  let created: Application;

  it("creates an application from the workspace and clears the draft", async () => {
    workspace = (await bootstrap()).workspace;
    workspace.coverLetter = "Dear team, hello.";
    const res = await call<{ application: Application; workspace: BootstrapPayload["workspace"] }>("POST", "/applications", { status: "queue", workspace });
    assert.equal(res.status, 201);
    created = res.body.application;
    assert.equal(created.status, "queue");
    assert.equal(created.job.company, "Lumen Labs");
    assert.equal(created.recruiterLinks[0]?.kind, "posting");
    assert.ok(created.recruiterLinks[0].id);
    assert.ok(created.activity.some((a) => a.message === "Added to the queue"));
    assert.equal(created.cvVersionLabel, "Full-Stack v1 (sample)");
    assert.equal(res.body.workspace.job.description, "");
    const stored = (await call<{ workspace: BootstrapPayload["workspace"] }>("GET", "/workspace")).body.workspace;
    assert.equal(stored.job.description, "", "saved draft is cleared in the database");
  });

  it("rejects bad creates: missing title, wrong status", async () => {
    const blank = { ...workspace, job: { ...workspace.job, title: "" } };
    assert.equal((await call("POST", "/applications", { status: "saved", workspace: blank })).status, 400);
    assert.equal((await call("POST", "/applications", { status: "offer", workspace })).status, 400);
  });

  it("patches documents and refuses direct status edits", async () => {
    const res = await call<{ application: Application }>("PATCH", `/applications/${created.id}`, { coverLetter: "Edited", notes: "Call Friday" });
    assert.equal(res.body.application.coverLetter, "Edited");
    assert.equal(res.body.application.notes, "Call Friday");
    assert.equal((await call("PATCH", `/applications/${created.id}`, { status: "offer" })).status, 400);
  });

  it("keeps matchScore in step with a patched analysis", async () => {
    const source = (await bootstrap()).applications.find((a) => a.analysis)!.analysis!;
    const res = await call("PATCH", `/applications/${created.id}`, { analysis: { ...source, overallScore: 42 } });
    assert.equal(res.status, 200);
    assert.equal((await ApplicationModel.findById(created.id).lean())?.matchScore, 42);
    assert.equal((await call("PATCH", `/applications/${created.id}`, { analysis: { overallScore: 42 } })).status, 400, "malformed analyses are rejected");
    await call("PATCH", `/applications/${created.id}`, { analysis: null });
    assert.equal((await ApplicationModel.findById(created.id).lean())?.matchScore, null);
  });

  it("moves through the pipeline, sets appliedAt once and logs each step", async () => {
    const applied = (await call<{ application: Application }>("POST", `/applications/${created.id}/move`, { status: "applied" })).body.application;
    assert.equal(applied.status, "applied");
    assert.ok(applied.appliedAt);
    const interview = (await call<{ application: Application }>("POST", `/applications/${created.id}/move`, { status: "interview" })).body.application;
    assert.equal(interview.appliedAt, applied.appliedAt);
    assert.ok(interview.activity.some((a) => a.message === "Moved from Applied to Interview"));
    assert.equal((await call("POST", `/applications/${created.id}/move`, { status: "ready" })).status, 400, "old status names are rejected");
    for (const status of ["offer", "rejected", "saved", "queue"] as const) {
      const res = await call<{ application: Application }>("POST", `/applications/${created.id}/move`, { status });
      assert.equal(res.body.application.status, status);
    }
  });

  it("validates recruiter links and removes them", async () => {
    const ok = await call<{ application: Application }>("POST", `/applications/${created.id}/links`, { label: "Jane", url: "https://linkedin.com/in/jane", kind: "linkedin" });
    assert.equal(ok.status, 201);
    const email = await call<{ application: Application }>("POST", `/applications/${created.id}/links`, { label: "Mail", url: "jane@co.com", kind: "email" });
    const mail = email.body.application.recruiterLinks.find((l) => l.kind === "email")!;
    assert.equal(mail.url, "mailto:jane@co.com");
    assert.equal((await call("POST", `/applications/${created.id}/links`, { label: "x", url: "javascript:alert(1)", kind: "other" })).status, 400);
    const removed = await call<{ application: Application }>("DELETE", `/applications/${created.id}/links/${mail.id}`);
    assert.ok(!removed.body.application.recruiterLinks.some((l) => l.id === mail.id));
  });

  it("logs custom activity and confirms submission", async () => {
    const logged = await call<{ application: Application }>("POST", `/applications/${created.id}/activity`, { kind: "note", message: "Recruiter replied" });
    assert.equal(logged.body.application.activity.at(-1)?.message, "Recruiter replied");
    const done = await call<{ application: Application }>("POST", `/applications/${created.id}/submit`);
    assert.equal(done.body.application.status, "applied");
    assert.ok(done.body.application.activity.some((a) => a.kind === "submitted"));
  });

  it("rejects malformed ids and 404s unknown ones", async () => {
    assert.equal((await call("GET", "/applications/not-an-id")).status, 400);
    assert.equal((await call("GET", "/applications/64b7f0c2a1b2c3d4e5f60718")).status, 404);
    assert.equal((await call("POST", "/applications/64b7f0c2a1b2c3d4e5f60718/move", { status: "applied" })).status, 404);
  });

  it("deletes an application together with its history", async () => {
    assert.ok((await ActivityLogModel.countDocuments({ applicationId: created.id })) > 0);
    assert.equal((await call("DELETE", `/applications/${created.id}`)).status, 200);
    assert.equal((await call("GET", `/applications/${created.id}`)).status, 404);
    assert.equal(await ActivityLogModel.countDocuments({ applicationId: created.id }), 0);
  });

  it("removes only demo rows in bulk, with their history", async () => {
    const own = (await call<{ application: Application }>("POST", "/applications", { status: "saved", workspace })).body.application;
    const res = await call<{ removed: number }>("DELETE", "/applications?demo=true");
    assert.equal(res.body.removed, 7);
    const left = (await call<{ applications: Application[] }>("GET", "/applications")).body.applications;
    assert.deepEqual(left.map((a) => a.id), [own.id]);
    assert.equal(await ActivityLogModel.countDocuments({ applicationId: { $ne: own.id } }), 0, "no orphaned activity rows");
    assert.equal((await call("DELETE", "/applications")).status, 400);
  });
});

describe("CV versions, profile and draft", () => {
  it("manages CV versions, repairs the active pointer, and keeps at least one", async () => {
    const created = await call<{ cv: { id: string }; activeCvId: string }>("POST", "/cv-versions", { label: "Backend v2", text: "Python dev" });
    assert.equal(created.status, 201);
    assert.equal(created.body.activeCvId, created.body.cv.id);
    const patched = await call<{ cv: { text: string } }>("PATCH", `/cv-versions/${created.body.cv.id}`, { text: "Python and Go dev" });
    assert.equal(patched.body.cv.text, "Python and Go dev");
    assert.equal((await call("PATCH", `/cv-versions/${created.body.cv.id}`, { label: "" })).status, 400);
    const copy = await call<{ cv: { label: string; id: string } }>("POST", `/cv-versions/${created.body.cv.id}/duplicate`);
    assert.equal(copy.body.cv.label, "Backend v2 (copy)");
    assert.equal((await call("PUT", "/cv-versions/active", { id: "64b7f0c2a1b2c3d4e5f60718" })).status, 404);

    // Deleting the active version falls back to the oldest remaining one.
    const del = await call<{ activeCvId: string }>("DELETE", `/cv-versions/${copy.body.cv.id}`);
    const state = await bootstrap();
    assert.equal(del.body.activeCvId, state.activeCvId);
    assert.equal(state.activeCvId, state.cvVersions[0].id);

    for (const cv of state.cvVersions.slice(1)) assert.equal((await call("DELETE", `/cv-versions/${cv.id}`)).status, 200);
    const last = await bootstrap();
    assert.equal(last.cvVersions.length, 1);
    assert.equal((await call("DELETE", `/cv-versions/${last.cvVersions[0].id}`)).status, 409);
  });

  it("merges profile patches and rejects unknown fields", async () => {
    const res = await call<{ profile: { fullName: string; email: string; requiresSponsorship: boolean } }>("PATCH", "/profile", { email: "new@example.com", requiresSponsorship: true });
    assert.equal(res.body.profile.email, "new@example.com");
    assert.equal(res.body.profile.fullName, "Alex Morgan");
    assert.equal(res.body.profile.requiresSponsorship, true);
    assert.equal((await call("PATCH", "/profile", { admin: true })).status, 400);
    assert.equal((await call<{ profile: { email: string } }>("GET", "/profile")).body.profile.email, "new@example.com");
  });

  it("persists, validates and resets the workspace draft", async () => {
    const ws = (await call<{ workspace: BootstrapPayload["workspace"] }>("GET", "/workspace")).body.workspace;
    ws.job.title = "Draft in progress";
    ws.answers = [{ id: "ans_1", question: "Q?", answer: "A.", confidence: "high", needsReview: false, engine: "local" }];
    assert.equal((await call("PUT", "/workspace", ws)).status, 200);
    const back = (await call<{ workspace: BootstrapPayload["workspace"] }>("GET", "/workspace")).body.workspace;
    assert.equal(back.job.title, "Draft in progress");
    assert.equal(back.answers[0].id, "ans_1");
    assert.equal((await call("PUT", "/workspace", { ...ws, tone: "rude" })).status, 400);
    const cleared = await call<{ workspace: BootstrapPayload["workspace"] }>("DELETE", "/workspace");
    assert.equal(cleared.body.workspace.job.title, "");
    assert.equal((await call<{ workspace: BootstrapPayload["workspace"] }>("GET", "/workspace")).body.workspace.answers.length, 0);
  });
});

describe("AI endpoints (local engine)", () => {
  it("reports status and analyses a CV against a job", async () => {
    const status = await call<{ aiEnabled: boolean }>("GET", "/status");
    assert.equal(typeof status.body.aiEnabled, "boolean");
    const { cvVersions, workspace } = await bootstrap();
    const job = { ...workspace.job, title: "Senior Engineer", description: "Senior Engineer\nRequirements\n- 5+ years of React and TypeScript\n- Docker and AWS experience" };
    const res = await call<{ analysis: { overallScore: number } }>("POST", "/analyze", { cvText: cvVersions[0].text, job });
    assert.equal(res.status, 200);
    assert.ok(res.body.analysis.overallScore > 0 && res.body.analysis.overallScore <= 100);
    assert.equal((await call("POST", "/analyze", { cvText: "", job })).status, 400);
  });

  it("streams a cover letter with the engine header", async () => {
    const { cvVersions, workspace } = await bootstrap();
    const res = await fetch(`${base}/api/cover-letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cvText: cvVersions[0].text, job: { ...workspace.job, description: "Frontend Engineer\nRequirements\n- React and TypeScript" }, tone: "startup", candidateName: "Alex Morgan", analysis: null, instructions: "" }),
    });
    assert.equal(res.status, 200);
    assert.ok(["claude", "local"].includes(res.headers.get("x-engine") ?? ""));
    assert.match(await res.text(), /Alex Morgan/);
  });

  it("answers recruiter questions from the profile", async () => {
    const { cvVersions, profile } = await bootstrap();
    const res = await call<{ answers: { answer: string }[] }>("POST", "/answers", {
      cvText: cvVersions[0].text,
      job: { title: "Engineer", company: "Acme", location: "", url: "", description: "Engineer\nRequirements\n- React" },
      profileFacts: { noticePeriod: profile.noticePeriod },
      questions: ["What is your notice period?"],
    });
    assert.match(res.body.answers[0].answer, /1 month/);
  });
});

describe("error handling", () => {
  it("returns JSON 404s and 400s for malformed bodies", async () => {
    assert.equal((await call("GET", "/nope")).status, 404);
    const res = await fetch(`${base}/api/profile`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{bad json" });
    assert.equal(res.status, 400);
  });
});

describe("API key guard (public deployments)", () => {
  const KEY = "k".repeat(32);

  async function withApp<T>(options: Parameters<typeof createApp>[0], run: (url: string) => Promise<T>): Promise<T> {
    const srv = createApp(options).listen(0);
    await new Promise<void>((resolve) => srv.once("listening", resolve));
    try {
      return await run(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  }

  it("requires the key on every route except /health", async () => {
    await withApp({ apiKey: KEY }, async (url) => {
      assert.equal((await fetch(`${url}/api/health`)).status, 200);
      assert.equal((await fetch(`${url}/api/bootstrap`)).status, 401);
      assert.equal((await fetch(`${url}/api/bootstrap`, { headers: { "x-api-key": "x".repeat(32) } })).status, 401);
      assert.equal((await fetch(`${url}/api/bootstrap`, { headers: { "x-api-key": KEY } })).status, 200);
      assert.equal((await fetch(`${url}/api/bootstrap`, { headers: { Authorization: `Bearer ${KEY}` } })).status, 200);
      const ai = await fetch(`${url}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      assert.equal(ai.status, 401, "AI endpoints (paid) are protected too");
      assert.equal((await fetch(`${url}/api/nope`)).status, 401, "unknown routes do not reveal anything without the key");
    });
  });

  it("fails closed when deployed without a configured key", async () => {
    await withApp({ failClosed: true }, async (url) => {
      assert.equal((await fetch(`${url}/api/health`)).status, 200);
      assert.equal((await fetch(`${url}/api/bootstrap`)).status, 503);
    });
  });

  it("stays open for local development (no key, not fail-closed)", async () => {
    await withApp({}, async (url) => {
      assert.equal((await fetch(`${url}/api/bootstrap`)).status, 200);
    });
  });
});

// Runs last: it empties the database to simulate a first start on an unseeded production database.
describe("fresh database without demo data", () => {
  it("creates an empty default CV and profile instead of failing", async () => {
    await Promise.all([ApplicationModel.deleteMany({}), ActivityLogModel.deleteMany({}), CvVersionModel.deleteMany({}), ProfileModel.deleteMany({})]);
    const data = await bootstrap();
    assert.equal(data.cvVersions.length, 1);
    assert.equal(data.cvVersions[0].label, "My CV");
    assert.equal(data.activeCvId, data.cvVersions[0].id);
    assert.equal(data.applications.length, 0);
    assert.equal(data.profile.fullName, "");
    assert.equal(await seedIfEmpty(), false, "seeding never overwrites an existing CV");
  });
});
