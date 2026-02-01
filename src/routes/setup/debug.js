import express from "express";
import fs from "node:fs";
import path from "node:path";

export function createDebugRouter(handlers) {
  const {
    requireApiToken,
    runCmd,
    clawArgs,
    OPENCLAW_NODE,
    OPENCLAW_ENTRY,
    PORT,
    STATE_DIR,
    WORKSPACE_DIR,
    configPath,
  } = handlers;

  const router = express.Router();

  router.get("/debug", requireApiToken, async (_req, res) => {
    const v = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
    const help = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));
    res.json({
      wrapper: {
        node: process.version,
        port: PORT,
        stateDir: STATE_DIR,
        workspaceDir: WORKSPACE_DIR,
        configPath: configPath(),
        gatewayTokenFromEnv: Boolean(process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || process.env.CLAWDBOT_GATEWAY_TOKEN?.trim()),
        gatewayTokenPersisted: fs.existsSync(path.join(STATE_DIR, "gateway.token")),
        railwayCommit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
      },
      openclaw: {
        entry: OPENCLAW_ENTRY,
        node: OPENCLAW_NODE,
        version: v.output.trim(),
        channelsAddHelpIncludesTelegram: help.output.includes("telegram"),
      },
    });
  });

  return router;
}
