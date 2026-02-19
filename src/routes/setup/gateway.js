import express from "express";

export function createGatewayRouter(handlers) {
  const { requireApiToken, restartGateway } = handlers;
  const router = express.Router();

  router.post("/gateway/restart", requireApiToken, async (_req, res) => {
    try {
      await restartGateway();
      return res.json({
        ok: true,
        output: "Gateway restarted. (Gateway auto-starts with the container; use Restart to apply config changes.)",
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
