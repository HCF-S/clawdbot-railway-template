import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";

export function createImportRouter(handlers) {
  const { requireApiToken, STATE_DIR, WORKSPACE_DIR, isConfigured, restartGateway, gatewayProcRef, sleep } = handlers;
  const router = express.Router();

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

  return router;
}
