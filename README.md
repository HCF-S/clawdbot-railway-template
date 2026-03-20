# Clawdbot Railway Template

Deploy a personal **OpenClaw** AI gateway on Railway in one click — no commands, no config files, no DevOps.

## What you get

- **OpenClaw gateway** running at `/` — your personal AI proxy with memory, skills, and chat integrations
- **Setup wizard** at `/setup` — browser-based onboarding, no terminal required
- **Amiko integration** — syncs your twin data, documents, and skills automatically on init
- **Persistent state** via Railway Volume — config, memory, and credentials survive redeploys
- **Export / Import backup** from `/setup` for migration or recovery
- **Setup API** at `/setup/api/*` for programmatic control (see [SETUP_API.md](./SETUP_API.md))

## Quick start

1. Click **Deploy on Railway** (or use the Railway Template Composer with this repo)
2. Add a **Volume** mounted at `/data`
3. Set the required environment variables (see below)
4. Enable **Public Networking** — Railway assigns a domain automatically
5. Deploy, then visit `https://<your-app>.up.railway.app/setup` to complete onboarding

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `SETUP_PASSWORD` | ✅ | Password to access `/setup` |
| `OPENCLAW_GATEWAY_TOKEN` | Optional | Auth token for the gateway. Auto-generated if not set — use a Railway secret for templates |

State and workspace paths are hardcoded: `/data/.openclaw` (state), `/data/.openclaw/workspace` (main agent), `/data/.openclaw/workspace-{agentId}` (other agents). No env overrides.

> The template pins OpenClaw to a known-good version via the `OPENCLAW_GIT_REF` Docker build arg.

## Chat integrations

### Telegram
1. Message **@BotFather** on Telegram
2. Run `/newbot` and follow the prompts
3. Copy the token (`123456789:AA...`) and paste it into `/setup`

### Discord
1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. **New Application** → **Bot** tab → **Add Bot** → copy the token
3. Paste into `/setup`
4. Invite the bot via OAuth2 URL Generator (scopes: `bot`, `applications.commands`)

### Slack
Generate a Bot Token and App Token from [api.slack.com/apps](https://api.slack.com/apps) and paste both into `/setup`.

## Setup API

The `/setup/api/*` endpoints allow programmatic control of the gateway — onboarding, config, model selection, Amiko sync, backup/restore, and more.

See **[SETUP_API.md](./SETUP_API.md)** for the full reference.

## Deployment

Push/merge to `main` does **not** trigger auto deploy. To deploy sandbox instances locally, use `python3 deploy-all-sandbox-projects.py`. See **[DEPLOY.md](./DEPLOY.md)** for prerequisites (Railway CLI, auth) and options.

## Local development

```bash
# Start with auto-restart on file changes
./start-dev.sh

# Init (POST /setup/api/init with OPENROUTER_API_KEY, AMIKO_* from .env)
./start-dev.sh init

# Stop
./start-dev.sh stop

# Rebuild image without Docker layer cache
./start-dev.sh build
```

Or manually:

```bash
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e SETUP_PASSWORD=test \
  -e OPENCLAW_GATEWAY_TOKEN=your-gateway-token \
  -v $(pwd):/app \
  -v $(pwd)/.tmpdata:/data \
  -w /app \
  openclaw-railway-template \
  npm run dev
```

## How it works

- A Node.js wrapper server handles `/setup` (protected by `SETUP_PASSWORD`) and proxies everything else to the OpenClaw gateway process
- On first setup, `/setup/api/init` runs onboarding, syncs Amiko twin data and documents, and installs skills
- After setup, the gateway runs at `/` with full WebSocket support
- All state is written to the Railway Volume so it persists across redeploys and restarts


