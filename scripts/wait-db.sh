#!/usr/bin/env bash
set -euo pipefail
cd /root/project_management
/usr/bin/docker compose up -d
# Wait until Postgres accepts connections (max ~60s)
for i in $(seq 1 30); do
  if /usr/bin/docker compose exec -T db pg_isready -U simplo -d simplo >/dev/null 2>&1; then
    echo "postgres ready"
    exit 0
  fi
  sleep 2
done
echo "postgres not ready after wait" >&2
exit 1
