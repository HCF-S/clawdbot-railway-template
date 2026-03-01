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

/**
 * Install the Composio skill into the workspace.
 * Copies only SKILL.md to workspace/skills/composio/. Does not modify openclaw.json
 * (OpenClaw accesses Composio via the skill's meta tools, not native MCP config).
 * The Composio MCP proxy (127.0.0.1:3099) is started by the wrapper when AMIKO_PLATFORM_URL is set.
 */
export async function installComposioSkill(handlers) {
  const { WORKSPACE_DIR } = handlers;

  const templateDir = path.join(TEMPLATES_DIR, "composio-skill");
  const skillMd = "SKILL.md";
  const srcPath = path.join(templateDir, skillMd);

  if (!fs.existsSync(srcPath)) {
    return {
      ok: false,
      error: `Template not found: ${srcPath}`,
    };
  }

  const skillsDir = path.join(WORKSPACE_DIR, "skills");
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
    const composioUrl = `http://127.0.0.1:${COMPOSIO_MCP_PROXY_PORT}`;
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
    config.mcpServers.composio = { url: composioUrl };
    fs.writeFileSync(mcporterConfigPath, JSON.stringify(config, null, 2), "utf8");
    console.log("[installComposioSkill] wrote", mcporterConfigPath, "with composio server");

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
