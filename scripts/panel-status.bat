@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "FCC_DIR=%SCRIPT_DIR%\.."
if "%FCC_DIR:~-1%"=="\" set "FCC_DIR=%FCC_DIR:~0,-1%"

set "SERVICE_NAME=FactorioControlCenter"
set "NEST_PORT=80"
if exist "%FCC_DIR%\package.json" (
    for /f "usebackq delims=" %%P in (`node "%SCRIPT_DIR%\read-bind-port.mjs" 2^>nul`) do set "NEST_PORT=%%P"
)

set "PANEL_STATE=Not running"
set "PANEL_DETAIL="
for %%P in (%NEST_PORT% 80 443 8080 8443 5173) do (
    if not defined PANEL_DETAIL (
        set "LISTEN_PID="
        for /f "tokens=5" %%I in ('netstat -ano ^| findstr "LISTENING" ^| findstr /C:":%%P "') do set "LISTEN_PID=%%I"
        if defined LISTEN_PID (
            set "PANEL_STATE=Running"
            set "PANEL_DETAIL=port %%P, PID !LISTEN_PID!"
        )
    )
)

set "SERVICE_STATE=Not installed"
sc query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 (
    set "SERVICE_STATE=Stopped"
    sc query "%SERVICE_NAME%" | findstr /I "RUNNING" >nul 2>&1
    if not errorlevel 1 set "SERVICE_STATE=Running"
    sc query "%SERVICE_NAME%" | findstr /I "START_PENDING" >nul 2>&1
    if not errorlevel 1 set "SERVICE_STATE=Starting"
    sc query "%SERVICE_NAME%" | findstr /I "STOP_PENDING" >nul 2>&1
    if not errorlevel 1 set "SERVICE_STATE=Stopping"
)

set "APP_VERSION=?"
for /f "usebackq delims=" %%V in (`node "%SCRIPT_DIR%\read-app-version.mjs" 2^>nul`) do set "APP_VERSION=%%V"

echo.
echo Factorio Control Center - status
echo --------------------------------
echo Version: !APP_VERSION!
echo Panel:   !PANEL_STATE!
if defined PANEL_DETAIL echo          !PANEL_DETAIL!
echo Service: !SERVICE_STATE!
echo URL:     http://127.0.0.1:%NEST_PORT%/
echo.

exit /b 0
