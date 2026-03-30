import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to templates directory (inside src/templates)
const TEMPLATES_DIR = path.resolve(__dirname, "../../templates");
const MAIN_WORKSPACE = "/data/.openclaw/workspace";

/**
 * Install the amiko-skill into STATE_DIR/skills/amiko (shared across agents)
 * Copies template files to STATE_DIR/skills/amiko (e.g. /data/.openclaw/skills/amiko)
 */
export async function installAmikoSkill(handlers) {
  const { STATE_DIR } = handlers;
  
  const templateDir = path.join(TEMPLATES_DIR, "amiko-skill");
  
  // Check if template exists
  if (!fs.existsSync(templateDir)) {
    return { 
      ok: false, 
      error: `Template not found: ${templateDir}` 
    };
  }
  
  const skillsDir = path.join(STATE_DIR, "skills");
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
    const amikoMdPath = path.join(MAIN_WORKSPACE, "AMIKO.md");
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
 * .amiko.json and config/mcporter.json are written by POST /setup/api/amiko/write.
 */
export async function installComposioSkill(handlers) {
  const { STATE_DIR } = handlers;

  const templateDir = path.join(TEMPLATES_DIR, "composio-skill");
  const skillMd = "SKILL.md";
  const srcPath = path.join(templateDir, skillMd);

  if (!fs.existsSync(srcPath)) {
    return {
      ok: false,
      error: `Template not found: ${srcPath}`,
    };
  }

  const skillsDir = path.join(STATE_DIR, "skills");
  const targetDir = path.join(skillsDir, "composio");

  try {
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

    const destPath = path.join(targetDir, skillMd);
    fs.copyFileSync(srcPath, destPath);

    // .amiko.json and config/mcporter.json are written by POST /setup/api/amiko/write
    // (uses writeAmikoConfigAndMcporter with correct workspace per agentId)

    console.log("[installComposioSkill] installed", skillMd, "to", targetDir);

    return {
      ok: true,
      path: targetDir,
      files: [skillMd],
      output: `Installed composio skill ${skillMd} to ${targetDir}. Use POST /setup/api/amiko/write to write .amiko.json and config/mcporter.json per agent.`,
    };
  } catch (err) {
    console.error("[installComposioSkill] error:", err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Install the genui-skill into STATE_DIR/skills/genui (shared across agents).
 * Copies server.mjs + SKILL.md and makes server.mjs executable.
 */
export async function installGenuiSkill(handlers) {
  const { STATE_DIR } = handlers;

  const templateDir = path.join(TEMPLATES_DIR, "genui-skill");

  if (!fs.existsSync(templateDir)) {
    return { ok: false, error: `Template not found: ${templateDir}` };
  }

  const skillsDir = path.join(STATE_DIR, "skills");
  const targetDir = path.join(skillsDir, "genui");

  try {
    fs.mkdirSync(targetDir, { recursive: true });

    const files = fs.readdirSync(templateDir);
    const copiedFiles = [];

    for (const file of files) {
      const srcPath = path.join(templateDir, file);
      if (fs.statSync(srcPath).isDirectory()) continue;

      const destPath = path.join(targetDir, file);
      fs.copyFileSync(srcPath, destPath);

      if (file === "server.mjs") {
        fs.chmodSync(destPath, 0o755);
      }

      copiedFiles.push(file);
    }

    console.log("[installGenuiSkill] installed to", targetDir);
    console.log("[installGenuiSkill] files:", copiedFiles.join(", "));

    // Add genui to mcporter.json in every workspace that has a config dir
    const serverPath = path.join(targetDir, "server.mjs");
    const genuiEntry = { command: "node", args: [serverPath] };
    let mcporterUpdated = 0;

    for (const entry of fs.readdirSync(STATE_DIR)) {
      if (!entry.startsWith("workspace")) continue;
      const configDir = path.join(STATE_DIR, entry, "config");
      if (!fs.existsSync(configDir)) continue;

      const mcpPath = path.join(configDir, "mcporter.json");
      try {
        let cfg = { mcpServers: {} };
        if (fs.existsSync(mcpPath)) {
          const parsed = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
          if (parsed && typeof parsed === "object") cfg = parsed;
        }
        if (!cfg.mcpServers || typeof cfg.mcpServers !== "object") cfg.mcpServers = {};
        cfg.mcpServers.genui = genuiEntry;
        fs.writeFileSync(mcpPath, JSON.stringify(cfg, null, 2), "utf8");
        mcporterUpdated++;
      } catch (err) {
        console.warn("[installGenuiSkill] failed to update", mcpPath, err);
      }
    }

    if (mcporterUpdated > 0) {
      console.log("[installGenuiSkill] updated mcporter.json in", mcporterUpdated, "workspace(s)");
    }

    // Inject genui skill reference into AMIKO.md in every workspace
    let amikoMdUpdated = 0;
    const amikoMdPaths = new Set();
    // Collect AMIKO.md from all workspace* dirs under STATE_DIR
    for (const entry of fs.readdirSync(STATE_DIR)) {
      if (!entry.startsWith("workspace")) continue;
      const p = path.join(STATE_DIR, entry, "AMIKO.md");
      if (fs.existsSync(p)) amikoMdPaths.add(p);
    }
    // Also check the main workspace directly — create if missing
    const mainAmikoMd = path.join(MAIN_WORKSPACE, "AMIKO.md");
    if (!fs.existsSync(mainAmikoMd)) {
      try {
        fs.mkdirSync(path.dirname(mainAmikoMd), { recursive: true });
        fs.writeFileSync(mainAmikoMd, "# Amiko\n", "utf8");
        console.log("[installGenuiSkill] created", mainAmikoMd);
      } catch (err) {
        console.warn("[installGenuiSkill] failed to create", mainAmikoMd, err);
      }
    }
    if (fs.existsSync(mainAmikoMd)) amikoMdPaths.add(mainAmikoMd);

    for (const amikoMdPath of amikoMdPaths) {

      try {
        let content = fs.readFileSync(amikoMdPath, "utf8");
        if (!content.includes("## Display Tools (Generative UI)")) {
          const section = `

---

## Display Tools (Generative UI)

You have **display tools** via \`mcporter call genui.<tool>\`. These render rich cards in the chat UI instead of plain text. **Always prefer display tools over markdown/text when presenting structured data.**

### Available Tools

| Tool | When to use |
|------|-------------|
| \`genui.show_weather\` | Presenting weather info |
| \`genui.show_profile\` | Showing a user/twin/friend profile |
| \`genui.create_poll\` | Creating or displaying a poll |
| \`genui.preview_link\` | Sharing a URL with a rich preview |
| \`genui.show_table\` | Presenting tabular data |

### How to call

Use \`key:value\` syntax. Quote strings with spaces using double quotes, wrap JSON arrays/objects in single quotes:

\`\`\`bash
mcporter call genui.show_weather location:"Tokyo, Japan" temperature:17 condition:"Patchy rain" unit:C humidity:81 wind:"27 km/h SSW" forecast:'[{"day":"Tue","high":18,"low":16,"condition":"Patchy rain"},{"day":"Wed","high":17,"low":14,"condition":"Light rain"}]'
\`\`\`

Read \`skills/genui/SKILL.md\` for full tool schemas and more examples.
`;
          content = content.trimEnd() + section + "\n";
          fs.writeFileSync(amikoMdPath, content, "utf8");
          amikoMdUpdated++;
        }
      } catch (err) {
        console.warn("[installGenuiSkill] failed to update", amikoMdPath, err);
      }
    }

    if (amikoMdUpdated > 0) {
      console.log("[installGenuiSkill] updated AMIKO.md in", amikoMdUpdated, "workspace(s)");
    }

    return {
      ok: true,
      path: targetDir,
      files: copiedFiles,
      output: `Installed genui skill to: ${targetDir} (${copiedFiles.length} files, ${mcporterUpdated} mcporter config(s) updated, ${amikoMdUpdated} AMIKO.md(s) updated)`,
    };
  } catch (err) {
    console.error("[installGenuiSkill] error:", err);
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
