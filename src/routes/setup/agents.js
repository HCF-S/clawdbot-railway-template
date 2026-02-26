import express from "express";
import fs from "node:fs";
import path from "node:path";
import { installAmikoSkill, installComposioSkill } from "./skills.js";
import { injectAmikoOnboardingPrompt, installSysConfig } from "./init.js";

/**
 * Copy .amiko.json from the main workspace into the agent workspace and run all
 * post-creation setup steps (Amiko skill, Composio skill, SYS config, onboarding prompt).
 * Each step is isolated so a failure in one does not prevent the others from running.
 *
 * @param {object} handlers - the shared handlers object (will be cloned with the agent workspace)
 * @param {string} mainWorkspaceDir - path to the main workspace (source of .amiko.json)
 * @param {string} agentWorkspaceDir - path to the newly created agent workspace
 * @returns {Promise<{ ok: boolean, output: string }>}
 */
async function setupAgentWorkspace(
  handlers,
  mainWorkspaceDir,
  agentWorkspaceDir,
) {
  const agentHandlers = { ...handlers, WORKSPACE_DIR: agentWorkspaceDir };
  let output = "";
  let hadWarnings = false;

  // 1. Copy .amiko.json so the agent shares the same twin config
  const mainCfgPath = path.join(mainWorkspaceDir, ".amiko.json");
  const agentCfgPath = path.join(agentWorkspaceDir, ".amiko.json");

  try {
    if (fs.existsSync(mainCfgPath)) {
      fs.mkdirSync(path.dirname(agentCfgPath), { recursive: true });
      fs.copyFileSync(mainCfgPath, agentCfgPath);
      fs.chmodSync(agentCfgPath, 0o600);
      output += "[add-agent/setup] Copied .amiko.json to agent workspace\n";
    }
  } catch (err) {
    console.warn("[add-agent/setup] failed to copy .amiko.json:", err?.message);
    output += `[add-agent/setup] Warning: failed to copy .amiko.json: ${err?.message}\n`;
    hadWarnings = true;
  }

  // 2. Install Amiko skill
  try {
    const result = await installAmikoSkill(agentHandlers);
    if (!result.ok) hadWarnings = true;
    output += result.ok
      ? `[add-agent/amiko-skill] ${result.output ?? "Installed"}\n`
      : `[add-agent/amiko-skill] Warning: ${result.error}\n`;
  } catch (err) {
    console.warn("[add-agent/setup] Amiko skill install failed:", err);
    output += `[add-agent/amiko-skill] Warning: ${String(err)}\n`;
    hadWarnings = true;
  }

  // 3. Install Composio skill
  try {
    const result = await installComposioSkill(agentHandlers);
    if (!result.ok) hadWarnings = true;
    output += result.ok
      ? `[add-agent/composio-skill] ${result.output ?? "Installed"}\n`
      : `[add-agent/composio-skill] Warning: ${result.error}\n`;
  } catch (err) {
    console.warn("[add-agent/setup] Composio skill install failed:", err);
    output += `[add-agent/composio-skill] Warning: ${String(err)}\n`;
    hadWarnings = true;
  }

  // 4. Install SYS config
  try {
    const result = await installSysConfig(agentHandlers);
    if (!result.ok) hadWarnings = true;
    output += result.ok
      ? `[add-agent/sys] ${result.output ?? "Installed"}\n`
      : `[add-agent/sys] Warning: ${result.error}\n`;
  } catch (err) {
    console.warn("[add-agent/setup] SYS config install failed:", err);
    output += `[add-agent/sys] Warning: ${String(err)}\n`;
    hadWarnings = true;
  }

  // 5. Inject Amiko onboarding prompt into BOOTSTRAP.md
  try {
    const result = await injectAmikoOnboardingPrompt(agentHandlers);
    if (!result.ok) hadWarnings = true;
    output += result.ok
      ? `[add-agent/bootstrap] ${result.output ?? "Injected"}\n`
      : `[add-agent/bootstrap] Warning: ${result.error}\n`;
  } catch (err) {
    console.warn("[add-agent/setup] Amiko onboarding prompt failed:", err);
    output += `[add-agent/bootstrap] Warning: ${String(err)}\n`;
    hadWarnings = true;
  }

  return { ok: !hadWarnings, output };
}

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
  const { requireApiToken, runCmd, clawArgs, OPENCLAW_NODE, WORKSPACE_DIR } =
    handlers;
  const router = express.Router();

  router.post("/add-agent", requireApiToken, async (req, res) => {
    try {
      const body = req.body || {};
      const agentId = String(body.agentId ?? "").trim();
      const name = String(body.name ?? "").trim();

      if (!agentId) {
        return res.status(400).json({ ok: false, error: "Missing agentId" });
      }
      if (!name) {
        return res.status(400).json({
          ok: false,
          error: "Missing name (required in non-interactive mode)",
        });
      }

      const workspace =
        typeof body.workspace === "string" && body.workspace.trim()
          ? body.workspace.trim()
          : `${WORKSPACE_DIR}-${agentId}`;

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
      let setupResult = null;
      if (r.code === 0) {
        setupResult = await setupAgentWorkspace(
          handlers,
          WORKSPACE_DIR,
          workspace,
        );
      }
      const allOk = r.code === 0 && setupResult?.ok !== false;
      const status = allOk ? 200 : 500;
      const payload =
        body.json && r.code === 0 && r.output?.trim()
          ? {
              ok: allOk,
              output: r.output,
              json: tryParseJson(r.output),
              setup: setupResult,
            }
          : { ok: allOk, output: r.output, setup: setupResult };
      return res.status(status).json(payload);
    } catch (err) {
      console.error("[/setup/api/add-agent] error:", err);
      return res
        .status(500)
        .json({ ok: false, output: `Internal error: ${String(err)}` });
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
