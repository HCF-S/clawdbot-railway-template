import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to templates directory (inside src/templates)
const TEMPLATES_DIR = path.resolve(__dirname, "../../templates");

/**
 * Install the amiko-skill into the workspace
 * Copies template files to /data/workspace/skills/amiko or /data/skills/amiko
 */
export async function installAmikoSkill(handlers) {
  const { WORKSPACE_DIR } = handlers;
  
  const templateDir = path.join(TEMPLATES_DIR, "amiko-skill");
  
  // Check if template exists
  if (!fs.existsSync(templateDir)) {
    return { 
      ok: false, 
      error: `Template not found: ${templateDir}` 
    };
  }
  
  // Determine target directory - prefer skills folder in workspace
  const skillsDir = path.join(WORKSPACE_DIR, "skills");
  const targetDir = path.join(skillsDir, "amiko");
  
  try {
    // Create skills directory
    fs.mkdirSync(skillsDir, { recursive: true });
    
    // Create target directory
    fs.mkdirSync(targetDir, { recursive: true });
    
    // Copy all files from template
    const files = fs.readdirSync(templateDir);
    const copiedFiles = [];
    
    for (const file of files) {
      const srcPath = path.join(templateDir, file);
      const destPath = path.join(targetDir, file);
      
      // Skip if it's a directory (we only copy files for now)
      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        continue;
      }
      
      // Copy file
      fs.copyFileSync(srcPath, destPath);
      
      // Make cli.js executable
      if (file === "cli.js") {
        fs.chmodSync(destPath, 0o755);
      }
      
      copiedFiles.push(file);
    }
    
    console.log("[installAmikoSkill] installed to", targetDir);
    console.log("[installAmikoSkill] files:", copiedFiles.join(", "));
    
    // Inject skill reference into AMIKO.md if it exists
    const amikoMdPath = path.join(WORKSPACE_DIR, "AMIKO.md");
    if (fs.existsSync(amikoMdPath)) {
      try {
        let content = fs.readFileSync(amikoMdPath, "utf8");
        
        if (!content.includes("## Amiko Skill")) {
          const skillSection = `

---

## Amiko Skill

You have the **amiko skill** installed at \`skills/amiko/\`. This skill allows you to:

- **Generate voice audio** using your cloned voice
- **Access your twin data** from the Amiko platform
- **List your training documents**

### Quick Commands

\`\`\`bash
# Generate voice
skills/amiko/cli.js voice "Hello, I am your digital twin!"

# Save voice to file
skills/amiko/cli.js voice "Hello world" --output hello.mp3

# Get your twin info
skills/amiko/cli.js info

# List your documents
skills/amiko/cli.js docs
\`\`\`

Read \`skills/amiko/SKILL.md\` for full documentation.
`;
          content = content.trimEnd() + skillSection + "\n";
          fs.writeFileSync(amikoMdPath, content, "utf8");
          console.log("[installAmikoSkill] added skill section to AMIKO.md");
        }
      } catch (err) {
        console.warn("[installAmikoSkill] failed to update AMIKO.md:", err);
      }
    }
    
    return {
      ok: true,
      path: targetDir,
      files: copiedFiles,
      output: `Installed amiko skill to: ${targetDir} (${copiedFiles.length} files)`,
    };
  } catch (err) {
    console.error("[installAmikoSkill] error:", err);
    return { 
      ok: false, 
      error: String(err) 
    };
  }
}

const COMPOSIO_MCP_PROXY_PORT = Number.parseInt(
  process.env.COMPOSIO_MCP_PROXY_PORT ?? "3099",
  10
);
const COMPOSIO_MCP_BRIDGE_CONFIG = {
  name: "composio",
  url: `http://127.0.0.1:${COMPOSIO_MCP_PROXY_PORT}`,
  prefix: "composio",
  healthCheck: true,
};

/**
 * Merge openclaw-mcp-bridge config with Composio server into openclaw.json.
 * Ensures plugins.entries["openclaw-mcp-bridge"].config.servers includes the Composio proxy entry.
 * Creates backup, writes config, and restarts gateway if configured.
 */
export async function ensureComposioMcpBridgeInOpenclawConfig(handlers) {
  const { configPath, STATE_DIR, isConfigured, restartGateway } = handlers;
  const p = configPath();

  try {
    let config = {};
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      try {
        config = JSON.parse(raw);
      } catch (parseErr) {
        console.warn("[ensureComposioMcpBridge] config parse error:", parseErr?.message);
        return { ok: false, error: "Invalid openclaw.json", updated: false };
      }
    }

    if (!config.plugins) config.plugins = {};
    if (config.plugins.enabled !== true) config.plugins.enabled = true;
    if (!config.plugins.entries) config.plugins.entries = {};
    if (!config.plugins.entries["openclaw-mcp-bridge"]) {
      config.plugins.entries["openclaw-mcp-bridge"] = { config: { servers: [], timeout: 30000, retries: 1 } };
    }
    const bridge = config.plugins.entries["openclaw-mcp-bridge"];
    if (!bridge.config) bridge.config = {};
    if (!Array.isArray(bridge.config.servers)) bridge.config.servers = [];
    bridge.config.timeout = bridge.config.timeout ?? 30000;
    bridge.config.retries = bridge.config.retries ?? 1;

    const composioUrl = COMPOSIO_MCP_BRIDGE_CONFIG.url;
    const hasComposio = bridge.config.servers.some(
      (s) => s.url === composioUrl || (s.name && s.name === "composio")
    );
    if (!hasComposio) {
      bridge.config.servers.push({ ...COMPOSIO_MCP_BRIDGE_CONFIG });
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });
    if (fs.existsSync(p)) {
      const backupPath = `${p}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      fs.copyFileSync(p, backupPath);
    }
    fs.writeFileSync(p, JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });

    if (isConfigured()) {
      await restartGateway();
    }

    return { ok: true, updated: !hasComposio };
  } catch (err) {
    console.error("[ensureComposioMcpBridge] error:", err);
    return { ok: false, error: String(err), updated: false };
  }
}

/**
 * Install the composio-skill into the workspace.
 * Copies template (SKILL.md, etc.) to workspace/skills/composio/.
 * The Composio MCP proxy (127.0.0.1:3099) is started by the wrapper when AMIKO_PLATFORM_URL is set;
 * OpenClaw can connect to http://127.0.0.1:3099 for Composio tools (Gmail, Calendar, Calendly, etc.).
 * Also merges openclaw-mcp-bridge config into openclaw.json so OpenClaw connects to the proxy.
 */
export async function installComposioSkill(handlers) {
  const { WORKSPACE_DIR } = handlers;

  const templateDir = path.join(TEMPLATES_DIR, "composio-skill");

  if (!fs.existsSync(templateDir)) {
    return {
      ok: false,
      error: `Template not found: ${templateDir}`,
    };
  }

  const skillsDir = path.join(WORKSPACE_DIR, "skills");
  const targetDir = path.join(skillsDir, "composio");

  try {
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

    const files = fs.readdirSync(templateDir);
    const copiedFiles = [];

    for (const file of files) {
      const srcPath = path.join(templateDir, file);
      const destPath = path.join(targetDir, file);
      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) continue;
      fs.copyFileSync(srcPath, destPath);
      copiedFiles.push(file);
    }

    console.log("[installComposioSkill] installed to", targetDir, "files:", copiedFiles.join(", "));

    const mcpResult = await ensureComposioMcpBridgeInOpenclawConfig(handlers);

    return {
      ok: true,
      path: targetDir,
      files: copiedFiles,
      mcpBridgeConfig: mcpResult,
      output: `Installed composio skill to: ${targetDir} (${copiedFiles.length} files)` + (mcpResult.updated ? "; openclaw-mcp-bridge config updated." : ""),
    };
  } catch (err) {
    console.error("[installComposioSkill] error:", err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Create the skills router
 * Note: The main skill installation endpoint is now at /setup/api/deploy/amiko-skill
 * This router is kept for potential future skill management endpoints
 */
export function createSkillsRouter(_handlers) {
  const router = express.Router();
  // Future skill management endpoints can be added here
  return router;
}
