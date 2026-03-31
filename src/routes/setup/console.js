import express from "express";

export function createConsoleRouter(handlers) {
  const {
    requireApiToken,
    ALLOWED_CONSOLE_COMMANDS,
    restartGateway,
    ensureGatewayRunning,
    runCmd,
    clawArgs,
    OPENCLAW_NODE,
    redactSecrets,
    gatewayProcRef,
    sleep,
  } = handlers;

  const router = express.Router();

  router.post("/console/run", requireApiToken, async (req, res) => {
    const payload = req.body || {};
    const cmd = String(payload.cmd || "").trim();
    const arg = String(payload.arg || "").trim();

    if (!ALLOWED_CONSOLE_COMMANDS.has(cmd)) {
      return res.status(400).json({ ok: false, error: "Command not allowed" });
    }

    try {
      if (cmd === "gateway.restart") {
        await restartGateway();
        return res.json({
          ok: true,
          output: "Gateway restarted. (Gateway auto-starts with the container; use Restart to apply config changes.)\n",
        });
      }
      if (cmd === "gateway.stop") {
        if (gatewayProcRef.current) {
          try { gatewayProcRef.current.kill("SIGTERM"); } catch {}
          await sleep(750);
          gatewayProcRef.current = null;
        }
        return res.json({
          ok: true,
          output: "Gateway stopped. It will not run until you run gateway.start or the container restarts.\n",
        });
      }
      if (cmd === "gateway.start") {
        const r = await ensureGatewayRunning();
        return res.json({
          ok: Boolean(r.ok),
          output: r.ok
            ? "Gateway started. (Normally the gateway auto-starts with the container.)\n"
            : `Gateway not started: ${r.reason}\n`,
        });
      }

      if (cmd === "openclaw.version") {
        const r = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
        return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
      }
      if (cmd === "openclaw.status") {
        const r = await runCmd(OPENCLAW_NODE, clawArgs(["status"]));
        return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
      }
      if (cmd === "openclaw.health") {
        const r = await runCmd(OPENCLAW_NODE, clawArgs(["health"]));
        return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
      }
      if (cmd === "openclaw.doctor") {
        const r = await runCmd(OPENCLAW_NODE, clawArgs(["doctor"]));
        return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
      }
      if (cmd === "openclaw.logs.tail") {
        const lines = Math.max(50, Math.min(1000, Number.parseInt(arg || "200", 10) || 200));
        const r = await runCmd(OPENCLAW_NODE, clawArgs(["logs", "--tail", String(lines)]));
        return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
      }
      if (cmd === "openclaw.config.get") {
        if (!arg) return res.status(400).json({ ok: false, error: "Missing config path" });
        const r = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", arg]));
        return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
      }

      if (cmd === "openclaw.mcp.list") {
        const r = await runCmd(OPENCLAW_NODE, clawArgs(["mcp", "list"]));
        return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
      }
      if (cmd === "openclaw.mcp.set") {
        if (!arg) return res.status(400).json({ ok: false, error: "Missing arg: <name> <json>" });
        const spaceIdx = arg.indexOf(" ");
        if (spaceIdx === -1) return res.status(400).json({ ok: false, error: "Usage: <name> <json>" });
        const name = arg.slice(0, spaceIdx);
        const json = arg.slice(spaceIdx + 1);
        const r = await runCmd(OPENCLAW_NODE, clawArgs(["mcp", "set", name, json]));
        return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
      }
      if (cmd === "openclaw.mcp.unset") {
        if (!arg) return res.status(400).json({ ok: false, error: "Missing arg: <name>" });
        const r = await runCmd(OPENCLAW_NODE, clawArgs(["mcp", "unset", arg]));
        return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
      }

      if (cmd === "print.envs") {
        const snapshot = {};
        for (const [key, value] of Object.entries(process.env)) {
          snapshot[key] = redactSecrets(value);
        }
        return res.json({ ok: true, output: JSON.stringify(snapshot, null, 2) });
      }

      return res.status(400).json({ ok: false, error: "Unhandled command" });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
