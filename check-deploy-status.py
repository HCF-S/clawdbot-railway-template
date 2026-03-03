#!/usr/bin/env python3
"""
Check last deploy status for all clawdbot services in sandbox-* projects.
Output: service name, project name, last deploy status, last deploy time

Usage:
  python check-deploy-status.py              # Print to stdout
  python check-deploy-status.py -o report.log # Write to file
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent


def run_railway(*args, capture=True):
    """Run railway CLI command."""
    cmd = ["railway"] + list(args)
    result = subprocess.run(
        cmd,
        cwd=SCRIPT_DIR,
        capture_output=capture,
        text=True,
        timeout=60,
    )
    return result


def link_project(proj_id, env="production", ws_id=None):
    """Link to a project."""
    args = ["link", "--project", proj_id, "--environment", env]
    if ws_id:
        args.extend(["--workspace", ws_id])
    result = run_railway(*args)
    return result.returncode == 0


def get_projects_list():
    """Get all projects from railway list."""
    result = run_railway("list", "--json")
    if result.returncode != 0:
        raise RuntimeError("railway list failed")
    return json.loads(result.stdout)


def get_services_for_project(data, proj_id):
    """Get clawdbot service names for a project."""
    for p in data:
        if p.get("id") == proj_id:
            services = []
            for e in p.get("services", {}).get("edges", []):
                name = e["node"].get("name", "")
                if "clawdbot" in name:
                    services.append(name)
            return services
    return []


def get_last_deployment(service_name):
    """Get last deployment for a service. Returns (status, created_at) or (None, None)."""
    result = run_railway("deployment", "list", "--service", service_name, "--limit", "1", "--json")
    if result.returncode != 0:
        return None, None
    try:
        deployments = json.loads(result.stdout)
        if not deployments:
            return None, None
        d = deployments[0]
        return d.get("status"), d.get("createdAt")
    except (json.JSONDecodeError, IndexError):
        return None, None


def main():
    parser = argparse.ArgumentParser(description="Check deploy status for clawdbot services")
    parser.add_argument("-o", "--output", help="Write results to file")
    args = parser.parse_args()

    print("Fetching project list...", file=sys.stderr)
    data = get_projects_list()

    seen = set()
    projects = []
    for p in data:
        if p.get("name", "").startswith("sandbox") and p["id"] not in seen:
            seen.add(p["id"])
            projects.append(p)

    print(f"Found {len(projects)} sandbox-* projects", file=sys.stderr)
    print("Checking deployments...", file=sys.stderr)

    rows = []
    for p in projects:
        proj_id = p["id"]
        proj_name = p["name"]
        ws_id = p.get("workspace", {}).get("id") or ""

        if not link_project(proj_id, ws_id=ws_id or None):
            print(f"  Skip {proj_name}: link failed", file=sys.stderr)
            continue

        services = get_services_for_project(data, proj_id)
        for svc in services:
            status, created_at = get_last_deployment(svc)
            status_str = status or "-"
            time_str = created_at or "-"
            if time_str != "-":
                time_str = time_str.replace("T", " ").replace("Z", " UTC")[:19]
            rows.append((svc, proj_name, status_str, time_str))

    # Column widths
    max_svc = max(len(r[0]) for r in rows) if rows else 20
    max_proj = max(len(r[1]) for r in rows) if rows else 20
    max_status = max(len(r[2]) for r in rows) if rows else 10
    max_svc = max(max_svc, 15)
    max_proj = max(max_proj, 15)
    max_status = max(max_status, 10)

    header = f"{'SERVICE':<{max_svc}}  {'PROJECT':<{max_proj}}  {'STATUS':<{max_status}}  LAST DEPLOY TIME"
    out_lines = [header, "-" * len(header)]
    for svc, proj, status, time_str in sorted(rows, key=lambda r: (r[1], r[0])):
        out_lines.append(f"{svc:<{max_svc}}  {proj:<{max_proj}}  {status:<{max_status}}  {time_str}")

    output = "\n".join(out_lines)
    if args.output:
        Path(args.output).write_text(output)
        print(f"Wrote {len(rows)} rows to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
