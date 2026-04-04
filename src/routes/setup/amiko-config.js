import fs from "node:fs";
import path from "node:path";
import { renderBootstrapMd } from "../../templates/render.js";

const MAIN_WORKSPACE = "/data/.openclaw/workspace";
const DEFAULT_AMIKO_PLATFORM_URL = "https://platform.heyamiko.com";
const DEFAULT_AMIKO_CHAT_URL = "https://amiko-chat.up.railway.app";

function resolveDefaultAmikoChatUrl(platformUrl = "") {
  const configured =
    process.env.AMIKO_CHAT_URL?.trim() ||
    process.env.WS_HTTP_API_URL?.trim() ||
    "";
  if (configured) return configured;
  return platformUrl === DEFAULT_AMIKO_PLATFORM_URL ? DEFAULT_AMIKO_CHAT_URL : "";
}

/**
 * Resolve workspace directory for a given agentId.
 */
export function resolveWorkspaceForAgent(_handlers, agentId = "main") {
  const safeId = (agentId && String(agentId).trim()) || "main";
  return safeId === "main" ? MAIN_WORKSPACE : `/data/.openclaw/workspace-${safeId}`;
}

/**
 * Install BOOTSTRAP.md into an agent's workspace.
 * Only writes if the file does not already exist (preserves in-progress bootstraps).
 *
 * @param {{ workspaceDir: string, userName?: string, twinName?: string }} opts
 * @returns {{ ok: boolean, written: boolean, path: string, error?: string }}
 */
export function installBootstrapMd({ workspaceDir, userName, twinName }) {
  const destPath = path.join(workspaceDir, "BOOTSTRAP.md");
  try {
    // Ensure workspace dir exists
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }

    const content = renderBootstrapMd({
      user: userName || "there",
      twin_name: twinName || "your Amiko",
    });
    fs.writeFileSync(destPath, content, "utf8");
    console.log("[bootstrap] Installed BOOTSTRAP.md to:", destPath);
    return { ok: true, written: true, path: destPath };
  } catch (err) {
    console.error("[bootstrap] Failed to install BOOTSTRAP.md:", err);
    return { ok: false, written: false, path: destPath, error: String(err) };
  }
}

/**
 * Detect agentId from a workspace path.
 * "/data/.openclaw/workspace" → "main"
 * "/data/.openclaw/workspace-foo" → "foo"
 */
function detectAgentIdFromWorkspace(workspaceDir) {
  const match = workspaceDir.match(/workspace-([^/\\]+)$/);
  return match ? match[1] : "main";
}

/**
 * Write Amiko config (.amiko.json), mcporter.json, and channel config to openclaw.json.
 *
 * This is the single entry point — all callers (init, amiko/write, add-agent)
 * get .amiko.json + mcporter + channel config written in one call.
 */
export async function writeAmikoConfigAndMcporter(params) {
  const {
    handlers,
    workspaceDir,
    amikoUserId = "",
    amikoTwinId = "",
    amikoTwinToken = "",
    amikoPlatformUrl,
    amikoChatUrl,
  } = params || {};

  try {
    if (!workspaceDir || typeof workspaceDir !== "string") {
      return { ok: false, error: "workspaceDir is required" };
    }

    fs.mkdirSync(workspaceDir, { recursive: true });

    const outputs = [];

    // ── 1. Write .amiko.json ──────────────────────────────────────────────────
    const cfgPath = path.join(workspaceDir, ".amiko.json");
    let current = {};
    if (fs.existsSync(cfgPath)) {
      try {
        current = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      } catch {
        current = {};
      }
    }

    const resolvedPlatformUrl =
      (amikoPlatformUrl && String(amikoPlatformUrl).trim()) ||
      (current.amikoPlatformUrl ? String(current.amikoPlatformUrl).trim() : "") ||
      (current.AMIKO_PLATFORM_URL ? String(current.AMIKO_PLATFORM_URL).trim() : "") ||
      process.env.AMIKO_PLATFORM_URL?.trim() ||
      DEFAULT_AMIKO_PLATFORM_URL;
    const resolvedChatUrl =
      (amikoChatUrl && String(amikoChatUrl).trim()) ||
      (current.amikoChatUrl ? String(current.amikoChatUrl).trim() : "") ||
      (current.AMIKO_CHAT_URL ? String(current.AMIKO_CHAT_URL).trim() : "") ||
      resolveDefaultAmikoChatUrl(resolvedPlatformUrl);

    const next = {
      AMIKO_USER_ID: amikoUserId || current.AMIKO_USER_ID || "",
      AMIKO_TWIN_ID: amikoTwinId || current.AMIKO_TWIN_ID || "",
      AMIKO_TWIN_TOKEN: amikoTwinToken || current.AMIKO_TWIN_TOKEN || current.AMIKO_USER_TOKEN || "",
      AMIKO_PLATFORM_URL: resolvedPlatformUrl || current.AMIKO_PLATFORM_URL || "",
      AMIKO_CHAT_URL: resolvedChatUrl || current.AMIKO_CHAT_URL || "",
    };

    fs.writeFileSync(cfgPath, JSON.stringify(next, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });

    // ── 2. Write config/mcporter.json ─────────────────────────────────────────
    const configDir = path.join(workspaceDir, "config");
    const mcporterConfigPath = path.join(configDir, "mcporter.json");
    fs.mkdirSync(configDir, { recursive: true });

    let mcporterConfig = { mcpServers: {} };
    if (fs.existsSync(mcporterConfigPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(mcporterConfigPath, "utf8"));
        if (parsed && typeof parsed === "object") {
          mcporterConfig = parsed;
        }
      } catch {
        // overwrite with minimal config
      }
    }
    if (!mcporterConfig.mcpServers || typeof mcporterConfig.mcpServers !== "object") {
      mcporterConfig.mcpServers = {};
    }

    const platformUrlNormalized = (resolvedPlatformUrl || "").replace(/\/+$/, "");

    // Genui MCP server (stdio, no auth needed)
    const genuiServerPath = path.join(path.dirname(workspaceDir), "skills", "genui", "server.mjs");
    if (fs.existsSync(genuiServerPath)) {
      mcporterConfig.mcpServers.genui = {
        command: "node",
        args: [genuiServerPath],
      };
    }

    if (amikoTwinId && amikoTwinToken && platformUrlNormalized) {
      mcporterConfig.mcpServers.composio = {
        url: `${platformUrlNormalized}/api/agents/${amikoTwinId}/mcp`,
        headers: { Authorization: `Bearer ${amikoTwinToken}` },
      };
      fs.writeFileSync(mcporterConfigPath, JSON.stringify(mcporterConfig, null, 2), "utf8");
      outputs.push(`Saved Amiko config to ${cfgPath} and mcporter config to ${mcporterConfigPath}`);
    } else {
      outputs.push(`Saved Amiko config to ${cfgPath} (mcporter composio entry skipped: missing twinId/token or platform URL)`);
    }

    // Even without composio credentials, write mcporter config if genui was added
    if (mcporterConfig.mcpServers.genui) {
      fs.writeFileSync(mcporterConfigPath, JSON.stringify(mcporterConfig, null, 2), "utf8");
    }

    // ── 3. Write channels.amiko config to openclaw.json ───────────────────────
    if (amikoTwinId && amikoTwinToken) {
      const agentId = detectAgentIdFromWorkspace(workspaceDir);
      const channelResult = await writeAmikoChannelConfig({
        handlers,
        agentId,
        amikoTwinId,
        amikoTwinToken,
        amikoPlatformUrl: resolvedPlatformUrl,
        amikoChatUrl: resolvedChatUrl,
      });
      if (channelResult.ok) {
        outputs.push(channelResult.output);
      } else {
        outputs.push(`[channel] WARNING: ${channelResult.error}`);
      }
    }

    return { ok: true, output: outputs.join("\n") };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Write amiko channel config into openclaw.json so the amiko plugin
 * can authenticate with the Amiko platform.
 *
 * Directly reads/writes openclaw.json instead of going through the CLI
 * to avoid parsing issues that could cause one agent's config to overwrite another's.
 */
async function writeAmikoChannelConfig(params) {
  const {
    handlers,
    agentId = "main",
    amikoTwinId = "",
    amikoTwinToken = "",
    amikoPlatformUrl,
    amikoChatUrl,
  } = params || {};

  if (!amikoTwinId || !amikoTwinToken) {
    return { ok: false, error: "amikoTwinId and amikoTwinToken are required" };
  }

  if (!handlers) {
    return { ok: false, error: "handlers is required for config path resolution" };
  }

  try {
    const platformUrl = (amikoPlatformUrl || process.env.AMIKO_PLATFORM_URL || DEFAULT_AMIKO_PLATFORM_URL).replace(/\/+$/, "");
    const chatUrl = (
      amikoChatUrl ||
      resolveDefaultAmikoChatUrl(platformUrl)
    ).replace(/\/+$/, "");

    const accountConfig = {
      twinId: amikoTwinId,
      token: amikoTwinToken,
      platformApiBaseUrl: platformUrl,
      chatApiBaseUrl: chatUrl || platformUrl,
    };

    // Directly read/write openclaw.json to safely merge accounts
    const cfgPath = handlers.configPath ? handlers.configPath() : path.join("/data/.openclaw", "openclaw.json");
    if (!fs.existsSync(cfgPath)) {
      return { ok: false, error: `openclaw.json not found at ${cfgPath}` };
    }

    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    if (!cfg.channels) cfg.channels = {};
    if (!cfg.channels.amiko) cfg.channels.amiko = {};
    if (!cfg.channels.amiko.accounts || typeof cfg.channels.amiko.accounts !== "object") {
      cfg.channels.amiko.accounts = {};
    }

    // Merge: add/update this agent's account, preserving all others
    cfg.channels.amiko.accounts[agentId] = accountConfig;

    // Set defaultAccount if not already set
    if (!cfg.channels.amiko.defaultAccount) {
      cfg.channels.amiko.defaultAccount = agentId;
    }

    // Ensure top-level bindings array has a route for this agent
    if (!Array.isArray(cfg.bindings)) cfg.bindings = [];
    const channelBinding = `amiko:${agentId}`;
    const hasBinding = cfg.bindings.some(
      (b) => b.type === "route" && b.agentId === agentId &&
        b.match?.channel === "amiko" && b.match?.accountId === agentId,
    );
    if (!hasBinding) {
      cfg.bindings.push({
        type: "route",
        agentId,
        match: { channel: "amiko", accountId: agentId },
      });
    }

    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");

    return {
      ok: true,
      output: `Wrote amiko channel config for agent ${agentId} (twin ${amikoTwinId}) — accounts preserved: [${Object.keys(cfg.channels.amiko.accounts).join(", ")}]`,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
