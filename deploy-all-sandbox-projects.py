#!/usr/bin/env python3
"""
Deploy clawdbot instances via `railway up`. Combines deploy-all-sandbox-projects
and deploy-non-101-instances with flexible filtering.

Usage:
  python deploy-all-sandbox-projects.py
  python deploy-all-sandbox-projects.py --version 1.0.1 --csv /path/to/audit.csv
  python deploy-all-sandbox-projects.py --skip-recent
  python deploy-all-sandbox-projects.py --name clawdbot-abc123
  python deploy-all-sandbox-projects.py --dry-run

Options:
  --version X     Only deploy services NOT on this version (requires --csv)
  --csv PATH      Path to audit CSV (required when using --version)
  --skip-recent   Skip instances with a recent successful deployment (within 1h)
  --name NAME     Only deploy this service (exact match)
  --all           Include all projects, not just sandbox
  --dry-run       Show what would be deployed without deploying
"""

import argparse
import csv
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MAX_SERVICES_PER_BATCH = 10
BATCH_DELAY_SEC = 180  # 3 minutes
RECENT_HOURS = 1
os.environ.setdefault("CI", "1")


def run_railway(*args, capture=True, timeout=60):
    cmd = ["railway"] + list(args)
    result = subprocess.run(
        cmd,
        cwd=SCRIPT_DIR,
        capture_output=capture,
        text=True,
        timeout=timeout,
        stdin=subprocess.DEVNULL,
    )
    return result


def link_project(proj_id, ws_id=None, first_svc=None):
    args = ["link", "--project", proj_id, "--environment", "production"]
    if ws_id:
        args.extend(["--workspace", ws_id])
    if first_svc:
        args.extend(["--service", first_svc])
    result = run_railway(*args)
    return result.returncode == 0


def get_projects_and_services(sandbox_only=True):
    result = run_railway("list", "--json")
    if result.returncode != 0:
        raise RuntimeError("railway list failed")
    data = json.loads(result.stdout)

    projects = []
    seen = set()
    for p in data:
        if sandbox_only and not p.get("name", "").startswith("sandbox"):
            continue
        if p["id"] in seen:
            continue
        seen.add(p["id"])
        ws_id = p.get("workspace", {}).get("id") or ""
        services = []
        for e in p.get("services", {}).get("edges", []):
            name = e["node"].get("name", "")
            if "clawdbot" in name:
                services.append(name)
        first_svc = services[0] if services else None
        if first_svc:
            projects.append({
                "id": p["id"],
                "name": p["name"],
                "ws_id": ws_id,
                "first_svc": first_svc,
                "services": services,
            })
    return projects


def get_deployment_status(service_name):
    result = run_railway(
        "deployment", "list", "--service", service_name, "--limit", "1", "--json"
    )
    if result.returncode != 0:
        return None, None
    try:
        deployments = json.loads(result.stdout)
        if not deployments:
            return None, None
        d = deployments[0]
        return d.get("status"), d.get("createdAt")
    except (json.JSONDecodeError, IndexError, TypeError):
        return None, None


def has_recent_success(service_name):
    """True if the latest deployment is SUCCESS and within 1 hour."""
    status, created_at = get_deployment_status(service_name)
    if status != "SUCCESS" or not created_at:
        return False
    try:
        created_ts = datetime.fromisoformat(
            created_at.replace("Z", "+00:00")
        ).timestamp()
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=RECENT_HOURS)).timestamp()
        return created_ts >= cutoff
    except Exception:
        return False


def parse_audit_csv(csv_path, exclude_version):
    """Return set of service names where version != exclude_version (or empty)."""
    targets = set()
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            version = (row.get("version") or "").strip()
            if version != exclude_version:
                name = (row.get("name") or "").strip()
                if name:
                    targets.add(name)
    return targets


def main():
    parser = argparse.ArgumentParser(
        description="Deploy clawdbot instances via railway up with optional filters."
    )
    parser.add_argument(
        "--version",
        metavar="X",
        help="Only deploy services NOT on this version (requires --csv)",
    )
    parser.add_argument(
        "--csv",
        metavar="PATH",
        help="Path to audit CSV (required when using --version)",
    )
    parser.add_argument(
        "--skip-recent",
        action="store_true",
        help="Skip instances with a recent successful deployment (within 1h)",
    )
    parser.add_argument(
        "--name",
        metavar="NAME",
        help="Only deploy this service (exact match)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Include all projects, not just sandbox",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be deployed without deploying",
    )
    args = parser.parse_args()

    if args.version and not args.csv:
        parser.error("--version requires --csv")
    if args.csv and not Path(args.csv).exists():
        print(f"Error: CSV not found: {args.csv}")
        sys.exit(1)

    version_filter = None
    if args.version and args.csv:
        version_filter = parse_audit_csv(args.csv, args.version)
        print(f"Version filter: deploy only services NOT on {args.version} ({len(version_filter)} from CSV)")

    print("Fetching projects and services...")
    projects = get_projects_and_services(sandbox_only=not args.all)
    total_services = sum(len(p["services"]) for p in projects)
    print(f"Found {len(projects)} projects, {total_services} clawdbot services\n")

    # Build list of (project, service) to deploy
    to_deploy = []
    for p in projects:
        for svc in p["services"]:
            if args.name and svc != args.name:
                continue
            if version_filter is not None and svc not in version_filter:
                continue
            to_deploy.append((p, svc))

    # Filter by --skip-recent (requires linking to each project)
    if args.skip_recent and to_deploy:
        print(f"Checking for recent successful deployments (within {RECENT_HOURS}h)...")
        still_to_deploy = []
        current_proj_id = None
        for p, svc in to_deploy:
            if p["id"] != current_proj_id:
                if not link_project(p["id"], p["ws_id"], p["first_svc"]):
                    still_to_deploy.append((p, svc))
                    continue
                current_proj_id = p["id"]
            if has_recent_success(svc):
                print(f"  Skip (recent success): {p['name']}/{svc}")
            else:
                still_to_deploy.append((p, svc))
            time.sleep(1)
        to_deploy = still_to_deploy
        print()

    if not to_deploy:
        print("Nothing to deploy.")
        sys.exit(0)

    print(f"Will deploy {len(to_deploy)} service(s):")
    for p, svc in to_deploy:
        print(f"  - {p['name']}/{svc}")
    print()

    if args.dry_run:
        print("Dry run. Exiting.")
        sys.exit(0)

    # Deploy in batches (link once per project)
    count = 0
    current_proj_id = None
    for i, (p, svc) in enumerate(to_deploy):
        if p["id"] != current_proj_id:
            if not link_project(p["id"], p["ws_id"], p["first_svc"]):
                print(f"  Skip {p['name']}: link failed")
                continue
            current_proj_id = p["id"]

        result = run_railway(
            "up",
            "--service", svc,
            "--environment", "production",
            "--detach",
            "-m", "Deploy: deploy-all-sandbox-projects",
            capture=True,
            timeout=90,
        )
        if result.returncode == 0:
            print(f"  Queued: {p['name']}/{svc}")
            count += 1
        else:
            print(f"  Failed: {p['name']}/{svc}: {result.stderr or result.stdout}")

        if (count % MAX_SERVICES_PER_BATCH) == 0 and count > 0:
            remaining = len(to_deploy) - (i + 1)
            if remaining > 0:
                print(f"  Batched {count}. Waiting {BATCH_DELAY_SEC}s before next batch...")
                time.sleep(BATCH_DELAY_SEC)

    print(f"\nDone. Triggered {count} deployments.")


if __name__ == "__main__":
    main()
