import express from "express";

export function createStatusRouter(handlers) {
  const { requireApiToken, isConfigured, runCmd, clawArgs, OPENCLAW_NODE, GATEWAY_TARGET } = handlers;
  const router = express.Router();

  router.get("/status", requireApiToken, async (_req, res) => {
    const version = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
    const channelsHelp = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));

    const authGroups = [
      { value: "openai", label: "OpenAI", hint: "Codex OAuth + API key", options: [
        { value: "codex-cli", label: "OpenAI Codex OAuth (Codex CLI)" },
        { value: "openai-codex", label: "OpenAI Codex (ChatGPT OAuth)" },
        { value: "openai-api-key", label: "OpenAI API key" }
      ]},
      { value: "anthropic", label: "Anthropic", hint: "Claude Code CLI + API key", options: [
        { value: "claude-cli", label: "Anthropic token (Claude Code CLI)" },
        { value: "token", label: "Anthropic token (paste setup-token)" },
        { value: "apiKey", label: "Anthropic API key" }
      ]},
      { value: "google", label: "Google", hint: "Gemini API key + OAuth", options: [
        { value: "gemini-api-key", label: "Google Gemini API key" },
        { value: "google-antigravity", label: "Google Antigravity OAuth" },
        { value: "google-gemini-cli", label: "Google Gemini CLI OAuth" }
      ]},
      { value: "openrouter", label: "OpenRouter", hint: "API key", options: [
        { value: "openrouter-api-key", label: "OpenRouter API key" }
      ]},
      { value: "ai-gateway", label: "Vercel AI Gateway", hint: "API key", options: [
        { value: "ai-gateway-api-key", label: "Vercel AI Gateway API key" }
      ]},
      { value: "moonshot", label: "Moonshot AI", hint: "Kimi K2 + Kimi Code", options: [
        { value: "moonshot-api-key", label: "Moonshot AI API key" },
        { value: "kimi-code-api-key", label: "Kimi Code API key" }
      ]},
      { value: "zai", label: "Z.AI (GLM 4.7)", hint: "API key", options: [
        { value: "zai-api-key", label: "Z.AI (GLM 4.7) API key" }
      ]},
      { value: "minimax", label: "MiniMax", hint: "M2.1 (recommended)", options: [
        { value: "minimax-api", label: "MiniMax M2.1" },
        { value: "minimax-api-lightning", label: "MiniMax M2.1 Lightning" }
      ]},
      { value: "qwen", label: "Qwen", hint: "OAuth", options: [
        { value: "qwen-portal", label: "Qwen OAuth" }
      ]},
      { value: "copilot", label: "Copilot", hint: "GitHub + local proxy", options: [
        { value: "github-copilot", label: "GitHub Copilot (GitHub device login)" },
        { value: "copilot-proxy", label: "Copilot Proxy (local)" }
      ]},
      { value: "synthetic", label: "Synthetic", hint: "Anthropic-compatible (multi-model)", options: [
        { value: "synthetic-api-key", label: "Synthetic API key" }
      ]},
      { value: "opencode-zen", label: "OpenCode Zen", hint: "API key", options: [
        { value: "opencode-zen", label: "OpenCode Zen (multi-model proxy)" }
      ]}
    ];

    res.json({
      configured: isConfigured(),
      gatewayTarget: GATEWAY_TARGET,
      openclawVersion: version.output.trim(),
      channelsAddHelp: channelsHelp.output,
      authGroups,
    });
  });

  return router;
}
