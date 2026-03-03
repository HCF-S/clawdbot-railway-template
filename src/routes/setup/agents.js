import express from "express";
import fs from "node:fs";
import path from "node:path";
import { writeAmikoConfigAndMcporter } from "./amiko-config.js";

/**
 * POST /setup/api/add-agent
 *
 * Runs `openclaw agents add <agentId>` with the given parameters (non-interactive).
 * Body:
 * - agentId (string, required)
 * - name (string, required)
 * - workspace (string, optional) - default: `${WORKSPACE_DIR}-${agentId}` (e.g. `/data/.openclaw/workspace-${agentId}`)
 * - model (string, optional) - e.g. claude-sonnet-4
 * - agentDir (string, optional) - custom agent directory
 * - bind (string | string[], optional) - channel bindings e.g. "whatsapp:+1234567890"
 * - json (boolean, optional) - request CLI --json output
 */
export function createAgentsRouter(handlers) {
  const { requireApiToken, runCmd, clawArgs, OPENCLAW_NODE } = handlers;
  const router = express.Router();

  router.post("/add-agent", requireApiToken, async (req, res) => {
    try {
      const body = req.body || {};
      const agentId = String(body.agentId ?? "").trim();
      const name = String(body.name ?? "").trim();
      const amikoUserId = String(body.amikoUserId ?? "").trim();
      const amikoTwinId = String(body.amikoTwinId ?? "").trim();
      const amikoTwinToken = String(body.amikoTwinToken ?? "").trim();

      if (!agentId) {
        return res.status(400).json({ ok: false, error: "Missing agentId" });
      }
      if (!name) {
        return res.status(400).json({ ok: false, error: "Missing name (required in non-interactive mode)" });
      }

      const workspace =
        typeof body.workspace === "string" && body.workspace.trim()
          ? body.workspace.trim()
          : `/data/.openclaw/workspace-${agentId}`;

      const args = [
        "agents",
        "add",
        agentId,
        "--non-interactive",
        "--workspace",
        workspace,
      ];

      if (typeof body.model === "string" && body.model.trim()) {
        args.push("--model", body.model.trim());
      }
      if (typeof body.agentDir === "string" && body.agentDir.trim()) {
        args.push("--agentDir", body.agentDir.trim());
      }

      const bindRaw = body.bind;
      if (bindRaw !== undefined && bindRaw !== null) {
        const bindList = Array.isArray(bindRaw)
          ? bindRaw.map((b) => String(b).trim()).filter(Boolean)
          : [String(bindRaw).trim()].filter(Boolean);
        for (const b of bindList) {
          args.push("--bind", b);
        }
      }

      if (body.json === true) {
        args.push("--json");
      }

      const r = await runCmd(OPENCLAW_NODE, clawArgs(args));
      if (r.code === 0) {
        // Prefer explicit Amiko config from request body; fall back to main workspace .amiko.json
        let effectiveUserId = amikoUserId;
        let effectiveTwinId = amikoTwinId;
        let effectiveTwinToken = amikoTwinToken;
        let effectivePlatformUrl = "";

        const mainCfgPath = "/data/.openclaw/workspace/.amiko.json";
        try {
          if (fs.existsSync(mainCfgPath)) {
            let mainCfg = {};
            try {
              mainCfg = JSON.parse(fs.readFileSync(mainCfgPath, "utf8"));
            } catch {
              mainCfg = {};
            }

            if (!effectiveUserId) {
              effectiveUserId = String(mainCfg.AMIKO_USER_ID || "").trim();
            }
            if (!effectiveTwinId) {
              effectiveTwinId = String(mainCfg.AMIKO_TWIN_ID || "").trim();
            }
            if (!effectiveTwinToken) {
              effectiveTwinToken = String(
                mainCfg.AMIKO_TWIN_TOKEN || mainCfg.AMIKO_USER_TOKEN || "",
              ).trim();
            }
            effectivePlatformUrl = String(mainCfg.AMIKO_PLATFORM_URL || "").trim();
          }
        } catch (copyErr) {
          console.warn(
            "[add-agent] failed to read main Amiko config; continuing with body values only:",
            copyErr?.message,
          );
        }

        if (effectiveTwinId && effectiveTwinToken) {
          const result = writeAmikoConfigAndMcporter({
            workspaceDir: workspace,
            amikoUserId: effectiveUserId,
            amikoTwinId: effectiveTwinId,
            amikoTwinToken: effectiveTwinToken,
            amikoPlatformUrl: effectivePlatformUrl,
          });

          if (!result.ok) {
            console.warn(
              "[add-agent] failed to write Amiko config for agent workspace:",
              result.error,
            );
          }
        } else {
          console.warn(
            "[add-agent] missing Amiko twinId/token; skipping .amiko.json / mcporter.json for agent workspace",
          );
        }
      }
      const status = r.code === 0 ? 200 : 500;
      const payload = body.json && r.code === 0 && r.output?.trim() ? { ok: true, output: r.output, json: tryParseJson(r.output) } : { ok: r.code === 0, output: r.output };
      return res.status(status).json(payload);
    } catch (err) {
      console.error("[/setup/api/add-agent] error:", err);
      return res.status(500).json({ ok: false, output: `Internal error: ${String(err)}` });
    }
  });

  return router;
}

function tryParseJson(str) {
  if (!str || typeof str !== "string") return undefined;
  try {
    return JSON.parse(str.trim());
  } catch {
    return undefined;
  }
}
