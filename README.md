# Job-Hunter API

Node.js backend for the **Job-Hunter AI** web app (kept in its own repository): Express 5, TypeScript, MongoDB
(Mongoose), Zod validation, optional Claude integration with a deterministic local fallback engine.

The web app is a separate project. It talks to this API over HTTP only (server-side, through its `proxy.ts`).

## Run locally

```bash
npm install
cp .env.example .env.local        # then set MONGODB_URI (and optionally ANTHROPIC_API_KEY, API_ACCESS_KEY)
npm run dev                       # http://localhost:4000 (file watching)
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Start with file watching (`.env.local` and `.env` are loaded automatically) |
| `npm start` | Start without watching (self-hosting) |
| `npm run build` | Build the Vercel Function bundle into `.vercel/output` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 25 API tests against a real in-memory MongoDB (first run downloads a `mongod` binary, ~75 MB) |
| `npm run migrate:sqlite -- <file.db>` | One-off import of the old SQLite database (see below) |

On first start against an empty database in development the API seeds a sample CV, profile and demo applications
(`SEED_DEMO_DATA`, off by default in production). With no seed data, an empty "My CV" is created on first use.
If `MONGODB_URI` is missing or unreachable the process exits with a clear message.

## Environment variables

See [.env.example](.env.example). Required: `MONGODB_URI`. On Vercel also `API_ACCESS_KEY`.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string (Atlas `mongodb+srv://…` or local) |
| `MONGODB_DB_NAME` | Optional database name override |
| `API_ACCESS_KEY` | Shared secret (>= 16 chars). When set, every route except `/api/health` needs `x-api-key` (or `Authorization: Bearer`). On Vercel the API refuses to serve data until it is set |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Optional. Without a key the local analysis engine is used |
| `SEED_DEMO_DATA` | `true` / `false`. Default: true in development, false in production |
| `PORT`, `WEB_ORIGIN` | Port (default 4000) and CORS origin(s) for direct browser calls |

## API

All routes are under `/api`. Bodies are validated with Zod; errors are JSON `{ error, issues? }` (400 validation,
401 missing/invalid key, 404, 409, 503 database unavailable).

| Method & path | Purpose |
| --- | --- |
| `GET /health` | 200/503 with database state (public) |
| `GET /bootstrap` | Everything the UI needs on load |
| `GET/PATCH /profile` | Candidate profile (partial updates) |
| `POST /cv-versions` · `PATCH /:id` · `POST /:id/duplicate` · `DELETE /:id` · `PUT /active` | CV versions (at least one is always kept) |
| `GET/PUT/DELETE /workspace` | The in-progress draft |
| `POST /applications` | Create from a workspace snapshot (`saved` or `queue`); clears the saved draft |
| `GET /applications` · `GET/PATCH/DELETE /:id` · `DELETE ?demo=true` | Read, edit, delete |
| `POST /applications/:id/move` · `/submit` · `/activity` · `/links` · `DELETE /links/:linkId` | Pipeline moves and history |
| `POST /analyze` · `/answers` · `GET /status` | AI endpoints |
| `POST /cover-letter` | Streams plain text; `X-Engine` / `X-Warning` headers |

Pipeline statuses: `saved`, `queue`, `applied`, `interview`, `offer`, `rejected`.

## Project layout

```
src/
  server.ts          long-running entry (npm run dev / start)
  vercel.ts          Vercel Function entry (connection reuse across invocations)
  app.ts             Express app: CORS, JSON, API-key guard, routers, error handling
  config/            env.ts (Zod-validated environment), db.ts (Mongoose connect/retry/status)
  models/            Profile, CvVersion, Application, ActivityLog, Draft
  schemas/           Zod request schemas
  services/          business rules and queries
  controllers/       thin HTTP handlers
  routes/            routers (stateless AI routes vs MongoDB-backed data routes)
  middleware/        API-key guard, error mapping, database guard
  serializers.ts     Mongoose records -> API JSON
  seed.ts            sample data for an empty development database
  shared/            types and domain/AI code that mirrors the web app (see below)
tests/               API tests (node:test + mongodb-memory-server)
scripts/             build-vercel-api.mjs (Vercel bundle), migrate-sqlite-to-mongo.ts
```

### The shared contract with the web app

`src/shared/types/*` (`ai`, `cv`, `job`, `state`) describe the JSON the API returns and accepts. The web app keeps the
same four files in its own `types/` folder. **They are the API contract: when you change one side, change the other
side's copy in the same release.** (Everything else under `src/shared` is backend-only: the Claude integration, the
local analysis engine, prompts, scoring and sample data.)

## Deploy

Deploys to Vercel as a single Vercel Function. See [DEPLOY.md](DEPLOY.md) (Arabic) for the step-by-step guide.
`vercel.json` already sets the framework and build command, so importing this repository is enough; add the
environment variables and deploy.

## Importing data from the old SQLite version

Earlier versions stored data in a SQLite file. To import it into MongoDB:

```bash
npm run migrate:sqlite -- /path/to/job-hunter.db --dry-run   # shows what would be imported
npm run migrate:sqlite -- /path/to/job-hunter.db             # imports into an empty database
npm run migrate:sqlite -- /path/to/job-hunter.db --force     # wipes MongoDB first, then imports
```

Pipeline names are mapped (`draft` → `saved`, `ready` → `queue`), ids become ObjectIds and history is kept.

## Security

There are no user accounts: this is a single-user API. Protect it with `API_ACCESS_KEY` (and keep the web app behind
its own password) before exposing it publicly. Never commit `.env` files; use a least-privilege database user.
