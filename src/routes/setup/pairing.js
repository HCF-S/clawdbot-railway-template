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

  router.post("/devices/request", requireApiToken, async (req, res) => {
    const { deviceId, publicKey, displayName, platform, role, scopes } = req.body || {};

    if (!deviceId || typeof deviceId !== "string" || !deviceId.trim()) {
      return res.status(400).json({ ok: false, error: "deviceId is required" });
    }
    if (!publicKey || typeof publicKey !== "string" || !publicKey.trim()) {
      return res.status(400).json({ ok: false, error: "publicKey is required" });
    }

    try {
      const { requestDevicePairing } = await import("/openclaw/dist/infra/device-pairing.js");
      const pairing = await requestDevicePairing({
        deviceId:    deviceId.trim(),
        publicKey:   publicKey.trim(),
        displayName: typeof displayName === "string" ? displayName.trim() : undefined,
        platform:    typeof platform    === "string" ? platform.trim()    : undefined,
        role:        typeof role        === "string" ? role.trim()        : undefined,
        scopes:      Array.isArray(scopes) ? scopes.filter((s) => typeof s === "string") : undefined,
      });
      return res.status(200).json({
        ok:        true,
        requestId: pairing.request.requestId,
        deviceId:  pairing.request.deviceId,
        created:   pairing.created,
      });
    } catch (err) {
      console.error("[devices/request]", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  router.get("/devices/status", requireApiToken, async (req, res) => {
    const requestId = String(req.query.requestId || "").trim();
    const deviceId  = String(req.query.deviceId  || "").trim();

    if (!requestId) {
      return res.status(400).json({ ok: false, error: "requestId query parameter is required" });
    }

    try {
      const { listDevicePairing } = await import("/openclaw/dist/infra/device-pairing.js");
      const list = await listDevicePairing();

      const isPending = list.pending.some((p) => p.requestId === requestId);
      if (isPending) {
        return res.status(200).json({ ok: true, status: "pending", requestId });
      }

      const isPaired = deviceId ? list.paired.some((p) => p.deviceId === deviceId) : false;
      return res.status(200).json({
        ok:     true,
        status: isPaired ? "approved" : "not_found",
        requestId,
      });
    } catch (err) {
      console.error("[devices/status]", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
