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

  const channelsHelp = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));
  const helpText = channelsHelp.output || "";
  const supports = (name) => helpText.includes(name);

  if (payload.telegramToken?.trim()) {
    if (!supports("telegram")) {
      out.push("[telegram] skipped (this openclaw build does not list telegram in `channels add --help`)");
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

      const enablePlugin = await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "set", "plugins.entries.telegram.enabled", "true"]),
      );

      const get = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.telegram"]));
      out.push(`[telegram config] exit=${set.code} (output ${set.output.length} chars)\n${set.output || "(no output)"}`);
      out.push(`[telegram enable plugin] exit=${enablePlugin.code} (output ${enablePlugin.output.length} chars)\n${enablePlugin.output || "(no output)"}`);
      out.push(`[telegram verify] exit=${get.code} (output ${get.output.length} chars)\n${get.output || "(no output)"}`);
    }
  }

  if (payload.discordToken?.trim()) {
    if (!supports("discord")) {
      out.push("[discord] skipped (this openclaw build does not list discord in `channels add --help`)");
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
      const discordPatch = { plugins: { entries: { discord: { enabled: true } } } };
      const patch = await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "patch", JSON.stringify(discordPatch)]),
      );
      const get = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.discord"]));
      out.push(`[discord config] exit=${set.code} (output ${set.output.length} chars)\n${set.output || "(no output)"}`);
      out.push(`[discord plugin] exit=${patch.code} (output ${patch.output.length} chars)\n${patch.output || "(no output)"}`);
      out.push(`[discord verify] exit=${get.code} (output ${get.output.length} chars)\n${get.output || "(no output)"}`);
    }
  }

  if (payload.slackBotToken?.trim() || payload.slackAppToken?.trim()) {
    if (!supports("slack")) {
      out.push("[slack] skipped (this openclaw build does not list slack in `channels add --help`)");
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
      const slackPatch = { plugins: { entries: { slack: { enabled: true } } } };
      const patch = await runCmd(
        OPENCLAW_NODE,
        clawArgs(["config", "patch", JSON.stringify(slackPatch)]),
      );
      const get = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.slack"]));
      out.push(`[slack config] exit=${set.code} (output ${set.output.length} chars)\n${set.output || "(no output)"}`);
      out.push(`[slack plugin] exit=${patch.code} (output ${patch.output.length} chars)\n${patch.output || "(no output)"}`);
      out.push(`[slack verify] exit=${get.code} (output ${get.output.length} chars)\n${get.output || "(no output)"}`);
    }
  }

  return out.join("\n\n");
}
