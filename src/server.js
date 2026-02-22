import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import express from "express";
import httpProxy from "http-proxy";
import { createSetupRouter } from "./routes/setup/index.js";
import { setGatewayControlUiAllowedOrigins } from "./routes/setup/run.js";
import { startComposioMcpProxy } from "./composio-mcp-proxy.js";

// Railway deployments sometimes inject PORT=3000 by default. We want the wrapper to
// reliably listen on 8080 unless explicitly overridden.
//
// Prefer OPENCLAW_PUBLIC_PORT (set in the Dockerfile / template) over PORT.
// Keep CLAWDBOT_PUBLIC_PORT as a backward-compat alias for older templates.
const PORT = Number.parseInt(
  process.env.OPENCLAW_PUBLIC_PORT ?? process.env.CLAWDBOT_PUBLIC_PORT ?? process.env.PORT ?? "3000",
  10,
);

// State/workspace
// OpenClaw defaults to ~/.openclaw. Keep CLAWDBOT_* as backward-compat aliases.
// OPENCLAW_HOME (https://docs.openclaw.ai/help/environment) sets effective home; state is $OPENCLAW_HOME/.openclaw
const OPENCLAW_HOME = process.env.OPENCLAW_HOME?.trim();
const STATE_DIR =
  process.env.OPENCLAW_STATE_DIR?.trim() ||
  process.env.CLAWDBOT_STATE_DIR?.trim() ||
  (OPENCLAW_HOME ? path.join(OPENCLAW_HOME, ".openclaw") : path.join(os.homedir(), ".openclaw"));

const WORKSPACE_DIR =
  process.env.OPENCLAW_WORKSPACE_DIR?.trim() ||
  process.env.CLAWDBOT_WORKSPACE_DIR?.trim() ||
  path.join(STATE_DIR, "workspace");

const AMIKO_TWIN_ID = process.env.AMIKO_TWIN_ID?.trim() || "";
const AMIKO_USER_TOKEN = process.env.AMIKO_USER_TOKEN?.trim() || "";

// Protect /setup + API with a user-provided token.
const SETUP_PASSWORD = process.env.SETUP_PASSWORD?.trim();

// Gateway admin token (protects OpenClaw gateway + Control UI).
// Must be stable across restarts. If not provided via env, persist it in the state dir.
function resolveGatewayToken() {
  const envTok = process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || process.env.CLAWDBOT_GATEWAY_TOKEN?.trim();
  if (envTok) return envTok;

  const tokenPath = path.join(STATE_DIR, "gateway.token");
  try {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    if (existing) return existing;
  } catch {
    // ignore
  }

  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(tokenPath, generated, { encoding: "utf8", mode: 0o600 });
  } catch {
    // best-effort
  }
  return generated;
}

const OPENCLAW_GATEWAY_TOKEN = resolveGatewayToken();
process.env.OPENCLAW_GATEWAY_TOKEN = OPENCLAW_GATEWAY_TOKEN;
// Backward-compat: some older flows expect CLAWDBOT_GATEWAY_TOKEN.
process.env.CLAWDBOT_GATEWAY_TOKEN = process.env.CLAWDBOT_GATEWAY_TOKEN || OPENCLAW_GATEWAY_TOKEN;

// Where the gateway will listen internally (we proxy to it).
const INTERNAL_GATEWAY_PORT = Number.parseInt(process.env.INTERNAL_GATEWAY_PORT ?? "18789", 10);
const INTERNAL_GATEWAY_HOST = process.env.INTERNAL_GATEWAY_HOST ?? "127.0.0.1";
const GATEWAY_TARGET = `http://${INTERNAL_GATEWAY_HOST}:${INTERNAL_GATEWAY_PORT}`;

// Always run the built-from-source CLI entry directly to avoid PATH/global-install mismatches.
const OPENCLAW_ENTRY = process.env.OPENCLAW_ENTRY?.trim() || "/openclaw/dist/entry.js";
const OPENCLAW_NODE = process.env.OPENCLAW_NODE?.trim() || "node";

function clawArgs(args) {
  return [OPENCLAW_ENTRY, ...args];
}

function configPath() {
  return (
    process.env.OPENCLAW_CONFIG_PATH?.trim() ||
    process.env.CLAWDBOT_CONFIG_PATH?.trim() ||
    path.join(STATE_DIR, "openclaw.json")
  );
}

function isConfigured() {
  try {
    return fs.existsSync(configPath());
  } catch {
    return false;
  }
}

/** Essential env vars required to run. If any are missing, returns their names; otherwise null. */
function checkEssentialEnv() {
  const required = [
    ["SETUP_PASSWORD", () => process.env.SETUP_PASSWORD?.trim()],
    [
      "OPENCLAW_GATEWAY_TOKEN",
      () =>
        process.env.OPENCLAW_GATEWAY_TOKEN?.trim() ||
        process.env.CLAWDBOT_GATEWAY_TOKEN?.trim(),
    ],
    ["AMIKO_USER_ID", () => process.env.AMIKO_USER_ID?.trim()],
    ["AMIKO_TWIN_ID", () => process.env.AMIKO_TWIN_ID?.trim()],
    ["AMIKO_USER_TOKEN", () => process.env.AMIKO_USER_TOKEN?.trim()],
    [
      "OPENROUTER_API_KEY",
      () =>
        process.env.OPENROUTER_API_KEY?.trim() ||
        process.env.OPENCLAW_OPENROUTER_API_KEY?.trim(),
    ],
  ];
  const missing = required.filter(([_, get]) => !get()).map(([name]) => name);
  return missing.length ? missing : null;
}

const gatewayProcRef = { current: null };
let gatewayStarting = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForGatewayReady(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // Try the default Control UI base path, then fall back to legacy or root.
      const paths = ["/openclaw", "/clawdbot", "/"]; 
      for (const p of paths) {
        try {
          const res = await fetch(`${GATEWAY_TARGET}${p}`, { method: "GET" });
          // Any HTTP response means the port is open.
          if (res) return true;
        } catch {
          // try next
        }
      }
    } catch {
      // not ready
    }
    await sleep(250);
  }
  return false;
}

async function startGateway() {
  if (gatewayProcRef.current) return;
  if (!isConfigured()) throw new Error("Gateway cannot start: not configured");

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  const args = [
    "gateway",
    "run",
    "--bind",
    "loopback",
    "--port",
    String(INTERNAL_GATEWAY_PORT),
    "--auth",
    "token",
    "--token",
    OPENCLAW_GATEWAY_TOKEN,
  ];

  gatewayProcRef.current = childProcess.spawn(OPENCLAW_NODE, clawArgs(args), {
    stdio: "inherit",
    env: {
      ...process.env,
      OPENCLAW_STATE_DIR: STATE_DIR,
      OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
      // Backward-compat aliases
      CLAWDBOT_STATE_DIR: process.env.CLAWDBOT_STATE_DIR || STATE_DIR,
      CLAWDBOT_WORKSPACE_DIR: process.env.CLAWDBOT_WORKSPACE_DIR || WORKSPACE_DIR,
    },
  });

  gatewayProcRef.current.on("error", (err) => {
    console.error(`[gateway] spawn error: ${String(err)}`);
    gatewayProcRef.current = null;
  });

  gatewayProcRef.current.on("exit", (code, signal) => {
    console.error(`[gateway] exited code=${code} signal=${signal}`);
    gatewayProcRef.current = null;
  });
}

async function ensureGatewayRunning() {
  if (!isConfigured()) return { ok: false, reason: "not configured" };
  if (gatewayProcRef.current) return { ok: true };
  if (!gatewayStarting) {
    gatewayStarting = (async () => {
      await startGateway();
      const ready = await waitForGatewayReady({ timeoutMs: 20_000 });
      if (!ready) {
        throw new Error("Gateway did not become ready in time");
      }
    })().finally(() => {
      gatewayStarting = null;
    });
  }
  await gatewayStarting;
  return { ok: true };
}

async function restartGateway() {
  if (gatewayProcRef.current) {
    try {
      gatewayProcRef.current.kill("SIGTERM");
    } catch {
      // ignore
    }
    // Give it a moment to exit and release the port.
    await sleep(750);
    gatewayProcRef.current = null;
  }
  return ensureGatewayRunning();
}

function requireBasicSetupAuthWithRealm(realm) {
  return function basicAuthHandler(req, res, next) {
    if (!SETUP_PASSWORD) {
      return res
        .status(500)
        .type("text/plain")
        .send("SETUP_PASSWORD is not set. Set it in Railway Variables before using /setup.");
    }

    const header = req.headers.authorization || "";
    const [scheme, encoded] = header.split(" ");
    if (scheme !== "Basic" || !encoded) {
      res.set("WWW-Authenticate", `Basic realm="${realm}"`);
      return res.status(401).send("Auth required");
    }
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    const password = idx >= 0 ? decoded.slice(idx + 1) : "";
    if (password !== SETUP_PASSWORD) {
      res.set("WWW-Authenticate", `Basic realm="${realm}"`);
      return res.status(401).send("Invalid password");
    }
    return next();
  };
}

const requireBasicSetupAuth = requireBasicSetupAuthWithRealm("OpenClaw Setup");

function requireApiToken(req, res, next) {
  if (!SETUP_PASSWORD) {
    return res
      .status(500)
      .type("text/plain")
      .send("SETUP_PASSWORD is not set. Set it in Railway Variables before using /setup.");
  }
  const token = String(req.get("x-api-token") || "").trim();
  if (!token || token !== SETUP_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Invalid or missing x-api-token" });
  }
  return next();
}

function buildOnboardArgs(payload) {
  const args = [
    "onboard",
    "--non-interactive",
    "--accept-risk",
    "--json",
    "--no-install-daemon",
    "--skip-health",
    "--workspace",
    WORKSPACE_DIR,
    // The wrapper owns public networking; keep the gateway internal.
    "--gateway-bind",
    "loopback",
    "--gateway-port",
    String(INTERNAL_GATEWAY_PORT),
    "--gateway-auth",
    "token",
    "--gateway-token",
    OPENCLAW_GATEWAY_TOKEN,
    "--flow",
    payload.flow || "quickstart"
  ];

  if (payload.authChoice) {
    args.push("--auth-choice", payload.authChoice);

    // Map secret to correct flag for common choices.
    const secret = (payload.authSecret || "").trim();
    const map = {
      "openai-api-key": "--openai-api-key",
      "apiKey": "--anthropic-api-key",
      "openrouter-api-key": "--openrouter-api-key",
      "ai-gateway-api-key": "--ai-gateway-api-key",
      "moonshot-api-key": "--moonshot-api-key",
      "kimi-code-api-key": "--kimi-code-api-key",
      "gemini-api-key": "--gemini-api-key",
      "zai-api-key": "--zai-api-key",
      "minimax-api": "--minimax-api-key",
      "minimax-api-lightning": "--minimax-api-key",
      "synthetic-api-key": "--synthetic-api-key",
      "opencode-zen": "--opencode-zen-api-key"
    };
    const flag = map[payload.authChoice];
    if (flag && secret) {
      args.push(flag, secret);
    }

    if (payload.authChoice === "token" && secret) {
      // This is the Anthropics setup-token flow.
      args.push("--token-provider", "anthropic", "--token", secret);
    }
  }

  return args;
}

/** Dummy OpenRouter key used by auto-onboard at startup; /init replaces it with the real key. */
const DUMMY_OPENROUTER_KEY = "test";

/** Env var for OpenRouter API key; when set and no config exists, bootstrap so gateway can auto-start on first run. */
const OPENROUTER_API_KEY_ENV =
  process.env.OPENROUTER_API_KEY?.trim() || process.env.OPENCLAW_OPENROUTER_API_KEY?.trim() || "";

/**
 * If not configured, run onboard once with a dummy OpenRouter key so .openclaw is fully created.
 * Platform then calls POST /setup/api/init with the real key; we replace the dummy in auth-profiles.json.
 */
async function bootstrapWithDummyKey() {
  if (isConfigured()) return;

  console.log("[wrapper] auto-onboard with dummy OpenRouter key (will be replaced on /init)");
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  const onboardArgs = [
    "onboard",
    "--non-interactive",
    "--accept-risk",
    "--json",
    "--no-install-daemon",
    "--skip-health",
    "--workspace",
    WORKSPACE_DIR,
    "--gateway-bind",
    "loopback",
    "--gateway-port",
    String(INTERNAL_GATEWAY_PORT),
    "--gateway-auth",
    "token",
    "--gateway-token",
    OPENCLAW_GATEWAY_TOKEN,
    "--flow",
    "quickstart",
    "--auth-choice",
    "openrouter-api-key",
    "--openrouter-api-key",
    DUMMY_OPENROUTER_KEY,
  ];

  const onboard = await runCmd(OPENCLAW_NODE, clawArgs(onboardArgs));
  if (onboard.code !== 0 || !isConfigured()) {
    console.error("[wrapper] bootstrap onboard failed:", onboard.output);
    return;
  }

  await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.mode", "token"]));
  await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.token", OPENCLAW_GATEWAY_TOKEN]));
  await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.bind", "loopback"]));
  await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.port", String(INTERNAL_GATEWAY_PORT)]));
  await runCmd(
    OPENCLAW_NODE,
    clawArgs(["config", "set", "gateway.trustedProxies", '["127.0.0.1","::1","10.0.0.0/8","172.16.0.0/12","192.168.0.0/16"]']),
  );

  const handlers = { runCmd, OPENCLAW_NODE, clawArgs };
  await setGatewayControlUiAllowedOrigins(handlers);

  const setModel = await runCmd(OPENCLAW_NODE, clawArgs(["models", "set", "openrouter/auto"]));
  if (setModel.code !== 0) {
    console.warn("[wrapper] bootstrap default model set:", setModel.output);
  }

  console.log("[wrapper] bootstrap complete (dummy key); call /init with real OpenRouter key to activate");
}

/**
 * If not configured but OPENROUTER_API_KEY (or OPENCLAW_OPENROUTER_API_KEY) is set, run
 * non-interactive onboarding with that key so the gateway can auto-start on first run.
 */
async function bootstrapFromEnv() {
  if (isConfigured() || !OPENROUTER_API_KEY_ENV) return;

  console.log("[wrapper] bootstrapping from OPENROUTER_API_KEY (first-run auto-config)");
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  const onboardArgs = [
    "onboard",
    "--non-interactive",
    "--accept-risk",
    "--json",
    "--no-install-daemon",
    "--skip-health",
    "--workspace",
    WORKSPACE_DIR,
    "--gateway-bind",
    "loopback",
    "--gateway-port",
    String(INTERNAL_GATEWAY_PORT),
    "--gateway-auth",
    "token",
    "--gateway-token",
    OPENCLAW_GATEWAY_TOKEN,
    "--flow",
    "quickstart",
    "--auth-choice",
    "openrouter-api-key",
    "--openrouter-api-key",
    OPENROUTER_API_KEY_ENV,
  ];

  const onboard = await runCmd(OPENCLAW_NODE, clawArgs(onboardArgs));
  if (onboard.code !== 0 || !isConfigured()) {
    console.error("[wrapper] bootstrap onboard failed:", onboard.output);
    return;
  }

  await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.mode", "token"]));
  await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.token", OPENCLAW_GATEWAY_TOKEN]));
  await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.bind", "loopback"]));
  await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.port", String(INTERNAL_GATEWAY_PORT)]));
  await runCmd(
    OPENCLAW_NODE,
    clawArgs(["config", "set", "gateway.trustedProxies", '["127.0.0.1","::1","10.0.0.0/8","172.16.0.0/12","192.168.0.0/16"]']),
  );

  const handlers = { runCmd, OPENCLAW_NODE, clawArgs };
  await setGatewayControlUiAllowedOrigins(handlers);

  const setModel = await runCmd(OPENCLAW_NODE, clawArgs(["models", "set", "openrouter/auto"]));
  if (setModel.code !== 0) {
    console.warn("[wrapper] bootstrap default model set:", setModel.output);
  }

  console.log("[wrapper] bootstrap complete; gateway can auto-start");
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const proc = childProcess.spawn(cmd, args, {
      ...opts,
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: STATE_DIR,
        OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
        // Backward-compat aliases
        CLAWDBOT_STATE_DIR: process.env.CLAWDBOT_STATE_DIR || STATE_DIR,
        CLAWDBOT_WORKSPACE_DIR: process.env.CLAWDBOT_WORKSPACE_DIR || WORKSPACE_DIR,
      },
    });

    let out = "";
    proc.stdout?.on("data", (d) => (out += d.toString("utf8")));
    proc.stderr?.on("data", (d) => (out += d.toString("utf8")));

    proc.on("error", (err) => {
      out += `\n[spawn error] ${String(err)}\n`;
      resolve({ code: 127, output: out });
    });

    proc.on("close", (code) => resolve({ code: code ?? 0, output: out }));
  });
}

function redactSecrets(text) {
  if (!text) return text;
  return String(text)
    .replace(/(sk-[A-Za-z0-9_-]{10,})/g, "[REDACTED]")
    .replace(/(gho_[A-Za-z0-9_]{10,})/g, "[REDACTED]")
    .replace(/(xox[baprs]-[A-Za-z0-9-]{10,})/g, "[REDACTED]")
    .replace(/(AA[A-Za-z0-9_-]{10,}:\S{10,})/g, "[REDACTED]");
}

const ALLOWED_CONSOLE_COMMANDS = new Set([
  "gateway.restart",
  "gateway.stop",
  "gateway.start",
  "openclaw.version",
  "openclaw.status",
  "openclaw.health",
  "openclaw.doctor",
  "openclaw.logs.tail",
  "openclaw.config.get",
  "print.envs",
]);

const app = express();
app.disable("x-powered-by");
// Amiko import: raw zip body for POST /setup/api/import (run before json so body is preserved)
app.use((req, res, next) => {
  if (req.path === "/setup/api/import" && req.method === "POST") {
    return express.raw({ type: "application/zip", limit: "100mb" })(req, res, next);
  }
  next();
});
app.use((req, res, next) => {
  if (req.path === "/setup/api/import" && req.method === "POST") return next();
  return express.json({ limit: "1mb" })(req, res, next);
});
const PUBLIC_DIR = path.join(process.cwd(), "public");

// Minimal health endpoint for Railway.
app.get("/setup/healthz", (_req, res) => res.json({ ok: true }));

app.get("/setup", (_req, res) => {
  res.type("html").sendFile(path.join(PUBLIC_DIR, "setup.html"));
});

app.use(
  "/setup",
  createSetupRouter({
    requireApiToken,
    isConfigured,
    runCmd,
    clawArgs,
    OPENCLAW_NODE,
    GATEWAY_TARGET,
    buildOnboardArgs,
    ensureGatewayRunning,
    restartGateway,
    OPENCLAW_GATEWAY_TOKEN,
    STATE_DIR,
    WORKSPACE_DIR,
    configPath,
    redactSecrets,
    ALLOWED_CONSOLE_COMMANDS,
    gatewayProcRef,
    sleep,
    INTERNAL_GATEWAY_PORT,
    OPENCLAW_ENTRY,
    PORT,
    AMIKO_TWIN_ID,
    AMIKO_USER_TOKEN,
  }),
);

// Static assets for the setup UI (HTML/JS/CSS).
app.use("/setup", express.static(PUBLIC_DIR));

// Proxy everything else to the gateway.
const proxy = httpProxy.createProxyServer({
  target: GATEWAY_TARGET,
  ws: true,
  xfwd: true,
});

proxy.on("error", (err, _req, _res) => {
  console.error("[proxy]", err);
});

app.use(async (req, res) => {
  // If not configured, force users to /setup for any non-setup routes.
  if (!isConfigured() && !req.path.startsWith("/setup")) {
    return res.redirect("/setup");
  }

  if (isConfigured()) {
    try {
      await ensureGatewayRunning();
    } catch (err) {
      return res.status(503).type("text/plain").send(`Gateway not ready: ${String(err)}`);
    }
  }

  return proxy.web(req, res, { target: GATEWAY_TARGET });
});

// On start: if not configured, auto-onboard (with env key if set, else dummy key "test").
// Then start gateway if configured. /init replaces dummy key with real one when called.
(async function startServer() {
  if (!isConfigured()) {
    if (OPENROUTER_API_KEY_ENV) {
      await bootstrapFromEnv();
    } else {
      await bootstrapWithDummyKey();
    }
  }
  if (isConfigured()) {
    try {
      await ensureGatewayRunning();
      console.log("[wrapper] gateway ready before listening");
    } catch (err) {
      console.error("[wrapper] boot gateway start failed:", err);
      // Continue anyway so /setup is reachable; proxy will 503 until gateway is up.
    }
  } else {
    console.log("[wrapper] Not configured; use /setup and run init to configure.");
  }

  startComposioMcpProxy();

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[wrapper] listening on :${PORT}`);
    console.log(`[wrapper] state dir: ${STATE_DIR}`);
    console.log(`[wrapper] workspace dir: ${WORKSPACE_DIR}`);
    console.log(`[wrapper] gateway token: ${OPENCLAW_GATEWAY_TOKEN ? "(set)" : "(missing)"}`);
    console.log(`[wrapper] gateway target: ${GATEWAY_TARGET}`);
  });
  server.on("upgrade", onUpgrade);
  process.on("SIGTERM", onSigTerm);
})();

async function onUpgrade(req, socket, head) {
  if (!isConfigured()) {
    socket.destroy();
    return;
  }
  try {
    await ensureGatewayRunning();
  } catch {
    socket.destroy();
    return;
  }
  proxy.ws(req, socket, head, { target: GATEWAY_TARGET });
}

function onSigTerm() {
  try {
    if (gatewayProcRef.current) gatewayProcRef.current.kill("SIGTERM");
  } catch {
    // ignore
  }
  process.exit(0);
}
