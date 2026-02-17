import express from "express";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";

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
  const tmp = `${filePath}.tmp.${Date.now()}`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, filePath);
}

const PENDING_TTL_MS = 5 * 60 * 1000;

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
    return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
  });

  router.post("/devices/approve", requireApiToken, async (req, res) => {
    const requestId = String((req.body && req.body.requestId) || "").trim();
    if (!requestId) {
      return res.status(400).json({ ok: false, error: "Missing requestId" });
    }
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "approve", requestId]));
    return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
  });

  router.post("/devices/request", requireApiToken, async (req, res) => {
    const { deviceId, publicKey, displayName, platform, role, scopes } = req.body || {};

    if (!deviceId || typeof deviceId !== "string" || !deviceId.trim()) {
      return res.status(400).json({ ok: false, error: "deviceId is required" });
    }
    if (!publicKey || typeof publicKey !== "string" || !publicKey.trim()) {
      return res.status(400).json({ ok: false, error: "publicKey is required" });
    }

    try {
      const result = await withLock(async () => {
        const { pendingById, pairedByDeviceId, pendingPath } = await loadPairingState();
        const normalizedId = deviceId.trim();

        // Return existing pending request for the same device (idempotent).
        const existing = Object.values(pendingById).find((p) => p.deviceId === normalizedId);
        if (existing) {
          return { request: existing, created: false };
        }

        const isRepair = Boolean(pairedByDeviceId[normalizedId]);
        const normalizedRole = typeof role === "string" ? role.trim() : undefined;
        const request = {
          requestId:   randomUUID(),
          deviceId:    normalizedId,
          publicKey:   publicKey.trim(),
          displayName: typeof displayName === "string" ? displayName.trim() : undefined,
          platform:    typeof platform    === "string" ? platform.trim()    : undefined,
          role:        normalizedRole || undefined,
          roles:       normalizedRole ? [normalizedRole] : undefined,
          scopes:      Array.isArray(scopes) ? scopes.filter((s) => typeof s === "string") : undefined,
          isRepair,
          ts:          Date.now(),
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
