import express from "express";
import childProcess from "node:child_process";
import path from "node:path";

/**
 * POST /setup/api/bash/run
 *
 * Run a bash command with cwd=/data.
 * Body: { command: string }
 *
 * This is primarily intended for maintenance/diagnostics from the setup UI or
 * platform automation. It is guarded by the setup API token (requireApiToken),
 * but callers should still take care not to expose arbitrary commands.
 */
export function createBashRouter(handlers) {
  const { requireApiToken } = handlers;
  const router = express.Router();

  router.post("/bash/run", requireApiToken, async (req, res) => {
    try {
      const body = req.body || {};
      const command = String(body.command || "").trim();

      if (!command) {
        return res
          .status(400)
          .json({ ok: false, error: "command is required" });
      }

      const cwd = "/data";
      const shell = process.env.SHELL || "/bin/bash";

      const child = childProcess.spawn(shell, ["-lc", command], {
        cwd,
        env: {
          ...process.env,
        },
      });

      let output = "";
      child.stdout?.on("data", (d) => {
        output += d.toString("utf8");
      });
      child.stderr?.on("data", (d) => {
        output += d.toString("utf8");
      });

      child.on("error", (err) => {
        return res.status(500).json({
          ok: false,
          error: String(err),
          output,
        });
      });

      child.on("close", (code) => {
        const status = code === 0 ? 200 : 500;
        return res.status(status).json({
          ok: code === 0,
          code,
          cwd,
          output,
        });
      });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: String(err ?? "Unknown error") });
    }
  });

  return router;
}

