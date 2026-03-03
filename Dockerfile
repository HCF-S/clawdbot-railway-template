FROM node:22-bookworm
ENV NODE_ENV=production

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Pin OpenClaw package version. Global install puts it in npm root; server resolves via OPENCLAW_ENTRY or fallbacks.
ARG OPENCLAW_NPM_VERSION=2026.3.1
RUN npm install -g "openclaw@${OPENCLAW_NPM_VERSION}"

# Server resolves entry via OPENCLAW_ENTRY; default global path in node:22
ENV OPENCLAW_ENTRY=/usr/local/lib/node_modules/openclaw/dist/entry.js

WORKDIR /app

# Copy application files
COPY . .

# Install wrapper dependencies
RUN npm install --omit=dev && npm cache clean --force

RUN npm install -g mcporter@0.7.3

# The wrapper listens on this port.
ENV OPENCLAW_PUBLIC_PORT=3000
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
