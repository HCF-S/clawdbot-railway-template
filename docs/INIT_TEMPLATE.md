# Init flow (no template-based onboarding)

The wrapper **auto-runs onboard with a dummy OpenRouter key** at Docker start, so `.openclaw` is fully created. When the platform calls `POST /setup/api/init` with `authSecret` (real key), we replace the dummy key in `agents/main/agent/auth-profiles.json` and restart the gateway, then run Amiko sync + skill + SYS + version.

No OpenClaw config/workspace templates are needed; only **Amiko-related templates** are used:

## Amiko templates (`src/templates/workspace/`)

| File | Used by | Destination |
|------|---------|-------------|
| `AMIKO.md.tmpl` | Amiko twin sync (Handlebars) | `WORKSPACE_DIR/AMIKO.md` |
| `DOC.md.tmpl` | Amiko docs sync | `amiko-docs/*.md` |
| `MEMORIES.md.tmpl` | Amiko memories sync | `WORKSPACE_DIR/MEMORIES.md` |
| `SYS.md.tmpl` | installSysConfig (init) | `WORKSPACE_DIR/SYS.md` |

Rendering is done in `src/templates/render.js`. Workspace markdown (BOOTSTRAP.md, AGENTS.md, etc.) is created by `openclaw onboard` at startup.
