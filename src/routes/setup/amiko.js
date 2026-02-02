import express from "express";
import fs from "node:fs";
import path from "node:path";

const PLATFORM_BASE_URL = "https://platform.heyamiko.com";
//const PLATFORM_BASE_URL = "http://host.docker.internal:3001";

function renderJsonBlock(label, value) {
  if (value === undefined || value === null) return "";
  const json = JSON.stringify(value, null, 2);
  return `## ${label}\n\n\`\`\`json\n${json}\n\`\`\`\n`;
}

function formatTwinMarkdown(twin, user) {
  const lines = [];
  lines.push("You are an AI agent from Amiko platform, here is your information from Amiko:");
  lines.push("");
  lines.push("Amiko platform is a AI Agent identity and social platform. It creates digital identities based on how users actually live, think, and connect — trained on behavior, not just data.");
  lines.push("");
  lines.push("There are 2 types of Amiko:");
  lines.push("- **Twin**: Replicates user behavior, personality, voice, style, and decision-making. Twins can contribute to user real work — writing, reviewing, filtering, organizing, reflecting.");
  lines.push("- **Companion**: Relationship-driven digital identities that can be friends, rivals, romantic leads, mentors, or co-conspirators. Companions can brainstorm, spot patterns, specialize in skills, help user get unstuck — or just listen.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("# Amiko");
  lines.push("");

  if (twin?.name) {
    lines.push("**Name:**");
    lines.push("");
    lines.push(twin.name);
    lines.push("");
  }

  if (twin?.description) {
    lines.push("**Description:**");
    lines.push("");
    lines.push(twin.description);
    lines.push("");
  }

  lines.push("## Summary");
  lines.push("");
  lines.push(`- ID: ${twin?.id || ""}`);
  lines.push(`- User ID: ${twin?.user_id || ""}`);
  lines.push(`- Type: ${twin?.type || ""}`);
  lines.push(`- Public: ${twin?.is_public ? "yes" : "no"}`);
  lines.push(`- Shipped: ${twin?.is_shipped ? "yes" : "no"}`);
  lines.push(`- Shipped At: ${twin?.shipped_at || ""}`);
  lines.push(`- Created At: ${twin?.created_at || ""}`);
  lines.push(`- Updated At: ${twin?.updated_at || ""}`);
  lines.push("");

  lines.push("## Media");
  lines.push("");
  lines.push(`- Original Photo URL: ${twin?.original_photo_url || ""}`);
  lines.push(`- Avatar URL: ${twin?.avatar_url || ""}`);
  lines.push("");

  lines.push("## Voice");
  lines.push("");
  lines.push(`- Voice ID: ${twin?.voice_id || ""}`);
  lines.push(`- Voice Description: ${twin?.voice_description || ""}`);
  lines.push(`- Voice Status: ${twin?.voice_status || ""}`);
  lines.push("");
  lines.push("> **Note:** This Voice ID is an ElevenLabs voice ID. Check the `amiko-skill` for tools on how to use it to generate voice.");
  lines.push("");

  const sections = [
    ["Metadata", twin?.metadata],
    ["Basic Info", twin?.basic_info],
    ["Preferences", twin?.preferences],
    ["Personality", twin?.personality],
    ["Personality Source", twin?.personality_source],
  ];

  for (const [label, value] of sections) {
    const block = renderJsonBlock(label, value);
    if (block) {
      lines.push(block.trimEnd());
      lines.push("");
    }
  }

  if (user) {
    lines.push("# Your User");
    lines.push("");
    lines.push("## Profile");
    lines.push("");
    lines.push(`- ID: ${user?.id || ""}`);
    lines.push(`- Name: ${user?.name || ""}`);
    lines.push(`- Email: ${user?.email || ""}`);
    lines.push(`- Twitter: ${user?.twitter_handle || ""}`);
    lines.push(`- Profile Image: ${user?.profile_image || ""}`);
    lines.push("");
    lines.push("## Account Details");
    lines.push("");
    lines.push(`- Tier: ${user?.tier || ""}`);
    lines.push(`- Created At: ${user?.created_at || ""}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function formatDocMarkdown(doc) {
  const lines = [];
  
  lines.push(`# ${doc.title || doc.filename || "Untitled Document"}`);
  lines.push("");
  
  lines.push("## Document Information");
  lines.push("");
  lines.push(`- **ID**: ${doc.id}`);
  lines.push(`- **Filename**: ${doc.filename || "N/A"}`);
  lines.push(`- **Type**: ${doc.doc_type || "N/A"}`);
  lines.push(`- **File Type**: ${doc.file_type || "N/A"}`);
  lines.push(`- **Relationship**: ${doc.relationship || "N/A"}`);
  lines.push(`- **Stance**: ${doc.stance || "N/A"}`);
  lines.push("");
  
  lines.push("## Dates");
  lines.push("");
  lines.push(`- **Created**: ${doc.created_at || "N/A"}`);
  lines.push(`- **Updated**: ${doc.updated_at || "N/A"}`);
  lines.push("");
  
  lines.push("## Processing Status");
  lines.push("");
  lines.push(`- **Parsed**: ${doc.is_parsed ? "Yes" : "No"}`);
  lines.push(`- **Processed**: ${doc.is_processed ? "Yes" : "No"}`);
  lines.push(`- **Chunk Count**: ${doc.chunk_count || 0}`);
  lines.push("");
  
  if (doc.description) {
    lines.push("## Description");
    lines.push("");
    lines.push(doc.description);
    lines.push("");
  }
  
  if (doc.file_url) {
    lines.push("## File");
    lines.push("");
    lines.push(`- **URL**: ${doc.file_url}`);
    if (doc.file_hash) {
      lines.push(`- **Hash**: ${doc.file_hash}`);
    }
    lines.push("");
  }
  
  if (doc.metadata && Object.keys(doc.metadata).length > 0) {
    lines.push("## Metadata");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(doc.metadata, null, 2));
    lines.push("```");
    lines.push("");
  }
  
  if (doc.content) {
    lines.push("## Content");
    lines.push("");
    lines.push(doc.content);
    lines.push("");
  }
  
  return lines.join("\n").trimEnd() + "\n";
}

// ============================================================
// SHARED FUNCTIONS - Used by both routes and syncAmikoData
// ============================================================

/**
 * Pull twin data from Amiko platform and save to AMIKO.MD
 * @returns {{ ok: boolean, path?: string, error?: string, output?: string }}
 */
export async function pullTwinData(handlers) {
  const { WORKSPACE_DIR, AMIKO_TWIN_ID, AMIKO_USER_TOKEN } = handlers;
  
  const twinId = String(AMIKO_TWIN_ID || "").trim();
  if (!twinId) {
    return { ok: false, error: "Missing twinId" };
  }

  const userToken = String(AMIKO_USER_TOKEN || "").trim();
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

    // Write AMIKO.MD
    const markdown = formatTwinMarkdown(twin, user);
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    const outPath = path.join(WORKSPACE_DIR, "AMIKO.MD");
    fs.writeFileSync(outPath, markdown, "utf8");
    console.log("[pullTwinData] saved", { path: outPath });

    // Append to HEARTBEAT.md
    try {
      const heartbeatPath = path.join(WORKSPACE_DIR, "HEARTBEAT.md");
      const timestamp = new Date().toISOString();
      fs.appendFileSync(heartbeatPath, `- [${timestamp}] Amiko data just updated\n`, "utf8");
    } catch (err) {
      console.warn("[pullTwinData] failed to update HEARTBEAT.md:", err);
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
        
        if (!content.includes("Read AMIKO.md to get information about yourself")) {
          const lines = content.split("\n");
          let injectIndex = -1;
          
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("## ") && !lines[i].includes("First:")) {
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
          console.log("[pullTwinData] injected AMIKO.md reference into", path.basename(targetFile));
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
 * Pull documents from Amiko platform and save to amiko-docs/
 * @returns {{ ok: boolean, count?: number, total?: number, docs?: Array, docsDir?: string, error?: string, output?: string }}
 */
export async function pullDocs(handlers, options = {}) {
  const { WORKSPACE_DIR, AMIKO_TWIN_ID, AMIKO_USER_TOKEN } = handlers;
  const { limit = 20, offset = 0 } = options;

  const twinId = String(AMIKO_TWIN_ID || "").trim();
  if (!twinId) {
    return { ok: false, error: "Missing twinId" };
  }

  const userToken = String(AMIKO_USER_TOKEN || "").trim();
  if (!userToken) {
    return { ok: false, error: "Missing user token" };
  }

  try {
    const docsUrl = `${PLATFORM_BASE_URL}/api/agents/${twinId}/docs?limit=${limit}&offset=${offset}`;
    console.log("[pullDocs] fetching docs", { twinId, limit, offset });

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
    const total = data.pagination?.total || docs.length;

    // Create amiko-docs folder
    const docsDir = path.join(WORKSPACE_DIR, "amiko-docs");
    fs.mkdirSync(docsDir, { recursive: true });

    // Save each doc as markdown
    const savedDocs = [];
    for (const doc of docs) {
      const docId = doc.id;
      const docPath = path.join(docsDir, `${docId}.md`);
      const markdown = formatDocMarkdown(doc);
      fs.writeFileSync(docPath, markdown, "utf8");

      savedDocs.push({
        id: docId,
        filename: doc.filename,
        path: docPath,
      });

      console.log("[pullDocs] saved doc", { id: docId, filename: doc.filename });
    }

    // Append reference to amiko-docs in AMIKO.MD
    if (savedDocs.length > 0) {
      const amikoMdPath = path.join(WORKSPACE_DIR, "AMIKO.MD");
      
      if (fs.existsSync(amikoMdPath)) {
        try {
          let amikoContent = fs.readFileSync(amikoMdPath, "utf8");
          
          if (!amikoContent.includes("## Your Documents")) {
            const docsSection = [
              "",
              "---",
              "",
              "## Your Documents",
              "",
              `You have ${savedDocs.length} document(s) from Amiko platform stored in the \`amiko-docs\` folder:`,
              "",
            ];
            
            for (const doc of savedDocs) {
              docsSection.push(`- **${doc.filename}** (\`amiko-docs/${doc.id}.md\`)`);
            }
            
            docsSection.push("");
            
            amikoContent = amikoContent.trimEnd() + "\n" + docsSection.join("\n");
            fs.writeFileSync(amikoMdPath, amikoContent, "utf8");
            console.log("[pullDocs] appended docs section to AMIKO.MD");
          }
        } catch (err) {
          console.warn("[pullDocs] failed to update AMIKO.MD:", err);
        }
      }
    }

    // Append to HEARTBEAT.md
    try {
      const heartbeatPath = path.join(WORKSPACE_DIR, "HEARTBEAT.md");
      const timestamp = new Date().toISOString();
      fs.appendFileSync(heartbeatPath, `- [${timestamp}] Amiko docs just synced into amiko-docs folder\n`, "utf8");
    } catch (err) {
      console.warn("[pullDocs] failed to update HEARTBEAT.md:", err);
    }

    return {
      ok: true,
      count: savedDocs.length,
      total,
      docs: savedDocs,
      docsDir,
      output: `Saved ${savedDocs.length} docs to: ${docsDir}` + (total > savedDocs.length ? ` (total available: ${total})` : ""),
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
  const { AMIKO_TWIN_ID, AMIKO_USER_TOKEN } = handlers;
  
  let output = "";
  
  if (!AMIKO_TWIN_ID || !AMIKO_USER_TOKEN) {
    output += "[amiko] WARNING: AMIKO_TWIN_ID or AMIKO_USER_TOKEN not set, skipping Amiko sync\n";
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

  router.post("/amiko/docs", requireApiToken, async (req, res) => {
    try {
      const options = {
        limit: req.body?.limit || 20,
        offset: req.body?.offset || 0,
      };
      const result = await pullDocs(handlers, options);
      if (result.ok) {
        return res.json({
          ok: true,
          count: result.count,
          total: result.total,
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

  return router;
}
