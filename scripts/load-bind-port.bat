@echo off
rem Sets NEST_PORT, PORT_MODE, PANEL_URL, NEST_URL from fcc-settings.ini (via read-bind-port.mjs).
set "NEST_PORT=80"
set "PORT_MODE=auto"
if defined FCC_DIR set "FCC_ROOT_DIR=%FCC_DIR%"
if not defined FCC_ROOT_DIR set "FCC_ROOT_DIR=%~dp0.."
if defined FCC_DIR set "FCC_SETTINGS_PATH=%FCC_DIR%\fcc-settings.ini"
set "INI_FILE=%FCC_ROOT_DIR%\fcc-settings.ini"
for /f "usebackq delims=" %%P in (`node "%~dp0read-bind-port.mjs" 2^>nul`) do set "NEST_PORT=%%P"
if exist "%INI_FILE%" (
  findstr /I /B /C:"port_mode=auto" "%INI_FILE%" >nul 2>&1 && set "PORT_MODE=auto"
) else (
  set "PORT_MODE=auto"
)
if "%NEST_PORT%"=="80" (
  set "PANEL_URL=http://127.0.0.1/"
  set "NEST_URL=http://127.0.0.1/"
) else if "%NEST_PORT%"=="443" (
  set "PANEL_URL=https://127.0.0.1/"
  set "NEST_URL=https://127.0.0.1/"
) else (
  set "PANEL_URL=http://127.0.0.1:%NEST_PORT%/"
  set "NEST_URL=http://127.0.0.1:%NEST_PORT%/"
)
