import express from "express";

export function createGatewayRouter(handlers) {
  const { requireApiToken, restartGateway } = handlers;
  const router = express.Router();

  router.post("/gateway/restart", requireApiToken, async (_req, res) => {
    try {
      await restartGateway();
      return res.json({ ok: true, output: "Gateway restart requested." });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
