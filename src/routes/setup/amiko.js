import express from "express";
import fs from "node:fs";
import path from "node:path";
import { renderAmikoMd, renderDocMd, renderMemoriesMd } from "../../templates/render.js";

const LEGACY_AMIKO_CONFIG_PATH = "/data/.amiko.json";
const PLATFORM_BASE_URL = "https://platform.heyamiko.com";
//const PLATFORM_BASE_URL = "http://host.docker.internal:3001";

// ============================================================
// SHARED FUNCTIONS - Used by both routes and syncAmikoData
// ============================================================

/**
 * Read Amiko config from workspace .amiko.json (per-agent), with fallback to legacy /data/.amiko.json.
 * @param {string} [workspaceDir] - Main workspace dir (e.g. WORKSPACE_DIR); if set, read workspaceDir/.amiko.json first
 * @returns {{ userId: string, twinId: string, userToken: string }}
 */
function readAmikoConfig(workspaceDir) {
  const pathsToTry = [];
  if (workspaceDir && typeof workspaceDir === "string") {
    pathsToTry.push(path.join(workspaceDir.trim(), ".amiko.json"));
  }
  pathsToTry.push(LEGACY_AMIKO_CONFIG_PATH);

  for (const cfgPath of pathsToTry) {
    try {
      if (fs.existsSync(cfgPath)) {
        const raw = fs.readFileSync(cfgPath, "utf8");
        const data = JSON.parse(raw);
        return {
          userId: String(data.AMIKO_USER_ID || "").trim(),
          twinId: String(data.AMIKO_TWIN_ID || "").trim(),
          userToken: String(data.AMIKO_USER_TOKEN || "").trim(),
        };
      }
    } catch (err) {
      console.warn("[amiko] failed to read config from", cfgPath, err?.message);
    }
  }
  return { userId: "", twinId: "", userToken: "" };
}

export async function pullTwinData(handlers) {
  const { WORKSPACE_DIR, AMIKO_TWIN_ID, AMIKO_USER_TOKEN } = handlers;
  const fileCfg = readAmikoConfig(WORKSPACE_DIR);

  const twinId = String(fileCfg.twinId || AMIKO_TWIN_ID || "").trim();
  if (!twinId) {
    return { ok: false, error: "Missing twinId" };
  }

  const userToken = String(fileCfg.userToken || AMIKO_USER_TOKEN || "").trim();
  if (!userToken) {
    return { ok: false, error: "Missing user token" };
  }

  try {
    const url = `${PLATFORM_BASE_URL}/api/agents/${encodeURIComponent(twinId)}`;
    console.log("[pullTwinData] fetching twin", { twinId, url });

    const response = await fetch(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${userToken}`,
        accept: "application/json",
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      return { ok: false, error: `HTTP ${response.status}: ${errText}` };
    }

    const twin = await response.json();

    // Fetch user data
    const userResponse = await fetch(`${PLATFORM_BASE_URL}/api/auth/me`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${userToken}`,
        accept: "application/json",
      },
    });

    let user = null;
    if (userResponse.ok) {
      user = await userResponse.json();
    }

    // Write AMIKO.md using template
    const markdown = renderAmikoMd(twin, user);
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    const outPath = path.join(WORKSPACE_DIR, "AMIKO.md");
    fs.writeFileSync(outPath, markdown, "utf8");
    console.log("[pullTwinData] saved", { path: outPath });

    const personality = typeof twin.personality === "string" ? twin.personality.trim() : "";
    if (personality) {
      const soulPath = path.join(WORKSPACE_DIR, "SOUL.md");
      const soulContent = `# Soul\n\n${twin.name ? `My name is ${twin.name}.\n\n` : ""}${personality}\n`;
      fs.writeFileSync(soulPath, soulContent, "utf8");
      console.log("[pullTwinData] wrote SOUL.md");

      const identityPath = path.join(WORKSPACE_DIR, "IDENTITY.md");
      const twinType = twin.type === "COMPANION" ? "AI companion" : "AI twin";
      const identityLines = [
        "# Identity",
        "",
        `**Name:** ${twin.name || "unnamed"}`,
        `**Creature:** ${twinType} from Amiko platform`,
        `**Vibe:** Defined in SOUL.md`,
      ];
      if (twin.avatar_url) {
        identityLines.push(`**Avatar:** ${twin.avatar_url}`);
      }
      identityLines.push("");
      fs.writeFileSync(identityPath, identityLines.join("\n"), "utf8");
      console.log("[pullTwinData] wrote IDENTITY.md");

      const bootstrapPath = path.join(WORKSPACE_DIR, "BOOTSTRAP.md");
      if (fs.existsSync(bootstrapPath)) {
        fs.unlinkSync(bootstrapPath);
        console.log("[pullTwinData] deleted BOOTSTRAP.md");
      }
    }

    // Inject AMIKO.md reference into BOOTSTRAP.md or AGENTS.md
    const bootstrapPath = path.join(WORKSPACE_DIR, "BOOTSTRAP.md");
    const agentsPath = path.join(WORKSPACE_DIR, "AGENTS.md");
    
    let targetFile = null;
    if (fs.existsSync(bootstrapPath)) {
      targetFile = bootstrapPath;
    } else if (fs.existsSync(agentsPath)) {
      targetFile = agentsPath;
    }

    if (targetFile) {
      try {
        let content = fs.readFileSync(targetFile, "utf8");
        
        let injectionText = "\n## First: Read Your Amiko Identity\n\n**Read AMIKO.md to get information about yourself** — this contains your identity from the Amiko platform, including your type (Twin or Companion), personality, voice, and user information.\n";
        
        if (targetFile === bootstrapPath) {
          injectionText += "\nYou can use those information to do the bootstrap task directly if user confirm.\n";
        } else {
          injectionText += "\nUpdate your identity/soul/memory if anything changed.\n";
        }
        
        // Add SYS.md reference
        injectionText += "\n## System Persistence\n\n**Read SYS.md for system persistence rules** — this container resets on every rebuild. Only `/data` persists. When installing tools, packages, or modifying configs, follow the persistence guide in SYS.md to ensure they survive restarts.\n\n- Use `/data/sys/` for persistent installations\n- Update `/data/sys/MANIFEST.md` to log changes\n- Add restore commands to `/data/sys/restore.sh`\n";
        
        if (!content.includes("Read AMIKO.md to get information about yourself")) {
          const lines = content.split("\n");
          let injectIndex = -1;
          
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("## ") && !lines[i].includes("First:") && !lines[i].includes("System Persistence")) {
              injectIndex = i;
              break;
            }
          }
          
          if (injectIndex > 0) {
            lines.splice(injectIndex, 0, injectionText);
            content = lines.join("\n");
          } else {
            content = content.trimEnd() + injectionText + "\n";
          }
          
          fs.writeFileSync(targetFile, content, "utf8");
          console.log("[pullTwinData] injected AMIKO.md and SYS.md references into", path.basename(targetFile));
        }
      } catch (err) {
        console.warn("[pullTwinData] failed to inject into bootstrap:", err);
      }
    }

    return { ok: true, path: outPath, output: `Saved twin data to: ${outPath}` };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Load the docs manifest file that tracks synced documents
 * @returns {{ docs: Record<string, { updated_at: string, filename: string }> }}
 */
function loadDocsManifest(docsDir) {
  const manifestPath = path.join(docsDir, ".manifest.json");
  try {
    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, "utf8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("[pullDocs] failed to load manifest:", err);
  }
  return { docs: {} };
}

/**
 * Save the docs manifest file
 */
function saveDocsManifest(docsDir, manifest) {
  const manifestPath = path.join(docsDir, ".manifest.json");
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  } catch (err) {
    console.warn("[pullDocs] failed to save manifest:", err);
  }
}

// Batch size for fetching docs from API
const DOCS_BATCH_SIZE = 50;

/**
 * Pull ALL documents from Amiko platform and save to amiko-docs/
 * Automatically handles pagination to fetch all docs in batches.
 * Supports incremental sync - only writes files that are new or updated.
 * @returns {{ ok: boolean, count?: number, total?: number, created?: number, updated?: number, skipped?: number, docs?: Array, docsDir?: string, error?: string, output?: string }}
 */
export async function pullDocs(handlers) {
  const { WORKSPACE_DIR, AMIKO_TWIN_ID, AMIKO_USER_TOKEN } = handlers;
  const fileCfg = readAmikoConfig(WORKSPACE_DIR);

  const twinId = String(fileCfg.twinId || AMIKO_TWIN_ID || "").trim();
  if (!twinId) {
    return { ok: false, error: "Missing twinId" };
  }

  const userToken = String(fileCfg.userToken || AMIKO_USER_TOKEN || "").trim();
  if (!userToken) {
    return { ok: false, error: "Missing user token" };
  }

  try {
    // Create amiko-docs folder
    const docsDir = path.join(WORKSPACE_DIR, "amiko-docs");
    fs.mkdirSync(docsDir, { recursive: true });

    // Load existing manifest to check for changes
    const manifest = loadDocsManifest(docsDir);
    const existingDocs = manifest.docs || {};

    // Track stats
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const allDocs = [];

    // Fetch all docs in batches
    let offset = 0;
    let total = 0;
    let batchNum = 0;

    while (true) {
      batchNum++;
      const docsUrl = `${PLATFORM_BASE_URL}/api/agents/${twinId}/docs?limit=${DOCS_BATCH_SIZE}&offset=${offset}`;
      console.log("[pullDocs] fetching batch", { batch: batchNum, offset, limit: DOCS_BATCH_SIZE });

      const response = await fetch(docsUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        return { ok: false, error: `HTTP ${response.status}: ${errText}` };
      }

      const data = await response.json();
      const docs = data.docs || [];
      total = data.pagination?.total || total || docs.length;

      if (docs.length === 0) {
        // No more docs
        break;
      }

      // Process each doc in this batch
      for (const doc of docs) {
        const docId = doc.id;
        const docPath = path.join(docsDir, `${docId}.md`);
        const docUpdatedAt = doc.updated_at || doc.created_at || "";

        // Check if we need to write this doc
        const existingEntry = existingDocs[docId];
        const fileExists = fs.existsSync(docPath);

        let needsWrite = false;
        let action = "skipped";

        if (!fileExists) {
          // File doesn't exist, need to create
          needsWrite = true;
          action = "created";
        } else if (!existingEntry) {
          // File exists but no manifest entry (legacy), update it
          needsWrite = true;
          action = "updated";
        } else if (existingEntry.updated_at !== docUpdatedAt) {
          // File exists but updated_at changed, need to update
          needsWrite = true;
          action = "updated";
        }

        if (needsWrite) {
          // Use template to render doc markdown
          const markdown = renderDocMd(doc);
          fs.writeFileSync(docPath, markdown, "utf8");

          // Update manifest entry
          manifest.docs[docId] = {
            updated_at: docUpdatedAt,
            filename: doc.filename || "",
          };

          if (action === "created") {
            created++;
            console.log("[pullDocs] created doc", { id: docId, filename: doc.filename });
          } else {
            updated++;
            console.log("[pullDocs] updated doc", { id: docId, filename: doc.filename });
          }
        } else {
          skipped++;
          console.log("[pullDocs] skipped doc (unchanged)", { id: docId, filename: doc.filename });
        }

        allDocs.push({
          id: docId,
          filename: doc.filename,
          path: docPath,
          action,
        });
      }

      // Move to next batch
      offset += docs.length;

      // Check if we've fetched all docs
      if (offset >= total || docs.length < DOCS_BATCH_SIZE) {
        break;
      }
    }

    // Save updated manifest
    saveDocsManifest(docsDir, manifest);

    // Update AMIKO.md docs section using template (re-render with docs)
    const amikoMdPath = path.join(WORKSPACE_DIR, "AMIKO.md");
    if (fs.existsSync(amikoMdPath) && allDocs.length > 0) {
      try {
        // Re-read current AMIKO.md and extract twin/user data
        // For now, we'll just append the docs section
        let amikoContent = fs.readFileSync(amikoMdPath, "utf8");

        // Build new docs section
        const docsSection = [
          "",
          "---",
          "",
          "## Your Documents",
          "",
          `You have ${allDocs.length} document(s) from Amiko platform stored in the \`amiko-docs\` folder:`,
          "",
        ];

        for (const doc of allDocs) {
          docsSection.push(`- **${doc.filename}** (\`amiko-docs/${doc.id}.md\`)`);
        }

        docsSection.push("");

        // Remove existing docs section if present
        const docsSectionMarker = "## Your Documents";
        const docsSectionIndex = amikoContent.indexOf(docsSectionMarker);

        if (docsSectionIndex !== -1) {
          // Find the separator before the docs section
          const separatorBefore = amikoContent.lastIndexOf("---", docsSectionIndex);
          if (separatorBefore !== -1) {
            // Remove from separator to end
            amikoContent = amikoContent.substring(0, separatorBefore).trimEnd();
          }
        }

        // Append new docs section
        amikoContent = amikoContent.trimEnd() + "\n" + docsSection.join("\n");
        fs.writeFileSync(amikoMdPath, amikoContent, "utf8");
        console.log("[pullDocs] updated docs section in AMIKO.md");
      } catch (err) {
        console.warn("[pullDocs] failed to update AMIKO.md:", err);
      }
    }

    // Build output message
    const parts = [];
    if (created > 0) parts.push(`${created} created`);
    if (updated > 0) parts.push(`${updated} updated`);
    if (skipped > 0) parts.push(`${skipped} unchanged`);
    const summary = parts.length > 0 ? parts.join(", ") : "no changes";

    return {
      ok: true,
      count: allDocs.length,
      total,
      created,
      updated,
      skipped,
      docs: allDocs,
      docsDir,
      output: `Synced ${allDocs.length} docs (${summary})`,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Sync all Amiko data (twin + docs) - used by init.js
 * @returns {string} Output log
 */
export async function syncAmikoData(handlers) {
  const { WORKSPACE_DIR, AMIKO_TWIN_ID, AMIKO_USER_TOKEN } = handlers;
  const fileCfg = readAmikoConfig(WORKSPACE_DIR);
  
  let output = "";
  
  const twinId = String(fileCfg.twinId || AMIKO_TWIN_ID || "").trim();
  const userToken = String(fileCfg.userToken || AMIKO_USER_TOKEN || "").trim();

  if (!twinId || !userToken) {
    output += "[amiko] WARNING: AMIKO_TWIN_ID / AMIKO_USER_TOKEN not set in config or env, skipping Amiko sync\n";
    return output;
  }

  // Pull twin data
  const pullResult = await pullTwinData(handlers);
  if (pullResult.ok) {
    output += `[amiko/pull] ${pullResult.output}\n`;
  } else {
    output += `[amiko/pull] Error: ${pullResult.error}\n`;
  }

  // Pull documents
  const docsResult = await pullDocs(handlers);
  if (docsResult.ok) {
    output += `[amiko/docs] ${docsResult.output}\n`;
  } else {
    output += `[amiko/docs] Error: ${docsResult.error}\n`;
  }

  return output;
}

/**
 * Pull memories from Amiko platform and save to MEMORIES.md
 * This is optional because the data quality of twin_memories may vary
 * @returns {{ ok: boolean, path?: string, count?: number, error?: string, output?: string }}
 */
export async function pullMemories(handlers) {
  const { WORKSPACE_DIR, AMIKO_TWIN_ID, AMIKO_USER_TOKEN } = handlers;
  const fileCfg = readAmikoConfig(WORKSPACE_DIR);
  
  const twinId = String(fileCfg.twinId || AMIKO_TWIN_ID || "").trim();
  if (!twinId) {
    return { ok: false, error: "Missing twinId" };
  }

  const userToken = String(fileCfg.userToken || AMIKO_USER_TOKEN || "").trim();
  if (!userToken) {
    return { ok: false, error: "Missing user token" };
  }

  try {
    // Fetch all memories with pagination
    const allMemories = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `${PLATFORM_BASE_URL}/api/agents/${encodeURIComponent(twinId)}/memories?limit=${limit}&offset=${offset}`;
      console.log("[pullMemories] fetching memories", { twinId, offset, limit });

      const response = await fetch(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${userToken}`,
          accept: "application/json",
        },
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        return { ok: false, error: `HTTP ${response.status}: ${errText}` };
      }

      const data = await response.json();
      const memories = data.memories || [];
      allMemories.push(...memories);

      // Check if there are more pages
      const total = data.pagination?.total || 0;
      offset += limit;
      hasMore = offset < total;
    }

    console.log("[pullMemories] fetched", allMemories.length, "memories");

    // Generate markdown using template
    const markdown = renderMemoriesMd(allMemories, twinId);

    // Write to amiko-memories.md in workspace (avoid conflict with Clawd's own data)
    const destPath = path.join(WORKSPACE_DIR, "amiko-memories.md");
    fs.writeFileSync(destPath, markdown, "utf8");
    console.log("[pullMemories] wrote", destPath);

    return { 
      ok: true, 
      path: destPath, 
      count: allMemories.length,
      output: `Synced ${allMemories.length} memories to amiko-memories.md`
    };
  } catch (err) {
    console.error("[pullMemories] error:", err);
    return { ok: false, error: String(err) };
  }
}

// ============================================================
// ROUTER - Uses shared functions
// ============================================================

export function createTwinRouter(handlers) {
  const { requireApiToken } = handlers;
  const router = express.Router();

  router.post("/amiko/pull", requireApiToken, async (req, res) => {
    try {
      const result = await pullTwinData(handlers);
      if (result.ok) {
        return res.json({ ok: true, path: result.path });
      } else {
        return res.status(400).json({ ok: false, error: result.error });
      }
    } catch (err) {
      console.error("[/setup/api/amiko/pull] error:", err);
      return res.status(500).json({ ok: false, error: `Internal error: ${String(err)}` });
    }
  });

  router.post("/amiko/docs", requireApiToken, async (_req, res) => {
    try {
      const result = await pullDocs(handlers);
      if (result.ok) {
        return res.json({
          ok: true,
          count: result.count,
          total: result.total,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          docs: result.docs,
          docsDir: result.docsDir,
        });
      } else {
        return res.status(400).json({ ok: false, error: result.error });
      }
    } catch (err) {
      console.error("[/setup/api/amiko/docs] error:", err);
      return res.status(500).json({ ok: false, error: `Internal error: ${String(err)}` });
    }
  });

  /**
   * POST /setup/api/amiko/memories
   * Pull memories from Amiko platform and save to MEMORIES.md
   * This is optional - only call when you want to sync memories
   */
  router.post("/amiko/memories", requireApiToken, async (_req, res) => {
    try {
      const result = await pullMemories(handlers);
      if (result.ok) {
        return res.json({
          ok: true,
          count: result.count,
          path: result.path,
        });
      } else {
        return res.status(400).json({ ok: false, error: result.error });
      }
    } catch (err) {
      console.error("[/setup/api/amiko/memories] error:", err);
      return res.status(500).json({ ok: false, error: `Internal error: ${String(err)}` });
    }
  });

  /**
   * POST /setup/api/amiko/write
   * Write .amiko.json for a single agent's workspace.
   * Body: { agentId: string, amikoUserId?: string, amikoTwinId?: string, amikoUserToken?: string }
   * agentId = "main" for main workspace, or the OpenClaw agent id (e.g. workspace-<id>).
   */
  router.post("/amiko/write", requireApiToken, async (req, res) => {
    try {
      const { WORKSPACE_DIR } = handlers;
      const body = req.body || {};
      const agentId = String(body.agentId ?? "").trim() || "main";
      const amikoUserId = String(body.amikoUserId ?? "").trim();
      const amikoTwinId = String(body.amikoTwinId ?? "").trim();
      const amikoUserToken = String(body.amikoUserToken ?? "").trim();

      if (!amikoUserId && !amikoTwinId && !amikoUserToken) {
        return res.status(400).json({
          ok: false,
          error: "At least one of amikoUserId, amikoTwinId, amikoUserToken is required",
        });
      }

      const workspaceDir =
        agentId === "main" ? WORKSPACE_DIR : `${WORKSPACE_DIR}-${agentId}`;
      const cfgPath = path.join(workspaceDir, ".amiko.json");

      fs.mkdirSync(workspaceDir, { recursive: true });
      let existing = {};
      if (fs.existsSync(cfgPath)) {
        try {
          existing = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
        } catch {
          existing = {};
        }
      }
      const next = {
        ...existing,
        AMIKO_USER_ID: amikoUserId || existing.AMIKO_USER_ID || "",
        AMIKO_TWIN_ID: amikoTwinId || existing.AMIKO_TWIN_ID || "",
        AMIKO_USER_TOKEN: amikoUserToken || existing.AMIKO_USER_TOKEN || "",
      };
      fs.writeFileSync(cfgPath, JSON.stringify(next, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      });

      return res.json({
        ok: true,
        message: `Wrote .amiko.json for agent ${agentId}`,
        agentId,
        path: cfgPath,
      });
    } catch (err) {
      console.error("[/setup/api/amiko/write] error:", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
