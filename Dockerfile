# Build openclaw from a pinned npm package version.
FROM node:22-bookworm AS openclaw-build

# Dependencies needed for dependency install (native addons may compile).
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /openclaw

# Pin OpenClaw package version.
ARG OPENCLAW_NPM_VERSION=2026.2.9
RUN set -eux; \
  npm pack "openclaw@${OPENCLAW_NPM_VERSION}"; \
  PKG_TGZ="$(ls -1 openclaw-*.tgz | head -n 1)"; \
  tar -xzf "${PKG_TGZ}" --strip-components=1 -C /openclaw; \
  rm -f openclaw-*.tgz; \
  pnpm install --prod --no-frozen-lockfile

# Runtime image
FROM node:22-bookworm
ENV NODE_ENV=production

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built openclaw
COPY --from=openclaw-build /openclaw /openclaw

# Provide an openclaw executable
RUN printf '%s\n' '#!/usr/bin/env bash' 'exec node /openclaw/dist/entry.js "$@"' > /usr/local/bin/openclaw \
  && chmod +x /usr/local/bin/openclaw

# Copy application files
COPY . .

# Install wrapper dependencies
RUN npm install --omit=dev && npm cache clean --force

# The wrapper listens on this port.
ENV OPENCLAW_PUBLIC_PORT=3000
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
