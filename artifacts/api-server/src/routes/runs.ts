import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import {
  CreateRunBody,
  CreateRunResponse,
  GetRunParams,
  GetRunResponse,
  ListRunsQueryParams,
  ListRunsResponse,
  StreamRunEventsParams,
  UpdateRunTaskBody,
  UpdateRunTaskParams,
  UpdateRunTaskResponse,
} from "@workspace/api-zod";
import { db, getDatabaseStatus, runsTable, type StoredTask } from "@workspace/db";
import {
  attachRunStream,
  executeRun,
  makeEvent,
  runToPublicResult,
  runToSummary,
  titleFromNotes,
} from "../lib/run-engine";

const router: IRouter = Router();
const createRunLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many runs were started from this connection. Please wait a few minutes and try again.",
  },
});

router.get("/runs", async (req, res): Promise<void> => {
  const parsed = ListRunsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(runsTable)
    .where(eq(runsTable.ownerId, parsed.data.ownerId))
    .orderBy(desc(runsTable.createdAt))
    .limit(12);
  res.json(ListRunsResponse.parse(rows.map(runToSummary)));
});

router.post("/runs", createRunLimiter, async (req, res): Promise<void> => {
  const validationStartedAt = performance.now();
  const parsed = CreateRunBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { ownerId, notes, timezone } = parsed.data;
  const runId = randomUUID();
  const events = [
    makeEvent(
      1,
      "1",
      "started",
      "browser",
      "Validate and send notes",
      "The browser checked the notes and sent them to the server.",
    ),
    makeEvent(
      2,
      "1",
      "completed",
      "browser",
      "Request accepted",
      "The notes passed input validation and are ready to organize.",
      Math.max(0, Math.round(performance.now() - validationStartedAt)),
    ),
    makeEvent(
      3,
      "2",
      "started",
      "database",
      "Create the run record",
      "A private run record is being created for this browser profile.",
    ),
  ];
  const saveStartedAt = performance.now();
  const [run] = await db
    .insert(runsTable)
    .values({
      id: runId,
      ownerId,
      title: titleFromNotes(notes),
      notes,
      timezone,
      status: "queued",
      events,
    })
    .returning();
  const recordCreated = makeEvent(
    4,
    "2",
    "completed",
    "database",
    "Run record created",
    "The database saved the run before any task processing began.",
    Math.max(0, Math.round(performance.now() - saveStartedAt)),
  );
  run.events = [...run.events, recordCreated];
  run.status = "running";
  await db
    .update(runsTable)
    .set({ events: run.events, status: "running", updatedAt: new Date() })
    .where(eq(runsTable.id, run.id));

  const response = CreateRunResponse.parse(runToPublicResult(run));
  res.status(201).json(response);
  setImmediate(() => {
    void executeRun(run, req.log);
  });
});

router.get("/runs/:ownerId/:runId", async (req, res): Promise<void> => {
  const params = GetRunParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [run] = await db
    .select()
    .from(runsTable)
    .where(
      and(
        eq(runsTable.id, params.data.runId),
        eq(runsTable.ownerId, params.data.ownerId),
      ),
    )
    .limit(1);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  res.json(GetRunResponse.parse(runToPublicResult(run)));
});

router.get(
  "/runs/:ownerId/:runId/events",
  async (req, res): Promise<void> => {
    const params = StreamRunEventsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [run] = await db
      .select({ id: runsTable.id, ownerId: runsTable.ownerId })
      .from(runsTable)
      .where(
        and(
          eq(runsTable.id, params.data.runId),
          eq(runsTable.ownerId, params.data.ownerId),
        ),
      )
      .limit(1);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const parsedLastEventId = Number(req.get("Last-Event-ID") ?? 0);
    const lastEventId =
      Number.isFinite(parsedLastEventId) && parsedLastEventId >= 0
        ? parsedLastEventId
        : 0;

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const cleanup = await attachRunStream(run.id, res, lastEventId);
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": keep-alive\n\n");
    }, 15_000);
    res.on("close", () => {
      clearInterval(heartbeat);
      cleanup();
    });
  },
);

router.patch(
  "/runs/:runId/tasks/:taskId",
  async (req, res): Promise<void> => {
    const params = UpdateRunTaskParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateRunTaskBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [run] = await db
      .select()
      .from(runsTable)
      .where(
        and(
          eq(runsTable.id, params.data.runId),
          eq(runsTable.ownerId, body.data.ownerId),
        ),
      )
      .limit(1);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    const taskList = (run.tasks || []) as StoredTask[];
    const task = taskList.find((item: StoredTask) => item.id === params.data.taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const updatedTask = { ...task, completed: body.data.completed };
    const tasks = taskList.map((item: StoredTask) =>
      item.id === updatedTask.id ? updatedTask : item,
    );
    await db
      .update(runsTable)
      .set({ tasks, updatedAt: new Date() })
      .where(
        and(
          eq(runsTable.id, run.id),
          eq(runsTable.ownerId, body.data.ownerId),
        ),
      );

    res.json(UpdateRunTaskResponse.parse(updatedTask));
  },
);

router.get("/db/status", async (_req, res): Promise<void> => {
  const status = await getDatabaseStatus();
  res.json(status);
});

export default router;
