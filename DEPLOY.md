# Deploying Clawdbot Instances

Pushing or merging to `main` **does not** trigger automatic deployment. Deployments must be run manually from your local machine.

## Version tracking

The version is read from `package.json` and exposed via `GET /setup/api/version`. The audit script uses this to report which version each instance is running.

**Before deploying**, bump the version in `package.json`:

```json
{
  "name": "openclaw-railway-template",
  "version": "1.0.3",
  ...
}
```

Use [semver](https://semver.org/): `MAJOR.MINOR.PATCH` (e.g. `1.0.2` → `1.0.3` for a patch, `1.1.0` for a minor change).

## Audit and CSV (for version-based deploy)

To deploy only instances that are **not** on a specific version, you need an audit CSV. Generate it from the **amiko-platform** repo:

```bash
cd amiko-platform/amiko-web
pnpm run audit-clawd-data
```

This audits all Clawd instances (via the setup files API) and writes:

- `scripts/logs/audit-clawd-data-YYYY-MM-DDTHHmmss.csv`

Options:

- `--name "my-instance"` — Audit a single instance
- `--json` — Machine-readable JSON only (no CSV)

Then use the CSV with the deploy script:

```bash
# Deploy only services NOT on version 1.0.1
python3 deploy-all-sandbox-projects.py --version 1.0.1 --csv /path/to/amiko-platform/amiko-web/scripts/logs/audit-clawd-data-2025-03-04T120000.csv
```

## Prerequisites

1. **Install the Railway CLI**
   ```bash
   npm install -g @railway/cli
   # or
   brew install railway
   ```

2. **Authenticate**
   ```bash
   railway login
   ```
   Follow the browser prompt to complete auth.

## Deploy All Sandbox Instances

From the repo root:

```bash
python3 deploy-all-sandbox-projects.py
```

This deploys all clawdbot services in sandbox projects via `railway up`.

### Options

| Option | Description |
| --- | --- |
| `--dry-run` | Show what would be deployed without deploying |
| `--name <name>` | Only deploy this service (exact match) |
| `--skip-recent` | Skip instances with a recent successful deployment (within 1h) |
| `--all` | Include all projects, not just sandbox |
| `--version X --csv PATH` | Only deploy services NOT on version X (requires audit CSV) |

### Examples

```bash
# Deploy everything
python3 deploy-all-sandbox-projects.py

# Dry run first
python3 deploy-all-sandbox-projects.py --dry-run

# Deploy a single instance
python3 deploy-all-sandbox-projects.py --name clawdbot-abc123

# Skip recently deployed instances
python3 deploy-all-sandbox-projects.py --skip-recent

# Deploy only instances NOT on a specific version (requires audit CSV from amiko-web)
python3 deploy-all-sandbox-projects.py --version 1.0.1 --csv ../amiko-platform/amiko-web/scripts/logs/audit-clawd-data-2025-03-04T120000.csv
```

## Upgrade a skill (amiko / composio)

After deploying clawdbot, you can push skill updates (SKILL.md, lib.js, cli.js, etc.) to all instances **without** redeploying the full app. Use the `deploy-skill-via-files` script from **amiko-platform**:

```bash
cd amiko-platform/amiko-web
pnpm run deploy-skill-via-files -- --skill amiko --template ../../clawdbot-railway-template/src/templates/amiko-skill
pnpm run deploy-skill-via-files -- --skill composio --template ../../clawdbot-railway-template/src/templates/composio-skill
```

This copies each file from the local template folder to `/data/.openclaw/skills/<skill>/` on every Clawd instance (via the setup files API).

| Option | Description |
| --- | --- |
| `--skill amiko\|composio` | Skill to deploy (required) |
| `--template <path>` | Local path to skill template folder (required) |
| `--name <filter>` | Only deploy to services whose name contains this string |
| `DRY_RUN=1` | Show what would be written without making changes |

Examples:

```bash
# Deploy amiko skill to all instances
pnpm run deploy-skill-via-files -- --skill amiko --template ../../clawdbot-railway-template/src/templates/amiko-skill

# Deploy to a single instance
pnpm run deploy-skill-via-files -- --skill amiko --template ../../clawdbot-railway-template/src/templates/amiko-skill --name "clawdbot-sophiee"

# Dry run
DRY_RUN=1 pnpm run deploy-skill-via-files -- --skill amiko --template ../../clawdbot-railway-template/src/templates/amiko-skill
```

See `amiko-platform/amiko-web/scripts/clawds/deploy-skill-via-files.ts` for the script source.
