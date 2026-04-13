#!/usr/bin/env bash
set -euo pipefail

if [ -f ".env" ]; then
  set -a
  . ".env"
  set +a
fi

IMAGE_NAME="${IMAGE_NAME:-openclaw-railway-template}"
CONTAINER_NAME="${CONTAINER_NAME:-${IMAGE_NAME}-dev}"
PORT="${PORT:-3000}"
SETUP_PASSWORD="${SETUP_PASSWORD:-test}"
OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-your-gateway-token}"
DATA_DIR="${DATA_DIR:-$(pwd)/.tmpdata}"

# For init command: set in .env or pass when calling ./start-dev.sh init
OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-}"
AMIKO_USER_ID="${AMIKO_USER_ID:-}"
AMIKO_TWIN_ID="${AMIKO_TWIN_ID:-}"
AMIKO_TWIN_TOKEN="${AMIKO_TWIN_TOKEN:-${AMIKO_USER_TOKEN:-}}"

cmd="${1:-start}"

case "${cmd}" in
  start)
    # Must run from repo root (host dir is mounted at /app; OpenClaw runtime lives at /openclaw)
    if [ ! -f src/server.js ] || [ ! -f package.json ]; then
      echo "Error: Run ./start-dev.sh from the clawdbot-railway-template directory."
      exit 1
    fi
    npm install
    docker run --rm --name "${CONTAINER_NAME}" -p "${PORT}:3000" \
      -e HOME=/data \
      -e PORT=3000 \
      -e SETUP_PASSWORD="${SETUP_PASSWORD}" \
      -e OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN}" \
      -e OPENCLAW_HOME=/data \
      -e OPENCLAW_ENTRY=/openclaw/openclaw.mjs \
      -v "$(pwd):/app" \
      -v "${DATA_DIR}:/data" \
      -w /app \
      "${IMAGE_NAME}" \
      npm run dev
    ;;
  init)
    # Send POST /setup/api/init with authSecret and optional Amiko IDs (from .env)
    if [ -z "${OPENROUTER_API_KEY}" ]; then
      echo "Error: OPENROUTER_API_KEY required for init. Set in .env or: OPENROUTER_API_KEY=sk-... ./start-dev.sh init"
      exit 1
    fi
    body=$(OPENROUTER_API_KEY="${OPENROUTER_API_KEY}" AMIKO_USER_ID="${AMIKO_USER_ID}" AMIKO_TWIN_ID="${AMIKO_TWIN_ID}" AMIKO_TWIN_TOKEN="${AMIKO_TWIN_TOKEN}" node -e '
      const o = { authSecret: process.env.OPENROUTER_API_KEY };
      if (process.env.AMIKO_USER_ID) o.amikoUserId = process.env.AMIKO_USER_ID;
      if (process.env.AMIKO_TWIN_ID) o.amikoTwinId = process.env.AMIKO_TWIN_ID;
      if (process.env.AMIKO_TWIN_TOKEN) o.amikoTwinToken = process.env.AMIKO_TWIN_TOKEN;
      console.log(JSON.stringify(o));
    ')
    echo "[init] POST http://127.0.0.1:${PORT}/setup/api/init"
    curl -s -X POST "http://127.0.0.1:${PORT}/setup/api/init" \
      -H "Content-Type: application/json" \
      -H "x-api-token: ${SETUP_PASSWORD}" \
      -d "${body}"
    echo ""
    ;;
  config)
    # POST /setup/api/config/set with default openclaw config entries
    RAILWAY_PUBLIC_DOMAIN="${RAILWAY_PUBLIC_DOMAIN:-}"
    allowed_origins='["https://platform.heyamiko.com","https://amiko-platform.vercel.app","https://amiko-social-test.vercel.app","http://localhost:3000","http://localhost","http://127.0.0.1:3000","http://127.0.0.1","http://localhost:8080","http://127.0.0.1:8080","https://amiko-chat.up.railway.app"]'
    if [ -n "${RAILWAY_PUBLIC_DOMAIN}" ]; then
      allowed_origins=$(node -e "
        const arr = ${allowed_origins};
        arr.push('https://${RAILWAY_PUBLIC_DOMAIN}');
        arr.push('http://${RAILWAY_PUBLIC_DOMAIN}');
        console.log(JSON.stringify(arr));
      ")
    fi
    body=$(node -e "
      const entries = [
        ['gateway.trustedProxies', ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']],
        ['gateway.controlUi.dangerouslyDisableDeviceAuth', true],
        ['gateway.controlUi.allowedOrigins', ${allowed_origins}],
        ['tools.profile', 'full'],
        ['tools.allow', ['*']],
        ['tools.exec.host', 'gateway'],
        ['tools.exec.security', 'full'],
        ['tools.exec.ask', 'off'],
        ['tools.sessions.visibility', 'agent'],
        ['tools.message.allowCrossContextSend', true],
        ['tools.message.crossContext.allowAcrossProviders', true],
        ['agents.defaults.compaction.mode', 'safeguard'],
        ['agents.defaults.maxConcurrent', 4],
        ['agents.defaults.subagents.maxConcurrent', 8],
        ['messages.ackReactionScope', 'group-mentions'],
        ['commands.native', 'auto'],
        ['commands.nativeSkills', 'auto'],
        ['commands.restart', true],
        ['commands.ownerDisplay', 'raw'],
        ['plugins.allow', ['openclaw-amiko', 'telegram', 'signal', 'slack', 'openclaw-weixin', 'openui-claw-plugin']],
      ];
      console.log(JSON.stringify({ entries }));
    ")
    echo "[config] POST http://127.0.0.1:${PORT}/setup/api/config/set"
    curl -s -X POST "http://127.0.0.1:${PORT}/setup/api/config/set" \
      -H "Content-Type: application/json" \
      -H "x-api-token: ${SETUP_PASSWORD}" \
      -d "${body}"
    echo ""
    ;;
  stop)
    docker stop "${CONTAINER_NAME}"
    exit 0
    ;;
  build)
    docker image rm -f "${IMAGE_NAME}" || true
    # Force a fresh rebuild so Docker does not reuse cached git clone layers.
    docker build --pull --no-cache -t "${IMAGE_NAME}" .
    exit 0
    ;;
  *)
    echo "Usage: ./start-dev.sh [start|stop|build|init|config]"
    echo ""
    echo "  start  - Run container (default). Amiko IDs go via init, not env."
    echo "  init   - POST /setup/api/init with OPENROUTER_API_KEY, AMIKO_USER_ID, AMIKO_TWIN_ID, AMIKO_TWIN_TOKEN (from .env)"
    echo "  config - POST /setup/api/config/set with default openclaw config entries"
    echo "  stop   - Stop container"
    echo "  build  - Rebuild Docker image without Docker layer cache"
    exit 1
    ;;
esac
