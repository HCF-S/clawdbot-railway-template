import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import express from "express";

const EXTENSIONS_DIR = "/data/.openclaw/extensions";

/**
 * Plugin management router.
 *
 * Wraps OpenClaw CLI `plugins` subcommands and exposes them as HTTP endpoints
 * so the platform can manage plugins without SSH access.
 */
export function createPluginsRouter(handlers) {
  const { requireApiToken, runCmd, clawArgs, OPENCLAW_NODE, restartGateway, configPath } =
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

  // ── POST /plugins/install — npm install -g + copy to extensions ─────

  router.post("/plugins/install", requireApiToken, async (req, res) => {
    const { spec } = req.body || {};

    if (!spec || typeof spec !== "string") {
      return res
        .status(400)
        .json({ ok: false, error: "spec (string) is required" });
    }

    try {
      // 1. npm install -g
      const npmResult = childProcess.spawnSync(
        "npm", ["install", "-g", spec.trim()],
        { encoding: "utf8", timeout: 120_000 },
      );
      if (npmResult.status !== 0) {
        return res.status(500).json({
          ok: false,
          error: `npm install -g ${spec} failed (exit=${npmResult.status})\n${npmResult.stderr || npmResult.stdout || ""}`.trim(),
        });
      }

      // 2. Resolve the installed package name and read its openclaw plugin id
      //    npm install -g @scope/pkg@version → package dir is @scope/pkg
      const pkgName = spec.trim().replace(/@[^/]*$/, ""); // strip version suffix
      const npmDir = path.join("/usr/local/lib/node_modules", pkgName);
      if (!fs.existsSync(path.join(npmDir, "package.json"))) {
        return res.status(500).json({
          ok: false,
          error: `Package installed but not found at ${npmDir}`,
          npmOutput: (npmResult.stdout || "").slice(0, 500),
        });
      }

      const pkg = JSON.parse(fs.readFileSync(path.join(npmDir, "package.json"), "utf8"));
      // Plugin id: package.json openclaw.id > openclaw.plugin.json id
      let pluginId = pkg.openclaw?.id;
      if (!pluginId) {
        const pluginJsonPath = path.join(npmDir, "openclaw.plugin.json");
        if (fs.existsSync(pluginJsonPath)) {
          try {
            pluginId = JSON.parse(fs.readFileSync(pluginJsonPath, "utf8")).id;
          } catch { /* ignore */ }
        }
      }
      if (!pluginId) {
        return res.status(400).json({
          ok: false,
          error: `Package ${pkgName} has no plugin id in package.json or openclaw.plugin.json — not a valid OpenClaw plugin`,
        });
      }

      // 3. Copy to extensions dir
      fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
      const dest = path.join(EXTENSIONS_DIR, pluginId);
      fs.rmSync(dest, { recursive: true, force: true });
      childProcess.execSync(`cp -rL ${JSON.stringify(npmDir)} ${JSON.stringify(dest)}`);

      return res.json({
        ok: true,
        pluginId,
        version: pkg.version,
        path: dest,
        output: `Installed ${pluginId}@${pkg.version} → ${dest}`,
      });
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

  // ── POST /plugins/:id/enable — enable + allow + restart gateway ─────

  router.post("/plugins/:id/enable", requireApiToken, async (req, res) => {
    const pluginId = req.params.id;
    try {
      const result = await runPluginCmd(["enable", pluginId]);
      if (result.code !== 0) {
        return res
          .status(500)
          .json({ ok: false, error: result.output || "Enable failed" });
      }

      // Add to plugins.allow in openclaw.json
      try {
        const cfgPath = configPath();
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
          if (!cfg.plugins) cfg.plugins = {};
          if (!Array.isArray(cfg.plugins.allow)) cfg.plugins.allow = [];
          if (!cfg.plugins.allow.includes(pluginId)) {
            cfg.plugins.allow.push(pluginId);
            fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
          }
        }
      } catch (err) {
        console.warn(`[plugins] failed to add ${pluginId} to plugins.allow:`, err);
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
