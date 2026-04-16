import express from "express";
import { runOnboarding, replaceOpenRouterKeyInAuthProfiles } from "./run.js";
import { writeAmikoConfigAndMcporter, installBootstrapMd } from "./amiko-config.js";

export function createInitRouter(handlers) {
  const { requireApiToken } = handlers;
  const router = express.Router();

  router.post("/init", requireApiToken, async (req, res) => {
    try {
      const payload = req.body || {};
      const {
        isConfigured,
        restartGateway,
        runCmd,
        clawArgs,
        OPENCLAW_NODE,
        ensureThinkingDefaultConfigured,
      } = handlers;
      let output = "";

      if (!isConfigured()) {
        // Not configured: run full onboarding (e.g. bootstrap failed or first deploy without auto-onboard)
        const onboardResult = await runOnboarding(payload, handlers);
        if (!onboardResult.ok) {
          return res.status(500).json(onboardResult);
        }
        output = onboardResult.output;
      } else {
        // Already configured (e.g. auto-onboard with dummy key at startup): replace dummy key with real one
        const realKey = String(payload.authSecret ?? "").trim();
        const amikoUserId = String(payload.amikoUserId ?? "").trim();
        const amikoTwinId = String(payload.amikoTwinId ?? "").trim();
        const amikoTwinToken = String(payload.amikoTwinToken ?? "").trim();
        const amikoPlatformUrl = String(payload.amikoPlatformUrl ?? "").trim();
        const amikoChatUrl = String(payload.amikoChatUrl ?? "").trim();

        if (realKey) {
          const replaceResult = replaceOpenRouterKeyInAuthProfiles(handlers, realKey);
          output = replaceResult.ok ? `${replaceResult.output}\n` : `${replaceResult.output}\n`;
          if (!replaceResult.ok) {
            return res.status(500).json({ ok: false, output: replaceResult.output });
          }
        } else {
          output = "Already configured; no authSecret provided to replace key.\n";
        }

        // Persist Amiko config to main agent's workspace (per-agent .amiko.json + mcporter.json)
        const billingBase = String(payload.billingBase ?? "").trim() || undefined;
        const platformKey = String(payload.platformKey ?? "").trim() || undefined;
        const agentWallets = Array.isArray(payload.agentWallets) ? payload.agentWallets : undefined;

        if (amikoUserId || amikoTwinId || amikoTwinToken || billingBase || platformKey || agentWallets) {
          try {
            const { WORKSPACE_DIR } = handlers;

            const result = await writeAmikoConfigAndMcporter({
              handlers,
              workspaceDir: WORKSPACE_DIR,
              amikoUserId,
              amikoTwinId,
              amikoTwinToken,
              amikoPlatformUrl: amikoPlatformUrl || undefined,
              amikoChatUrl: amikoChatUrl || undefined,
              billingBase,
              platformKey,
              agentWallets,
            });
            if (result.ok) {
              output += `[amiko] ${result.output}\n`;
            } else {
              output += `[amiko] WARNING: Failed to write Amiko config: ${result.error}\n`;
            }
          } catch (err) {
            output += `[amiko] WARNING: Failed to write .amiko.json / mcporter.json: ${String(err)}\n`;
          }
        }

        // Install BOOTSTRAP.md for first conversation
        try {
          const { WORKSPACE_DIR } = handlers;
          const userName = String(payload.userName ?? "").trim();
          const twinName =
            String(payload.twinName ?? payload.name ?? payload.agentName ?? "").trim();
          const bootstrapResult = installBootstrapMd({
            workspaceDir: WORKSPACE_DIR,
            userName,
            twinName,
          });
          if (bootstrapResult.ok) {
            output += `[bootstrap] Installed BOOTSTRAP.md to ${bootstrapResult.path}\n`;
          } else {
            output += `[bootstrap] WARNING: ${bootstrapResult.error}\n`;
          }
        } catch (err) {
          output += `[bootstrap] WARNING: Failed to install BOOTSTRAP.md: ${String(err)}\n`;
        }

        const thinkingResult = ensureThinkingDefaultConfigured({
          upgradeOff: true,
        });
        if (!thinkingResult.ok) {
          output += `[default thinking] WARNING: ${thinkingResult.error}\n`;
        } else if (thinkingResult.changed) {
          output += `[default thinking] ${String(thinkingResult.value)}\n`;
        }

        // Restart gateway after key/model/default-config changes
        if (realKey || payload.model || thinkingResult.changed) {
          await restartGateway();
          output += "[gateway] Restarted to pick up new OpenRouter key/model/config.\n";

          const model = String(payload.model ?? "").trim();
          if (model) {
            const r = await runCmd(OPENCLAW_NODE, clawArgs(["models", "set", model]));
            output += `[models] Set default model to ${model} (exit=${r.code})\n${r.output || ""}\n`;
          }
        } else {
          try {
            await handlers.ensureGatewayRunning();
          } catch {
            // ignore
          }
        }
      }

      // Keep /init lightweight: it now only ensures the instance is configured,
      // updates OpenRouter credentials/model, writes .amiko.json, and makes sure
      // the gateway is running. Feature deployments (skills, sys config, data
      // sync, etc.) are handled by POST /setup/api/deploy/* endpoints instead.
      return res.json({ ok: true, output });
    } catch (err) {
      console.error("[/setup/api/init] error:", err);
      return res.status(500).json({ ok: false, output: `Internal error: ${String(err)}` });
    }
  });

  return router;
}
