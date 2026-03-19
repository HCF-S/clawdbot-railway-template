import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to templates directory (inside src/templates)
const TEMPLATES_DIR = path.resolve(__dirname, "../../templates");
const MAIN_WORKSPACE = "/data/.openclaw/workspace";

// Note: installAmikoSkill removed — amiko skill is now bundled in the openclaw-amiko-plugin extension.

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
 * Create the skills router
 * Note: The main skill installation endpoint is now at /setup/api/deploy/amiko-skill
 * This router is kept for potential future skill management endpoints
 */
export function createSkillsRouter(_handlers) {
  const router = express.Router();
  // Future skill management endpoints can be added here
  return router;
}
