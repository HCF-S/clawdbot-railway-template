import express from "express";
import cors from "cors";
import { createStatusRouter } from "./status.js";
import { createRunRouter } from "./run.js";
import { createInitRouter } from "./init.js";
import { createDebugRouter } from "./debug.js";
import { createConsoleRouter } from "./console.js";
import { createConfigRouter } from "./config.js";
import { createPairingRouter } from "./pairing.js";
import { createChannelsRouter } from "./channels.js";
import { createPrefillRouter } from "./prefill.js";
import { createResetRouter } from "./reset.js";
import { createExportRouter } from "./export.js";
import { createImportRouter } from "./import.js";
import { createModelsRouter } from "./models.js";
import { createGatewayRouter } from "./gateway.js";
import { createTwinRouter } from "./amiko.js";
import { createSkillsRouter } from "./skills.js";

export function createSetupRouter(handlers) {
  const router = express.Router();

  // CORS middleware for /api routes
  const corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      // Allow localhost (all ports)
      if (origin.match(/^https?:\/\/localhost(:\d+)?$/)) {
        return callback(null, true);
      }

      // Allow platform.heyamiko.com
      if (origin === "https://platform.heyamiko.com" || origin === "http://platform.heyamiko.com") {
        return callback(null, true);
      }

      // Allow requests from the same origin (the service's own domain)
      // This is automatically handled, but we explicitly allow it here
      callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-token"],
  };

  router.use("/api", cors(corsOptions));

  router.use("/api", createStatusRouter(handlers));
  router.use("/api", createRunRouter(handlers));
  router.use("/api", createInitRouter(handlers));
  router.use("/api", createDebugRouter(handlers));
  router.use("/api", createConsoleRouter(handlers));
  router.use("/api", createConfigRouter(handlers));
  router.use("/api", createPairingRouter(handlers));
  router.use("/api", createChannelsRouter(handlers));
  router.use("/api", createPrefillRouter(handlers));
  router.use("/api", createModelsRouter(handlers));
  router.use("/api", createGatewayRouter(handlers));
  router.use("/api", createTwinRouter(handlers));
  router.use("/api", createSkillsRouter(handlers));
  router.use("/api", createResetRouter(handlers));
  router.use(createExportRouter(handlers));
  router.use(createImportRouter(handlers));

  return router;
}
