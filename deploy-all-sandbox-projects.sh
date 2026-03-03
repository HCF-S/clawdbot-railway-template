#!/bin/bash
# Trigger deploy for all clawdbot services across all sandbox* projects.
# No builder patch - just redeploy. Use same batching as fix script to avoid build limits.
# Use CI=1 and </dev/null to avoid interactive prompts when run non-interactively.
set +e
cd "$(dirname "$0")"
export CI=1

# Get unique sandbox project ids with workspace and first clawdbot service (for non-interactive link)
PROJECTS=$(railway list --json 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
seen = set()
for p in data:
    if p.get('name', '').startswith('sandbox') and p['id'] not in seen:
        seen.add(p['id'])
        ws_id = p.get('workspace', {}).get('id', '')
        first_svc = ''
        for e in p.get('services', {}).get('edges', []):
            name = e['node'].get('name', '')
            if 'clawdbot' in name:
                first_svc = name
                break
        print(p['id'], p['name'], ws_id, first_svc)
")

BATCH=10
BATCH_DELAY=120
PROJECT_DELAY=60
FORCE=0
[ "$1" = "--force" ] && FORCE=1

echo "Deploying all clawdbot instances (batch $BATCH, ${BATCH_DELAY}s between batches)"
[ $FORCE -eq 1 ] && echo "Force mode: deploying all (no skip for recent SUCCESS)"

while read -r proj_id proj_name ws_id first_svc; do
  echo "=== Project: $proj_name ($proj_id) ==="
  [ -z "$first_svc" ] && { echo "  Skip: no clawdbot services"; continue; }
  link_args=(--project "$proj_id" --environment production)
  [ -n "$ws_id" ] && link_args+=(--workspace "$ws_id")
  link_args+=(--service "$first_svc")
  railway link "${link_args[@]}" </dev/null 2>/dev/null
  link_ok=$?
  if [ $link_ok -ne 0 ]; then
    echo "  Skip: link failed (run in interactive terminal if prompts appear)"
    continue
  fi

  services=$(railway list --json 2>/dev/null | python3 -c "
import json, sys
proj_id = sys.argv[1]
data = json.load(sys.stdin)
p = next((x for x in data if x.get('id') == proj_id), None)
if not p: sys.exit(1)
for e in p.get('services', {}).get('edges', []):
    name = e['node'].get('name', '')
    if 'clawdbot' in name:
        print(name)
" "$proj_id")

  if [ -z "$services" ]; then
    echo "  No clawdbot services found"
    continue
  fi

  count=0
  batch_num=0
  skipped=0
  for svc in $services; do
    if [ $FORCE -eq 0 ]; then
      recent_success=$(railway deployment list --service "$svc" --limit 5 --json 2>/dev/null | python3 -c "
import json, sys
from datetime import datetime, timezone, timedelta
try:
    deployments = json.load(sys.stdin)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    for d in deployments:
        if d.get('status') == 'SUCCESS':
            created = datetime.fromisoformat(d['createdAt'].replace('Z', '+00:00'))
            if created >= cutoff:
                print('yes')
                break
except: pass
" 2>/dev/null | tr -d '\n')
      if [ "$recent_success" = "yes" ]; then
        echo "  Skip $svc: has SUCCESS deploy within last hour"
        skipped=$((skipped + 1))
        continue
      fi
    fi
    railway up --service "$svc" --environment production --detach -m "Redeploy" 2>/dev/null &
    count=$((count + 1))
    if [ $((count % BATCH)) -eq 0 ]; then
      wait
      batch_num=$((batch_num + 1))
      echo "  Batch $batch_num done ($count deployed). Waiting ${BATCH_DELAY}s for build queue..."
      sleep $BATCH_DELAY
    fi
  done
  wait
  echo "  Deployed $count services, skipped $skipped (recent SUCCESS)"
  echo "  Waiting ${PROJECT_DELAY}s before next project..."
  sleep $PROJECT_DELAY
done <<< "$PROJECTS"

echo "Done."
