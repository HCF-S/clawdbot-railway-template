# syntax=docker/dockerfile:1.7

ARG OPENCLAW_IMAGE=ghcr.io/openclaw/openclaw:2026.4.2
ARG OPENCLAW_NPM_VERSION=2026.4.2

FROM node:24-bookworm AS amiko-plugin-build
ARG AMIKO_PLUGIN_REF=main
ARG OPENCLAW_NPM_VERSION

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

WORKDIR /build

RUN AMIKO_PLUGIN_REF="$AMIKO_PLUGIN_REF" node -e ' \
  const fs = require("node:fs"); \
  const ref = process.env.AMIKO_PLUGIN_REF; \
  const url = `https://github.com/HCF-S/openclaw-amiko-plugin/archive/${ref}.tar.gz`; \
  const out = "/tmp/amiko-plugin.tar.gz"; \
  (async () => { \
    for (let attempt = 1; attempt <= 5; attempt += 1) { \
      try { \
        const res = await fetch(url); \
        if (!res.ok) throw new Error(`HTTP ${res.status}`); \
        const buf = Buffer.from(await res.arrayBuffer()); \
        fs.writeFileSync(out, buf); \
        return; \
      } catch (err) { \
        if (attempt === 5) throw err; \
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000)); \
      } \
    } \
  })().catch((err) => { \
    console.error(`Failed to download ${url}: ${err}`); \
    process.exit(1); \
  });'

RUN mkdir -p /build/amiko-plugin \
  && tar -xzf /tmp/amiko-plugin.tar.gz --strip-components=1 -C /build/amiko-plugin

WORKDIR /build/amiko-plugin

RUN npm pkg set peerDependencies.openclaw="${OPENCLAW_NPM_VERSION}" devDependencies.openclaw="${OPENCLAW_NPM_VERSION}"
RUN pnpm install --no-frozen-lockfile
RUN pnpm run build
RUN rm -rf /build/amiko-plugin/node_modules/openclaw

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

COPY --from=amiko-plugin-build /build/amiko-plugin /openclaw/extensions/amiko

RUN npm install -g mcporter@0.7.3 @heyamiko/amiko-cli

EXPOSE 3000

CMD ["node", "src/server.js"]
