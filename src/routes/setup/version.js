import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Read setup version from package.json */
export function getVersion() {
  try {
    const pkgPath = path.resolve(__dirname, "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.version || "0.0.0";
  } catch (err) {
    console.error("[version] Error reading package.json:", err);
    return "0.0.0";
  }
}

export function createVersionRouter(handlers) {
  const { requireApiToken } = handlers;
  const router = express.Router();

  /**
   * GET /setup/api/version
   * Get the setup version (from package.json)
   */
  router.get("/version", requireApiToken, (_req, res) => {
    const version = getVersion();
    return res.json({
      ok: true,
      version,
    });
  });

  return router;
}
