# `/setup` API reference

All `/setup/*` endpoints require the `x-api-token` header (set to your `SETUP_PASSWORD`) once the wizard is running.

## Pool (pre-provisioned) instances

When creating **pooled** instances (unassigned, no user/twin yet), set only minimal env so the container can start and persist state under `/data`:

- **Required**: `OPENCLAW_HOME=/data` (or `OPENCLAW_STATE_DIR=/data/.openclaw`) so OpenClaw state lives on persistent storage.
- **Required for setup UI**: `SETUP_PASSWORD`, `OPENCLAW_GATEWAY_TOKEN`, `PORT` (e.g. `3000`), `OPENCLAW_PUBLIC_PORT`.
- **Do not set** at create time: `AMIKO_USER_ID`, `AMIKO_TWIN_ID`, `AMIKO_USER_TOKEN`, `OPENROUTER_API_KEY`. On first start the wrapper **auto-runs onboard with a dummy OpenRouter key** (`"test"`) so `.openclaw` is fully created and the gateway can start. When the instance is assigned to a user, the platform calls `POST /setup/api/init` with `authSecret` (user’s real OpenRouter key); the wrapper **replaces the dummy key** in `/data/.openclaw/agents/main/agent/auth-profiles.json` and restarts the gateway, then runs Amiko sync + skill + SYS + version. The browser / SPA stores the token in `localStorage` under `openclaw_setup_api_token`; other clients must set `x-api-token`. The only endpoint that still uses Basic auth is `GET /setup` itself.

## Health & static assets

| Method | Endpoint | Description | Notes |
| --- | --- | --- | --- |
| `GET` | `/setup/healthz` | Minimal heartbeat for Railway to confirm the wrapper is alive. | Returns `{ "ok": true }`. No auth. |
| `GET` | `/setup` | Serves the SPA (`public/setup.html` + `/setup/app.js`, etc.). | Protected by HTTP Basic (realm “OpenClaw Setup”). |

## Platform status

| Method | Endpoint | Description | Request body / response |
| --- | --- | --- | --- |
| `GET` | `/setup/api/status` | Reports whether the template is configured, gateway target URL and OpenClaw version, the available auth groups shown in the wizard, and the CLI’s `channels add --help` output so the UI knows which tokens to surface. | `{ configured, gatewayTarget, openclawVersion, channelsAddHelp, authGroups }` |
| `GET` | `/setup/api/debug` | Returns runtime info (Node version, state/workspace/config paths, persisted gateway token flag, Railway commit) plus `models status` info (current OpenClaw entry + whether Telegram is listed). | Large JSON object for debugging the wrapper. |
| `GET` | `/setup/api/prefill` | Reads `agents.defaults.model.primary`, guesses the provider group/auth choice, and returns saved channel tokens. Used by the SPA to pre-populate forms. | `{ modelPrimary, provider, authChoice, channels: { telegramToken, discordToken, slackBotToken, slackAppToken } }` |

## Onboarding and configuration

| Method | Endpoint | Description | Request body |
| --- | --- | --- | --- |
| `POST` | `/setup/api/init` | **Recommended.** Replace the dummy OpenRouter key created at startup with `authSecret`, optionally set the default model, and persist Amiko IDs/tokens for later sync, then restart the gateway and run Amiko sync + skill + SYS + version. When not configured (rare), runs full onboarding first and then the same steps. | JSON body `{ authSecret: string, model?: "provider/model", amikoUserId?: string, amikoTwinId?: string, amikoTwinToken?: string }`. `authSecret` = real OpenRouter API key. When provided, `amikoUserId`/`amikoTwinId`/`amikoTwinToken` are stored in the **main agent's workspace** as `workspace/.amiko.json` (per-agent config). |
| `POST` | `/setup/api/onboard` | Core onboarding endpoint (without Amiko sync). Runs `openclaw onboard ...` with the selected `authChoice` + secret + flow, writes gateway auth (token, bind, port, trusted proxies), applies default model based on provider, and optionally writes Telegram/Discord/Slack config objects. | JSON body with keys `flow`, `authChoice`, `authSecret`, `telegramToken`, `discordToken`, `slackBotToken`, `slackAppToken`. |
| `GET` | `/setup/api/config/raw` | Returns the raw `openclaw.json` so the UI can edit it. | Response `{ ok, path, exists, content }`. |
| `POST` | `/setup/api/config/raw` | Overwrite the entire config. Creates a timestamped `.bak` of the previous file and restarts the gateway immediately. | Body `{ content: string }` (max `500000` chars). |

## Amiko sync

| Method | Endpoint | Description | Request body / headers |
| --- | --- | --- | --- |
| `POST` | `/setup/api/amiko/pull` | Fetches twin data from the platform API and writes a markdown snapshot to `AMIKO.md` in the workspace. | Uses config from **workspace/.amiko.json** (per-agent), falling back to env if missing. |
| `POST` | `/setup/api/amiko/docs` | Trigger to sync all documents from the platform API. Automatically fetches all docs in batches (50 per batch) and writes markdown files to `amiko-docs/` folder. **Supports incremental sync** — only writes files that are new or updated (based on `updated_at`), skipping unchanged docs. | No body required. Uses config from **workspace/.amiko.json** (or env as fallback). Response includes `created`, `updated`, `skipped` counts. |
| `POST` | `/setup/api/amiko/memories` | **Optional.** Sync memories from the platform API to `amiko-memories.md`. Data quality may vary. | No body required. Uses config from **workspace/.amiko.json** (or env as fallback). |
| `POST` | `/setup/api/amiko/write` | Writes `.amiko.json` and `config/mcporter.json` to the agent's workspace using `writeAmikoConfigAndMcporter`. Workspace is resolved from `openclaw.json` per `agentId` (`agents.entries[agentId].workspace` or `agents.defaults.workspace`). Body: `{ agentId?, amikoUserId?, amikoTwinId?, amikoTwinToken?, amikoPlatformUrl? }`. | JSON body |

## Channel helpers

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/setup/api/channels/set` | Saves Telegram/Discord/Slack tokens into `channels.telegram`, `channels.discord`, `channels.slack`. Each block is written via `openclaw config set --json` and verified by a follow-up `config get`. |

## Pairing helpers

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/setup/api/pairing/pending?channel=<channel>` | Lists pending pairing codes for Telegram or Discord (delegates to `openclaw pairing list <channel>`). |
| `POST` | `/setup/api/pairing/approve` | Approves a pairing code (`openclaw pairing approve <channel> <code>`). Body must include `{ channel, code }`. |
| `GET` | `/setup/api/devices/list` | Lists pending node/device pairing requests via `openclaw devices list --json`. |
| `POST` | `/setup/api/devices/approve` | Approves a device pairing (`openclaw devices approve <requestId>`). Body `{ requestId }`. |

## Debug console

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/setup/api/console/run` | Runs a small allowlist of commands (`gateway.start`, `gateway.stop`, `gateway.restart`, plus CLI helpers such as `openclaw.version`, `openclaw.status`, `openclaw.health`, `openclaw.doctor`, `openclaw.logs.tail`, `openclaw.config.get`, and `print.envs` to dump wrapper env vars). The same commands back the UI console. | Body `{ cmd, arg }` (arg optional). Gateway auto-starts with the container; `gateway.start` / `gateway.stop` / `gateway.restart` control the in-process gateway (use Restart to apply config). |

## Model helpers

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/setup/api/models/list` | Returns `openclaw models list --json` so the UI can populate dropdowns. |
| `GET` | `/setup/api/models/status` | Returns `openclaw models status --json` describing the current default/fallback model and auth state. |
| `POST` | `/setup/api/models/set` | Runs `openclaw models set <model>` to switch the default model/provider. Body `{ model: "provider/model" }`. |

## Agents

| Method | Endpoint | Description | Request body |
| --- | --- | --- | --- |
| `POST` | `/setup/api/add-agent` | Runs `openclaw agents add <agentId>` in non-interactive mode. | `agentId` (required), `name` (required), `workspace` (optional, default `/data/.openclaw/workspace-${agentId}` when `OPENCLAW_HOME=/data`), `model` (optional), `agentDir` (optional), `bind` (optional, string or array e.g. `"whatsapp:+1234567890"`), `json` (optional boolean to request CLI JSON output). |

## Backup helpers

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/setup/import` | Uploads a `.tar.gz` backup (content type `application/gzip`), extracts it under `/data`, and restarts the gateway. Only permitted when both state/workspace are under `/data`. |
| `POST` | `/setup/api/import` | **Amiko import.** Accepts a ZIP (`Content-Type: application/zip`) with top-level `workspace/` and `sessions/` folders. Extracts into the target agent's dirs. Query: `agentId` (optional, default `main`) — use the twin's `openclaw_agent_id` for reused instances so import goes to that agent's workspace and sessions (e.g. `workspace-{agentId}`, `agents/{agentId}/sessions/`). Auth: `x-api-token` (setup password). |
| `GET` | `/setup/api/export` | Streams a `.tar.gz` of the state/workspace dirs, with `Content-Disposition` forcing a download. |

## Gateway helpers

The gateway **auto-starts when the container starts** (when the wrapper is configured). The setup service only connects to it; use Restart to apply config changes.

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/setup/api/gateway/restart` | Restarts the gateway process (e.g. to apply config changes). Gateway is started automatically with the container. |

## Skills

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/setup/api/deploy/amiko-skill` | Install/update the Amiko skill to `skills/amiko/` in the workspace. See Deploy section for details. |
| `POST` | `/setup/api/deploy/composio-skill` | Install/update the Composio skill to `skills/composio/` (SKILL.md and docs). Does **not** set `COMPOSIO_*` on the instance; the Composio MCP proxy runs on `127.0.0.1:3099` when `AMIKO_PLATFORM_URL` is set. |

## File Management

These endpoints provide direct read/write access to files within `/data`. All paths are relative to `/data` and directory traversal is prevented.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/setup/api/files/list?path=/` | List files and directories. Returns items with name, type, size, mtime. |
| `GET` | `/setup/api/files/read?path=workspace/AMIKO.md` | Read a file's content. Returns content as utf8 or base64 (for binary). Max 10MB. |
| `POST` | `/setup/api/files/write` | Write/replace a file. Body: `{ path, content, encoding?, mkdir? }`. Creates parent dirs by default. |
| `DELETE` | `/setup/api/files/delete?path=...` | Delete a file or empty directory. |
| `POST` | `/setup/api/files/mkdir` | Create a directory. Body: `{ path }`. Creates recursively. |
| `GET` | `/setup/api/files/stat?path=...` | Get file/directory stats (exists, isFile, isDirectory, size, mtime). |

### File Write Request Format
```json
{
  "path": "workspace/custom/myfile.txt",
  "content": "File content here",
  "encoding": "utf8",
  "mkdir": true
}
```

- `encoding`: `"utf8"` (default) or `"base64"` for binary files
- `mkdir`: `true` (default) to create parent directories if needed

### Example Usage

```bash
# List workspace contents
curl -X GET "https://your-instance/setup/api/files/list?path=workspace" \
  -H "x-api-token: YOUR_TOKEN"

# Read a file
curl -X GET "https://your-instance/setup/api/files/read?path=workspace/AMIKO.md" \
  -H "x-api-token: YOUR_TOKEN"

# Write a file
curl -X POST "https://your-instance/setup/api/files/write" \
  -H "x-api-token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path": "workspace/custom/test.md", "content": "# Hello\n\nThis is a test."}'

# Delete a file
curl -X DELETE "https://your-instance/setup/api/files/delete?path=workspace/custom/test.md" \
  -H "x-api-token: YOUR_TOKEN"
```

## Version Management

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/setup/api/version` | Get the current and installed setup versions. Returns `currentVersion` (code version), `installedVersion` (persisted in `/data/.setup-version`), and `needsUpgrade` flag. |
| `POST` | `/setup/api/version/set` | Manually set the installed version. Body: `{ "version": "x.y.z" }` (optional, defaults to current). |

### Version Response Format
```json
{
  "ok": true,
  "currentVersion": "1.0.0",
  "installedVersion": "1.0.0",
  "needsUpgrade": false
}
```

The platform can use this to:
1. Query all Clawd instances for their version
2. Identify instances that need upgrades (`needsUpgrade: true`)
3. Call appropriate deploy endpoints
4. Version is automatically updated after `/init` or `/deploy/all`

## Deploy (Platform Push Updates)

These endpoints allow the platform to push updates to existing instances without re-running full initialization. Useful for upgrading instances that were initialized before certain features existed.

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/setup/api/deploy/amiko-skill` | Deploy/update the Amiko skill to an existing instance. Copies the latest skill files to `skills/amiko/`. |
| `POST` | `/setup/api/deploy/composio-skill` | Deploy/update the Composio skill: installs `SKILL.md` to `skills/composio/`. The Composio MCP proxy runs on `http://127.0.0.1:3099` when `AMIKO_PLATFORM_URL` is set. OpenClaw accesses it through the composio skill's meta tools. |
| `POST` | `/setup/api/deploy/sys` | Deploy/update `SYS.md` and `/data/sys/` structure for system persistence. Creates the persistence directories and files if they don't exist. |

### Connecting OpenClaw to the Composio MCP proxy (optional)

OpenClaw accesses Composio through the composio skill's meta tools (COMPOSIO_SEARCH_TOOLS, etc.) which talk to the local MCP proxy at `http://127.0.0.1:3099`. No config changes to `openclaw.json` are needed.

If you need to configure the bridge by hand (e.g. for a custom setup using the openclaw-mcp-bridge plugin):

**Config location:** OpenClaw reads `openclaw.json` from the state directory. When `OPENCLAW_HOME=/data` or `OPENCLAW_STATE_DIR=/data/.openclaw`, the file is `/data/.openclaw/openclaw.json` (or `~/.clawdbot/clawdbot.json5` on newer installs).

**Official docs:** [Mcp Bridge – OpenClaw Plugin](https://openclawdir.com/plugins/mcp-bridge-1volrr) (config format, fields, and behavior).

**Add the Composio server** under the plugin’s `servers` array. Example merge into existing `openclaw.json`:

```json
{
  "plugins": {
    "enabled": true,
    "entries": {
      "openclaw-mcp-bridge": {
        "config": {
          "servers": [
            {
              "name": "composio",
              "url": "http://127.0.0.1:3099",
              "prefix": "composio",
              "healthCheck": true
            }
          ],
          "timeout": 30000,
          "retries": 1
        }
      }
    }
  }
}
```

- **url:** Composio MCP server URL. When using the Amiko platform integration, this should be the Amiko web app endpoint `https://platform.heyamiko.com/api/agents/<twinId>/mcp` (or your custom Amiko base URL).
- **prefix:** Tool name prefix (e.g. `composio_search_emails`). Change if you prefer another prefix.
- **healthCheck:** Optional; if `true`, the bridge checks the server at startup and skips it if down.

**Ways to apply config:**

1. **Edit via setup API:** Use `GET /setup/api/config/raw` to read the current `openclaw.json`, merge in the `plugins.entries["openclaw-mcp-bridge"]` block above (or add the Composio entry to an existing `servers` array), then `POST /setup/api/config/raw` with the full updated JSON. Restart the gateway (e.g. `POST /setup/api/gateway/restart` or Restart in the setup UI).
2. **Write file directly:** If you have filesystem access to the instance, edit `/data/.openclaw/openclaw.json` (or the state dir in use), add the block, then restart the gateway.
3. **Platform automation:** From the Amiko platform, you can use the setup API to read config, inject the Composio MCP server entry, write it back, and restart the gateway so the Clawd gets Composio tools without manual steps.

After restart, the bridge will call `tools/list` on the configured Composio MCP server URL and register the Composio tools with the chosen prefix.
| `POST` | `/setup/api/deploy/amiko-data` | Re-sync Amiko data (twin info + docs) to an existing instance. Same as calling `/amiko/pull` + `/amiko/docs`. |
| `POST` | `/setup/api/deploy/memories` | **Optional.** Sync memories to `amiko-memories.md`. Separate endpoint because data quality may vary. |
| `POST` | `/setup/api/deploy/all` | Deploy all updates at once: amiko-data + amiko-skill + sys config. **Automatically updates version** after successful deployment. Body: `{ includeMemories?: boolean }` to optionally include memories sync. |

### Deploy Response Format

All deploy endpoints return:
```json
{
  "ok": true,
  "message": "Description of what was deployed",
  "output": "Detailed log output"
}
```

The `/deploy/all` endpoint returns additional `results` object showing status of each component:
```json
{
  "ok": true,
  "message": "All updates deployed successfully",
  "results": {
    "amikoData": { "ok": true },
    "amikoSkill": { "ok": true, "path": "/data/workspace/skills/amiko", "files": 3 },
    "sys": { "ok": true }
  },
  "output": "..."
}
```

### Amiko Skill Features

The Amiko skill (`skills/amiko/`) provides:

- **Voice Generation** - Generate speech using your twin's cloned voice via ElevenLabs
- **Twin Info** - Fetch your twin's profile from the Amiko platform
- **Document Listing** - List training documents associated with your twin

Example CLI usage (from workspace):
```bash
# Generate voice
skills/amiko/cli.js voice "Hello, I am your digital twin!"

# Save voice to file
skills/amiko/cli.js voice "Hello world" --output hello.mp3

# Get twin info
skills/amiko/cli.js info

# List documents
skills/amiko/cli.js docs --limit 10
```
