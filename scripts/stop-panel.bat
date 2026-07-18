@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "FCC_DIR=%SCRIPT_DIR%\.."
if "%FCC_DIR:~-1%"=="\" set "FCC_DIR=%FCC_DIR:~0,-1%"

set "NSSM_EXE=%SCRIPT_DIR%\nssm\nssm.exe"
set "SERVICE_NAME=FactorioControlCenter"

set "NEST_PORT=80"
if exist "%FCC_DIR%\package.json" (
    for /f "usebackq delims=" %%P in (`node "%SCRIPT_DIR%\read-bind-port.mjs" 2^>nul`) do set "NEST_PORT=%%P"
)

set "STOPPED=0"

sc query "%SERVICE_NAME%" | findstr /I "RUNNING" >nul 2>&1
if not errorlevel 1 (
    if exist "%NSSM_EXE%" (
        "%NSSM_EXE%" stop "%SERVICE_NAME%" >nul 2>&1
    )
    sc stop "%SERVICE_NAME%" >nul 2>&1
    echo Stopped Windows service.
    set "STOPPED=1"
)

for %%P in (%NEST_PORT% 80 443 8080 8443 5173) do (
    set "LISTEN_PID="
    for /f "tokens=5" %%I in ('netstat -ano ^| findstr "LISTENING" ^| findstr /C:":%%P "') do set "LISTEN_PID=%%I"
    if defined LISTEN_PID (
        echo Stopping port %%P - PID !LISTEN_PID!...
        taskkill /PID !LISTEN_PID! /T /F >nul 2>&1
        set "STOPPED=1"
    )
)

if "%STOPPED%"=="1" (
    echo Done.
) else (
    echo Panel is not running.
)

exit /b 0
