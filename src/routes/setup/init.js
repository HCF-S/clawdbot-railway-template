import express from "express";
import { runOnboarding } from "./run.js";
import { syncAmikoData } from "./amiko.js";
import { installAmikoSkill } from "./skills.js";

export function createInitRouter(handlers) {
  const { requireApiToken } = handlers;
  const router = express.Router();

  router.post("/init", requireApiToken, async (req, res) => {
    try {
      const payload = req.body || {};

      // Step 1: Run onboarding (includes channel configuration)
      const onboardResult = await runOnboarding(payload, handlers);
      
      if (!onboardResult.ok) {
        return res.status(500).json(onboardResult);
      }

      let output = onboardResult.output;

      // Step 2: Sync Amiko data
      output += "\n\n[amiko] Starting Amiko data sync...\n";
      const amikoOutput = await syncAmikoData(handlers);
      output += amikoOutput;

      // Step 3: Install Amiko skill
      output += "\n[amiko] Installing Amiko skill...\n";
      const skillResult = await installAmikoSkill(handlers);
      if (skillResult.ok) {
        output += `[amiko/skill] ${skillResult.output}\n`;
      } else {
        output += `[amiko/skill] Warning: ${skillResult.error}\n`;
      }

      return res.json({ ok: true, output });
    } catch (err) {
      console.error("[/setup/api/init] error:", err);
      return res.status(500).json({ ok: false, output: `Internal error: ${String(err)}` });
    }
  });

  return router;
}
