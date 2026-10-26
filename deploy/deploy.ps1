# Push the code and update the existing web-app deployment (same address, new version) — this project's own minyan.
# Usage (PowerShell):   .\deploy\deploy.ps1 "what changed"      (or double-click deploy\deploy.cmd)
# With deploy\minyanim.json (deploy-all.ps1), it updates this project's own minyan from there (the entry whose
# Script ID is the one in .clasp.json). Without it, the older way: the deployment ID from src\Secrets.gs.
param([string]$Description = "update")
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)          # the project folder, where .clasp.json is
# The browser scripts in src/scripts/*.js must be uploaded as HTML-type files, never as server code,
# and only src/ is the Apps Script project.
$clasp = Get-Content -Raw -Path ".clasp.json"
if ($clasp -notmatch '"htmlExtensions"\s*:\s*\[[^\]]*"\.?js"' -or $clasp -notmatch '"scriptExtensions"\s*:\s*\[\s*"\.?gs"\s*\]') {
  Write-Error '.clasp.json must contain  "scriptExtensions": [".gs"], "htmlExtensions": [".html", ".js"]  (see .clasp.json.example).'; exit 1
}
if ($clasp -notmatch '"rootDir"\s*:\s*"src/?"') { Write-Error '.clasp.json must contain  "rootDir": "src"  (see .clasp.json.example).'; exit 1 }
$sid = ($clasp | ConvertFrom-Json).scriptId
$list = Join-Path $PSScriptRoot "minyanim.json"
if (Test-Path $list) {
  $own = @(Get-Content -Raw -Encoding UTF8 $list | ConvertFrom-Json) | ForEach-Object { $_ } | Where-Object { $_.scriptId -eq $sid } | Select-Object -First 1
  if ($own) { & (Join-Path $PSScriptRoot "deploy-all.ps1") $Description -Only $own.name; exit $LASTEXITCODE }
}
if (-not (Test-Path "src\Secrets.gs")) { Write-Error "Add this minyan to deploy\minyanim.json first:  .\deploy\deploy-all.ps1 -Add"; exit 1 }
$m = [regex]::Match((Get-Content -Raw -Path "src\Secrets.gs"), "deploymentId:\s*'([^']+)'")
if (-not $m.Success) { Write-Error "Set deploymentId in src\Secrets.gs first (Deploy -> Manage deployments -> Deployment ID)."; exit 1 }
$id = $m.Groups[1].Value
clasp push -f
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
clasp update-deployment $id -d $Description
