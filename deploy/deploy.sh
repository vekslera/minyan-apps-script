#!/usr/bin/env bash
# Push the code and update the existing web-app deployment (same address, new version).
# Usage:  ./deploy/deploy.sh "what changed"      (the deployment ID from src/Secrets.gs)
set -euo pipefail
cd "$(dirname "$0")/.."                                  # the project folder, where .clasp.json is
# The browser scripts in src/scripts/*.js must be uploaded as HTML-type files, never as server code,
# and only src/ is the Apps Script project.
if ! grep -Eq '"htmlExtensions"[[:space:]]*:[[:space:]]*\[[^]]*"\.?js"' .clasp.json || \
   ! grep -Eq '"scriptExtensions"[[:space:]]*:[[:space:]]*\[[[:space:]]*"\.?gs"[[:space:]]*\]' .clasp.json; then
  echo '.clasp.json must contain  "scriptExtensions": [".gs"], "htmlExtensions": [".html", ".js"]  (see .clasp.json.example).' >&2; exit 1
fi
if ! grep -Eq '"rootDir"[[:space:]]*:[[:space:]]*"src/?"' .clasp.json; then echo '.clasp.json must contain  "rootDir": "src"' >&2; exit 1; fi
id=$(sed -n "s/.*deploymentId:[[:space:]]*'\([^']\{1,\}\)'.*/\1/p" src/Secrets.gs 2>/dev/null | head -1)
if [ -z "$id" ]; then echo "Set deploymentId in src/Secrets.gs first (Deploy -> Manage deployments -> Deployment ID)." >&2; exit 1; fi
clasp push -f
clasp update-deployment "$id" -d "${1:-update}"
