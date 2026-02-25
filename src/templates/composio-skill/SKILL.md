---
name: composio
description: Composio tools (Gmail, Google Calendar, Calendly, etc.) via Amiko platform session proxy
homepage: https://composio.dev
metadata: {"openclaw":{"emoji":"📧","mcp":{"url":"http://127.0.0.1:3099"}}}
---

# Composio Skill

This skill exposes **Composio** tools to your agent via a local MCP proxy. The proxy uses your Amiko user token to obtain a short-lived Composio session from the platform—no API key is stored on this instance.

## How it works

- The wrapper runs a **Composio MCP proxy** on `http://127.0.0.1:3099` when `AMIKO_PLATFORM_URL` is set (e.g. after you enable Composio for this Clawd from the Amiko platform).
- The proxy fetches a session from the platform (`GET /api/composio-mcp/session`) using the token in the main workspace's `.amiko.json`, then forwards MCP requests to Composio’s session URL.
- **OpenClaw** can connect to this proxy as an MCP server so the agent can use Composio tools.

## MCP server URL

Use this URL in your OpenClaw MCP / mcp-bridge configuration:

- **URL:** `http://127.0.0.1:3099`

Port can be overridden with `COMPOSIO_MCP_PROXY_PORT` (default `3099`).

## Available toolkits (examples)

Once connected, the agent can use tools from Composio toolkits such as:

- **Gmail** – Read, send, search email
- **Google Calendar** – List and create events
- **Calendly** – Scheduling and availability
- **Slack**, **Notion**, and others (depending on platform configuration)

Exact tools depend on which apps you’ve connected in the Amiko platform Composio integration.

## Requirements

- **AMIKO_PLATFORM_URL** – Set by the platform when Composio is activated for this instance.
- **AMIKO_USER_TOKEN** – Stored in **workspace/.amiko.json** (per-agent; written by `/setup/api/init` or `/setup/api/amiko/write-all`).

No `COMPOSIO_API_KEY` or `COMPOSIO_ENTITY_ID` is required on this instance; the platform holds the API key and creates sessions per user.

## Troubleshooting

- If the proxy is not listening, ensure Composio was enabled for this Clawd from the Amiko platform (so `AMIKO_PLATFORM_URL` is set) and the instance was restarted or env vars applied.
- On 401/403 from Composio, the proxy clears its session cache; the next request will fetch a new session automatically.
- Read `skills/composio/SKILL.md` (this file) from the workspace for agent-facing documentation.

## Using mcporter inside this container

This container includes the **mcporter** CLI preinstalled globally. When the Composio skill is deployed, a mcporter config file is created at **workspace `config/mcporter.json`** with the Composio MCP proxy registered as the named server **`composio`**. Run mcporter from the workspace directory (or with `--root` pointing at the workspace) so it picks up that config.

### Use the named `composio` MCP server

- **List all configured servers (including composio):**  
  `mcporter list`
- **List Composio tools:**  
  `mcporter list composio`
- **Call a Composio tool:**  
  `mcporter call composio.tool_name arg:value`

Example:

```bash
cd /data   # or your workspace root
mcporter list composio
mcporter call composio.some_tool_name arg1:value1
```

Config location: `config/mcporter.json` in the workspace (created/updated when this skill is deployed). For more mcporter options (ad‑hoc URLs, OAuth, TypeScript clients), see the upstream MCPorter documentation.

---

**Status:** Use MCP URL `http://127.0.0.1:3099` in OpenClaw to enable Composio tools.
