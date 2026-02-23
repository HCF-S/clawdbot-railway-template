/**
 * Composio MCP proxy: listens on 127.0.0.1:3099 and forwards MCP requests to
 * Composio's session MCP URL. Session is obtained from the Amiko platform using
 * the instance's AMIKO_USER_TOKEN (no COMPOSIO_API_KEY on the instance).
 */
import http from "node:http";
import https from "node:https";
import fs from "node:fs";

const LEGACY_AMIKO_CONFIG_PATH = "/data/.amiko.json";
const DEFAULT_AMIKO_PLATFORM_URL = "https://platform.heyamiko.com";
const PROXY_PORT = Number.parseInt(process.env.COMPOSIO_MCP_PROXY_PORT ?? "3099", 10);
const SESSION_CACHE_TTL_MS = 4 * 60 * 1000; // 4 minutes (Composio sessions may last ~5–15 min)

function getPlatformUrl() {
  return process.env.AMIKO_PLATFORM_URL?.trim() || DEFAULT_AMIKO_PLATFORM_URL;
}

function getMainWorkspaceDir() {
  const env =
    process.env.OPENCLAW_WORKSPACE_DIR?.trim() ||
    process.env.CLAWDBOT_WORKSPACE_DIR?.trim() ||
    "";
  if (env) return env;
  const state =
    process.env.OPENCLAW_STATE_DIR?.trim() || process.env.CLAWDBOT_STATE_DIR?.trim() || "";
  if (state) return `${state}/workspace`;
  return "/data/.openclaw/workspace";
}

function readAmikoToken() {
  const pathsToTry = [
    `${getMainWorkspaceDir()}/.amiko.json`,
    LEGACY_AMIKO_CONFIG_PATH,
  ];
  for (const cfgPath of pathsToTry) {
    try {
      if (fs.existsSync(cfgPath)) {
        const raw = fs.readFileSync(cfgPath, "utf8");
        const data = JSON.parse(raw);
        const token = String(data.AMIKO_USER_TOKEN ?? "").trim();
        if (token) return token;
      }
    } catch (err) {
      console.warn("[composio-mcp-proxy] failed to read", cfgPath, err?.message);
    }
  }
  return process.env.AMIKO_USER_TOKEN?.trim() ?? "";
}

async function fetchSession(platformUrl, token) {
  const base = platformUrl.replace(/\/$/, "");
  const url = `${base}/api/composio-mcp/session`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Session fetch failed: ${res.status} ${text}`);
  }
  const body = await res.json();
  const mcpUrl = body.mcpUrl ?? body.mcp_url;
  const headers = body.headers ?? {};
  if (!mcpUrl) throw new Error("Session response missing mcpUrl");
  return { mcpUrl, headers };
}

function getSessionCacheKey() {
  return readAmikoToken()
    ? `${getPlatformUrl()}:${readAmikoToken().slice(0, 12)}`
    : "";
}

let sessionCache = { key: "", session: null, expiresAt: 0 };

async function getSession() {
  const platformUrl = getPlatformUrl();
  const token = readAmikoToken();
  if (!token) throw new Error("AMIKO_USER_TOKEN not found in workspace .amiko.json or env");

  const key = getSessionCacheKey();
  const now = Date.now();
  if (sessionCache.key === key && sessionCache.expiresAt > now && sessionCache.session) {
    return sessionCache.session;
  }

  const session = await fetchSession(platformUrl, token);
  sessionCache = { key, session, expiresAt: now + SESSION_CACHE_TTL_MS };
  return session;
}

function clearSessionCache() {
  sessionCache = { key: "", session: null, expiresAt: 0 };
}

function parseUrl(urlString) {
  try {
    return new URL(urlString);
  } catch {
    return null;
  }
}

function copyHeaders(from, into, extra = {}) {
  const skip = new Set([
    "host",
    "connection",
    "authorization",
    "content-length",
    "transfer-encoding",
  ]);
  for (const [k, v] of Object.entries(from)) {
    const lower = k.toLowerCase();
    if (!skip.has(lower) && v !== undefined && v !== "") {
      into[lower] = Array.isArray(v) ? v.join(", ") : String(v);
    }
  }
  Object.assign(into, extra);
}

async function proxyRequest(req, res, upstreamRes) {
  res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
  upstreamRes.pipe(res);
}

async function handleRequest(req, res) {
  let session;
  try {
    session = await getSession();
  } catch (err) {
    console.warn("[composio-mcp-proxy] getSession:", err?.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Failed to get Composio MCP session",
        detail: err?.message ?? String(err),
      })
    );
    return;
  }

  const targetUrl = parseUrl(session.mcpUrl);
  if (!targetUrl) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid Composio MCP URL" }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  const reqHeaders = {};
  copyHeaders(req.headers, reqHeaders, session.headers);
  if (body.length > 0) reqHeaders["content-length"] = String(body.length);

  const doRequest = targetUrl.protocol === "https:" ? https.request : http.request;
  const targetPath = targetUrl.pathname + targetUrl.search;

  const upstreamReq = doRequest(
    {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
      path: targetPath,
      method: req.method,
      headers: reqHeaders,
    },
    (upstreamRes) => {
      if (upstreamRes.statusCode === 401 || upstreamRes.statusCode === 403) {
        clearSessionCache();
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Composio session expired or unauthorized; retry to get a new session",
          })
        );
        return;
      }
      proxyRequest(req, res, upstreamRes);
    }
  );

  upstreamReq.on("error", (err) => {
    console.warn("[composio-mcp-proxy] upstream error:", err?.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Upstream error", detail: err?.message }));
    }
  });

  if (body.length > 0) upstreamReq.write(body);
  upstreamReq.end();
}

export function startComposioMcpProxy() {
  const platformUrl = getPlatformUrl();
  const isDefault = !process.env.AMIKO_PLATFORM_URL?.trim();
  if (isDefault) {
    console.log(
      "[composio-mcp-proxy] AMIKO_PLATFORM_URL not set; using default",
      DEFAULT_AMIKO_PLATFORM_URL
    );
  }
  const server = http.createServer(handleRequest);
  server.listen(PROXY_PORT, "127.0.0.1", () => {
    console.log(`[composio-mcp-proxy] listening on 127.0.0.1:${PROXY_PORT}`);
  });
  server.on("error", (err) => {
    console.error("[composio-mcp-proxy] server error:", err);
  });
  return server;
}
