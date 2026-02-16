import express from "express";

export function createChannelsRouter(handlers) {
  const { requireApiToken, runCmd, clawArgs, OPENCLAW_NODE } = handlers;
  const router = express.Router();

  router.post("/channels/set", requireApiToken, async (req, res) => {
    const payload = req.body || {};
    const output = await configureChannels(payload, handlers);
    return res.json({ ok: true, output });
  });

  return router;
}

// Shared channel configuration logic
export async function configureChannels(payload, handlers) {
  const { runCmd, clawArgs, OPENCLAW_NODE } = handlers;
  const out = [];

  const channelsHelp = await runCmd(
    OPENCLAW_NODE,
    clawArgs(["channels", "add", "--help"]),
  );
  const helpText = channelsHelp.output || "";
  const supports = (name) => helpText.includes(name);

  if (payload.telegramToken?.trim()) {
    if (!supports("telegram")) {
      out.push(
        "[telegram] skipped (this openclaw build does not list telegram in `channels add --help`)",
      );
    } else {
      const token = payload.telegramToken.trim();
      const cfgObj = {
        enabled: true,
        dmPolicy: "pairing",
        botToken: token,
        groupPolicy: "allowlist",
        streamMode: "partial",
      };

      // Enable the telegram channel via config set
      const set = await runCmd(
        OPENCLAW_NODE,
        clawArgs([
          "config",
          "set",
          "--json",
          "channels.telegram",
          JSON.stringify(cfgObj),
        ]),
      );
      const get = await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "get", "channels.telegram"]),
      );
      out.push(
        `[telegram config] exit=${set.code} (output ${set.output.length} chars)\n${set.output || "(no output)"}`,
      );
      out.push(
        `[telegram verify] exit=${get.code} (output ${get.output.length} chars)\n${get.output || "(no output)"}`,
      );

      const telegramPlugin = {
        enabled: true,
      };

      // Enable the telegram plugin via config set
      const enableTelegramPlugin = await runCmd(
        OPENCLAW_NODE,
        clawArgs([
          "config",
          "set",
          "--json",
          "plugins.entries.telegram",
          JSON.stringify(telegramPlugin),
        ]),
      );
      const getPlugin = await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "get", "plugins.entries.telegram"]),
      );
      out.push(
        `[telegram plugin] exit=${enableTelegramPlugin.code} (output ${enableTelegramPlugin.output.length} chars)\n${enableTelegramPlugin.output || "(no output)"}`,
      );
      out.push(
        `[telegram plugin verify] exit=${getPlugin.code} (output ${getPlugin.output.length} chars)\n${getPlugin.output || "(no output)"}`,
      );
    }
  }

  if (payload.discordToken?.trim()) {
    if (!supports("discord")) {
      out.push(
        "[discord] skipped (this openclaw build does not list discord in `channels add --help`)",
      );
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

      // Enable the discord channel via config set
      const set = await runCmd(
        OPENCLAW_NODE,
        clawArgs([
          "config",
          "set",
          "--json",
          "channels.discord",
          JSON.stringify(cfgObj),
        ]),
      );

      const get = await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "get", "channels.discord"]),
      );
      out.push(
        `[discord config] exit=${set.code} (output ${set.output.length} chars)\n${set.output || "(no output)"}`,
      );
      out.push(
        `[discord verify] exit=${get.code} (output ${get.output.length} chars)\n${get.output || "(no output)"}`,
      );

      const discordPlugin = {
        enabled: true,
      };

      // Enable the discord plugin via config set
      const enableDiscordPlugin = await runCmd(
        OPENCLAW_NODE,
        clawArgs([
          "config",
          "set",
          "--json",
          "plugins.entries.discord",
          JSON.stringify(discordPlugin),
        ]),
      );
      const getPlugin = await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "get", "plugins.entries.discord"]),
      );
      out.push(
        `[discord plugin] exit=${enableDiscordPlugin.code} (output ${enableDiscordPlugin.output.length} chars)\n${enableDiscordPlugin.output || "(no output)"}`,
      );
      out.push(
        `[discord plugin verify] exit=${getPlugin.code} (output ${getPlugin.output.length} chars)\n${getPlugin.output || "(no output)"}`,
      );
    }
  }

  if (payload.slackBotToken?.trim() || payload.slackAppToken?.trim()) {
    if (!supports("slack")) {
      out.push(
        "[slack] skipped (this openclaw build does not list slack in `channels add --help`)",
      );
    } else {
      const cfgObj = {
        enabled: true,
        botToken: payload.slackBotToken?.trim() || undefined,
        appToken: payload.slackAppToken?.trim() || undefined,
      };

      // Enable the slack channel via config set
      const set = await runCmd(
        OPENCLAW_NODE,
        clawArgs([
          "config",
          "set",
          "--json",
          "channels.slack",
          JSON.stringify(cfgObj),
        ]),
      );
      const get = await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "get", "channels.slack"]),
      );
      out.push(
        `[slack config] exit=${set.code} (output ${set.output.length} chars)\n${set.output || "(no output)"}`,
      );
      out.push(
        `[slack verify] exit=${get.code} (output ${get.output.length} chars)\n${get.output || "(no output)"}`,
      );

      const slackPlugin = {
        enabled: true,
      };

      // Enable the slack plugin via config set
      const enableSlackPlugin = await runCmd(
        OPENCLAW_NODE,
        clawArgs([
          "config",
          "set",
          "--json",
          "plugins.entries.slack",
          JSON.stringify(slackPlugin),
        ]),
      );
      const getPlugin = await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "get", "plugins.entries.slack"]),
      );
      out.push(
        `[slack plugin] exit=${enableSlackPlugin.code} (output ${enableSlackPlugin.output.length} chars)\n${enableSlackPlugin.output || "(no output)"}`,
      );
      out.push(
        `[slack plugin verify] exit=${getPlugin.code} (output ${getPlugin.output.length} chars)\n${getPlugin.output || "(no output)"}`,
      );
    }
  }

  return out.join("\n\n");
}
