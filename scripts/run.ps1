<#
.SYNOPSIS
    XakuMedia — Unified Application & Server Launcher for Windows PowerShell.

.DESCRIPTION
    Runs the entire XakuMedia application (Frontend, Desktop Shell, and Python Backend)
    or standalone components from a single command, displaying live local view URLs.

.PARAMETER Web
    Run only the web frontend dev server and open http://localhost:5173 in default browser.

.PARAMETER Server
    Run only the standalone Python JSON-RPC backend engine (interactive debug console).

.PARAMETER OpenBrowser
    Open http://localhost:5173 in the default web browser alongside the Electron window.

.PARAMETER Verify
    Run the pre-flight environment and dependency diagnostics.

.PARAMETER Clean
    Run workspace cache cleanup (build artifacts, Python caches, temporary files).

.PARAMETER Port
    Custom port for the Vite development server (default: 5173).

.EXAMPLE
    .\scripts\run.ps1
    Starts the full desktop application (Vite + Electron + Python) with local view URL.

.EXAMPLE
    .\scripts\run.ps1 -OpenBrowser
    Starts the full application and automatically opens the local web view in browser.

.EXAMPLE
    .\scripts\run.ps1 -Web
    Runs only the web frontend with local browser view.

.EXAMPLE
    .\scripts\run.ps1 -Server
    Runs the standalone Python backend debug server.
#>

[CmdletBinding()]
param(
    [switch]$Web,
    [switch]$Server,
    [switch]$OpenBrowser,
    [switch]$Verify,
    [switch]$Clean,
    [string]$Port = "5173"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
Set-Location $RootDir

function Write-Banner {
    Write-Host ""
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "        XAKURAII BULK DOWNLOADER (XAKUMEDIA) - ONE-CLICK LAUNCHER         " -ForegroundColor Cyan
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "  Root Directory: " -NoNewline -ForegroundColor DarkGray
    Write-Host "$RootDir" -ForegroundColor White
    Write-Host "  Timestamp:      " -NoNewline -ForegroundColor DarkGray
    Write-Host (Get-Date -Format "yyyy-MM-dd HH:mm:ss") -ForegroundColor DarkGray
    Write-Host ""
}

# Find local IPv4 address for local network view
function Get-LocalIpAddress {
    try {
        $ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*", "Ethernet*" -ErrorAction SilentlyContinue |
               Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
               Select-Object -First 1).IPAddress
        if ($ip) { return $ip }
    } catch {}
    return "127.0.0.1"
}

# Check if a port is responding to HTTP requests
function Test-HttpServer {
    param([string]$Url, [int]$TimeoutSeconds = 25)
    $startTime = [DateTime]::UtcNow
    while (([DateTime]::UtcNow - $startTime).TotalSeconds -lt $TimeoutSeconds) {
        try {
            $req = [System.Net.WebRequest]::Create($Url)
            $req.Timeout = 1500
            $resp = $req.GetResponse()
            $resp.Close()
            return $true
        } catch {
            Start-Sleep -Milliseconds 400
        }
    }
    return $false
}

Write-Banner

# -----------------------------------------------------------------------------
# Mode 1: Preflight Verification
# -----------------------------------------------------------------------------
if ($Verify) {
    Write-Host "[Launcher] Running pre-flight environment check..." -ForegroundColor Yellow
    node scripts/verify-env.mjs
    exit $LASTEXITCODE
}

# -----------------------------------------------------------------------------
# Mode 2: Workspace Clean
# -----------------------------------------------------------------------------
if ($Clean) {
    Write-Host "[Launcher] Running workspace cache cleanup..." -ForegroundColor Yellow
    node scripts/clean.mjs
    exit $LASTEXITCODE
}

# -----------------------------------------------------------------------------
# Mode 3: Standalone Python Backend Server
# -----------------------------------------------------------------------------
if ($Server) {
    Write-Host "[Launcher] Starting standalone Python backend JSON-RPC server..." -ForegroundColor Cyan
    node scripts/run-python-server.mjs
    exit $LASTEXITCODE
}

# -----------------------------------------------------------------------------
# Mode 4: Web-Only Mode (Frontend + Local Browser View)
# -----------------------------------------------------------------------------
if ($Web) {
    $LocalUrl = "http://localhost:" + $Port
    $LocalIp = Get-LocalIpAddress
    $NetworkUrl = "http://" + $LocalIp + ":" + $Port

    Write-Host "  Mode: " -NoNewline -ForegroundColor DarkGray
    Write-Host "Web Only (Browser Dev Mode)" -ForegroundColor Green
    Write-Host ""
    Write-Host "  * Local UI View:    " -NoNewline -ForegroundColor DarkGray
    Write-Host $LocalUrl -ForegroundColor Green
    Write-Host "  * Network UI View:  " -NoNewline -ForegroundColor DarkGray
    Write-Host $NetworkUrl -ForegroundColor Yellow
    Write-Host ""
    Write-Host "[Launcher] Starting Vite frontend server on port $Port..." -ForegroundColor Cyan

    $ViteProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "--prefix", "frontend", "run", "dev" -PassThru -NoNewWindow
    
    # Wait for server to become responsive
    if (Test-HttpServer -Url $LocalUrl -TimeoutSeconds 20) {
        Write-Host "[Launcher] Server is LIVE! Opening local view in default browser..." -ForegroundColor Green
        Start-Process $LocalUrl
    }

    try {
        $ViteProcess.WaitForExit()
    } finally {
        if (-not $ViteProcess.HasExited) {
            Write-Host "[Launcher] Stopping Vite server..." -ForegroundColor Yellow
            Stop-Process -Id $ViteProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
    exit 0
}

# -----------------------------------------------------------------------------
# Mode 5: Full Application (Vite Dev Server + Desktop Shell + Python Engine)
# -----------------------------------------------------------------------------
$LocalUrl = "http://localhost:" + $Port
$LocalIp = Get-LocalIpAddress
$NetworkUrl = "http://" + $LocalIp + ":" + $Port

Write-Host "  * Local View URL: " -NoNewline -ForegroundColor DarkGray
Write-Host $LocalUrl -ForegroundColor Green
Write-Host "  * Network URL:    " -NoNewline -ForegroundColor DarkGray
Write-Host $NetworkUrl -ForegroundColor Yellow
Write-Host "  * Desktop Shell:  " -NoNewline -ForegroundColor DarkGray
Write-Host "Electron Native Window" -ForegroundColor Cyan
Write-Host "  * Backend Engine: " -NoNewline -ForegroundColor DarkGray
Write-Host "Python 3.12 (JSON-RPC stdio)" -ForegroundColor Magenta
Write-Host ""

# 1. Compile Desktop Electron bundles
Write-Host "[1/3] Compiling desktop Electron main and preload scripts..." -ForegroundColor Cyan
node scripts/build-desktop.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "[Launcher] Error: Failed to compile desktop scripts." -ForegroundColor Red
    exit 1
}

# 2. Launch Vite Dev Server
Write-Host "[2/3] Starting Vite frontend server..." -ForegroundColor Cyan
$ViteProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "--prefix", "frontend", "run", "dev" -PassThru -NoNewWindow

# 3. Wait for Vite server to become responsive
Write-Host "[3/3] Waiting for local view ($LocalUrl) to be ready..." -ForegroundColor Cyan
$IsReady = Test-HttpServer -Url $LocalUrl -TimeoutSeconds 25

if (-not $IsReady) {
    Write-Host "[Launcher] Warning: Timed out waiting for Vite server at $LocalUrl. Proceeding anyway..." -ForegroundColor Yellow
} else {
    Write-Host "[Launcher] Local view is LIVE at $LocalUrl" -ForegroundColor Green
}

# Optionally open local view in web browser
if ($OpenBrowser) {
    Write-Host "[Launcher] Opening local view in default web browser..." -ForegroundColor Green
    Start-Process $LocalUrl
}

# 4. Launch Electron Desktop Shell
Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "  XAKUMEDIA APP IS RUNNING!" -ForegroundColor Green
Write-Host "  Local View URL: $LocalUrl" -ForegroundColor Green
Write-Host "  Press Ctrl+C in this console to stop all processes and exit" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host ""

$env:VITE_DEV_SERVER_URL = $LocalUrl

try {
    # Run Electron in the foreground
    & npx.cmd --prefix frontend electron desktop/dist/main.cjs
} finally {
    Write-Host ""
    Write-Host "[Launcher] Shutting down application and background services..." -ForegroundColor Yellow
    if ($ViteProcess -and -not $ViteProcess.HasExited) {
        Stop-Process -Id $ViteProcess.Id -Force -ErrorAction SilentlyContinue
    }
    # Clean up any lingering node vite instances on windows
    try {
        Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*vite*" } | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    } catch {}
    Write-Host "[Launcher] Shutdown complete. Goodbye!" -ForegroundColor DarkGray
}
