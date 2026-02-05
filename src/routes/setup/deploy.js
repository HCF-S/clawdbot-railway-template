import express from "express";
import { installAmikoSkill } from "./skills.js";
import { installSysConfig } from "./init.js";
import { syncAmikoData } from "./amiko.js";

/**
 * Deploy Router - APIs for platform to push updates to existing instances
 * These endpoints allow the platform to deploy new features without re-running full init
 */
export function createDeployRouter(handlers) {
  const { requireApiToken } = handlers;
  const router = express.Router();

  /**
   * POST /setup/api/deploy/amiko-skill
   * Deploy/update the amiko-skill to an existing instance
   */
  router.post("/deploy/amiko-skill", requireApiToken, async (_req, res) => {
    try {
      const result = await installAmikoSkill(handlers);
      if (result.ok) {
        return res.json({
          ok: true,
          message: "Amiko skill deployed successfully",
          path: result.path,
          files: result.files,
        });
      } else {
        return res.status(500).json({ ok: false, error: result.error });
      }
    } catch (err) {
      console.error("[/setup/api/deploy/amiko-skill] error:", err);
      return res.status(500).json({ ok: false, error: `Internal error: ${String(err)}` });
    }
  });

  /**
   * POST /setup/api/deploy/sys
   * Deploy/update SYS.md and /data/sys structure to an existing instance
   */
  router.post("/deploy/sys", requireApiToken, async (_req, res) => {
    try {
      const result = await installSysConfig(handlers);
      if (result.ok) {
        return res.json({
          ok: true,
          message: "System persistence config deployed successfully",
          output: result.output,
        });
      } else {
        return res.status(500).json({ ok: false, error: result.error });
      }
    } catch (err) {
      console.error("[/setup/api/deploy/sys] error:", err);
      return res.status(500).json({ ok: false, error: `Internal error: ${String(err)}` });
    }
  });

  /**
   * POST /setup/api/deploy/amiko-data
   * Re-sync Amiko data (twin info + docs) to an existing instance
   */
  router.post("/deploy/amiko-data", requireApiToken, async (_req, res) => {
    try {
      const output = await syncAmikoData(handlers);
      return res.json({
        ok: true,
        message: "Amiko data synced successfully",
        output,
      });
    } catch (err) {
      console.error("[/setup/api/deploy/amiko-data] error:", err);
      return res.status(500).json({ ok: false, error: `Internal error: ${String(err)}` });
    }
  });

  /**
   * POST /setup/api/deploy/all
   * Deploy all updates (amiko-skill + sys + amiko-data) to an existing instance
   * This is useful for upgrading existing instances to latest features
   */
  router.post("/deploy/all", requireApiToken, async (_req, res) => {
    try {
      const results = {
        amikoData: null,
        amikoSkill: null,
        sys: null,
      };
      let output = "";

      // 1. Sync Amiko data
      output += "[deploy] Syncing Amiko data...\n";
      try {
        const amikoOutput = await syncAmikoData(handlers);
        results.amikoData = { ok: true };
        output += amikoOutput;
      } catch (err) {
        results.amikoData = { ok: false, error: String(err) };
        output += `[deploy/amiko-data] Error: ${err}\n`;
      }

      // 2. Install Amiko skill
      output += "\n[deploy] Installing Amiko skill...\n";
      try {
        const skillResult = await installAmikoSkill(handlers);
        results.amikoSkill = skillResult;
        output += skillResult.ok 
          ? `[deploy/amiko-skill] ${skillResult.output}\n`
          : `[deploy/amiko-skill] Error: ${skillResult.error}\n`;
      } catch (err) {
        results.amikoSkill = { ok: false, error: String(err) };
        output += `[deploy/amiko-skill] Error: ${err}\n`;
      }

      // 3. Install SYS config
      output += "\n[deploy] Setting up system persistence...\n";
      try {
        const sysResult = await installSysConfig(handlers);
        results.sys = sysResult;
        output += sysResult.ok
          ? `[deploy/sys] ${sysResult.output}\n`
          : `[deploy/sys] Error: ${sysResult.error}\n`;
      } catch (err) {
        results.sys = { ok: false, error: String(err) };
        output += `[deploy/sys] Error: ${err}\n`;
      }

      const allOk = results.amikoData?.ok && results.amikoSkill?.ok && results.sys?.ok;

      return res.json({
        ok: allOk,
        message: allOk ? "All updates deployed successfully" : "Some updates failed",
        results,
        output,
      });
    } catch (err) {
      console.error("[/setup/api/deploy/all] error:", err);
      return res.status(500).json({ ok: false, error: `Internal error: ${String(err)}` });
    }
  });

  return router;
}
