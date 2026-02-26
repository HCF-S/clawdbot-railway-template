import express from "express";
import { installAmikoSkill, installComposioSkill } from "./skills.js";
import { injectAmikoOnboardingPrompt, installSysConfig } from "./init.js";
import { syncAmikoData, pullMemories } from "./amiko.js";
import { CURRENT_SETUP_VERSION, setInstalledVersion } from "./version.js";

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
      return res
        .status(500)
        .json({ ok: false, error: `Internal error: ${String(err)}` });
    }
  });

  /**
   * POST /setup/api/deploy/composio-skill
   * Deploy/update the composio-skill (SKILL.md + docs). Composio MCP proxy runs on 127.0.0.1:3099 when AMIKO_PLATFORM_URL is set.
   */
  router.post("/deploy/composio-skill", requireApiToken, async (_req, res) => {
    try {
      const result = await installComposioSkill(handlers);
      if (result.ok) {
        return res.json({
          ok: true,
          message: "Composio skill deployed successfully",
          path: result.path,
          files: result.files,
        });
      } else {
        return res.status(500).json({ ok: false, error: result.error });
      }
    } catch (err) {
      console.error("[/setup/api/deploy/composio-skill] error:", err);
      return res
        .status(500)
        .json({ ok: false, error: `Internal error: ${String(err)}` });
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
      return res
        .status(500)
        .json({ ok: false, error: `Internal error: ${String(err)}` });
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
      return res
        .status(500)
        .json({ ok: false, error: `Internal error: ${String(err)}` });
    }
  });

  /**
   * POST /setup/api/deploy/memories
   * Sync memories from Amiko platform to MEMORIES.md
   * This is optional and separate because memory data quality may vary
   */
  router.post("/deploy/memories", requireApiToken, async (_req, res) => {
    try {
      const result = await pullMemories(handlers);
      if (result.ok) {
        return res.json({
          ok: true,
          message: "Memories synced successfully",
          count: result.count,
          path: result.path,
        });
      } else {
        return res.status(400).json({ ok: false, error: result.error });
      }
    } catch (err) {
      console.error("[/setup/api/deploy/memories] error:", err);
      return res
        .status(500)
        .json({ ok: false, error: `Internal error: ${String(err)}` });
    }
  });

  /**
   * POST /setup/api/deploy/bootstrap
   * Inject Amiko onboarding prompt into BOOTSTRAP.md
   */

  router.post("/deploy/bootstrap", requireApiToken, async (req, res) => {
    try {
      const result = await injectAmikoOnboardingPrompt(handlers);
      if (result.ok) {
        return res.json({
          ok: true,
          message: "Amiko onboarding prompt deployed successfully",
          output: result.output,
        });
      } else {
        return res.status(500).json({ ok: false, error: result.error });
      }
    } catch (err) {
      console.error("[/setup/api/deploy/bootstrap] error:", err);
      return res
        .status(500)
        .json({ ok: false, error: `Internal error: ${String(err)}` });
    }
  });

  /**
   * POST /setup/api/deploy/all
   * Deploy all updates (amiko-skill + sys + amiko-data) to an existing instance
   * This is useful for upgrading existing instances to latest features
   * Body: { includeMemories?: boolean } - optionally include memories sync
   */
  router.post("/deploy/all", requireApiToken, async (req, res) => {
    try {
      const { includeMemories = false } = req.body || {};

      const results = {
        amikoData: null,
        amikoSkill: null,
        sys: null,
        memories: null,
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

      // 4. Optionally sync memories
      if (includeMemories) {
        output += "\n[deploy] Syncing memories (optional)...\n";
        try {
          const memoriesResult = await pullMemories(handlers);
          results.memories = memoriesResult;
          output += memoriesResult.ok
            ? `[deploy/memories] ${memoriesResult.output}\n`
            : `[deploy/memories] Error: ${memoriesResult.error}\n`;
        } catch (err) {
          results.memories = { ok: false, error: String(err) };
          output += `[deploy/memories] Error: ${err}\n`;
        }
      } else {
        output += "\n[deploy] Skipping memories sync (not requested)\n";
      }

      // 5. Inject Amiko onboarding prompt
      output += "\n[deploy] Injecting Amiko onboarding prompt...\n";
      try {
        const onboardingResult = await injectAmikoOnboardingPrompt(handlers);
        results.onboarding = onboardingResult;
        output += onboardingResult.ok
          ? `[deploy/bootstrap] ${onboardingResult.output}\n`
          : `[deploy/bootstrap] Error: ${onboardingResult.error}\n`;
      } catch (err) {
        results.onboarding = { ok: false, error: String(err) };
        output += `[deploy/bootstrap] Error: ${err}\n`;
      }

      // Check if core components succeeded (memories is optional)
      const allOk =
        results.amikoData?.ok &&
        results.amikoSkill?.ok &&
        results.sys?.ok &&
        results.onboarding?.ok;

      // Update version after successful deployment
      let versionUpdated = false;
      if (allOk) {
        output += "\n[deploy] Updating setup version...\n";
        versionUpdated = setInstalledVersion(CURRENT_SETUP_VERSION);
        output += versionUpdated
          ? `[deploy/version] Updated to ${CURRENT_SETUP_VERSION}\n`
          : `[deploy/version] Warning: Failed to update version\n`;
      }

      return res.json({
        ok: allOk,
        message: allOk
          ? "All updates deployed successfully"
          : "Some updates failed",
        results,
        version: allOk ? CURRENT_SETUP_VERSION : undefined,
        versionUpdated,
        output,
      });
    } catch (err) {
      console.error("[/setup/api/deploy/all] error:", err);
      return res
        .status(500)
        .json({ ok: false, error: `Internal error: ${String(err)}` });
    }
  });

  return router;
}
