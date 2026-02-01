#!/usr/bin/env bash
set -euo pipefail

if [ -f ".env" ]; then
  set -a
  . ".env"
  set +a
fi

IMAGE_NAME="${IMAGE_NAME:-openclaw-railway-template}"
PORT="${PORT:-8080}"
SETUP_PASSWORD="${SETUP_PASSWORD:-test}"
OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-your-gateway-token}"
AMIKO_TWIN_ID="${AMIKO_TWIN_ID:-}"
AMIKO_USER_TOKEN="${AMIKO_USER_TOKEN:-}"
DATA_DIR="${DATA_DIR:-$(pwd)/.tmpdata}"

docker run --rm -p "${PORT}:8080" \
  -e PORT=8080 \
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
