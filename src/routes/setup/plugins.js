import express from "express";

/**
 * Plugin management router.
 *
 * Wraps OpenClaw CLI `plugins` subcommands and exposes them as HTTP endpoints
 * so the platform can manage plugins without SSH access.
 */
export function createPluginsRouter(handlers) {
  const { requireApiToken, runCmd, clawArgs, OPENCLAW_NODE, restartGateway } =
    handlers;
  const router = express.Router();

  // ── helpers ──────────────────────────────────────────────────────────

  async function runPluginCmd(args) {
    const result = await runCmd(OPENCLAW_NODE, clawArgs(["plugins", ...args]));
    return result;
  }

  function tryParseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  // ── GET /plugins — list all plugins ─────────────────────────────────

  router.get("/plugins", requireApiToken, async (_req, res) => {
    try {
      const result = await runPluginCmd(["list", "--json"]);
      const json = tryParseJson(result.output);
      if (json) {
        return res.json({ ok: true, ...json });
      }
      return res.json({ ok: true, raw: result.output });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: String(err) });
    }
  });

  // ── GET /plugins/:id/info — plugin details ──────────────────────────

  router.get("/plugins/:id/info", requireApiToken, async (req, res) => {
    try {
      const result = await runPluginCmd(["info", req.params.id, "--json"]);
      const json = tryParseJson(result.output);
      if (json) {
        return res.json({ ok: true, plugin: json });
      }
      return res.json({ ok: true, raw: result.output });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: String(err) });
    }
  });

  // ── POST /plugins/install — install from npm spec, path, or archive ─

  router.post("/plugins/install", requireApiToken, async (req, res) => {
    const { spec, pin } = req.body || {};

    if (!spec || typeof spec !== "string") {
      return res
        .status(400)
        .json({ ok: false, error: "spec (string) is required" });
    }

    try {
      const args = ["install", spec.trim()];
      if (pin) args.push("--pin");

      const result = await runPluginCmd(args);
      if (result.code !== 0) {
        return res
          .status(500)
          .json({ ok: false, error: result.output || "Install failed" });
      }

      await restartGateway().catch(() => null);
      return res.json({ ok: true, output: result.output });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: String(err) });
    }
  });

  // ── POST /plugins/:id/uninstall ─────────────────────────────────────

  router.post("/plugins/:id/uninstall", requireApiToken, async (req, res) => {
    try {
      const result = await runPluginCmd(["uninstall", req.params.id]);
      if (result.code !== 0) {
        return res
          .status(500)
          .json({ ok: false, error: result.output || "Uninstall failed" });
      }

      await restartGateway().catch(() => null);
      return res.json({ ok: true, output: result.output });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: String(err) });
    }
  });

  // ── POST /plugins/:id/enable ────────────────────────────────────────

  router.post("/plugins/:id/enable", requireApiToken, async (req, res) => {
    try {
      const result = await runPluginCmd(["enable", req.params.id]);
      if (result.code !== 0) {
        return res
          .status(500)
          .json({ ok: false, error: result.output || "Enable failed" });
      }

      await restartGateway().catch(() => null);
      return res.json({ ok: true, output: result.output });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: String(err) });
    }
  });

  // ── POST /plugins/:id/disable ───────────────────────────────────────

  router.post("/plugins/:id/disable", requireApiToken, async (req, res) => {
    try {
      const result = await runPluginCmd(["disable", req.params.id]);
      if (result.code !== 0) {
        return res
          .status(500)
          .json({ ok: false, error: result.output || "Disable failed" });
      }

      await restartGateway().catch(() => null);
      return res.json({ ok: true, output: result.output });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: String(err) });
    }
  });

  // ── POST /plugins/update — update all npm-installed plugins ─────────
  // ── POST /plugins/:id/update — update a specific plugin ────────────

  router.post("/plugins/update", requireApiToken, async (_req, res) => {
    try {
      const result = await runPluginCmd(["update"]);
      if (result.code !== 0) {
        return res
          .status(500)
          .json({ ok: false, error: result.output || "Update failed" });
      }

      await restartGateway().catch(() => null);
      return res.json({ ok: true, output: result.output });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: String(err) });
    }
  });

  router.post("/plugins/:id/update", requireApiToken, async (req, res) => {
    try {
      const result = await runPluginCmd(["update", req.params.id]);
      if (result.code !== 0) {
        return res
          .status(500)
          .json({ ok: false, error: result.output || "Update failed" });
      }

      await restartGateway().catch(() => null);
      return res.json({ ok: true, output: result.output });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: String(err) });
    }
  });

  // ── POST /plugins/doctor — diagnose plugin load issues ──────────────

  router.post("/plugins/doctor", requireApiToken, async (_req, res) => {
    try {
      const result = await runPluginCmd(["doctor"]);
      return res.json({ ok: true, output: result.output });
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: String(err) });
    }
  });

  return router;
}
