# syntax=docker/dockerfile:1.7

ARG OPENCLAW_IMAGE=ghcr.io/openclaw/openclaw:2026.4.2

FROM ${OPENCLAW_IMAGE}

USER root

ENV NODE_ENV=production \
  OPENCLAW_PUBLIC_PORT=3000 \
  PORT=3000 \
  HOME=/data \
  OPENCLAW_HOME=/data \
  OPENCLAW_ENTRY=/openclaw/openclaw.mjs

RUN if [ -d /app ] && [ ! -e /openclaw ]; then mv /app /openclaw; fi \
  && mkdir -p /app /data /home/node \
  && ln -sfn /data/.openclaw /home/node/.openclaw

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public

# Cache-bust: update this date to force fresh npm install
ARG NPM_CACHE_BUST=2026-04-17
RUN echo "cache-bust: ${NPM_CACHE_BUST}" && npm install -g mcporter@0.7.3 @heyamiko/amiko-cli@latest @heyamiko/openclaw-amiko@latest

EXPOSE 3000

CMD ["node", "src/server.js"]
