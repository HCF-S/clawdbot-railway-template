import express from "express";
import path from "node:path";
import os from "node:os";
import { randomUUID, createPublicKey, createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename, chmod } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Key normalization helpers (mirrors openclaw/src/infra/device-identity.ts)
// ---------------------------------------------------------------------------

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function base64UrlEncode(buf) {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function derivePublicKeyRaw(publicKeyPem) {
  const key = createPublicKey(publicKeyPem);
  const spki = key.export({ type: "spki", format: "der" });
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

function normalizeDevicePublicKeyBase64Url(publicKey) {
  try {
    if (publicKey.includes("BEGIN")) {
      return base64UrlEncode(derivePublicKeyRaw(publicKey));
    }
    return base64UrlEncode(base64UrlDecode(publicKey));
  } catch {
    return null;
  }
}

function deriveDeviceIdFromPublicKey(publicKey) {
  try {
    const raw = publicKey.includes("BEGIN")
      ? derivePublicKeyRaw(publicKey)
      : base64UrlDecode(publicKey);
    return createHash("sha256").update(raw).digest("hex");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Device-pairing state helpers (mirrors openclaw/src/infra/device-pairing.ts)
// ---------------------------------------------------------------------------

function getStateDir() {
  const override =
    (process.env.OPENCLAW_STATE_DIR || "").trim() ||
    (process.env.CLAWDBOT_STATE_DIR || "").trim();
  return override || path.join(os.homedir(), ".openclaw");
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  try { await chmod(tmp, 0o600); } catch (e) { 
   console.error(e) 
  }
  await rename(tmp, filePath);
  try { await chmod(filePath, 0o600); } catch (e) { 
    console.error(e)
  }
}

const PENDING_TTL_MS = 5 * 60 * 1000;
const APPROVE_RETRIES = 5;
const APPROVE_RETRY_BASE_DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUnknownRequestIdOutput(output) {
  return String(output || "").toLowerCase().includes("unknown requestid");
}

function pruneExpired(pendingById, now) {
  for (const [id, req] of Object.entries(pendingById)) {
    if (now - req.ts > PENDING_TTL_MS) {
      delete pendingById[id];
    }
  }
}

// Simple async mutex so concurrent requests don't race on the state files.
let _lockChain = Promise.resolve();
function withLock(fn) {
  const next = _lockChain.then(fn, fn);
  _lockChain = next.then(
    () => {},
    () => {},
  );
  return next;
}

async function loadPairingState() {
  const stateDir = getStateDir();
  const devicesDir = path.join(stateDir, "devices");
  const pendingPath = path.join(devicesDir, "pending.json");
  const pairedPath = path.join(devicesDir, "paired.json");
  const [pending, paired] = await Promise.all([
    readJsonFile(pendingPath),
    readJsonFile(pairedPath),
  ]);
  const now = Date.now();
  const pendingById = pending ?? {};
  pruneExpired(pendingById, now);
  return {
    pendingById,
    pairedByDeviceId: paired ?? {},
    pendingPath,
    pairedPath,
  };
}

export function createPairingRouter(handlers) {
  const { requireApiToken, runCmd, clawArgs, OPENCLAW_NODE } = handlers;
  const router = express.Router();

  router.get("/pairing/pending", requireApiToken, async (req, res) => {
    const channel = String(req.query.channel || "").trim();
    if (!channel) {
      return res.status(400).json({ ok: false, error: "Missing channel query parameter" });
    }
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["pairing", "list", channel]));
    return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
  });

  router.post("/pairing/approve", requireApiToken, async (req, res) => {
    const { channel, code } = req.body || {};
    if (!channel || !code) {
      return res.status(400).json({ ok: false, error: "Missing channel or code" });
    }
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["pairing", "approve", String(channel), String(code)]));
    return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
  });

  router.get("/devices/list", requireApiToken, async (_req, res) => {
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "list", "--json"]));
    if (r.code !== 0) {
      return res
        .status(500)
        .json({ ok: false, error: "Failed to list devices", output: r.output });
    }
    // CLI may print "gateway connect failed: Error: pairing required" before the JSON when unpaired.
    // Strip that prefix so the output is valid JSON for the UI.
    const output = String(r.output ?? "").replace(
      /^gateway connect failed: Error: pairing required\r?\n?/i,
      ""
    ).trim();
    return res.status(200).json({ ok: true, output });
  });

  router.post("/devices/approve", requireApiToken, async (req, res) => {
    const requestId = String((req.body && req.body.requestId) || "").trim();
    if (!requestId) {
      return res.status(400).json({ ok: false, error: "Missing requestId" });
    }

    let last = { code: 500, output: "" };
    for (let attempt = 0; attempt < APPROVE_RETRIES; attempt++) {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "approve", requestId]));
      last = r;

      if (r.code === 0) {
        return res.status(200).json({ ok: true, output: r.output });
      }

      if (isUnknownRequestIdOutput(r.output) && attempt < APPROVE_RETRIES - 1) {
        await sleep(APPROVE_RETRY_BASE_DELAY_MS * (attempt + 1));
        continue;
      }

      break;
    }

    if (isUnknownRequestIdOutput(last.output)) {
      return res
        .status(400)
        .json({ ok: false, error: "invalid_request_id", output: last.output });
    }

    return res.status(500).json({ ok: false, output: last.output });
  });

  router.post("/devices/request", requireApiToken, async (req, res) => {
    const { publicKey, displayName, platform, role, scopes, clientId, remoteIp, clientMode } = req.body || {};

    if (!publicKey || typeof publicKey !== "string" || !publicKey.trim()) {
      return res.status(400).json({ ok: false, error: "publicKey is required" });
    }

    const normalizedPublicKey = normalizeDevicePublicKeyBase64Url(publicKey.trim());
    if (!normalizedPublicKey) {
      return res.status(400).json({ ok: false, error: "publicKey is invalid or unsupported format" });
    }

    const derivedDeviceId = deriveDeviceIdFromPublicKey(publicKey.trim());
    if (!derivedDeviceId) {
      return res.status(400).json({ ok: false, error: "Could not derive deviceId from publicKey" });
    }

    try {
      const result = await withLock(async () => {
        const { pendingById, pairedByDeviceId, pendingPath } = await loadPairingState();

        const existing = Object.values(pendingById).find((p) => p.deviceId === derivedDeviceId);
        if (existing) {
          return { request: existing, created: false };
        }

        const isRepair = Boolean(pairedByDeviceId[derivedDeviceId]);
        const normalizedRole = typeof role === "string" ? role.trim() : undefined;
        const request = {
          requestId:   randomUUID(),
          deviceId:    derivedDeviceId,
          publicKey:   normalizedPublicKey,
          displayName: typeof displayName === "string" ? displayName.trim() : undefined,
          platform:    typeof platform    === "string" ? platform.trim()    : undefined,
          role:        normalizedRole || undefined,
          roles:       normalizedRole ? [normalizedRole] : undefined,
          scopes:      Array.isArray(scopes) ? scopes.filter((s) => typeof s === "string") : undefined,
          isRepair,
          ts:          Date.now(),
          clientId:      typeof clientId === "string" ? clientId.trim() : undefined,
          remoteIp:      typeof remoteIp === "string" ? remoteIp.trim() : undefined,
          clientMode:   typeof clientMode === "string" ? clientMode.trim() : undefined,
          silent: false
        };
        pendingById[request.requestId] = request;
        await writeJsonAtomic(pendingPath, pendingById);
        return { request, created: true };
      });

      return res.status(200).json({
        ok:        true,
        requestId: result.request.requestId,
        deviceId:  result.request.deviceId,
        created:   result.created,
      });
    } catch (err) {
      console.error("[devices/request]", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  router.get("/devices/status", requireApiToken, async (req, res) => {
    const requestId = String(req.query.requestId || "").trim();
    const deviceId  = String(req.query.deviceId  || "").trim();

    if (!requestId) {
      return res.status(400).json({ ok: false, error: "requestId query parameter is required" });
    }

    try {
      const { pendingById, pairedByDeviceId } = await loadPairingState();

      if (pendingById[requestId]) {
        return res.status(200).json({ ok: true, status: "pending", requestId });
      }

      const isPaired = deviceId ? Boolean(pairedByDeviceId[deviceId]) : false;
      return res.status(200).json({
        ok:     true,
        status: isPaired ? "approved" : "not_found",
        requestId,
      });
    } catch (err) {
      console.error("[devices/status]", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
