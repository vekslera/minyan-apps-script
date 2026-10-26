# Upload the code to the TEMPLATE Sheet's script — the master copy other minyanim copy (File -> Make a copy).
# Secrets.gs is left out on purpose: a copy must not carry this minyan's page address or private values.
# Usage (PowerShell, in this folder):   .\template.ps1        (or double-click template.cmd)
# The first run asks for the template's Script ID and keeps it in .clasp-template.json (git-ignored).
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$cfgFile = Join-Path $here ".clasp-template.json"

if (-not (Test-Path $cfgFile)) {
  Write-Host "The template Sheet -> Extensions -> Apps Script -> Project Settings (gear) -> Script ID."
  $id = (Read-Host "Paste the template's Script ID").Trim()
  if ($id -notmatch '^[\w-]{20,}$') { Write-Error "That doesn't look like a Script ID."; exit 1 }
  $cfg = [ordered]@{ scriptId = $id; rootDir = "."; scriptExtensions = @(".gs"); htmlExtensions = @(".html", ".js") }
  $cfg | ConvertTo-Json | Set-Content -Encoding ascii -Path $cfgFile
}
$cfg = Get-Content -Raw -Path $cfgFile | ConvertFrom-Json
$main = Join-Path $here ".clasp.json"
if ((Test-Path $main) -and ((Get-Content -Raw $main | ConvertFrom-Json).scriptId -eq $cfg.scriptId)) {
  Write-Error ".clasp-template.json has this minyan's own Script ID. The template must be a separate Sheet."; exit 1
}

# A clean folder with only what Apps Script runs: *.gs (minus Secrets.gs), *.html, appsscript.json, scripts/, styles/.
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("minyan-template-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Get-ChildItem -Path $here -File | Where-Object {
    ($_.Extension -in ".gs", ".html" -and $_.Name -ne "Secrets.gs") -or $_.Name -eq "appsscript.json"
  } | Copy-Item -Destination $tmp
  foreach ($d in "scripts", "styles") { Copy-Item -Recurse -Path (Join-Path $here $d) -Destination (Join-Path $tmp $d) }
  $cfg | ConvertTo-Json | Set-Content -Encoding ascii -Path (Join-Path $tmp ".clasp.json")
  if (Test-Path (Join-Path $tmp "Secrets.gs")) { Write-Error "Secrets.gs must not go to the template."; exit 1 }
  $n = (Get-ChildItem -Recurse -File -Path $tmp | Where-Object { $_.Name -ne ".clasp.json" }).Count
  Write-Host "Uploading $n files to the template (without Secrets.gs)..."
  Push-Location $tmp
  try { clasp push -f; $code = $LASTEXITCODE } finally { Pop-Location }
  if ($code -ne 0) { exit $code }
  Write-Host "The template has the current code. Copies made from now on get it."
} finally {
  Remove-Item -Recurse -Force -Path $tmp
}
