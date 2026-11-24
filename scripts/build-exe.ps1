$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Bin = Join-Path $Root "bin"
New-Item -ItemType Directory -Force -Path $Bin | Out-Null

$csc = @(
  "${env:WINDIR}\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "${env:WINDIR}\Microsoft.NET\Framework\v4.0.30319\csc.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $csc) {
  $bat = @"
@echo off
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "%~dp0start-mapharvest.ps1"
"@
  Set-Content -Path (Join-Path $Bin "MapHarvest.bat") -Value $bat -Encoding ASCII
  Write-Host "Created MapHarvest.bat"
} else {
  & $csc /nologo /target:winexe /reference:System.Windows.Forms.dll `
    /out:"$Bin\MapHarvest.exe" `
    "$Root\scripts\MapHarvestLauncher.cs"
  Write-Host "Built $Bin\MapHarvest.exe" -ForegroundColor Green
}

$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "MapHarvest.lnk"
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$target = Join-Path $Bin "MapHarvest.exe"
if (-not (Test-Path $target)) { $target = Join-Path $Bin "MapHarvest.bat" }
$lnk.TargetPath = $target
$lnk.WorkingDirectory = $Root
$lnk.Description = "MapHarvest — Google Maps lead search"
$lnk.Save()
Write-Host "Desktop shortcut → $lnkPath → $target" -ForegroundColor Green
