import app from "./app";
import { logger } from "./lib/logger";
import { ensureDbReady, getDatabaseStatus } from "@workspace/db";

const rawPort = process.env["PORT"] || "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer() {
  try {
    await ensureDbReady();
    const dbStatus = await getDatabaseStatus();
    logger.info(
      { dbType: dbStatus.type, location: dbStatus.location },
      "Database initialized successfully",
    );

    app.listen(port, () => {
      logger.info({ port }, "Server listening");
    });
  } catch (err) {
    logger.error({ err }, "Error starting server");
    process.exit(1);
  }
}

void startServer();
