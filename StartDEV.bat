@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "FCC_DIR=%~dp0"
if "%FCC_DIR:~-1%"=="\" set "FCC_DIR=%FCC_DIR:~0,-1%"
set "FCC_ROOT_DIR=%FCC_DIR%"
set "VITE_PORT=5173"
set "VITE_URL=http://127.0.0.1:5173/login"

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

set "FCC_RELEASE=0"
if exist "%FCC_DIR%\client\dist\index.html" if not exist "%FCC_DIR%\client\package.json" set "FCC_RELEASE=1"

if not exist "%FCC_DIR%\node_modules\" (
    echo Installing backend dependencies...
    call npm install
)
if not exist "%FCC_DIR%\client\node_modules\" (
    echo Installing client dependencies...
    pushd "%FCC_DIR%\client"
    call npm install
    popd
)

:menu
cls
echo.
echo  Factorio Control Center - DEV
echo  -----------------------------
echo  Dev UI:  %VITE_URL%
echo  Prod UI: %PANEL_URL%
echo.
echo  1. Dev mode ^(Nest + Vite^)
echo  2. Production ^(build if needed^)
echo  3. Build all
echo  4. Open dev UI
echo  5. Open prod UI
echo  6. Stop servers
echo  7. Pack release
echo  8. Exit
echo.
set /p "ACTION=Choose [1-8]: "

if "%ACTION%"=="1" goto run_dev
if "%ACTION%"=="2" goto run_prod
if "%ACTION%"=="3" goto build_all
if "%ACTION%"=="4" start "" "%VITE_URL%" & goto menu
if "%ACTION%"=="5" start "" "%PANEL_URL%" & goto menu
if "%ACTION%"=="6" goto stop_servers
if "%ACTION%"=="7" goto pack_release
if "%ACTION%"=="8" exit /b 0
goto menu

:run_dev
if "%FCC_RELEASE%"=="1" (
    echo Dev mode is not available in a release build.
    pause
    goto menu
)
call :ensure_port_free %NEST_PORT% Nest
if errorlevel 1 goto menu
call :ensure_port_free %VITE_PORT% Vite
if errorlevel 1 goto menu
echo Starting Nest...
start "FCC Nest API" /D "%FCC_DIR%" cmd /k "set FCC_ROOT_DIR=%FCC_ROOT_DIR%&& npm run start:dev"
timeout /t 8 /nobreak >nul
echo Starting Vite...
start "FCC React Vite" /D "%FCC_DIR%" cmd /k npm run client:dev
timeout /t 5 /nobreak >nul
echo Dev: %VITE_URL%  ^|  API: %NEST_URL%
pause
goto menu

:run_prod
call :ensure_port_free %NEST_PORT% Nest
if errorlevel 1 goto menu
if exist "%FCC_DIR%\dist\main.js" if exist "%FCC_DIR%\client\dist\index.html" goto start_prod
echo Building...
call npm run build:all
if errorlevel 1 (
    echo Build failed.
    pause
    goto menu
)
:start_prod
start "FCC Production" /D "%FCC_DIR%" cmd /k "set FCC_ROOT_DIR=%FCC_ROOT_DIR%&& node dist\main"
timeout /t 5 /nobreak >nul
echo Production: %PANEL_URL%
pause
goto menu

:build_all
call npm run build:all
pause
goto menu

:pack_release
call npm run pack:release
pause
goto menu

:stop_servers
call "%FCC_DIR%\scripts\stop-panel.bat"
pause
goto menu

:ensure_port_free
set "CHECK_PORT=%~1"
set "CHECK_NAME=%~2"
set "LISTEN_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "LISTENING" ^| findstr /C:":%CHECK_PORT% "') do set "LISTEN_PID=%%P"
if defined LISTEN_PID (
    echo %CHECK_NAME% on port %CHECK_PORT% - PID !LISTEN_PID!
    exit /b 1
)
exit /b 0
