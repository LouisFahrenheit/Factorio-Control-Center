@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "FCC_DIR=%~dp0"
if "%FCC_DIR:~-1%"=="\" set "FCC_DIR=%FCC_DIR:~0,-1%"
set "FCC_ROOT_DIR=%FCC_DIR%"

if not exist "%FCC_DIR%\package.json" (
    echo ERROR: package.json not found at %FCC_DIR%
    pause
    exit /b 1
)

cd /d "%FCC_DIR%"
call "%FCC_DIR%\scripts\load-bind-port.bat"

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Install from https://nodejs.org/
    pause
    exit /b 1
)

call :detect_release
call :ensure_deps

:menu
cls
echo.
echo  Factorio Control Center
echo.
echo  1. Start panel
echo  2. Stop panel
echo  3. Install service        
echo  4. Remove service
echo  5. Start service
echo  6. Stop service
echo  7. Update panel
echo  8. Show panel log
echo  9. Status
echo 10. Exit
echo.
set /p "ACTION=Choose [1-10]: "

if "%ACTION%"=="1" goto start_panel
if "%ACTION%"=="2" goto stop_panel
if "%ACTION%"=="3" goto install_service
if "%ACTION%"=="4" goto remove_service
if "%ACTION%"=="5" goto start_service
if "%ACTION%"=="6" goto stop_service
if "%ACTION%"=="7" goto update_panel
if "%ACTION%"=="8" goto show_logs
if "%ACTION%"=="9" goto panel_status
if "%ACTION%"=="10" exit /b 0
goto menu

:start_panel
call :ensure_port_free %NEST_PORT% Panel
if errorlevel 1 (
    echo Use option 2 to stop the panel first.
    pause
    goto menu
)
if "%FCC_RELEASE%"=="1" goto start_prod_ready
if exist "%FCC_DIR%\dist\main.js" if exist "%FCC_DIR%\client\dist\index.html" goto start_prod_ready
echo.
echo Build not found. Use StartDEV.bat to build from source, or install a release archive.
pause
goto menu

:start_prod_ready
if not exist "%FCC_DIR%\dist\main.js" (
    echo ERROR: dist\main.js missing.
    pause
    goto menu
)
for /f "usebackq delims=" %%V in (`node "%FCC_DIR%\scripts\read-app-version.mjs" 2^>nul`) do set "APP_VERSION=%%V"
echo.
echo Starting panel v!APP_VERSION! ...
echo Open: %PANEL_URL%
start "Factorio Control Center" /D "%FCC_DIR%" cmd /k "set FCC_ROOT_DIR=%FCC_ROOT_DIR%&& node dist\main"
timeout /t 3 /nobreak >nul
pause
goto menu

:stop_panel
echo.
call "%FCC_DIR%\scripts\stop-panel.bat"
pause
goto menu

:install_service
call :require_admin
if errorlevel 1 pause & goto menu
echo.
call "%FCC_DIR%\scripts\install-service.bat" install
pause
goto menu

:remove_service
call :require_admin
if errorlevel 1 pause & goto menu
echo.
call "%FCC_DIR%\scripts\install-service.bat" remove
pause
goto menu

:start_service
echo.
call "%FCC_DIR%\scripts\install-service.bat" start
pause
goto menu

:stop_service
echo.
call "%FCC_DIR%\scripts\install-service.bat" stop
pause
goto menu

:update_panel
call :require_admin
if errorlevel 1 pause & goto menu
echo.
call "%FCC_DIR%\scripts\update-panel.bat"
pause
goto menu

:show_logs
call "%FCC_DIR%\scripts\show-logs.bat"
goto menu

:panel_status
call "%FCC_DIR%\scripts\panel-status.bat"
pause
goto menu

:require_admin
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: This action requires Administrator rights.
    echo Right-click Start.bat -^> Run as administrator.
    exit /b 1
)
exit /b 0

:detect_release
set "FCC_RELEASE=0"
if exist "%FCC_DIR%\client\dist\index.html" if not exist "%FCC_DIR%\client\package.json" set "FCC_RELEASE=1"
exit /b 0

:ensure_deps
if exist "%FCC_DIR%\node_modules\" exit /b 0
echo Installing dependencies...
if "%FCC_RELEASE%"=="1" (
    call npm ci --omit=dev
) else (
    call npm install
)
exit /b 0

:ensure_port_free
set "CHECK_PORT=%~1"
set "CHECK_NAME=%~2"
if not defined CHECK_PORT exit /b 2
if not defined CHECK_NAME set "CHECK_NAME=Process"
set "LISTEN_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "LISTENING" ^| findstr /C:":%CHECK_PORT% "') do set "LISTEN_PID=%%P"
if defined LISTEN_PID (
    echo %CHECK_NAME% already on port %CHECK_PORT% ^(PID !LISTEN_PID!^)
    exit /b 1
)
exit /b 0
