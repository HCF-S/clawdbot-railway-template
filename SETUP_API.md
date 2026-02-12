# `/setup` API reference

All `/setup/*` endpoints require the `x-api-token` header (set to your `SETUP_PASSWORD`) once the wizard is running. The browser / SPA stores the token in `localStorage` under `openclaw_setup_api_token` and sets it automatically; other clients must set `x-api-token`. The only endpoint that still uses Basic auth is `GET /setup` itself, which serves the static SPA.

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
| `POST` | `/setup/api/init` | **Recommended.** Full initialization endpoint that combines onboarding + Amiko data sync + skill installation. Runs the onboarding process, syncs twin data (`AMIKO.md`) and documents (`amiko-docs/`), and installs the Amiko skill (`skills/amiko/`). | Same as `/run`: JSON body with keys `flow`, `authChoice`, `authSecret`, `telegramToken`, `discordToken`, `slackBotToken`, `slackAppToken`. |
| `POST` | `/setup/api/run` | Core onboarding endpoint (without Amiko sync). Runs `openclaw onboard ...` with the selected `authChoice` + secret + flow, writes gateway auth (token, bind, port, trusted proxies), applies default model based on provider, and optionally writes Telegram/Discord/Slack config objects. | JSON body with keys `flow`, `authChoice`, `authSecret`, `telegramToken`, `discordToken`, `slackBotToken`, `slackAppToken`. |
| `GET` | `/setup/api/config/raw` | Returns the raw `openclaw.json` so the UI can edit it. | Response `{ ok, path, exists, content }`. |
| `POST` | `/setup/api/config/raw` | Overwrite the entire config. Creates a timestamped `.bak` of the previous file and restarts the gateway immediately. | Body `{ content: string }` (max `500000` chars). |

## Amiko sync

| Method | Endpoint | Description | Request body / headers |
| --- | --- | --- | --- |
| `POST` | `/setup/api/amiko/pull` | Fetches twin data from the platform API and writes a markdown snapshot to `AMIKO.md` in the workspace. | Uses `AMIKO_TWIN_ID` + `AMIKO_USER_TOKEN` from the container env. |
| `POST` | `/setup/api/amiko/docs` | Trigger to sync all documents from the platform API. Automatically fetches all docs in batches (50 per batch) and writes markdown files to `amiko-docs/` folder. **Supports incremental sync** — only writes files that are new or updated (based on `updated_at`), skipping unchanged docs. | No body required. Uses `AMIKO_TWIN_ID` + `AMIKO_USER_TOKEN` from env. Response includes `created`, `updated`, `skipped` counts. |
| `POST` | `/setup/api/amiko/memories` | **Optional.** Sync memories from the platform API to `amiko-memories.md`. Data quality may vary. | No body required. Uses `AMIKO_TWIN_ID` + `AMIKO_USER_TOKEN` from env. |

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
| `POST` | `/setup/api/console/run` | Runs a small allowlist of commands (`gateway.start`, `gateway.stop`, `gateway.restart`, plus CLI helpers such as `openclaw.version`, `openclaw.status`, `openclaw.health`, `openclaw.doctor`, `openclaw.logs.tail`, `openclaw.config.get`, and `print.envs` to dump wrapper env vars). The same commands back the UI console. | Body `{ cmd, arg }` (arg optional). `gateway.*` toggles the wrapper gateway process. |

## Model helpers

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/setup/api/models/list` | Returns `openclaw models list --json` so the UI can populate dropdowns. |
| `GET` | `/setup/api/models/status` | Returns `openclaw models status --json` describing the current default/fallback model and auth state. |
| `POST` | `/setup/api/models/set` | Runs `openclaw models set <model>` to switch the default model/provider. Body `{ model: "provider/model" }`. |

## Backup helpers

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/setup/import` | Uploads a `.tar.gz` backup (content type `application/gzip`), extracts it under `/data`, and restarts the gateway. Only permitted when both state/workspace are under `/data`. |
| `GET` | `/setup/api/export` | Streams a `.tar.gz` of the state/workspace dirs, with `Content-Disposition` forcing a download. |

## Gateway helpers

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/setup/api/gateway/restart` | Restarts the gateway process managed by the wrapper. |

## Skills

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/setup/api/deploy/amiko-skill` | Install/update the Amiko skill to `skills/amiko/` in the workspace. See Deploy section for details. |

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
| `POST` | `/setup/api/deploy/sys` | Deploy/update `SYS.md` and `/data/sys/` structure for system persistence. Creates the persistence directories and files if they don't exist. |
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
