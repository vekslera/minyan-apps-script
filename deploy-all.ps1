# Update every minyan from this folder: upload the code to each one's Sheet and publish a new version of
# its registration page (same address — links and printed QR codes stay valid). Also updates the template.
#
#   .\deploy-all.ps1 "what changed"          update everything in minyanim.json
#   .\deploy-all.ps1 "what changed" -Only x  update only the one named x (e.g. -Only template)
#   .\deploy-all.ps1 -Add                    add a minyan (asks for a name, its Script ID and its page address)
#   .\deploy-all.ps1 -List                   show the list
#
# minyanim.json (git-ignored) holds, per minyan: name, scriptId, deploymentId ("" = upload only, like the
# template) and secrets (true only for the minyan whose Secrets.gs is in this folder). Everything runs as the
# Google account clasp is signed in to: every Sheet must be shared with it as Editor, and the pages then run as it.
param([string]$Description = "update", [string]$Only = "", [switch]$Add, [switch]$List, [switch]$NoCheck)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$listFile = Join-Path $here "minyanim.json"

function Read-List {
  if (-not (Test-Path $listFile)) { return @() }
  $parsed = Get-Content -Raw -Encoding UTF8 -Path $listFile | ConvertFrom-Json
  return @($parsed | Where-Object { $_ })
}
function Write-List($items) {
  ConvertTo-Json -InputObject @($items) -Depth 3 | Set-Content -Encoding UTF8 -Path $listFile
}
function Main-ScriptId {
  $f = Join-Path $here ".clasp.json"
  if (Test-Path $f) { return (Get-Content -Raw $f | ConvertFrom-Json).scriptId } else { return "" }
}
function Secrets-DeploymentId {
  $f = Join-Path $here "Secrets.gs"
  if (-not (Test-Path $f)) { return "" }
  $m = [regex]::Match((Get-Content -Raw $f), "deploymentId:\s*'([^']+)'")
  if ($m.Success) { return $m.Groups[1].Value } else { return "" }
}
# "https://script.google.com/macros/s/<id>/exec?k=…" (or a bare AKfyc… ID) -> the deployment ID
function DeploymentId-From($text) {
  $t = "$text".Trim()
  $m = [regex]::Match($t, '/s/([\w-]{20,})/(exec|dev)')
  if ($m.Success) { return $m.Groups[1].Value }
  if ($t -match '^AKfyc[\w-]{15,}$') { return $t }
  return ""
}

$items = @(Read-List)

# The template used to live in .clasp-template.json (template.cmd): move it into the list once.
$oldTemplate = Join-Path $here ".clasp-template.json"
if ((Test-Path $oldTemplate) -and -not ($items | Where-Object { $_.name -eq "template" })) {
  $tid = (Get-Content -Raw $oldTemplate | ConvertFrom-Json).scriptId
  $items += [pscustomobject]@{ name = "template"; scriptId = $tid; deploymentId = ""; secrets = $false }
  Write-List $items
  Write-Host "The template (from .clasp-template.json) was added to minyanim.json as 'template'."
}

if ($List) {
  if (-not $items.Count) { Write-Host "minyanim.json is empty. Add one with:  .\deploy-all.ps1 -Add" }
  foreach ($m in $items) {
    $what = if ($m.deploymentId) { "page " + $m.deploymentId.Substring(0, 12) + "..." } else { "upload only" }
    $sec = if ($m.secrets) { ", with Secrets.gs" } else { "" }
    Write-Host ("{0,-16} script {1}...  {2}{3}" -f $m.name, $m.scriptId.Substring(0, 12), $what, $sec)
  }
  exit 0
}

if ($Add) {
  Write-Host "Adding a minyan. Its Sheet must be shared with the Google account clasp uses, as Editor."
  $name = (Read-Host "Short name, in English letters (e.g. steinbach, mincha)").Trim()
  if ($name -notmatch '^[\w-]+$') { Write-Error "Use letters, digits, - or _ only."; exit 1 }
  if ($items | Where-Object { $_.name -eq $name }) { Write-Error "'$name' is already in the list."; exit 1 }
  $main = Main-ScriptId
  Write-Host "Script ID: its Sheet -> Extensions/תוספים -> Apps Script -> Project Settings (gear) -> Script ID."
  $sid = (Read-Host ("Script ID" + $(if ($main) { " (Enter = this folder's own, from .clasp.json)" } else { "" }))).Trim()
  if (-not $sid) { $sid = $main }
  if ($sid -notmatch '^[\w-]{20,}$') { Write-Error "That doesn't look like a Script ID."; exit 1 }
  if ($items | Where-Object { $_.scriptId -eq $sid }) { Write-Error "This Script ID is already in the list."; exit 1 }
  $own = $sid -eq $main
  $dflt = if ($own) { Secrets-DeploymentId } else { "" }
  Write-Host "Page address: the Web app URL (Deploy -> Manage deployments), or the registration link. Empty = upload only (a template)."
  $addr = (Read-Host ("Page address" + $(if ($dflt) { " (Enter = deploymentId from Secrets.gs)" } else { "" }))).Trim()
  $did = if ($addr) { DeploymentId-From $addr } else { $dflt }
  if ($addr -and -not $did) { Write-Error "That doesn't look like a page address."; exit 1 }
  $items += [pscustomobject]@{ name = $name; scriptId = $sid; deploymentId = $did; secrets = $own }
  Write-List $items
  Write-Host "Added '$name'$(if ($own) { ' (this folder''s minyan: its Secrets.gs goes with it)' })."
  if ($did) {
    Write-Host ""
    Write-Host "Once, before its first update: open its Sheet signed in as the clasp account,"
    Write-Host "choose  מניין -> קישור לדף הרישום  and allow the permissions. After the update its page runs as that account."
  }
  exit 0
}

$targets = @($items | Where-Object { -not $Only -or $_.name -eq $Only })
if (-not $targets.Count) {
  if ($Only) { Write-Error "No minyan named '$Only' in minyanim.json (see .\deploy-all.ps1 -List)." }
  else { Write-Error "minyanim.json is empty. Add the minyanim first:  .\deploy-all.ps1 -Add" }
  exit 1
}

# One upload folder per minyan, with only what Apps Script runs. Secrets.gs only where "secrets" is true.
function Build-Folder($m) {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("minyan-" + $m.name + "-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  Get-ChildItem -Path $here -File | Where-Object {
    ($_.Extension -in ".gs", ".html" -and $_.Name -ne "Secrets.gs") -or $_.Name -eq "appsscript.json"
  } | Copy-Item -Destination $tmp
  foreach ($d in "scripts", "styles") { Copy-Item -Recurse -Path (Join-Path $here $d) -Destination (Join-Path $tmp $d) }
  if ($m.secrets) {
    $s = Join-Path $here "Secrets.gs"
    if (-not (Test-Path $s)) { throw "'secrets' is true but there is no Secrets.gs in this folder" }
    Copy-Item $s -Destination $tmp
  }
  $cfg = [ordered]@{ scriptId = $m.scriptId; rootDir = "."; scriptExtensions = @(".gs"); htmlExtensions = @(".html", ".js") }
  $cfg | ConvertTo-Json | Set-Content -Encoding ascii -Path (Join-Path $tmp ".clasp.json")
  return $tmp
}
# Runs clasp (the function must not be named "clasp": PowerShell would call it instead); its messages are shown, and only the exit code decides success.
function Invoke-Clasp {
  $ErrorActionPreference = "Continue"
  & clasp @args 2>&1 | ForEach-Object { Write-Host "    $_" }
  return $LASTEXITCODE
}
# The page without its key answers with the "bad link" page when all is well; Google's own error pages mean trouble.
function Check-Page($id) {
  try { $r = Invoke-WebRequest -UseBasicParsing -Uri "https://script.google.com/macros/s/$id/exec" -TimeoutSec 60; $body = "$($r.Content)" }
  catch { return "the page did not answer ($($_.Exception.Message))" }
  if ($body -match 'Authorization is required') { return "needs permissions: open its Sheet as the clasp account, מניין -> קישור לדף הרישום, allow" }
  if ($body -match 'unable to open the file|Script function not found|ReferenceError|TypeError') { return "the page shows an error" }
  return ""
}

$ok = @(); $warn = @(); $failed = @()
foreach ($m in $targets) {
  Write-Host ""
  Write-Host "=== $($m.name)"
  $tmp = $null; $pushed = $false
  try {
    $tmp = Build-Folder $m
    Push-Location $tmp; $pushed = $true
    Write-Host "  uploading the code..."
    if ((Invoke-Clasp push -f) -ne 0) { throw "upload failed (is the Sheet shared with the clasp account as Editor?)" }
    if ($m.deploymentId) {
      Write-Host "  publishing a new version of the page..."
      if ((Invoke-Clasp update-deployment $m.deploymentId -d $Description) -ne 0) { throw "publishing failed" }
      if (-not $NoCheck) {
        $problem = Check-Page $m.deploymentId
        if ($problem) { Write-Host "  WARNING: $problem"; $warn += "$($m.name): $problem" }
      }
    }
    $ok += $m.name
    Write-Host "  OK"
  } catch {
    Write-Host "  FAILED: $($_.Exception.Message)"
    $failed += $m.name
  } finally {
    if ($pushed) { Pop-Location }
    if ($tmp) { Remove-Item -Recurse -Force -Path $tmp -ErrorAction SilentlyContinue }
  }
}
Write-Host ""
Write-Host "Updated: $($ok.Count) of $($targets.Count)$(if ($ok.Count) { ' (' + ($ok -join ', ') + ')' })"
foreach ($w in $warn) { Write-Host "Check:   $w" }
if ($failed.Count) { Write-Host "FAILED:  $($failed -join ', ')"; exit 1 }
exit 0
