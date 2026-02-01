import express from "express";
import fs from "node:fs";

export function createConfigRouter(handlers) {
  const { requireApiToken, configPath, STATE_DIR, isConfigured, restartGateway } = handlers;
  const router = express.Router();

  router.get("/config/raw", requireApiToken, async (_req, res) => {
    try {
      const p = configPath();
      const exists = fs.existsSync(p);
      const content = exists ? fs.readFileSync(p, "utf8") : "";
      res.json({ ok: true, path: p, exists, content });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  router.post("/config/raw", requireApiToken, async (req, res) => {
    try {
      const content = String((req.body && req.body.content) || "");
      if (content.length > 500_000) {
        return res.status(413).json({ ok: false, error: "Config too large" });
      }

      fs.mkdirSync(STATE_DIR, { recursive: true });

      const p = configPath();
      if (fs.existsSync(p)) {
        const backupPath = `${p}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
        fs.copyFileSync(p, backupPath);
      }

      fs.writeFileSync(p, content, { encoding: "utf8", mode: 0o600 });

      if (isConfigured()) {
        await restartGateway();
      }

      res.json({ ok: true, path: p });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
