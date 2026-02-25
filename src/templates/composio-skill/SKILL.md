---
name: composio
description: Connects the agent to Composio tools (Gmail, Google Calendar, Calendly, etc.) via an MCP server.
homepage: https://composio.dev
metadata:
  { "openclaw": { "emoji": "📧", "mcp": { "url": "http://127.0.0.1:3099" } } }
---

# Composio MCP Skill

This skill grants you access to various external applications via the **Composio** platform. You will connect to these tools through a local Model Context Protocol (MCP) server that acts as a proxy.

## Connection Details

To use Composio tools, route your MCP requests to the following local proxy server:

- **Default MCP Server URL:** `http://127.0.0.1:3099`

> **Note:** If the environment variable `COMPOSIO_MCP_PROXY_PORT` is set, replace `3099` with that custom port. Otherwise, assume the default URL.

## Available Capabilities

By connecting to this MCP server, you can interface with any apps the user has authenticated with via Composio. Depending on the user's setup, this may include:

- **Gmail:** Read, search, and send emails.
- **Google Calendar:** List schedules, check availability, and create events.
- **Calendly:** Manage scheduling links and availability.
- **Slack / Notion:** Read and write workspace data.

_When a user asks you to perform a task involving third-party apps, immediately check this MCP server for the relevant available tools._

## ⚠️ Important Agent Directives

1.  **Zero-Auth Required:** Do **not** ask the user for a `COMPOSIO_API_KEY`, `AMIKO_PLATFORM_URL`, or any auth tokens. The local proxy automatically handles all session management and authentication in the background.
2.  **Troubleshooting:** If an action fails with a 401/403 error, the proxy will automatically clear its cache and fetch a new session. Simply retry your request.
3.  **Scope:** Focus solely on calling the available tools exposed at the MCP URL. Do not attempt to interact with the Amiko platform's backend APIs.

---

**Status:** Ready. Use `http://127.0.0.1:3099` to access Composio tools.
