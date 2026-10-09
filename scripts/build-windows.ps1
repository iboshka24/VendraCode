<#
.SYNOPSIS
    Builds VendraCode for Windows (.exe installers) from a Windows machine.

.DESCRIPTION
    One-command Windows build:
      1. environment checks (Node, npm, Python for node-gyp, VS Build Tools)
      2. dependency install incl. the native node-pty compilation
      3. TypeScript type-check
      4. Vite production build of the renderer
      5. electron-builder --win (NSIS installer + portable exe)

.PARAMETER Mode
      full      -> NSIS installer + portable .exe (default)
      installer -> NSIS setup exe only
      portable  -> portable .exe only
      dir       -> unpacked build dir only (fastest, for smoke testing)

.PARAMETER SkipInstall
    Reuse the existing node_modules instead of running `npm ci`.

.PARAMETER SkipTypeCheck
    Skip `tsc --noEmit` (faster, but you lose the type safety net).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1 -Mode portable
#>

[CmdletBinding()]
param(
    [ValidateSet('full', 'installer', 'portable', 'dir')]
    [string]$Mode = 'full',
    [switch]$SkipInstall,
    [switch]$SkipTypeCheck,
    # Never prompt (CI / unattended runs).
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ─── Paths & constants ───────────────────────────────────────────────
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot
$ReleaseDir = Join-Path $RepoRoot 'release'
$LogPrefix = '[build-win]'

function Write-Step([string]$Message) { Write-Host "$LogPrefix === $Message ===" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "$LogPrefix OK  $Message" -ForegroundColor Green }
function Write-Caution([string]$Message) { Write-Host "$LogPrefix !!! $Message" -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host "$LogPrefix ERR $Message" -ForegroundColor Red }

$script:Failed = $false

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-VersionFromCommand([string]$Exe, [string[]]$Arguments) {
    try {
        return (& $Exe @Arguments 2>$null | Select-Object -First 1)
    } catch {
        return $null
    }
}

# ─── 0. OS guard ────────────────────────────────────────────────────
Write-Step 'Checking platform'
# $env:OS exists in Windows PowerShell 5.1 and PowerShell 7, and is safe under
# Set-StrictMode (unlike $IsWindows, which only exists on 7+).
if ($env:OS -ne 'Windows_NT') {
    Write-Caution 'This script is meant to run on Windows.'
    Write-Caution 'Building a Windows .exe from Linux/macOS needs wine and is not supported here.'
    Write-Caution 'Use the GitHub Actions workflow instead: .github/workflows/build.yml (push a tag v1.x.y).'
    exit 2
}

# ─── 1. Toolchain checks ────────────────────────────────────────────
Write-Step 'Checking toolchain'

if (-not (Test-Command 'node')) {
    Write-Fail 'Node.js not found. Install Node 20 LTS or newer: https://nodejs.org/'
    exit 1
}
$nodeVersion = (Get-VersionFromCommand 'node' '--version')
Write-Host "  node : $nodeVersion"

if (-not (Test-Command 'npm')) {
    Write-Fail 'npm not found. It ships with Node.js — reinstall it.'
    exit 1
}
$npmVersion = (Get-VersionFromCommand 'npm' '--version')
Write-Host "  npm  : $npmVersion"

$nodeMajor = [int]($nodeVersion -replace '^v(\d+)\..*$', '$1')
if ($nodeMajor -lt 18) {
    Write-Fail "Node 18+ is required (found $nodeVersion)."
    exit 1
}

# node-pty is an N-API (node-addon-api) module: it still compiles from source on
# Windows, which needs Python for node-gyp and the MSVC C++ toolchain.
$hasPython = Test-Command 'python'
if (-not $hasPython) { $hasPython = Test-Command 'python3' }
if (-not $hasPython) {
    Write-Fail 'Python not found. node-gyp needs it to compile the native node-pty module.'
    Write-Host  '  Install from https://www.python.org/downloads/ (check "Add Python to PATH").'
    exit 1
}
Write-Host "  python: $(Get-VersionFromCommand 'python' '--version')"

$vsWhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$hasVs = $false
if (Test-Path $vsWhere) {
    try {
        $vsInstallation = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
        if ($vsInstallation) { $hasVs = $true }
    } catch {
        # vswhere exists but reported nothing — fall through to the warning
    }
}

# electron-builder also needs to unpack the app; nothing else platform-specific is required on Windows.
if (-not $hasVs) {
    Write-Caution 'Visual Studio C++ Build Tools were not detected.'
    Write-Host  '  node-pty compiles from source on Windows and will fail without them.'
    Write-Host  '  Install with:  winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"'
    if ($Force) {
        Write-Caution 'Continuing without Visual Studio Build Tools because -Force was given.'
    } else {
        $answer = Read-Host 'Continue anyway? [y/N]'
        if ($answer -notmatch '^[yY]') { exit 1 }
    }
}

if (-not (Test-Path 'build\icon.ico')) {
    Write-Caution 'build\icon.ico is missing — the installer will fall back to the default Electron icon.'
}

# ─── 2. Dependencies ────────────────────────────────────────────────
if ($SkipInstall) {
    Write-Step 'Skipping dependency install (-SkipInstall)'
} else {
    Write-Step 'Installing dependencies (npm ci) — this compiles node-pty for Windows'
    if (Test-Path 'package-lock.json') {
        & npm ci
    } else {
        & npm install
    }
    if ($LASTEXITCODE -ne 0) { Write-Fail 'npm ci/install failed'; exit 1 }
}

# ─── 3. Type check ──────────────────────────────────────────────────
if ($SkipTypeCheck) {
    Write-Step 'Skipping type check (-SkipTypeCheck)'
} else {
    Write-Step 'Type-checking the renderer'
    & npx --yes tsc --noEmit
    if ($LASTEXITCODE -ne 0) { Write-Fail 'TypeScript errors — fix them before packaging'; exit 1 }
    Write-Ok 'types are clean'
}

# ─── 4. Renderer bundle ─────────────────────────────────────────────
Write-Step 'Building the renderer with Vite'
& npm run build
if ($LASTEXITCODE -ne 0) { Write-Fail 'vite build failed'; exit 1 }

# ─── 5. Package for Windows ─────────────────────────────────────────
# electron-builder takes the target list positionally: `--win nsis`,
# `--win portable`, or `--win --dir` for an unpacked build.
$builderArgs = @('--win')
$targets = switch ($Mode) {
    'installer' { @('nsis') }
    'portable' { @('portable') }
    'dir' { @('--dir') }
    default { @() }   # full: nsis + portable, as configured in package.json
}
$builderArgs += $targets

Write-Step "Running electron-builder $($builderArgs -join ' ')"
# `--publish never` keeps electron-builder from looking for GitHub credentials.
& npx --yes electron-builder @builderArgs --publish never
if ($LASTEXITCODE -ne 0) { Write-Fail 'electron-builder failed'; exit 1 }

# ─── 6. Report artifacts ────────────────────────────────────────────
Write-Step 'Build artifacts in release\'
if (-not (Test-Path $ReleaseDir)) {
    Write-Fail "No release directory at $ReleaseDir"
    exit 1
}

# `--dir` writes an unpacked build instead of installer files.
$searchDir = $ReleaseDir
if ($Mode -eq 'dir') {
    $unpacked = Join-Path $ReleaseDir 'win-unpacked'
    if (Test-Path $unpacked) { $searchDir = $unpacked }
}

$artifacts = Get-ChildItem -Path $searchDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -ieq '.exe' -or $_.Name -like '*.exe*' } |
    Sort-Object Name

if (-not $artifacts) {
    Write-Fail "No .exe artifacts were produced in $searchDir"
    if ($Mode -ne 'dir') {
        Write-Host '  Expected: "VendraCode Setup 1.0.0.exe" and "VendraCode-1.0.0-portable.exe"'
    }
    exit 1
}

$artifacts | ForEach-Object {
    Write-Host ("  {0,-52} {1,8:N1} MB" -f $_.Name, ($_.Length / 1MB)) -ForegroundColor Gray
}

Write-Ok "Windows build finished ($Mode)"
Write-Host "$LogPrefix Install the installer .exe or run the portable .exe from:"
Write-Host "  $ReleaseDir"
exit 0
