import express from "express";

export function createPrefillRouter(handlers) {
  const { requireApiToken, runCmd, clawArgs, OPENCLAW_NODE } = handlers;
  const router = express.Router();

  function parseConfigValue(output) {
    const trimmed = String(output || "").trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" ? parsed : trimmed;
    } catch {
      return trimmed.replace(/^"|"$/g, "");
    }
  }

  function guessAuthChoiceFromProvider(provider) {
    switch (provider) {
      case "openai": return "openai-api-key";
      case "openai-codex": return "openai-codex";
      case "anthropic": return "apiKey";
      case "google": return "gemini-api-key";
      case "openrouter": return "openrouter-api-key";
      case "vercel-ai-gateway": return "ai-gateway-api-key";
      case "moonshot": return "moonshot-api-key";
      case "kimi-coding": return "kimi-code-api-key";
      case "zai": return "zai-api-key";
      case "minimax": return "minimax-api";
      case "qwen-portal": return "qwen-portal";
      case "github-copilot": return "github-copilot";
      case "copilot-proxy": return "copilot-proxy";
      case "synthetic": return "synthetic-api-key";
      case "opencode": return "opencode-zen";
      default: return "";
    }
  }

  router.get("/prefill", requireApiToken, async (_req, res) => {
    const modelRes = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "agents.defaults.model.primary"]));
    const modelPrimary = modelRes.code === 0 ? parseConfigValue(modelRes.output) : "";
    const provider = modelPrimary.includes("/") ? modelPrimary.split("/")[0] : "";

    const telegramRes = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.telegram.botToken"]));
    const discordRes = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.discord.token"]));
    const slackBotRes = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.slack.botToken"]));
    const slackAppRes = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.slack.appToken"]));

    res.json({
      modelPrimary,
      provider,
      authChoice: guessAuthChoiceFromProvider(provider),
      channels: {
        telegramToken: telegramRes.code === 0 ? parseConfigValue(telegramRes.output) : "",
        discordToken: discordRes.code === 0 ? parseConfigValue(discordRes.output) : "",
        slackBotToken: slackBotRes.code === 0 ? parseConfigValue(slackBotRes.output) : "",
        slackAppToken: slackAppRes.code === 0 ? parseConfigValue(slackAppRes.output) : "",
      },
    });
  });

  return router;
}
