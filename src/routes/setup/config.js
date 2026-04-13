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

  // POST /config/set — set one or more openclaw config keys directly in openclaw.json
  // Supports dot-notation keys (e.g. "tools.sessions.visibility").
  // Body: { key: string, value: any } or { entries: [[key, value], ...] }
  router.post("/config/set", requireApiToken, async (req, res) => {
    try {
      const { key, value, entries } = req.body || {};

      let pairs;
      if (Array.isArray(entries)) {
        pairs = entries;
      } else if (key !== undefined && value !== undefined) {
        pairs = [[key, value]];
      } else {
        return res.status(400).json({ ok: false, error: "Provide {key, value} or {entries: [[key, value], ...]}" });
      }

      if (pairs.length === 0) {
        return res.status(400).json({ ok: false, error: "No entries to set" });
      }

      for (const [k] of pairs) {
        if (typeof k !== "string" || k.trim() === "") {
          return res.status(400).json({ ok: false, error: `Invalid key: ${JSON.stringify(k)}` });
        }
      }

      const p = configPath();
      if (!fs.existsSync(p)) {
        return res.status(409).json({ ok: false, error: "openclaw.json not found — service not yet bootstrapped" });
      }

      const cfg = JSON.parse(fs.readFileSync(p, "utf8"));

      for (const [k, v] of pairs) {
        const parts = k.split(".");
        let node = cfg;
        for (let i = 0; i < parts.length - 1; i++) {
          if (node[parts[i]] === null || typeof node[parts[i]] !== "object") {
            node[parts[i]] = {};
          }
          node = node[parts[i]];
        }
        node[parts[parts.length - 1]] = v;
      }

      fs.writeFileSync(p, JSON.stringify(cfg, null, 2), { encoding: "utf8", mode: 0o600 });

      if (isConfigured()) {
        await restartGateway();
      }

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
