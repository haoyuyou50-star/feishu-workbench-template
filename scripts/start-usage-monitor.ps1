[CmdletBinding()]
param()

$projectRoot = Split-Path -Parent $PSScriptRoot
$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } elseif (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { $null }

function Test-LoopbackPort {
  param([int]$Port)
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('127.0.0.1', $Port)
    return $task.Wait(500) -and $client.Connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Show-StartupFailure {
  param([string]$Message)
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $notice = New-Object System.Windows.Forms.NotifyIcon
  $notice.Icon = [System.Drawing.SystemIcons]::Error
  $notice.Text = 'LiuFeng Usage Monitor'
  $notice.BalloonTipTitle = 'Usage monitor did not start'
  $notice.BalloonTipText = $Message
  $notice.Visible = $true
  $notice.ShowBalloonTip(8000)
  Start-Sleep -Seconds 9
  $notice.Dispose()
}

if (-not $nodePath) {
  Show-StartupFailure 'The local Node.js runtime was not found. Open Codex and configure startup again.'
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist'))) {
  Show-StartupFailure 'The local dashboard has not been built. Ask Codex to run a production build.'
  exit 1
}

if (-not (Test-LoopbackPort -Port 47832)) {
  Start-Process -FilePath $nodePath -ArgumentList @('scripts\codex-usage-bridge.mjs', '--config', 'scripts\codex-usage-sources.local.json') -WorkingDirectory $projectRoot -WindowStyle Hidden
}

if (-not (Test-LoopbackPort -Port 3000)) {
  Start-Process -FilePath $nodePath -ArgumentList @('node_modules\vinext\dist\cli.js', 'start', '--hostname', '127.0.0.1', '--port', '3000') -WorkingDirectory $projectRoot -WindowStyle Hidden
}
