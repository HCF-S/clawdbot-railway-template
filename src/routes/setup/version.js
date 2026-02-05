import express from "express";
import fs from "node:fs";
import path from "node:path";

// Current setup version - increment this when making breaking changes
// or adding new features that require deployment
export const CURRENT_SETUP_VERSION = "1.0.0";

// Version file path (persisted in /data)
const VERSION_FILE = "/data/.setup-version";

/**
 * Get the currently installed setup version from the container
 * @returns {string | null} The version string or null if not set
 */
export function getInstalledVersion() {
  try {
    if (fs.existsSync(VERSION_FILE)) {
      return fs.readFileSync(VERSION_FILE, "utf8").trim();
    }
  } catch (err) {
    console.error("[version] Error reading version file:", err);
  }
  return null;
}

/**
 * Set the installed setup version in the container
 * @param {string} version The version string to set
 * @returns {boolean} Whether the operation succeeded
 */
export function setInstalledVersion(version) {
  try {
    // Ensure /data directory exists
    const dir = path.dirname(VERSION_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(VERSION_FILE, version, "utf8");
    console.log("[version] Set installed version to:", version);
    return true;
  } catch (err) {
    console.error("[version] Error writing version file:", err);
    return false;
  }
}

/**
 * Compare two semver versions
 * @param {string} v1 First version
 * @param {string} v2 Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export function compareVersions(v1, v2) {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

/**
 * Check if the installed version is older than the current version
 * @returns {boolean}
 */
export function needsUpgrade() {
  const installed = getInstalledVersion();
  if (!installed) return true;
  return compareVersions(installed, CURRENT_SETUP_VERSION) < 0;
}

export function createVersionRouter(handlers) {
  const { requireApiToken } = handlers;
  const router = express.Router();

  /**
   * GET /setup/api/version
   * Get the current and installed setup versions
   */
  router.get("/version", requireApiToken, (_req, res) => {
    const installedVersion = getInstalledVersion();
    const needsUpdate = needsUpgrade();
    
    return res.json({
      ok: true,
      currentVersion: CURRENT_SETUP_VERSION,
      installedVersion: installedVersion || "not set",
      needsUpgrade: needsUpdate,
    });
  });

  /**
   * POST /setup/api/version/set
   * Manually set the installed version (usually called after deploy operations)
   */
  router.post("/version/set", requireApiToken, (req, res) => {
    const { version } = req.body || {};
    const targetVersion = version || CURRENT_SETUP_VERSION;
    
    const success = setInstalledVersion(targetVersion);
    
    if (success) {
      return res.json({
        ok: true,
        message: `Version set to ${targetVersion}`,
        installedVersion: targetVersion,
      });
    } else {
      return res.status(500).json({
        ok: false,
        error: "Failed to set version",
      });
    }
  });

  return router;
}
