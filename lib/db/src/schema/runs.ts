import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export interface StoredTask {
  id: string;
  title: string;
  category: string;
  priority: "high" | "medium" | "low";
  reason: string;
  estimateMinutes: number;
  dueLabel?: string | null;
  completed: boolean;
}

export interface StoredScheduleBlock {
  taskId: string;
  title: string;
  start: string;
  end: string;
  estimateMinutes: number;
}

export interface StoredRunEvent {
  sequence: number;
  stepId: string;
  phase: "started" | "completed" | "failed" | "recovered";
  layer: "browser" | "server" | "openai" | "database";
  label: string;
  detail: string;
  occurredAt: string;
  durationMs?: number | null;
}

export const runsTable = pgTable("productivity_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: varchar("owner_id", { length: 100 }).notNull(),
  title: text("title").notNull(),
  notes: text("notes").notNull(),
  timezone: varchar("timezone", { length: 80 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  tasks: jsonb("tasks")
    .$type<StoredTask[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  schedule: jsonb("schedule")
    .$type<StoredScheduleBlock[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  events: jsonb("events")
    .$type<StoredRunEvent[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  fallbackUsed: boolean("fallback_used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertRunSchema = createInsertSchema(runsTable).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  updatedAt: true,
});

export type InsertRun = typeof runsTable.$inferInsert;
export type DbRun = typeof runsTable.$inferSelect;
