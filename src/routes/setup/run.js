import express from "express";
import fs from "node:fs";

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

export function createRunRouter(handlers) {
  const {
    requireApiToken,
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

  const router = express.Router();

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

  router.post("/run", requireApiToken, async (req, res) => {
    try {
      if (isConfigured()) {
        await ensureGatewayRunning();
        return res.json({ ok: true, output: "Already configured.\nUse Reset setup if you want to rerun onboarding.\n" });
      }

      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

      const payload = req.body || {};
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

        const channelsHelp = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));
        const helpText = channelsHelp.output || "";
        const supports = (name) => helpText.includes(name);

        if (payload.telegramToken?.trim()) {
          if (!supports("telegram")) {
            extra += "\n[telegram] skipped (this openclaw build does not list telegram in `channels add --help`)\n";
          } else {
            const token = payload.telegramToken.trim();
            const cfgObj = {
              enabled: true,
              dmPolicy: "pairing",
              botToken: token,
              groupPolicy: "allowlist",
              streamMode: "partial",
            };
            const set = await runCmd(
              OPENCLAW_NODE,
              clawArgs(["config", "set", "--json", "channels.telegram", JSON.stringify(cfgObj)]),
            );
            const get = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.telegram"]));
            extra += `\n[telegram config] exit=${set.code} (output ${set.output.length} chars)\n${set.output || "(no output)"}`;
            extra += `\n[telegram verify] exit=${get.code} (output ${get.output.length} chars)\n${get.output || "(no output)"}`;
          }
        }

        if (payload.discordToken?.trim()) {
          if (!supports("discord")) {
            extra += "\n[discord] skipped (this openclaw build does not list discord in `channels add --help`)\n";
          } else {
            const token = payload.discordToken.trim();
            const cfgObj = {
              enabled: true,
              token,
              groupPolicy: "allowlist",
              dm: {
                policy: "pairing",
              },
            };
            const set = await runCmd(
              OPENCLAW_NODE,
              clawArgs(["config", "set", "--json", "channels.discord", JSON.stringify(cfgObj)]),
            );
            const get = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.discord"]));
            extra += `\n[discord config] exit=${set.code} (output ${set.output.length} chars)\n${set.output || "(no output)"}`;
            extra += `\n[discord verify] exit=${get.code} (output ${get.output.length} chars)\n${get.output || "(no output)"}`;
          }
        }

        if (payload.slackBotToken?.trim() || payload.slackAppToken?.trim()) {
          if (!supports("slack")) {
            extra += "\n[slack] skipped (this openclaw build does not list slack in `channels add --help`)\n";
          } else {
            const cfgObj = {
              enabled: true,
              botToken: payload.slackBotToken?.trim() || undefined,
              appToken: payload.slackAppToken?.trim() || undefined,
            };
            const set = await runCmd(
              OPENCLAW_NODE,
              clawArgs(["config", "set", "--json", "channels.slack", JSON.stringify(cfgObj)]),
            );
            const get = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.slack"]));
            extra += `\n[slack config] exit=${set.code} (output ${set.output.length} chars)\n${set.output || "(no output)"}`;
            extra += `\n[slack verify] exit=${get.code} (output ${get.output.length} chars)\n${get.output || "(no output)"}`;
          }
        }

        if (defaultModel && (!previousProvider || previousProvider !== defaultProvider)) {
          const setModel = await runCmd(OPENCLAW_NODE, clawArgs(["models", "set", defaultModel]));
          extra += `\n[default model] ${defaultModel} (exit=${setModel.code})\n${setModel.output || "(no output)"}`;
        }

        await restartGateway();
      }

      return res.status(ok ? 200 : 500).json({
        ok,
        output: `${onboard.output}${extra}`,
      });
    } catch (err) {
      console.error("[/setup/api/run] error:", err);
      return res.status(500).json({ ok: false, output: `Internal error: ${String(err)}` });
    }
  });

  return router;
}
