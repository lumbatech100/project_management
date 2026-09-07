#!/usr/bin/env bash
set -euo pipefail
cd /root/project_management
set -a
# shellcheck disable=SC1091
source .env
set +a
SECRET="${CRON_SECRET:-}"
URL="${APP_URL:-http://127.0.0.1:3001}"
curl -fsS -X POST \
  "${URL}/api/cron/close-daily-reports" \
  -H "Authorization: Bearer ${SECRET}" \
  -H "Content-Type: application/json" \
  || exit 1
