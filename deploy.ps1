# Push the code and update the existing web-app deployment (same address, new version) — this folder's own minyan.
# Usage (PowerShell, in this folder):   .\deploy.ps1 "what changed"
# With minyanim.json (deploy-all.ps1), it updates this folder's own minyan from there (the entry whose Script ID is
# the one in .clasp.json). Without it, the older way: the deployment ID from Secrets.gs.
param([string]$Description = "update")
$ErrorActionPreference = "Stop"
# The browser scripts in scripts/*.js must be uploaded as HTML-type files, never as server code.
$clasp = Get-Content -Raw -Path ".clasp.json"
if ($clasp -notmatch '"htmlExtensions"\s*:\s*\[[^\]]*"\.?js"' -or $clasp -notmatch '"scriptExtensions"\s*:\s*\[\s*"\.?gs"\s*\]') {
  Write-Error '.clasp.json must contain  "scriptExtensions": [".gs"], "htmlExtensions": [".html", ".js"]  (see .clasp.json.example).'; exit 1
}
$sid = ($clasp | ConvertFrom-Json).scriptId
if (Test-Path "minyanim.json") {
  $own = @(Get-Content -Raw -Encoding UTF8 "minyanim.json" | ConvertFrom-Json) | ForEach-Object { $_ } | Where-Object { $_.scriptId -eq $sid } | Select-Object -First 1
  if ($own) { & (Join-Path $PSScriptRoot "deploy-all.ps1") $Description -Only $own.name; exit $LASTEXITCODE }
}
if (-not (Test-Path "Secrets.gs")) { Write-Error "Add this minyan to minyanim.json first:  .\deploy-all.ps1 -Add"; exit 1 }
$secrets = Get-Content -Raw -Path "Secrets.gs"
$m = [regex]::Match($secrets, "deploymentId:\s*'([^']+)'")
if (-not $m.Success) { Write-Error "Set deploymentId in Secrets.gs first (Deploy -> Manage deployments -> Deployment ID)."; exit 1 }
$id = $m.Groups[1].Value
clasp push -f
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
clasp update-deployment $id -d $Description
