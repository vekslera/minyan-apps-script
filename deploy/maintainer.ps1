# The maintainer's notification channel (ntfy; see src/Notify.gs), used by deploy-all.ps1.
# deploy\maintainer.json (git-ignored) holds the topic; it is made the first time: "minyan-attendance-script" if that
# topic is free on ntfy.sh, else the same name with a short random ending.
# Every minyan with a page gets it as Maintainer.gs in its upload — never the template, never git.
# On ntfy.sh anyone who knows a topic's name can read and post to it: the alerts carry no personal data.

$maintainerFile = Join-Path $PSScriptRoot "maintainer.json"
$preferredTopic = "minyan-attendance-script"

# $true when the topic has someone else's messages (ours carry the tag "synagogue", see Notify.gs) or is reserved;
# $false when free, used only by this app, or when it can't be checked. ntfy.sh keeps messages for about 12 hours.
function Test-TopicTaken($server, $topic) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$server/$topic/json?poll=1&since=all" -TimeoutSec 20
    foreach ($line in ("$($r.Content)" -split "`n")) {
      if (-not $line.Trim()) { continue }
      $msg = $null; try { $msg = $line | ConvertFrom-Json } catch { return $true }
      if ($msg.event -eq "message" -and -not (@($msg.tags) -contains "synagogue")) { return $true }
    }
    return $false
  } catch {
    $code = 0; try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    if ($code -eq 401 -or $code -eq 403) { return $true }
    Write-Host "Could not check whether ntfy topic '$topic' is free ($($_.Exception.Message)); using it."
    return $false
  }
}

function Get-Maintainer {
  if (-not (Test-Path $maintainerFile)) {
    $server = "https://ntfy.sh"; $topic = $preferredTopic
    if (Test-TopicTaken $server $topic) {
      $bytes = New-Object byte[] 3
      [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
      $topic = $preferredTopic + "-" + (($bytes | ForEach-Object { $_.ToString("x2") }) -join "")
      Write-Host "ntfy topic '$preferredTopic' is already in use; using '$topic' instead."
    }
    [ordered]@{ ntfyServer = $server; ntfyTopic = $topic } | ConvertTo-Json | Set-Content -Encoding ascii -Path $maintainerFile
    Write-Host "Error alerts go to ntfy topic '$topic' (deploy\maintainer.json). In the ntfy app: Subscribe to topic -> $topic"
  }
  $m = Get-Content -Raw -Path $maintainerFile | ConvertFrom-Json
  if ("$($m.ntfyTopic)" -notmatch '^[\w-]{6,64}$') { throw "deploy\maintainer.json: ntfyTopic must be 6-64 letters, digits, - or _" }
  return $m
}

# Writes Maintainer.gs into a minyan's upload folder, with the minyan's short name (from minyanim.json) for the alerts' titles.
function Add-Maintainer($folder, $name) {
  $m = Get-Maintainer
  $server = if ($m.ntfyServer) { "$($m.ntfyServer)" } else { "https://ntfy.sh" }
  "// Written by deploy\deploy-all.ps1 from deploy\maintainer.json - not in git.`r`nconst MAINTAINER = { ntfyServer: '$server', ntfyTopic: '$($m.ntfyTopic)', minyan: '$name' };" |
    Set-Content -Encoding ascii -Path (Join-Path $folder "Maintainer.gs")
}
