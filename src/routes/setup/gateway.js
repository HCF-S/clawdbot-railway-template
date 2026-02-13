import express from "express";
import { setGatewayControlUiAllowedOrigins } from "./run.js";

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

  /**
   * POST /setup/api/gateway/control-ui-allowed-origins
   * Set gateway.controlUi.allowedOrigins and restart gateway.
   * Body: { origins?: string } - optional comma-separated list; otherwise uses env or default.
   * Use to fix old containers that lack the setting.
   */
  router.post("/gateway/control-ui-allowed-origins", requireApiToken, async (req, res) => {
    try {
      const origins = req.body?.origins != null ? String(req.body.origins) : null;
      await setGatewayControlUiAllowedOrigins(handlers, origins);
      await restartGateway();
      return res.json({
        ok: true,
        output: "Control UI allowed origins set and gateway restarted. (Gateway runs in the container; Restart applies config changes.)",
      });
    } catch (err) {
      console.error("[/setup/api/gateway/control-ui-allowed-origins] error:", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
