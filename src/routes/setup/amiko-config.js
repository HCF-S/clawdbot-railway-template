import fs from "node:fs";
import path from "node:path";

const MAIN_WORKSPACE = "/data/.openclaw/workspace";

function parseConfigValue(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function runOpenClaw(handlers, args) {
  const { runCmd, clawArgs, OPENCLAW_NODE } = handlers || {};
  if (typeof runCmd !== "function" || typeof clawArgs !== "function" || !OPENCLAW_NODE) {
    return { ok: false, error: "OpenClaw CLI handlers are required" };
  }

  const result = await runCmd(OPENCLAW_NODE, clawArgs(args));
  if (result.code !== 0) {
    return {
      ok: false,
      error: `openclaw ${args.join(" ")} failed (exit=${result.code})\n${result.output || ""}`.trim(),
    };
  }

  return { ok: true, output: result.output || "" };
}

function isMissingPathError(message) {
  return /not found|missing|undefined|null|does not exist|no value/i.test(String(message || ""));
}

function toBracketPath(basePath, key) {
  return `${basePath}[${JSON.stringify(String(key))}]`;
}

async function getConfigValue(handlers, path) {
  const result = await runOpenClaw(handlers, ["config", "get", path]);
  if (!result.ok) {
    if (isMissingPathError(result.error)) {
      return { ok: true, value: undefined };
    }
    return { ok: false, error: result.error };
  }
  return { ok: true, value: parseConfigValue(result.output) };
}

async function setConfigJson(handlers, path, value) {
  return runOpenClaw(handlers, ["config", "set", "--json", path, JSON.stringify(value)]);
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
export async function writeAmikoConfigAndMcporter(params) {
  const {
    handlers,
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
      const channelResult = await writeAmikoChannelConfig({
        handlers,
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
    return { ok: false, error: "handlers is required to write OpenClaw config via CLI" };
  }

  try {
    const platformUrl = (amikoPlatformUrl || process.env.AMIKO_PLATFORM_URL || "https://platform.heyamiko.com").replace(/\/+$/, "");
    const chatUrl = (amikoChatUrl || process.env.AMIKO_CHAT_URL || platformUrl).replace(/\/+$/, "");
    const channelBinding = `amiko:${agentId}`;
    const accountPath = toBracketPath("channels.amiko.accounts", agentId);
    const accountConfig = {
      twinId: amikoTwinId,
      token: amikoTwinToken,
      platformApiBaseUrl: platformUrl,
      chatApiBaseUrl: chatUrl,
    };
    const accountSet = await setConfigJson(handlers, accountPath, accountConfig);
    if (!accountSet.ok) return accountSet;

    const defaultAccount = await getConfigValue(handlers, "channels.amiko.defaultAccount");
    if (!defaultAccount.ok) return defaultAccount;
    if (!String(defaultAccount.value ?? "").trim()) {
      const defaultSet = await runOpenClaw(handlers, ["config", "set", "channels.amiko.defaultAccount", agentId]);
      if (!defaultSet.ok) return defaultSet;
    }

    const bindingsPath = `${toBracketPath("agents.entries", agentId)}.routing.bindings`;
    const bindingsResult = await getConfigValue(handlers, bindingsPath);
    if (!bindingsResult.ok) return bindingsResult;
    const existingBindings = Array.isArray(bindingsResult.value)
      ? bindingsResult.value.map((value) => String(value).trim()).filter(Boolean)
      : [];
    if (!existingBindings.includes(channelBinding)) {
      existingBindings.push(channelBinding);
      const bindingsSet = await setConfigJson(handlers, bindingsPath, existingBindings);
      if (!bindingsSet.ok) return bindingsSet;
    }

    return {
      ok: true,
      output: `Wrote amiko channel config for agent ${agentId} (twin ${amikoTwinId}) via OpenClaw CLI and ensured routing binding ${channelBinding}`,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
