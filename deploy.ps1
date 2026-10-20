# Push the code and update the existing web-app deployment (same address, new version).
# Usage (PowerShell, in this folder):   .\deploy.ps1 "what changed"
param([string]$Description = "update")
$ErrorActionPreference = "Stop"
$secrets = Get-Content -Raw -Path "Secrets.gs"
$m = [regex]::Match($secrets, "deploymentId:\s*'([^']+)'")
if (-not $m.Success) { Write-Error "Set deploymentId in Secrets.gs first (Deploy -> Manage deployments -> Deployment ID)."; exit 1 }
$id = $m.Groups[1].Value
clasp push -f
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
clasp update-deployment $id -d $Description
