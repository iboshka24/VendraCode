@echo off
REM ===========================================================================
REM  VendraCode - Windows build (double-clickable)
REM
REM  Builds the .exe installers for VendraCode on Windows.
REM  Everything else (checks, messages, artifact list) lives in
REM  scripts\build-windows.ps1
REM
REM  Usage:
REM     build-windows.bat                 full build (installer + portable)
REM     build-windows.bat portable        portable .exe only
REM     build-windows.bat installer       NSIS installer only
REM     build-windows.bat dir             unpacked build only (fastest)
REM
REM  Extra flags are passed through, e.g.:
REM     build-windows.bat full -SkipInstall
REM ===========================================================================

setlocal
cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
    echo [build-win] ERR powershell.exe was not found on PATH.
    echo [build-win]     It ships with Windows; this script cannot run without it.
    exit /b 1
)

REM Bypass only affects this process, so no system policy is changed.
REM Allow a bare mode word:  build-windows.bat portable  ->  -Mode portable
set "ARGS=%*"
if /i "%ARGS%"=="full" set "ARGS=-Mode full"
if /i "%ARGS%"=="installer" set "ARGS=-Mode installer"
if /i "%ARGS%"=="portable" set "ARGS=-Mode portable"
if /i "%ARGS%"=="dir" set "ARGS=-Mode dir"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-windows.ps1" %ARGS%
set "CODE=%ERRORLEVEL%"

if not "%CODE%"=="0" (
    echo.
    echo [build-win] FAILED with exit code %CODE%.
    echo [build-win] Common causes: missing Visual Studio C++ Build Tools ^(node-pty^),
    echo [build-win] missing Python, or TypeScript errors.
    exit /b %CODE%
)

echo.
echo [build-win] Done.
endlocal
