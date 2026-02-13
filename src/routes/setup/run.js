import express from "express";
import fs from "node:fs";

export function createRunRouter(handlers) {
  const { requireApiToken } = handlers;
  const router = express.Router();

  router.post("/run", requireApiToken, async (req, res) => {
    try {
      const payload = req.body || {};
      const result = await runOnboarding(payload, handlers);
      return res.status(result.ok ? 200 : 500).json(result);
    } catch (err) {
      console.error("[/setup/api/run] error:", err);
      return res.status(500).json({ ok: false, output: `Internal error: ${String(err)}` });
    }
  });

  return router;
}

/** Default allowed origins for gateway control UI when env is not set */
const DEFAULT_CONTROL_UI_ALLOWED_ORIGINS =
  "https://platform.heyamiko.com,https://amiko-platform.vercel.app,http://localhost:3000,http://localhost,http://127.0.0.1:3000,http://127.0.0.1";

/**
 * Set gateway.controlUi.allowedOrigins in OpenClaw config.
 * Uses OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS or default (platform.heyamiko.com, localhost:3000).
 * @param {object} handlers - { runCmd, OPENCLAW_NODE, clawArgs }
 * @param {string} [originsOverride] - Optional comma-separated list to use instead of env/default
 * @returns {{ ok: boolean }}
 */
export async function setGatewayControlUiAllowedOrigins(handlers, originsOverride = null) {
  const { runCmd, OPENCLAW_NODE, clawArgs } = handlers;
  const raw = (originsOverride ?? process.env.OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS ?? DEFAULT_CONTROL_UI_ALLOWED_ORIGINS).trim();
  if (!raw) return { ok: true };
  const originsArray = JSON.stringify(raw.split(",").map((o) => o.trim()).filter(Boolean));
  await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.controlUi.allowedOrigins", originsArray]));
  return { ok: true };
}

// Shared onboarding logic that can be reused by init.js
export async function runOnboarding(payload, handlers) {
  const {
    isConfigured,
    ensureGatewayRunning,
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
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.mode", "token"]));
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.token", OPENCLAW_GATEWAY_TOKEN]));
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.bind", "loopback"]));
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.port", String(INTERNAL_GATEWAY_PORT)]));
    await runCmd(
      OPENCLAW_NODE,
      clawArgs(["config", "set", "gateway.trustedProxies", '["127.0.0.1","::1","10.0.0.0/8","172.16.0.0/12","192.168.0.0/16"]']),
    );

    await setGatewayControlUiAllowedOrigins(handlers);

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

    await restartGateway();
  }

  return {
    ok,
    output: `${onboard.output}${extra}`,
  };
}
