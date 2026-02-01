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
| `POST` | `/setup/api/run` | Core onboarding endpoint. Runs `openclaw onboard ...` with the selected `authChoice` + secret + flow, writes gateway auth (token, bind, port, trusted proxies), applies default model based on provider, and optionally writes Telegram/Discord/Slack config objects. | JSON body with keys `flow`, `authChoice`, `authSecret`, `telegramToken`, `discordToken`, `slackBotToken`, `slackAppToken`. |
| `GET` | `/setup/api/config/raw` | Returns the raw `openclaw.json` so the UI can edit it. | Response `{ ok, path, exists, content }`. |
| `POST` | `/setup/api/config/raw` | Overwrite the entire config. Creates a timestamped `.bak` of the previous file and restarts the gateway immediately. | Body `{ content: string }` (max `500000` chars). |

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
| `POST` | `/setup/api/console/run` | Runs a small allowlist of commands (`gateway.start`, `gateway.stop`, `gateway.restart`, plus a few CLI helpers such as `openclaw.version`, `openclaw.status`, `openclaw.health`, `openclaw.doctor`, `openclaw.logs.tail`, `openclaw.config.get`). The same CLI commands are used in the UI’s console panel. | Body `{ cmd, arg }` (arg optional for some commands). `gateway.*` commands restart/stop/start the local gateway process managed by the wrapper. |

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
