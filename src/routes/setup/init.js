import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runOnboarding } from "./run.js";
import { syncAmikoData } from "./amiko.js";
import { installAmikoSkill } from "./skills.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Install SYS.md and create /data/sys directory structure
 * @returns {{ ok: boolean, output?: string, error?: string }}
 */
export async function installSysConfig(handlers) {
  const { WORKSPACE_DIR } = handlers;
  
  try {
    // Copy SYS.md template to workspace
    const templatePath = path.join(__dirname, "../../templates/SYS.md.tmpl");
    const destPath = path.join(WORKSPACE_DIR, "SYS.md");
    
    if (fs.existsSync(templatePath)) {
      const content = fs.readFileSync(templatePath, "utf8");
      fs.writeFileSync(destPath, content, "utf8");
      console.log("[installSysConfig] copied SYS.md to workspace");
    } else {
      console.warn("[installSysConfig] SYS.md.tmpl not found, skipping");
    }
    
    // Create /data/sys directory structure
    const sysDir = "/data/sys";
    const subDirs = ["bin", "lib", "config", "packages", "npm-global"];
    
    for (const dir of [sysDir, ...subDirs.map(d => path.join(sysDir, d))]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log("[installSysConfig] created directory:", dir);
      }
    }
    
    // Create initial MANIFEST.md if not exists
    const manifestPath = path.join(sysDir, "MANIFEST.md");
    if (!fs.existsSync(manifestPath)) {
      const manifestContent = `# System Persistence Manifest

This file tracks all persistent installations and configurations.

---

## Initial Setup

**Date**: ${new Date().toISOString()}
**Type**: setup
**Notes**: Initial /data/sys directory structure created

---

`;
      fs.writeFileSync(manifestPath, manifestContent, "utf8");
      console.log("[installSysConfig] created MANIFEST.md");
    }
    
    // Create initial restore.sh if not exists
    const restorePath = path.join(sysDir, "restore.sh");
    if (!fs.existsSync(restorePath)) {
      const restoreContent = `#!/bin/bash
# System Restoration Script
# This script restores persistent configurations after container restart

set -e

echo "[restore.sh] Starting system restoration..."

# Add persistent bin to PATH
export PATH="/data/sys/bin:\$PATH"

# Restore npm global packages path
if [ -d "/data/sys/npm-global" ]; then
    export PATH="/data/sys/npm-global/bin:\$PATH"
    echo "[restore.sh] npm global path restored"
fi

# Activate Python venv if exists
if [ -f "/data/sys/python-venv/bin/activate" ]; then
    source /data/sys/python-venv/bin/activate
    echo "[restore.sh] Python venv activated"
fi

# Reinstall apt packages if needed
if [ -f "/data/sys/packages/apt-packages.txt" ] && [ -s "/data/sys/packages/apt-packages.txt" ]; then
    echo "[restore.sh] Reinstalling apt packages..."
    apt-get update -qq 2>/dev/null || true
    xargs -a /data/sys/packages/apt-packages.txt apt-get install -y -qq 2>/dev/null || true
fi

# Add custom restore commands below this line
# ---

echo "[restore.sh] System restoration complete!"
`;
      fs.writeFileSync(restorePath, restoreContent, "utf8");
      fs.chmodSync(restorePath, 0o755);
      console.log("[installSysConfig] created restore.sh");
    }
    
    return { 
      ok: true, 
      output: `Installed SYS.md and created /data/sys structure` 
    };
  } catch (err) {
    console.error("[installSysConfig] error:", err);
    return { ok: false, error: String(err) };
  }
}

export function createInitRouter(handlers) {
  const { requireApiToken } = handlers;
  const router = express.Router();

  router.post("/init", requireApiToken, async (req, res) => {
    try {
      const payload = req.body || {};

      // Step 1: Run onboarding (includes channel configuration)
      const onboardResult = await runOnboarding(payload, handlers);
      
      if (!onboardResult.ok) {
        return res.status(500).json(onboardResult);
      }

      let output = onboardResult.output;

      // Step 2: Sync Amiko data
      output += "\n\n[amiko] Starting Amiko data sync...\n";
      const amikoOutput = await syncAmikoData(handlers);
      output += amikoOutput;

      // Step 3: Install Amiko skill
      output += "\n[amiko] Installing Amiko skill...\n";
      const skillResult = await installAmikoSkill(handlers);
      if (skillResult.ok) {
        output += `[amiko/skill] ${skillResult.output}\n`;
      } else {
        output += `[amiko/skill] Warning: ${skillResult.error}\n`;
      }

      // Step 4: Install SYS.md and create /data/sys structure
      output += "\n[sys] Setting up system persistence...\n";
      const sysResult = await installSysConfig(handlers);
      if (sysResult.ok) {
        output += `[sys] ${sysResult.output}\n`;
      } else {
        output += `[sys] Warning: ${sysResult.error}\n`;
      }

      return res.json({ ok: true, output });
    } catch (err) {
      console.error("[/setup/api/init] error:", err);
      return res.status(500).json({ ok: false, output: `Internal error: ${String(err)}` });
    }
  });

  return router;
}
