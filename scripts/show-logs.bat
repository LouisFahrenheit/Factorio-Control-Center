@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "FCC_DIR=%SCRIPT_DIR%\.."
if "%FCC_DIR:~-1%"=="\" set "FCC_DIR=%FCC_DIR:~0,-1%"
set "LOG_FILE=%FCC_DIR%\logs\web_panel.log"

echo.
if not exist "%LOG_FILE%" (
    echo File not found: %LOG_FILE%
    echo Start the panel first ^(option 1^) or install the service ^(option 3^).
    pause
    exit /b 1
)

echo === web_panel.log ===
echo.
chcp 65001 >nul
node "%SCRIPT_DIR%\read-panel-log.mjs" "%LOG_FILE%"
if errorlevel 1 pause & exit /b 1
echo.
pause
