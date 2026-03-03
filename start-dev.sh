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
AMIKO_USER_TOKEN="${AMIKO_USER_TOKEN:-}"

cmd="${1:-start}"

case "${cmd}" in
  start)
    # Must run from repo root (host dir is mounted at /app; container uses its node_modules)
    if [ ! -f src/server.js ] || [ ! -f package.json ]; then
      echo "Error: Run ./start-dev.sh from the clawdbot-railway-template directory."
      exit 1
    fi
    npm install
    docker run --rm --name "${CONTAINER_NAME}" -p "${PORT}:3000" \
      -e PORT=3000 \
      -e SETUP_PASSWORD="${SETUP_PASSWORD}" \
      -e OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN}" \
      -e OPENCLAW_HOME=/data \
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
    body=$(OPENROUTER_API_KEY="${OPENROUTER_API_KEY}" AMIKO_USER_ID="${AMIKO_USER_ID}" AMIKO_TWIN_ID="${AMIKO_TWIN_ID}" AMIKO_USER_TOKEN="${AMIKO_USER_TOKEN}" node -e '
      const o = { authSecret: process.env.OPENROUTER_API_KEY };
      if (process.env.AMIKO_USER_ID) o.amikoUserId = process.env.AMIKO_USER_ID;
      if (process.env.AMIKO_TWIN_ID) o.amikoTwinId = process.env.AMIKO_TWIN_ID;
      if (process.env.AMIKO_USER_TOKEN) o.amikoTwinToken = process.env.AMIKO_USER_TOKEN;
      console.log(JSON.stringify(o));
    ')
    echo "[init] POST http://127.0.0.1:${PORT}/setup/api/init"
    curl -s -X POST "http://127.0.0.1:${PORT}/setup/api/init" \
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
    docker build -t "${IMAGE_NAME}" .
    exit 0
    ;;
  *)
    echo "Usage: ./start-dev.sh [start|stop|build|init]"
    echo ""
    echo "  start  - Run container (default). Amiko IDs go via init, not env."
    echo "  init   - POST /setup/api/init with OPENROUTER_API_KEY, AMIKO_USER_ID, AMIKO_TWIN_ID, AMIKO_USER_TOKEN (from .env)"
    echo "  stop   - Stop container"
    echo "  build  - Rebuild Docker image"
    exit 1
    ;;
esac
