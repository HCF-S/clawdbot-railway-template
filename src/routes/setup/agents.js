import express from "express";
import path from "node:path";

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
  const { requireApiToken, runCmd, clawArgs, OPENCLAW_NODE, WORKSPACE_DIR } = handlers;
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
        return res.status(400).json({ ok: false, error: "Missing name (required in non-interactive mode)" });
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
