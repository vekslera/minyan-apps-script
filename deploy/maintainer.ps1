# Where the minyanim send their error alerts (src/Notify.gs): an email address, used by deploy-all.ps1.
# deploy\maintainer.json (git-ignored) holds it; set it with  .\deploy\deploy-all.ps1 -Alerts
# Every minyan with a page gets it as Maintainer.gs in its upload (with its short name) — never the template, never git.

$maintainerFile = Join-Path $PSScriptRoot "maintainer.json"

function Test-Email($a) { return "$a" -match '^[^@\s]+@[^@\s]+\.[^@\s]+$' }

# {email} or $null when not set yet.
function Get-Maintainer {
  if (-not (Test-Path $maintainerFile)) { return $null }
  $m = Get-Content -Raw -Path $maintainerFile | ConvertFrom-Json
  if (-not (Test-Email $m.email)) { return $null }
  return $m
}

# -Alerts: asks for the address (Enter = keep the current one) and saves it.
function Set-Maintainer {
  $cur = Get-Maintainer
  $hint = if ($cur) { " (Enter = keep $($cur.email))" } else { "" }
  $a = (Read-Host "Email address for the minyanim's error alerts$hint").Trim().ToLower()
  if (-not $a -and $cur) { $a = $cur.email }
  if (-not (Test-Email $a)) { throw "That isn't an email address." }
  [ordered]@{ email = $a } | ConvertTo-Json | Set-Content -Encoding ascii -Path $maintainerFile
  Write-Host "Error alerts go to $a. They take effect with the next deploy-all."
}

$script:alertsWarned = $false
# Writes Maintainer.gs into a minyan's upload folder, with the minyan's short name (from minyanim.json) for the subjects.
function Add-Maintainer($folder, $name) {
  $m = Get-Maintainer
  if (-not $m) {
    if (-not $script:alertsWarned) { Write-Host "  (error alerts are off: no address yet — .\deploy\deploy-all.ps1 -Alerts)"; $script:alertsWarned = $true }
    return
  }
  "// Written by deploy\deploy-all.ps1 from deploy\maintainer.json - not in git.`r`nconst MAINTAINER = { email: '$($m.email)', minyan: '$name' };" |
    Set-Content -Encoding ascii -Path (Join-Path $folder "Maintainer.gs")
}
