/**
 * Composio MCP proxy: listens on 127.0.0.1:3099 and forwards MCP requests to
 * Composio's session MCP URL. Session is obtained from the Amiko platform using
 * the instance's AMIKO_USER_TOKEN (no COMPOSIO_API_KEY on the instance).
 */
import http from "node:http";
import https from "node:https";
import fs from "node:fs";

const AMIKO_CONFIG_PATH = "/data/.amiko.json";
const PROXY_PORT = Number.parseInt(process.env.COMPOSIO_MCP_PROXY_PORT ?? "3099", 10);
const SESSION_CACHE_TTL_MS = 4 * 60 * 1000; // 4 minutes (Composio sessions may last ~5–15 min)

function readAmikoToken() {
  try {
    if (fs.existsSync(AMIKO_CONFIG_PATH)) {
      const raw = fs.readFileSync(AMIKO_CONFIG_PATH, "utf8");
      const data = JSON.parse(raw);
      const token = String(data.AMIKO_USER_TOKEN ?? "").trim();
      if (token) return token;
    }
  } catch (err) {
    console.warn("[composio-mcp-proxy] failed to read .amiko.json:", err?.message);
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
    ? `${process.env.AMIKO_PLATFORM_URL ?? ""}:${readAmikoToken().slice(0, 12)}`
    : "";
}

let sessionCache = { key: "", session: null, expiresAt: 0 };

async function getSession() {
  const platformUrl = process.env.AMIKO_PLATFORM_URL?.trim();
  if (!platformUrl) throw new Error("AMIKO_PLATFORM_URL is not set");

  const token = readAmikoToken();
  if (!token) throw new Error("AMIKO_USER_TOKEN not found in /data/.amiko.json or env");

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
  const platformUrl = process.env.AMIKO_PLATFORM_URL?.trim();
  if (!platformUrl) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Composio MCP proxy not configured (AMIKO_PLATFORM_URL)" }));
    return;
  }

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
  const platformUrl = process.env.AMIKO_PLATFORM_URL?.trim();
  if (!platformUrl) {
    console.log("[composio-mcp-proxy] AMIKO_PLATFORM_URL not set; proxy not started");
    return null;
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
