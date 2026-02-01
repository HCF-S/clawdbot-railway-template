import express from "express";
import { createStatusRouter } from "./status.js";
import { createRunRouter } from "./run.js";
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

export function createSetupRouter(handlers) {
  const router = express.Router();

  router.use("/api", createStatusRouter(handlers));
  router.use("/api", createRunRouter(handlers));
  router.use("/api", createDebugRouter(handlers));
  router.use("/api", createConsoleRouter(handlers));
  router.use("/api", createConfigRouter(handlers));
  router.use("/api", createPairingRouter(handlers));
  router.use("/api", createChannelsRouter(handlers));
  router.use("/api", createPrefillRouter(handlers));
  router.use("/api", createModelsRouter(handlers));
  router.use("/api", createGatewayRouter(handlers));
  router.use("/api", createResetRouter(handlers));
  router.use(createExportRouter(handlers));
  router.use(createImportRouter(handlers));

  return router;
}
