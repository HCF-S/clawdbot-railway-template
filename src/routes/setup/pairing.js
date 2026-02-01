import express from "express";

export function createPairingRouter(handlers) {
  const { requireApiToken, runCmd, clawArgs, OPENCLAW_NODE } = handlers;
  const router = express.Router();

  router.get("/pairing/pending", requireApiToken, async (_req, res) => {
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["pairing", "list"]));
    return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
  });

  router.post("/pairing/approve", requireApiToken, async (req, res) => {
    const { channel, code } = req.body || {};
    if (!channel || !code) {
      return res.status(400).json({ ok: false, error: "Missing channel or code" });
    }
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["pairing", "approve", String(channel), String(code)]));
    return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
  });

  return router;
}
