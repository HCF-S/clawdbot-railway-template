import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runOnboarding, replaceOpenRouterKeyInAuthProfiles, setGatewayControlUiAllowedOrigins } from "./run.js";
import { syncAmikoData } from "./amiko.js";
import { installAmikoSkill } from "./skills.js";
import { CURRENT_SETUP_VERSION, setInstalledVersion } from "./version.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Install SYS.md and create /data/sys directory structure
 * @returns {{ ok: boolean, output?: string, error?: string }}
 */
export async function installSysConfig(handlers) {
  const { WORKSPACE_DIR } = handlers;
  
  try {
    // Copy SYS.md template to workspace (template lives under workspace/ = final position)
    const templatePath = path.join(__dirname, "../../templates/workspace/SYS.md.tmpl");
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
    const subDirs = ["bin", "mirror", "install-log", "npm-global"];
    
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
See SYS.md in workspace for the full persistence guide.

---

## [${new Date().toISOString()}] Initial Setup

**Method**: setup
**Notes**: Initial /data/sys directory structure created
- /data/sys/bin/ - Portable executables
- /data/sys/mirror/ - Mirror of system files
- /data/sys/install-log/ - Detailed installation records
- /data/sys/npm-global/ - npm global packages

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
# 
# Strategy: Copy mirrored files back to their original locations

set -e

echo "[restore.sh] Starting system restoration..."

MIRROR_DIR="/data/sys/mirror"
RESTORED_COUNT=0

# 1. Add persistent bin to PATH
export PATH="/data/sys/bin:\$PATH"
echo "[restore.sh] Added /data/sys/bin to PATH"

# 2. Restore npm global packages path
if [ -d "/data/sys/npm-global/bin" ]; then
    export PATH="/data/sys/npm-global/bin:\$PATH"
    echo "[restore.sh] Added npm global bin to PATH"
fi

# 3. Activate Python venv if exists
if [ -f "/data/sys/python-venv/bin/activate" ]; then
    source /data/sys/python-venv/bin/activate
    echo "[restore.sh] Python venv activated"
fi

# 4. Restore mirrored files
if [ -d "\$MIRROR_DIR" ]; then
    echo "[restore.sh] Restoring mirrored files..."
    
    # Find all files in mirror and copy them back
    cd "\$MIRROR_DIR"
    find . -type f | while read -r file; do
        # Remove leading ./
        rel_path="\${file#./}"
        src="\$MIRROR_DIR/\$rel_path"
        dest="/\$rel_path"
        
        # Create destination directory if needed
        dest_dir=\$(dirname "\$dest")
        if [ ! -d "\$dest_dir" ]; then
            mkdir -p "\$dest_dir" 2>/dev/null || true
        fi
        
        # Copy file back
        if cp "\$src" "\$dest" 2>/dev/null; then
            # Preserve executable permission
            if [ -x "\$src" ]; then
                chmod +x "\$dest" 2>/dev/null || true
            fi
            echo "  Restored: \$dest"
            RESTORED_COUNT=\$((RESTORED_COUNT + 1))
        else
            echo "  Failed to restore: \$dest (may need sudo)"
        fi
    done
    cd - > /dev/null
    
    echo "[restore.sh] Restored \$RESTORED_COUNT file(s) from mirror"
else
    echo "[restore.sh] No mirror directory found, skipping file restoration"
fi

echo "[restore.sh] System restoration complete!"
echo ""
echo "Note: If any files failed to restore, you may need to run with sudo:"
echo "  sudo /data/sys/restore.sh"
echo ""
echo "For apt packages, check /data/sys/install-log/apt-packages.md"
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
      const { isConfigured, restartGateway } = handlers;
      let output = "";

      if (!isConfigured()) {
        // Not configured: run full onboarding (e.g. bootstrap failed or first deploy without auto-onboard)
        const onboardResult = await runOnboarding(payload, handlers);
        if (!onboardResult.ok) {
          return res.status(500).json(onboardResult);
        }
        output = onboardResult.output;
        try {
          await setGatewayControlUiAllowedOrigins(handlers);
          await restartGateway();
          output += "[gateway] Allowed origins set and gateway restarted.\n";
        } catch (err) {
          output += `[gateway] Warning: ${String(err)}\n`;
        }
      } else {
        // Already configured (e.g. auto-onboard with dummy key at startup): replace dummy key with real one
        const realKey = String(payload.authSecret ?? "").trim();
        if (realKey) {
          const replaceResult = replaceOpenRouterKeyInAuthProfiles(handlers, realKey);
          output = replaceResult.ok ? `${replaceResult.output}\n` : `${replaceResult.output}\n`;
          if (replaceResult.ok) {
            await restartGateway();
            output += "[gateway] Restarted to pick up new OpenRouter key.\n";
          } else {
            return res.status(500).json({ ok: false, output: replaceResult.output });
          }
        } else {
          output = "Already configured; no authSecret provided to replace key. Running data sync only.\n";
          try {
            await handlers.ensureGatewayRunning();
          } catch {
            // ignore
          }
        }
      }

      return await finishInit(output, handlers, res);
    } catch (err) {
      console.error("[/setup/api/init] error:", err);
      return res.status(500).json({ ok: false, output: `Internal error: ${String(err)}` });
    }
  });

  /** Alias for /init: same behavior (key replace when configured, full onboarding when not). */
  router.post("/init-template", requireApiToken, async (req, res) => {
    try {
      const payload = req.body || {};
      const { isConfigured, restartGateway } = handlers;
      let output = "";

      if (!isConfigured()) {
        const onboardResult = await runOnboarding(payload, handlers);
        if (!onboardResult.ok) {
          return res.status(500).json(onboardResult);
        }
        output = onboardResult.output;
        try {
          await setGatewayControlUiAllowedOrigins(handlers);
          await restartGateway();
          output += "[gateway] Allowed origins set and gateway restarted.\n";
        } catch (err) {
          output += `[gateway] Warning: ${String(err)}\n`;
        }
      } else {
        const realKey = String(payload.authSecret ?? "").trim();
        if (realKey) {
          const replaceResult = replaceOpenRouterKeyInAuthProfiles(handlers, realKey);
          output = replaceResult.ok ? `${replaceResult.output}\n` : replaceResult.output;
          if (replaceResult.ok) {
            await restartGateway();
            output += "[gateway] Restarted to pick up new OpenRouter key.\n";
          } else {
            return res.status(500).json({ ok: false, output: replaceResult.output });
          }
        } else {
          output = "Already configured; no authSecret provided. Running data sync only.\n";
          try {
            await handlers.ensureGatewayRunning();
          } catch {
            // ignore
          }
        }
      }

      return await finishInit(output, handlers, res);
    } catch (err) {
      console.error("[/setup/api/init-template] error:", err);
      return res.status(500).json({ ok: false, output: `Internal error: ${String(err)}` });
    }
  });

  return router;
}

async function finishInit(output, handlers, res) {
  try {
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

    // Step 5: Set setup version
    output += "\n[version] Setting setup version...\n";
    const versionSet = setInstalledVersion(CURRENT_SETUP_VERSION);
    if (versionSet) {
      output += `[version] Set to ${CURRENT_SETUP_VERSION}\n`;
    } else {
      output += `[version] Warning: Failed to set version\n`;
    }

    return res.json({ ok: true, version: CURRENT_SETUP_VERSION, output });
  } catch (err) {
    console.error("[finishInit] error:", err);
    return res.status(500).json({ ok: false, output: `Internal error: ${String(err)}` });
  }
}
