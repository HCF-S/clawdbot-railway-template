---
name: composio
description: Composio tools (Gmail, Google Calendar, Calendly, etc.) via Amiko platform MCP proxy on the Amiko web app
homepage: https://composio.dev
metadata: {"openclaw":{"emoji":"📧","mcp":{"url":"amiko-web-mcp"}}}
---

# Composio Skill

This skill exposes **Composio** tools to your agent via the Amiko platform's MCP endpoint. The platform uses your twin-scoped Clawd token to obtain short-lived Composio sessions—no Composio API key is stored on this instance.

## How it works

- The wrapper writes a `config/mcporter.json` file in the workspace that points the `composio` MCP server to the Amiko web app's endpoint `/api/agents/:id/mcp`.
- The endpoint is authenticated with a **Clawd twin token** sent in the `Authorization: Bearer ...` header, sourced from the workspace `.amiko.json`.
- **OpenClaw** (via mcporter) connects directly to this Amiko endpoint as an MCP server so the agent can use Composio tools.

## MCP server URL

Use this URL in your OpenClaw MCP / mcp-bridge configuration (the wrapper will also write it into `config/mcporter.json`):

- **URL:** `https://platform.heyamiko.com/api/agents/<twinId>/mcp` (or your Amiko web base URL)

## Available toolkits (examples)

Once connected, the agent can use tools from Composio toolkits such as:

- **Gmail** – Read, send, search email
- **Google Calendar** – List and create events
- **Slack** – Read and send messages
- **GitHub** – Repos, issues, PRs
- **Spotify** – Playback, playlists
- **Google Sheets** – Read and write spreadsheets
- **Calendly** – Scheduling and availability
- **Notion**, **Discord**, **Linear**, and others (depending on platform configuration)

Exact tools depend on which apps you've connected in the Amiko platform Composio integration.

## Check connected services

To see which services are actually connected for this twin, run:

```bash
/data/.openclaw/skills/amiko/cli.js composio:connections
```

This returns the authoritative list of connected services with their status. **Always use this command** when the user asks what services/tools are connected, rather than just listing MCP tools.

## Requirements

- **AMIKO_PLATFORM_URL** – Set by the platform when Composio is activated for this instance.
- **AMIKO_TWIN_TOKEN** – Stored in **workspace/.amiko.json** (per-agent; written by `/setup/api/init` or `/setup/api/amiko/write`).

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
cd /data/.openclaw/workspace   # main workspace (or workspace-{agentId} for other agent)
mcporter list composio
mcporter call composio.some_tool_name arg1:value1
```

Config location: `config/mcporter.json` in the workspace (created/updated when this skill is deployed). For more mcporter options (ad‑hoc URLs, OAuth, TypeScript clients), see the upstream MCPorter documentation.

