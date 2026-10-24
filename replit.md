# Notes to Action

A personal productivity web app that turns rough notes into prioritized tasks and a practical day plan, then records a replayable trace of the real run.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/notes-to-action run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Database: Embedded persistent database (PGlite) automatically active when `DATABASE_URL` is omitted; supports remote PostgreSQL when `DATABASE_URL` is set.
- Optional env: `OPENAI_API_KEY` (AI extraction), falls back automatically to local deterministic extraction engine if omitted.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod and generated OpenAPI schemas
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild

## Where things live

- `artifacts/notes-to-action/` — React/Vite app and the run diagram/replay UI
- `artifacts/api-server/src/routes/runs.ts` — run, history, event-stream, and task-completion endpoints
- `artifacts/api-server/src/lib/run-engine.ts` — task extraction, recovery, prioritization, schedule, and event recording
- `lib/api-spec/openapi.yaml` — source API contract
- `lib/db/src/schema/runs.ts` — persisted runs and event history

## Architecture decisions

- The browser-generated owner ID scopes saved runs to a browser profile; it is not an account or cross-device sync.
- Run events are measured and persisted by the server, then reused for history and replay; replay speed must not change real processing or recorded timings.
- OpenAI extraction failures are recorded and recovered with local task extraction; the recovery is a visible branch in the trace.
- Run creation is rate-limited to protect the server-side OpenAI key from public abuse.

## Product

- Turn a pasted brain-dump into prioritized, categorized tasks and a suggested schedule.
- Show seven real processing steps, their event timestamps/durations, and an explicit local fallback when AI extraction fails.
- Save run history and task completion state; replay a saved timeline at a user-selected speed.

## User preferences

- Keep the diagram's steps and server event IDs aligned; show the recovery branch when it occurs and stack the diagram on mobile.
- The user declined upgrading for Replit AI Integrations. Use the `OPENAI_API_KEY` Replit Secret; do not retry integration setup or request the key in chat.

## Gotchas

- Re-run API codegen after any OpenAPI change before checking the server or client.
- The run stream is named SSE events; the browser consumes the live stream while the saved run is the rehydration source.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
