import express from "express";

export function createPairingRouter(handlers) {
  const { requireApiToken, runCmd, clawArgs, OPENCLAW_NODE } = handlers;
  const router = express.Router();

  router.get("/pairing/pending", requireApiToken, async (req, res) => {
    const channel = String(req.query.channel || "").trim();
    if (!channel) {
      return res.status(400).json({ ok: false, error: "Missing channel query parameter" });
    }
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["pairing", "list", channel]));
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

  router.get("/devices/list", requireApiToken, async (_req, res) => {
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "list", "--json"]));
    return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
  });

  router.post("/devices/approve", requireApiToken, async (req, res) => {
    const requestId = String((req.body && req.body.requestId) || "").trim();
    if (!requestId) {
      return res.status(400).json({ ok: false, error: "Missing requestId" });
    }
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "approve", requestId]));
    return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
  });

  return router;
}
