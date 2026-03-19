import fs from "node:fs";
import path from "node:path";

const MAIN_WORKSPACE = "/data/.openclaw/workspace";
const STATE_DIR = "/data/.openclaw";

function ensureAgentChannelBinding(config, agentId, channelBinding) {
  if (!config.agents || typeof config.agents !== "object") {
    config.agents = {};
  }
  if (!config.agents.entries || typeof config.agents.entries !== "object") {
    config.agents.entries = {};
  }

  const currentEntry = config.agents.entries[agentId];
  const entry =
    currentEntry && typeof currentEntry === "object" && !Array.isArray(currentEntry)
      ? currentEntry
      : {};

  const currentRouting = entry.routing;
  const routing =
    currentRouting && typeof currentRouting === "object" && !Array.isArray(currentRouting)
      ? currentRouting
      : {};

  const existingBindings = Array.isArray(routing.bindings)
    ? routing.bindings.map((value) => String(value).trim()).filter(Boolean)
    : [];

  if (!existingBindings.includes(channelBinding)) {
    existingBindings.push(channelBinding);
  }

  routing.bindings = existingBindings;
  entry.routing = routing;
  config.agents.entries[agentId] = entry;
}

/**
 * Resolve workspace directory for a given agentId.
 */
export function resolveWorkspaceForAgent(_handlers, agentId = "main") {
  const safeId = (agentId && String(agentId).trim()) || "main";
  return safeId === "main" ? MAIN_WORKSPACE : `/data/.openclaw/workspace-${safeId}`;
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
export function writeAmikoConfigAndMcporter(params) {
  const {
    workspaceDir,
    amikoUserId = "",
    amikoTwinId = "",
    amikoTwinToken = "",
    amikoPlatformUrl,
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
      "https://platform.heyamiko.com";

    const next = {
      AMIKO_USER_ID: amikoUserId || current.AMIKO_USER_ID || "",
      AMIKO_TWIN_ID: amikoTwinId || current.AMIKO_TWIN_ID || "",
      AMIKO_TWIN_TOKEN: amikoTwinToken || current.AMIKO_TWIN_TOKEN || current.AMIKO_USER_TOKEN || "",
      AMIKO_PLATFORM_URL: resolvedPlatformUrl || current.AMIKO_PLATFORM_URL || "",
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

    // ── 3. Write channels.amiko config to openclaw.json ───────────────────────
    if (amikoTwinId && amikoTwinToken) {
      const agentId = detectAgentIdFromWorkspace(workspaceDir);
      const channelResult = writeAmikoChannelConfig({
        agentId,
        amikoTwinId,
        amikoTwinToken,
        amikoPlatformUrl: resolvedPlatformUrl,
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
 */
function writeAmikoChannelConfig(params) {
  const {
    agentId = "main",
    amikoTwinId = "",
    amikoTwinToken = "",
    amikoPlatformUrl,
    amikoChatUrl,
  } = params || {};

  if (!amikoTwinId || !amikoTwinToken) {
    return { ok: false, error: "amikoTwinId and amikoTwinToken are required" };
  }

  const configPath = path.join(STATE_DIR, "openclaw.json");
  if (!fs.existsSync(configPath)) {
    return { ok: false, error: `openclaw.json not found at ${configPath}` };
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const cleaned = raw
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,(\s*[}\]])/g, "$1");
    const config = JSON.parse(cleaned);

    if (!config.channels) config.channels = {};
    if (!config.channels.amiko) config.channels.amiko = {};
    if (!config.channels.amiko.accounts) config.channels.amiko.accounts = {};
    if (!config.channels.amiko.defaultAccount) {
      config.channels.amiko.defaultAccount = agentId;
    }

    const platformUrl = (amikoPlatformUrl || process.env.AMIKO_PLATFORM_URL || "https://platform.heyamiko.com").replace(/\/+$/, "");
    const chatUrl = (amikoChatUrl || process.env.AMIKO_CHAT_URL || platformUrl).replace(/\/+$/, "");
    const channelBinding = `amiko:${agentId}`;

    config.channels.amiko.accounts[agentId] = {
      twinId: amikoTwinId,
      token: amikoTwinToken,
      platformApiBaseUrl: platformUrl,
      chatApiBaseUrl: chatUrl,
    };

    ensureAgentChannelBinding(config, agentId, channelBinding);

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    console.log(`[writeAmikoChannelConfig] wrote channels.amiko.accounts.${agentId} to ${configPath}`);

    return {
      ok: true,
      output: `Wrote amiko channel config for agent ${agentId} (twin ${amikoTwinId}) to ${configPath} and ensured routing binding ${channelBinding}`,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
