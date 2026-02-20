import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import AdmZip from "adm-zip";

export function createImportRouter(handlers) {
  const { requireApiToken, STATE_DIR, WORKSPACE_DIR, isConfigured, restartGateway, gatewayProcRef, sleep } = handlers;
  const router = express.Router();

  const SESSIONS_DIR = path.join(STATE_DIR, "agents", "main", "sessions");
  const MAX_ZIP_BYTES = 100 * 1024 * 1024; // 100 MB

  function isUnderDir(p, root) {
    const abs = path.resolve(p);
    const r = path.resolve(root);
    return abs === r || abs.startsWith(r + path.sep);
  }

  function looksSafeTarPath(p) {
    if (!p) return false;
    if (p.startsWith("/") || p.startsWith("\\")) return false;
    if (/^[A-Za-z]:[\\/]/.test(p)) return false;
    if (p.split("/").includes("..")) return false;
    return true;
  }

  async function readBodyBuffer(req, maxBytes) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let total = 0;
      req.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          reject(new Error("payload too large"));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  router.post("/import", requireApiToken, async (req, res) => {
    try {
      const dataRoot = "/data";
      if (!isUnderDir(STATE_DIR, dataRoot) || !isUnderDir(WORKSPACE_DIR, dataRoot)) {
        return res
          .status(400)
          .type("text/plain")
          .send("Import is only supported when OPENCLAW_STATE_DIR and OPENCLAW_WORKSPACE_DIR are under /data (Railway volume).\n");
      }

      if (gatewayProcRef.current) {
        try { gatewayProcRef.current.kill("SIGTERM"); } catch {}
        await sleep(750);
        gatewayProcRef.current = null;
      }

      const buf = await readBodyBuffer(req, 250 * 1024 * 1024);
      if (!buf.length) return res.status(400).type("text/plain").send("Empty body\n");

      const tmpPath = path.join(os.tmpdir(), `openclaw-import-${Date.now()}.tar.gz`);
      fs.writeFileSync(tmpPath, buf);

      await tar.x({
        file: tmpPath,
        cwd: dataRoot,
        gzip: true,
        strict: true,
        onwarn: () => {},
        filter: (p) => looksSafeTarPath(p),
      });

      try { fs.rmSync(tmpPath, { force: true }); } catch {}

      if (isConfigured()) {
        await restartGateway();
      }

      res.type("text/plain").send("OK - imported backup into /data and restarted gateway.\n");
    } catch (err) {
      console.error("[import]", err);
      res.status(500).type("text/plain").send(String(err));
    }
  });

  /**
   * POST /api/import
   * Amiko import: accept ZIP with workspace/ and sessions/, extract to WORKSPACE_DIR and SESSIONS_DIR.
   * Requires x-api-token. Body: raw application/zip.
   */
  router.post("/api/import", requireApiToken, async (req, res) => {
    try {
      const buf = req.body;
      if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ ok: false, error: "Empty or invalid body (expect application/zip)" });
      }
      if (buf.length > MAX_ZIP_BYTES) {
        return res.status(413).json({ ok: false, error: "Payload too large" });
      }

      const zip = new AdmZip(buf);
      const entries = zip.getEntries();

      fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });

      for (const entry of entries) {
        const name = entry.entryName.replace(/\\/g, "/");
        if (name.includes("..")) continue;
        if (name.startsWith("workspace/")) {
          const rel = name.slice("workspace/".length);
          if (!rel) continue;
          const full = path.join(WORKSPACE_DIR, rel);
          if (entry.isDirectory) {
            fs.mkdirSync(full, { recursive: true });
          } else {
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, entry.getData());
          }
        } else if (name.startsWith("sessions/")) {
          const rel = name.slice("sessions/".length);
          if (!rel) continue;
          const full = path.join(SESSIONS_DIR, rel);
          if (entry.isDirectory) {
            fs.mkdirSync(full, { recursive: true });
          } else {
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, entry.getData());
          }
        }
      }

      if (isConfigured()) {
        await restartGateway();
      }

      res.json({ ok: true, message: "Workspace and sessions imported." });
    } catch (err) {
      console.error("[api/import]", err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
