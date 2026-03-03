import fs from "node:fs";
import path from "node:path";

/**
 * Resolve workspace directory for a given agentId from openclaw.json.
 * Reads config.agents.entries[agentId].workspace, agents.defaults.workspace, or falls back to
 * WORKSPACE_DIR for "main" / agents.defaults.workspace for main, or WORKSPACE_DIR-{agentId} for others.
 *
 * @param {object} handlers - { configPath, WORKSPACE_DIR }
 * @param {string} [agentId] - Agent ID (e.g. "main", or custom). Default "main".
 * @returns {string} Absolute path to the agent's workspace directory
 */
export function resolveWorkspaceForAgent(handlers, agentId = "main") {
  const { WORKSPACE_DIR } = handlers;
  const safeId = (agentId && String(agentId).trim()) || "main";

  try {
    const p = typeof handlers.configPath === "function" ? handlers.configPath() : null;
    if (!p || !fs.existsSync(p)) {
      return safeId === "main" ? WORKSPACE_DIR : `${WORKSPACE_DIR}-${safeId}`;
    }

    const raw = fs.readFileSync(p, "utf8");
    const config = JSON.parse(raw);

    // Per-agent workspace: agents.entries[agentId].workspace
    const entry = config?.agents?.entries?.[safeId];
    if (entry && typeof entry.workspace === "string" && entry.workspace.trim()) {
      return entry.workspace.trim();
    }

    // agents.list: array of { id, workspace }
    const list = config?.agents?.list;
    if (Array.isArray(list)) {
      const found = list.find((a) => (a.id || a.agentId) === safeId);
      if (found && typeof found.workspace === "string" && found.workspace.trim()) {
        return found.workspace.trim();
      }
    }

    // Default workspace for "main" or when no per-agent config
    const defaultsWs = config?.agents?.defaults?.workspace;
    if (typeof defaultsWs === "string" && defaultsWs.trim()) {
      return safeId === "main" ? defaultsWs.trim() : `${WORKSPACE_DIR}-${safeId}`;
    }

    return safeId === "main" ? WORKSPACE_DIR : `${WORKSPACE_DIR}-${safeId}`;
  } catch (err) {
    console.warn("[resolveWorkspaceForAgent] could not read openclaw.json:", err?.message);
    return safeId === "main" ? WORKSPACE_DIR : `${WORKSPACE_DIR}-${safeId}`;
  }
}

/**
 * Write Amiko config (.amiko.json) and mcporter.json for a given workspace.
 *
 * - Merges with any existing .amiko.json (keeps unknown fields)
 * - Persists both legacy uppercase keys (AMIKO_*) and new lowercase keys (amiko*)
 * - Ensures config/mcporter.json has a composio server pointing at Amiko web MCP proxy
 *
 * @param {object} params
 * @param {string} params.workspaceDir - Absolute path to the agent workspace directory
 * @param {string} [params.amikoUserId]
 * @param {string} [params.amikoTwinId]
 * @param {string} [params.amikoTwinToken]
 * @param {string} [params.amikoPlatformUrl] - Optional explicit platform URL (falls back to existing config/env/default)
 * @returns {{ ok: boolean, output?: string, error?: string }}
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

    const cfgPath = path.join(workspaceDir, ".amiko.json");
    let current = {};
    if (fs.existsSync(cfgPath)) {
      try {
        current = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      } catch {
        current = {};
      }
    }

    // Resolve platform URL: prefer explicit arg, then existing config, then env, then default.
    const resolvedPlatformUrl =
      (amikoPlatformUrl && String(amikoPlatformUrl).trim()) ||
      (current.amikoPlatformUrl ? String(current.amikoPlatformUrl).trim() : "") ||
      (current.AMIKO_PLATFORM_URL ? String(current.AMIKO_PLATFORM_URL).trim() : "") ||
      process.env.AMIKO_PLATFORM_URL?.trim() ||
      "https://platform.heyamiko.com";

    const next = {
      ...current,
      // Legacy uppercase keys (env-style)
      AMIKO_USER_ID: amikoUserId || current.AMIKO_USER_ID || "",
      AMIKO_TWIN_ID: amikoTwinId || current.AMIKO_TWIN_ID || "",
      AMIKO_TWIN_TOKEN: amikoTwinToken || current.AMIKO_TWIN_TOKEN || "",
      // Keep AMIKO_USER_TOKEN for backward compatibility (same value as twin token)
      AMIKO_USER_TOKEN: amikoTwinToken || current.AMIKO_USER_TOKEN || "",
      AMIKO_PLATFORM_URL: resolvedPlatformUrl || current.AMIKO_PLATFORM_URL || "",
      // New lowercase keys (script/skill-friendly)
      amikoUserId: amikoUserId || current.amikoUserId || "",
      amikoTwinId: amikoTwinId || current.amikoTwinId || "",
      amikoTwinToken: amikoTwinToken || current.amikoTwinToken || "",
      amikoPlatformUrl: resolvedPlatformUrl || current.amikoPlatformUrl || "",
    };

    fs.writeFileSync(cfgPath, JSON.stringify(next, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });

    // Build or merge mcporter.json with composio server pointing at Amiko web MCP proxy
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
        // ignore parse errors; overwrite with minimal config
      }
    }
    if (!mcporterConfig.mcpServers || typeof mcporterConfig.mcpServers !== "object") {
      mcporterConfig.mcpServers = {};
    }

    const platformUrlNormalized = (resolvedPlatformUrl || "").replace(/\/+$/, "");

    if (amikoTwinId && amikoTwinToken && platformUrlNormalized) {
      const composioUrl = `${platformUrlNormalized}/api/agents/${amikoTwinId}/mcp`;
      mcporterConfig.mcpServers.composio = {
        url: composioUrl,
        headers: {
          Authorization: `Bearer ${amikoTwinToken}`,
        },
      };

      fs.writeFileSync(mcporterConfigPath, JSON.stringify(mcporterConfig, null, 2), "utf8");

      return {
        ok: true,
        output: `Saved Amiko config to ${cfgPath} and mcporter config to ${mcporterConfigPath}`,
      };
    }

    // If we don't have enough info for Composio MCP, still consider .amiko.json write a success.
    return {
      ok: true,
      output: `Saved Amiko config to ${cfgPath} (mcporter composio entry skipped: missing twinId/token or platform URL)`,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

