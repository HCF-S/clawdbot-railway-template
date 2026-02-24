import { spawn, spawnSync } from "node:child_process";

const IMAGE_NAME = process.env.E2E_IMAGE_NAME || "openclaw-railway-template:e2e";
const CONTAINER_NAME =
  process.env.E2E_CONTAINER_NAME || `openclaw-e2e-${Date.now().toString(36)}`;
const HOST_PORT = Number.parseInt(process.env.E2E_HOST_PORT || "38080", 10);
const CONTAINER_PORT = 3000;

const REQUIRED_ENVS = [
  "SETUP_PASSWORD",
  "AMIKO_USER_ID",
  "AMIKO_TWIN_ID",
  "AMIKO_USER_TOKEN",
  "OPENROUTER_API_KEY",
];

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
}

function runSync(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with status ${res.status}`);
  }
}

function runSyncCapture(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (res.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed with status ${res.status}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`,
    );
  }
  return res.stdout;
}

async function waitForHttpOk(url, { timeoutMs = 60_000, intervalMs = 1_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return true;
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function main() {
  try {
    // Ensure required env vars are present – mirrors checkEssentialEnv in server.js.
    const missing = REQUIRED_ENVS.filter((k) => !process.env[k] || !String(process.env[k]).trim());
    if (missing.length) {
      throw new Error(`Missing required env vars for e2e test: ${missing.join(", ")}`);
    }

    console.log("[e2e] Building Docker image...");
    runSync("docker", ["build", "-t", IMAGE_NAME, "."]);

    console.log("[e2e] Launching container...");
    const dockerEnv = [
      "-e",
      `SETUP_PASSWORD=${process.env.SETUP_PASSWORD}`,
      "-e",
      `AMIKO_USER_ID=${process.env.AMIKO_USER_ID}`,
      "-e",
      `AMIKO_TWIN_ID=${process.env.AMIKO_TWIN_ID}`,
      "-e",
      `AMIKO_USER_TOKEN=${process.env.AMIKO_USER_TOKEN}`,
      "-e",
      `OPENROUTER_API_KEY=${process.env.OPENROUTER_API_KEY}`,
    ];

    const runArgs = [
      "run",
      "--rm",
      "--name",
      CONTAINER_NAME,
      "-p",
      `${HOST_PORT}:${CONTAINER_PORT}`,
      ...dockerEnv,
      IMAGE_NAME,
    ];

    const child = spawn("docker", runArgs, { stdio: "inherit" });

    // Ensure we always clean up the container.
    const cleanup = () => {
      try {
        console.log("[e2e] Stopping container...");
        spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "inherit" });
      } catch {
        // ignore
      }
    };

    process.on("SIGINT", () => {
      cleanup();
      process.exit(1);
    });
    process.on("SIGTERM", () => {
      cleanup();
      process.exit(1);
    });

    const baseUrl = `http://127.0.0.1:${HOST_PORT}`;
    console.log(`[e2e] Waiting for wrapper to be reachable at ${baseUrl}/setup/healthz ...`);

    const ready = await waitForHttpOk(`${baseUrl}/setup/healthz`, {
      timeoutMs: 120_000,
      intervalMs: 2_000,
    });
    if (!ready) {
      cleanup();
      throw new Error("Wrapper did not become ready in time");
    }

    console.log("[e2e] Calling /setup/api/init ...");
    const initRes = await fetch(`${baseUrl}/setup/api/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-token": process.env.SETUP_PASSWORD || "",
      },
      body: JSON.stringify({
        authSecret: process.env.OPENROUTER_API_KEY,
        authChoice: "openrouter-api-key",
        flow: "quickstart",
        amikoUserId: process.env.AMIKO_USER_ID,
        amikoTwinId: process.env.AMIKO_TWIN_ID,
        amikoUserToken: process.env.AMIKO_USER_TOKEN,
      }),
    });

    if (!initRes.ok) {
      const text = await initRes.text().catch(() => "");
      cleanup();
      throw new Error(`/setup/api/init failed: ${initRes.status} ${initRes.statusText} ${text}`);
    }

    const initBody = await initRes.json().catch(() => ({}));
    if (!initBody.ok) {
      cleanup();
      throw new Error(`/setup/api/init returned ok=false: ${JSON.stringify(initBody)}`);
    }
    console.log("[e2e] /init ok");

    console.log("[e2e] Checking OpenClaw status via /setup/api/status ...");
    const statusRes = await fetch(`${baseUrl}/setup/api/status`, {
      method: "GET",
      headers: {
        "x-api-token": process.env.SETUP_PASSWORD || "",
      },
    });
    if (!statusRes.ok) {
      const text = await statusRes.text().catch(() => "");
      cleanup();
      throw new Error(`/setup/api/status failed: ${statusRes.status} ${statusRes.statusText} ${text}`);
    }

    const statusBody = await statusRes.json().catch(() => ({}));
    if (!statusBody.openclawVersion) {
      cleanup();
      throw new Error(`Status response missing openclawVersion: ${JSON.stringify(statusBody)}`);
    }

    console.log("[e2e] OpenClaw status ok:", statusBody.openclawVersion);

    // Explicitly stop the container at the end.
    cleanup();

    // Also wait for docker run process to exit.
    await new Promise((resolve) => {
      child.on("close", () => resolve());
    });

    console.log("[e2e] Docker e2e test completed successfully.");
  } catch (err) {
    fail(`[e2e] ERROR: ${String(err?.message || err)}`);
  }
}

await main();

