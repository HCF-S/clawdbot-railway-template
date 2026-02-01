import express from "express";

export function createModelsRouter(handlers) {
  const { requireApiToken, runCmd, clawArgs, OPENCLAW_NODE } = handlers;
  const router = express.Router();

  router.get("/models/list", requireApiToken, async (_req, res) => {
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["models", "list", "--json"]));
    return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
  });

  router.get("/models/status", requireApiToken, async (_req, res) => {
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["models", "status", "--json"]));
    return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
  });

  router.post("/models/set", requireApiToken, async (req, res) => {
    const model = String(req.body && req.body.model || "").trim();
    if (!model) return res.status(400).json({ ok: false, error: "Missing model" });
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["models", "set", model]));
    return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
  });

  return router;
}
