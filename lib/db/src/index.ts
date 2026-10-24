import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export let isLocalDatabase = false;
export let localDbPath: string | null = null;
export let pool: InstanceType<typeof Pool> | null = null;
export let pgliteClient: PGlite | null = null;

function resolveLocalDbPath(): string {
  if (process.env.LOCAL_DB_PATH) {
    return path.resolve(process.env.LOCAL_DB_PATH);
  }
  return path.resolve(process.cwd(), "local-data", "notes-to-action-db");
}

let dbInstance: any;

const ddl = `
  CREATE TABLE IF NOT EXISTS productivity_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id VARCHAR(100) NOT NULL,
    title TEXT NOT NULL,
    notes TEXT NOT NULL,
    timezone VARCHAR(80) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
    schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
    events JSONB NOT NULL DEFAULT '[]'::jsonb,
    fallback_used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

if (process.env.DATABASE_URL) {
  isLocalDatabase = false;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  dbInstance = drizzlePg(pool, { schema });
} else {
  isLocalDatabase = true;
  localDbPath = resolveLocalDbPath();
  if (!fs.existsSync(localDbPath)) {
    fs.mkdirSync(localDbPath, { recursive: true });
  }
  pgliteClient = new PGlite(localDbPath);
  dbInstance = drizzlePglite(pgliteClient, { schema });

  // Initialize table structure asynchronously
  void (async () => {
    try {
      if (pgliteClient) {
        await pgliteClient.waitReady;
        await pgliteClient.exec(ddl);
      }
    } catch (err) {
      console.error("Failed to initialize local database schema:", err);
    }
  })();
}

export const db = dbInstance;

export async function ensureDbReady(): Promise<void> {
  if (isLocalDatabase && pgliteClient) {
    await pgliteClient.waitReady;
    await pgliteClient.exec(ddl);
  }
}

export async function getDatabaseStatus() {
  return {
    type: isLocalDatabase ? "local-embedded" : "postgresql",
    isLocal: isLocalDatabase,
    location: isLocalDatabase ? localDbPath : "PostgreSQL Server",
    ready: true,
  };
}

export * from "./schema";
