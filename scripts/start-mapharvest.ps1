# MapHarvest desktop launcher — starts the UI and opens the browser
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "package.json"))) {
  $Root = "C:\MapHarvest"
}
Set-Location $Root

$host.UI.RawUI.WindowTitle = "MapHarvest Server"
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $Root ".playwright-browsers"
$Port = 3030
$Url = "http://localhost:$Port"

Write-Host ""
Write-Host "  MapHarvest" -ForegroundColor Cyan
Write-Host "  Opening search UI at $Url" -ForegroundColor Green
Write-Host "  Keep this window open while you use the app." -ForegroundColor DarkGray
Write-Host ""

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Host "First run: installing dependencies…" -ForegroundColor Yellow
  npm install
}

function Test-Port([int]$PortNum) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect("127.0.0.1", $PortNum)
    $c.Close()
    return $true
  } catch {
    return $false
  }
}

if (Test-Port $Port) {
  Start-Process $Url
  Write-Host "Already running — browser opened." -ForegroundColor Green
  Write-Host "Press any key to close this window (app keeps running)…"
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
  exit 0
}

# Start Next.js in background of this window, then open browser when ready
$job = Start-Job -ScriptBlock {
  param($root, $browsers)
  Set-Location $root
  $env:PLAYWRIGHT_BROWSERS_PATH = $browsers
  npm run dev
} -ArgumentList $Root, $env:PLAYWRIGHT_BROWSERS_PATH

$opened = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Port $Port) {
    Start-Process $Url
    $opened = $true
    Write-Host "UI ready → $Url" -ForegroundColor Green
    break
  }
  Receive-Job $job -ErrorAction SilentlyContinue | Out-Null
}

if (-not $opened) {
  Write-Host "Server is still starting… open $Url manually." -ForegroundColor Yellow
  Start-Process $Url
}

Write-Host ""
Write-Host "Search UI is in your browser. Do not close this window." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop MapHarvest." -ForegroundColor DarkGray
Write-Host ""

try {
  while ($true) {
    Receive-Job $job | ForEach-Object { Write-Host $_ }
    if ($job.State -ne "Running") { break }
    Start-Sleep -Seconds 2
  }
} finally {
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -ErrorAction SilentlyContinue
}
