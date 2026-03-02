import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to templates directory (inside src/templates)
const TEMPLATES_DIR = path.resolve(__dirname, "../../templates");

/**
 * Install the amiko-skill into STATE_DIR/skills/amiko (shared across agents)
 * Copies template files to STATE_DIR/skills/amiko (e.g. /data/.openclaw/skills/amiko)
 */
export async function installAmikoSkill(handlers) {
  const { WORKSPACE_DIR, STATE_DIR } = handlers;
  
  const templateDir = path.join(TEMPLATES_DIR, "amiko-skill");
  
  // Check if template exists
  if (!fs.existsSync(templateDir)) {
    return { 
      ok: false, 
      error: `Template not found: ${templateDir}` 
    };
  }
  
  // Determine target directory - prefer STATE_DIR/skills (shared across agents), fall back to workspace/skills for older setups
  const skillsDir = STATE_DIR ? path.join(STATE_DIR, "skills") : path.join(WORKSPACE_DIR, "skills");
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

/**
 * Install the Composio skill into STATE_DIR/skills/composio (shared across agents).
 * Copies only SKILL.md to STATE_DIR/skills/composio/. Does not modify openclaw.json
 * (OpenClaw accesses Composio via the skill's meta tools, not native MCP config).
 */
export async function installComposioSkill(handlers) {
  const { WORKSPACE_DIR, STATE_DIR } = handlers;

  const templateDir = path.join(TEMPLATES_DIR, "composio-skill");
  const skillMd = "SKILL.md";
  const srcPath = path.join(templateDir, skillMd);

  if (!fs.existsSync(srcPath)) {
    return {
      ok: false,
      error: `Template not found: ${srcPath}`,
    };
  }

  const skillsDir = STATE_DIR ? path.join(STATE_DIR, "skills") : path.join(WORKSPACE_DIR, "skills");
  const targetDir = path.join(skillsDir, "composio");

  try {
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

    const destPath = path.join(targetDir, skillMd);
    fs.copyFileSync(srcPath, destPath);

    // Create or update workspace mcporter config so the composio MCP server is named and discoverable
    const configDir = path.join(WORKSPACE_DIR, "config");
    const mcporterConfigPath = path.join(configDir, "mcporter.json");
    fs.mkdirSync(configDir, { recursive: true });

    // Read Amiko twin config for platform URL + clawd twin token
    const amikoConfigPath = path.join(WORKSPACE_DIR, ".amiko.json");
    let amikoConfig = {};
    if (fs.existsSync(amikoConfigPath)) {
      try {
        amikoConfig = JSON.parse(fs.readFileSync(amikoConfigPath, "utf8"));
      } catch (err) {
        console.warn("[installComposioSkill] failed to parse .amiko.json:", err);
      }
    }

    const rawPlatformUrl =
      (amikoConfig.amikoPlatformUrl ? String(amikoConfig.amikoPlatformUrl).trim() : "") ||
      process.env.AMIKO_PLATFORM_URL?.trim() ||
      "https://platform.heyamiko.com";
    const platformUrl = rawPlatformUrl.replace(/\/+$/, "");

    const twinId =
      (amikoConfig.amikoTwinId ? String(amikoConfig.amikoTwinId).trim() : "") ||
      process.env.AMIKO_TWIN_ID?.trim() ||
      "";
    const clawdTwinToken =
      (amikoConfig.amikoTwinToken ? String(amikoConfig.amikoTwinToken).trim() : "") ||
      (amikoConfig.amikoUserToken ? String(amikoConfig.amikoUserToken).trim() : "") ||
      process.env.AMIKO_USER_TOKEN?.trim() ||
      "";

    let config = { mcpServers: {} };
    if (fs.existsSync(mcporterConfigPath)) {
      try {
        config = JSON.parse(fs.readFileSync(mcporterConfigPath, "utf8"));
        if (!config.mcpServers || typeof config.mcpServers !== "object") {
          config.mcpServers = {};
        }
      } catch (_) {
        // ignore parse errors; overwrite with minimal config
      }
    }

    if (twinId && clawdTwinToken) {
      const composioUrl = `${platformUrl}/api/agents/${twinId}/mcp`;
      config.mcpServers.composio = {
        url: composioUrl,
        headers: {
          Authorization: `Bearer ${clawdTwinToken}`,
        },
      };
      fs.writeFileSync(mcporterConfigPath, JSON.stringify(config, null, 2), "utf8");
      console.log(
        "[installComposioSkill] wrote",
        mcporterConfigPath,
        "with composio server pointing to",
        composioUrl
      );
    } else {
      console.warn(
        "[installComposioSkill] missing twinId or clawd twin token; skipping mcporter composio entry"
      );
    }

    console.log("[installComposioSkill] installed", skillMd, "to", targetDir);

    return {
      ok: true,
      path: targetDir,
      files: [skillMd],
      output: `Installed composio skill ${skillMd} to ${targetDir}. MCP URL: ${composioUrl}. mcporter config: ${mcporterConfigPath}`,
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
