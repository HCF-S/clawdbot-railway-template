import express from "express";
import fs from "node:fs";
import path from "node:path";

export function createRunRouter(handlers) {
  const { requireApiToken } = handlers;
  const router = express.Router();

  router.post("/onboard", requireApiToken, async (req, res) => {
    try {
      const payload = req.body || {};
      const result = await runOnboarding(payload, handlers);
      return res.status(result.ok ? 200 : 500).json(result);
    } catch (err) {
      console.error("[/setup/api/onboard] error:", err);
      return res.status(500).json({ ok: false, output: `Internal error: ${String(err)}` });
    }
  });

  return router;
}

/**
 * Replace the OpenRouter API key in agents/main/agent/auth-profiles.json.
 * Used when config was created with a dummy key at startup; /init passes the real key.
 * @param {object} handlers - { STATE_DIR, restartGateway }
 * @param {string} realKey - The real OpenRouter API key
 * @returns {{ ok: boolean, output: string }}
 */
export function replaceOpenRouterKeyInAuthProfiles(handlers, realKey) {
  const { STATE_DIR } = handlers;
  const authPath = path.join(STATE_DIR, "agents", "main", "agent", "auth-profiles.json");
  if (!fs.existsSync(authPath)) {
    return { ok: false, output: `auth-profiles.json not found at ${authPath}` };
  }
  const raw = fs.readFileSync(authPath, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, output: `Invalid JSON in auth-profiles.json: ${String(e)}` };
  }
  if (data.profiles && data.profiles["openrouter:default"]) {
    data.profiles["openrouter:default"].key = String(realKey ?? "").trim();
  } else {
    return { ok: false, output: "openrouter:default profile not found in auth-profiles.json" };
  }
  fs.writeFileSync(authPath, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
  return { ok: true, output: "Replaced OpenRouter key in auth-profiles.json" };
}

// Shared onboarding logic that can be reused by init.js
export async function runOnboarding(payload, handlers) {
  const {
    isConfigured,
    ensureGatewayRunning,
    ensureThinkingDefaultConfigured,
    runCmd,
    clawArgs,
    OPENCLAW_NODE,
    buildOnboardArgs,
    OPENCLAW_GATEWAY_TOKEN,
    INTERNAL_GATEWAY_PORT,
    STATE_DIR,
    WORKSPACE_DIR,
    restartGateway,
  } = handlers;

  const DEFAULT_MODEL_BY_AUTH_CHOICE = {
    "codex-cli": "openai-codex/gpt-5.2",
    "openai-codex": "openai-codex/gpt-5.2",
    "openai-api-key": "openai/gpt-5.2",
    "claude-cli": "anthropic/claude-opus-4-5",
    "token": "anthropic/claude-opus-4-5",
    "apiKey": "anthropic/claude-opus-4-5",
    "gemini-api-key": "google/gemini-3-pro-preview",
    "google-antigravity": "google/gemini-3-pro-preview",
    "google-gemini-cli": "google/gemini-3-pro-preview",
    "openrouter-api-key": "openrouter/auto",
    "ai-gateway-api-key": "vercel-ai-gateway/anthropic/claude-opus-4.5",
    "moonshot-api-key": "moonshot/kimi-k2-0905-preview",
    "kimi-code-api-key": "kimi-coding/k2p5",
    "zai-api-key": "zai/glm-4.7",
    "minimax-api": "minimax/MiniMax-M2.1",
    "minimax-api-lightning": "minimax/MiniMax-M2.1-lightning",
    "qwen-portal": "qwen-portal/coder-model",
    "github-copilot": "github-copilot/gpt-4o",
    "copilot-proxy": "copilot-proxy/gpt-5.2",
    "synthetic-api-key": "synthetic/hf:MiniMaxAI/MiniMax-M2.1",
    "opencode-zen": "opencode/claude-opus-4-5",
  };

  function parseConfigValue(output) {
    const trimmed = String(output || "").trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : trimmed;
    } catch {
      return trimmed.replace(/^\"|\"$/g, "");
    }
  }

  async function getCurrentPrimaryModel() {
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "agents.defaults.model.primary"]));
    if (r.code !== 0) return "";
    return parseConfigValue(r.output);
  }

  function providerFromModel(model) {
    if (!model) return "";
    const idx = model.indexOf("/");
    return idx > 0 ? model.slice(0, idx) : "";
  }

  if (isConfigured()) {
    await ensureGatewayRunning();
    return { ok: true, output: "Already configured.\nUse Reset setup if you want to rerun onboarding.\n" };
  }

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  const authChoice = String(payload.authChoice || "");
  const defaultModel = DEFAULT_MODEL_BY_AUTH_CHOICE[authChoice] || "";
  const previousModel = defaultModel ? await getCurrentPrimaryModel() : "";
  const previousProvider = providerFromModel(previousModel);
  const defaultProvider = providerFromModel(defaultModel);

  const onboardArgs = buildOnboardArgs(payload);
  const onboard = await runCmd(OPENCLAW_NODE, clawArgs(onboardArgs));

  let extra = "";
  const ok = onboard.code === 0 && isConfigured();

  if (ok) {
    // Configure channels using shared function
    const { configureChannels } = await import("./channels.js");
    const channelOutput = await configureChannels(payload, handlers);
    if (channelOutput) {
      extra += "\n" + channelOutput;
    }

    if (defaultModel && (!previousProvider || previousProvider !== defaultProvider)) {
      const setModel = await runCmd(OPENCLAW_NODE, clawArgs(["models", "set", defaultModel]));
      extra += `\n[default model] ${defaultModel} (exit=${setModel.code})\n${setModel.output || "(no output)"}`;
    }

    const thinkingResult = ensureThinkingDefaultConfigured({
      upgradeOff: true,
    });
    if (!thinkingResult.ok) {
      extra += `\n[default thinking] WARNING: ${thinkingResult.error}`;
    } else if (thinkingResult.changed) {
      extra += `\n[default thinking] ${String(thinkingResult.value)}`;
    }

    await restartGateway();
  }

  return {
    ok,
    output: `${onboard.output}${extra}`,
  };
}
