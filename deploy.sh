#!/usr/bin/env bash
# Push the code and update the existing web-app deployment (same address, new version).
# Usage:  ./deploy.sh "what changed"
set -euo pipefail
cd "$(dirname "$0")"
id=$(sed -n "s/.*deploymentId:[[:space:]]*'\([^']\{1,\}\)'.*/\1/p" Secrets.gs | head -1)
if [ -z "$id" ]; then echo "Set deploymentId in Secrets.gs first (Deploy -> Manage deployments -> Deployment ID)." >&2; exit 1; fi
clasp push -f
clasp update-deployment "$id" -d "${1:-update}"
