#!/usr/bin/env bash
# Push the code and update the existing web-app deployment (same address, new version).
# Usage:  ./deploy.sh "what changed"
set -euo pipefail
cd "$(dirname "$0")"
# The browser scripts in scripts/*.js must be uploaded as HTML-type files, never as server code.
if ! grep -Eq '"htmlExtensions"[[:space:]]*:[[:space:]]*\[[^]]*"\.?js"' .clasp.json || \
   ! grep -Eq '"scriptExtensions"[[:space:]]*:[[:space:]]*\[[[:space:]]*"\.?gs"[[:space:]]*\]' .clasp.json; then
  echo '.clasp.json must contain  "scriptExtensions": [".gs"], "htmlExtensions": [".html", ".js"]  (see .clasp.json.example).' >&2; exit 1
fi
id=$(sed -n "s/.*deploymentId:[[:space:]]*'\([^']\{1,\}\)'.*/\1/p" Secrets.gs | head -1)
if [ -z "$id" ]; then echo "Set deploymentId in Secrets.gs first (Deploy -> Manage deployments -> Deployment ID)." >&2; exit 1; fi
clasp push -f
clasp update-deployment "$id" -d "${1:-update}"
