# Update every minyan from this folder: upload the code to each one's Sheet and publish a new version of
# its registration page (same address — links and printed QR codes stay valid). Also updates the template.
#
#   .\deploy-all.ps1 "what changed"          update everything in minyanim.json
#   .\deploy-all.ps1 "what changed" -Only x  update only the one named x (e.g. -Only template)
#   .\deploy-all.ps1 -Add                    add a minyan (asks for a name, its Script ID and its registration link)
#   .\deploy-all.ps1 -Remove x               take x off the list (nothing changes in its Sheet)
#   .\deploy-all.ps1 -List                   show the list, with every registration link
#
# minyanim.json (git-ignored, private: it holds the links with their keys) has, per minyan: name, scriptId,
# deploymentId and key ("" = upload only, like the template). Secrets.gs, if this folder still has one, goes only
# to this folder's own minyan (the Script ID in .clasp.json). Everything runs as the Google account clasp is
# signed in to: every Sheet must be shared with it as Editor, and the pages then run as it.
param([string]$Description = "update", [string]$Only = "", [switch]$Add, [string]$Remove = "", [switch]$List, [switch]$NoCheck)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$listFile = Join-Path $here "minyanim.json"
$secretsFile = Join-Path $here "Secrets.gs"

function Read-List {
  if (-not (Test-Path $listFile)) { return @() }
  $parsed = Get-Content -Raw -Encoding UTF8 -Path $listFile | ConvertFrom-Json
  return @($parsed | Where-Object { $_ } | ForEach-Object {
    [pscustomobject]@{ name = $_.name; scriptId = $_.scriptId; deploymentId = "$($_.deploymentId)"; key = "$($_.key)" }
  })
}
function Write-List($items) {
  ConvertTo-Json -InputObject @($items) -Depth 3 | Set-Content -Encoding UTF8 -Path $listFile
}
function Main-ScriptId {
  $f = Join-Path $here ".clasp.json"
  if (Test-Path $f) { return (Get-Content -Raw $f | ConvertFrom-Json).scriptId } else { return "" }
}
function Secret($name) {
  if (-not (Test-Path $secretsFile)) { return "" }
  $m = [regex]::Match((Get-Content -Raw $secretsFile), "$name\s*:\s*'([^']+)'")
  if ($m.Success) { return $m.Groups[1].Value } else { return "" }
}
function Link-Of($m) {
  if (-not $m.deploymentId) { return "" }
  $u = "https://script.google.com/macros/s/$($m.deploymentId)/exec"
  if ($m.key) { return "$u`?k=$($m.key)" } else { return $u }
}
# A registration link "https://script.google.com/macros/s/<id>/exec?k=<key>" -> @(id, key)
function Parse-Link($text) {
  $t = "$text".Trim()
  $m = [regex]::Match($t, '^https://script\.google\.com/(?:a/macros/[^/\s]+|macros)/s/([\w-]{20,})/exec\?(?:.*&)?k=([\w-]{6,})')
  if ($m.Success) { return @($m.Groups[1].Value, $m.Groups[2].Value) } else { return $null }
}
function Uses-Secrets($m) { return (Test-Path $secretsFile) -and $m.scriptId -eq (Main-ScriptId) }

$items = @(Read-List)

# The template used to live in .clasp-template.json (template.cmd): move it into the list once.
$oldTemplate = Join-Path $here ".clasp-template.json"
if ((Test-Path $oldTemplate) -and -not ($items | Where-Object { $_.name -eq "template" })) {
  $tid = (Get-Content -Raw $oldTemplate | ConvertFrom-Json).scriptId
  $items += [pscustomobject]@{ name = "template"; scriptId = $tid; deploymentId = ""; key = "" }
  Write-List $items
  Write-Host "The template (from .clasp-template.json) was added to minyanim.json as 'template'."
}

if ($List) {
  if (-not $items.Count) { Write-Host "minyanim.json is empty. Add one with:  .\deploy-all.ps1 -Add" }
  foreach ($m in $items) {
    $link = Link-Of $m
    $what = if (-not $link) { "(upload only)" } elseif (-not $m.key) { "$link   <- no key: -Remove and -Add again with the registration link" } else { $link }
    $sec = if (Uses-Secrets $m) { "  [+ Secrets.gs]" } else { "" }
    Write-Host ("{0,-14} script {1}...{2}" -f $m.name, $m.scriptId.Substring(0, 10), $sec)
    Write-Host "               $what"
  }
  exit 0
}

if ($Remove) {
  if (-not ($items | Where-Object { $_.name -eq $Remove })) { Write-Error "No minyan named '$Remove' in minyanim.json."; exit 1 }
  Write-List @($items | Where-Object { $_.name -ne $Remove })
  Write-Host "'$Remove' was taken off the list (its Sheet and page are unchanged)."
  exit 0
}

if ($Add) {
  Write-Host "Adding a minyan. Its Sheet must be shared with the Google account clasp uses, as Editor."
  $name = (Read-Host "Short name, in English letters (e.g. steinbach, mincha, template)").Trim()
  if ($name -notmatch '^[\w-]+$') { Write-Error "Use letters, digits, - or _ only."; exit 1 }
  if ($items | Where-Object { $_.name -eq $name }) { Write-Error "'$name' is already in the list (.\deploy-all.ps1 -Remove $name first)."; exit 1 }
  $main = Main-ScriptId
  Write-Host "Script ID: its Sheet -> Extensions/תוספים -> Apps Script -> Project Settings (gear) -> Script ID."
  $sid = (Read-Host ("Script ID" + $(if ($main) { " (Enter = this folder's own, from .clasp.json)" } else { "" }))).Trim()
  if (-not $sid) { $sid = $main }
  if ($sid -notmatch '^[\w-]{20,}$') { Write-Error "That doesn't look like a Script ID."; exit 1 }
  if ($items | Where-Object { $_.scriptId -eq $sid }) { Write-Error "This Script ID is already in the list."; exit 1 }
  $fromSecrets = ""
  if ($sid -eq $main -and (Secret "deploymentId") -and (Secret "kioskKey")) {
    $fromSecrets = "https://script.google.com/macros/s/$(Secret 'deploymentId')/exec?k=$(Secret 'kioskKey')"
  }
  Write-Host "Registration link: in its Sheet, מניין -> קישור לדף הרישום -> העתקה (it ends with ?k=...). Empty = upload only (the template)."
  $addr = (Read-Host ("Registration link" + $(if ($fromSecrets) { " (Enter = the one in Secrets.gs)" } else { "" }))).Trim()
  if (-not $addr) { $addr = $fromSecrets }
  $did = ""; $key = ""
  if ($addr) {
    $p = Parse-Link $addr
    if (-not $p) { Write-Error "That isn't a registration link (https://script.google.com/macros/s/.../exec?k=...)."; exit 1 }
    $did = $p[0]; $key = $p[1]
  }
  $items += [pscustomobject]@{ name = $name; scriptId = $sid; deploymentId = $did; key = $key }
  Write-List $items
  Write-Host "Added '$name'."
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

# One upload folder per minyan, with only what Apps Script runs (+ Secrets.gs for this folder's own minyan, while it exists).
function Build-Folder($m) {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("minyan-" + $m.name + "-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  Get-ChildItem -Path $here -File | Where-Object {
    ($_.Extension -in ".gs", ".html" -and $_.Name -ne "Secrets.gs") -or $_.Name -eq "appsscript.json"
  } | Copy-Item -Destination $tmp
  foreach ($d in "scripts", "styles") { Copy-Item -Recurse -Path (Join-Path $here $d) -Destination (Join-Path $tmp $d) }
  if (Uses-Secrets $m) { Copy-Item $secretsFile -Destination $tmp }
  $cfg = [ordered]@{ scriptId = $m.scriptId; rootDir = "."; scriptExtensions = @(".gs"); htmlExtensions = @(".html", ".js") }
  $cfg | ConvertTo-Json | Set-Content -Encoding ascii -Path (Join-Path $tmp ".clasp.json")
  return $tmp
}
# Runs clasp (the function must not be named "clasp": PowerShell would call it instead); its messages are shown,
# and only the exit code decides success.
function Invoke-Clasp {
  $ErrorActionPreference = "Continue"
  & clasp @args 2>&1 | ForEach-Object { Write-Host "    $_" }
  return $LASTEXITCODE
}
# Opens the page as a worshipper would (with its key, when known). The bad-link page has its own title
# (Kiosk.gs), and Google's own error pages mean trouble.
function Check-Page($m) {
  $url = Link-Of $m
  try { $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 60; $body = "$($r.Content)" }
  catch { return "the page did not answer ($($_.Exception.Message))" }
  if ($body -match 'Authorization is required') { return "needs permissions: open its Sheet as the clasp account, מניין -> קישור לדף הרישום, allow" }
  if ($body -match 'unable to open the file|Script function not found|ReferenceError|TypeError') { return "the page shows an error" }
  $t = [regex]::Match($body, '<title>([^<]*)</title>')
  $title = if ($t.Success) { [System.Net.WebUtility]::HtmlDecode($t.Groups[1].Value) } else { "" }
  if ($m.key -and $title -match 'הקישור אינו תקין') { return "THE REGISTRATION LINK NO LONGER WORKS (wrong key). If Secrets.gs was just removed: put it back, run deploy-all again, then run מניין -> הגדרה ראשונית in that Sheet" }
  if (-not $m.key) { return "no key in minyanim.json, so only the address was checked (-Remove and -Add again with the registration link)" }
  return ""
}

$ok = @(); $warn = @(); $failed = @()
foreach ($m in $targets) {
  Write-Host ""
  Write-Host "=== $($m.name)$(if (Uses-Secrets $m) { '  (with Secrets.gs)' })"
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
        $problem = Check-Page $m
        if ($problem) { Write-Host "  CHECK: $problem"; $warn += "$($m.name): $problem" } else { Write-Host "  the registration link opens the page" }
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
