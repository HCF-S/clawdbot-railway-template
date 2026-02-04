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
AMIKO_TWIN_ID="${AMIKO_TWIN_ID:-}"
AMIKO_USER_TOKEN="${AMIKO_USER_TOKEN:-}"
DATA_DIR="${DATA_DIR:-$(pwd)/.tmpdata}"

cmd="${1:-start}"

case "${cmd}" in
  start)
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
    echo "Usage: ./start-dev.sh [start|stop|build]"
    exit 1
    ;;
esac

docker run --rm --name "${CONTAINER_NAME}" -p "${PORT}:3000" \
  -e PORT=3000 \
  -e SETUP_PASSWORD="${SETUP_PASSWORD}" \
  -e OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN}" \
  -e AMIKO_TWIN_ID="${AMIKO_TWIN_ID}" \
  -e AMIKO_USER_TOKEN="${AMIKO_USER_TOKEN}" \
  -e OPENCLAW_STATE_DIR=/data/.openclaw \
  -e OPENCLAW_WORKSPACE_DIR=/data/workspace \
  -v "$(pwd):/app" \
  -v "${DATA_DIR}:/data" \
  -w /app \
  "${IMAGE_NAME}" \
  npm run dev
