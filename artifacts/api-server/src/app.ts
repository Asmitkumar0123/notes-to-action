import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", 1);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import fs from "node:fs";
import path from "node:path";

app.use("/api", router);

// Production static frontend serving
const staticCandidates = [
  path.resolve(process.cwd(), "artifacts", "notes-to-action", "dist", "public"),
  path.resolve(process.cwd(), "dist", "public"),
  path.resolve(import.meta.dirname, "..", "..", "notes-to-action", "dist", "public"),
];

const frontendDir = staticCandidates.find((dir) => fs.existsSync(path.join(dir, "index.html")));

if (frontendDir) {
  logger.info({ frontendDir }, "Serving static frontend bundle");
  app.use(express.static(frontendDir));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(path.join(frontendDir, "index.html"));
    } else {
      next();
    }
  });
}

export default app;
