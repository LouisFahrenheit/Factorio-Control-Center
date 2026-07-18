@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ACTION=%~1"
if not defined ACTION set "ACTION=install"

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "FCC_DIR=%SCRIPT_DIR%\.."
if "%FCC_DIR:~-1%"=="\" set "FCC_DIR=%FCC_DIR:~0,-1%"

set "NSSM_EXE=%SCRIPT_DIR%\nssm\nssm.exe"
set "SERVICE_NAME=FactorioControlCenter"
set "DISPLAY_NAME=Factorio Control Center"

if /I "%ACTION%"=="install" goto do_install
if /I "%ACTION%"=="remove" goto do_remove
if /I "%ACTION%"=="start" goto do_start
if /I "%ACTION%"=="stop" goto do_stop
if /I "%ACTION%"=="status" goto do_status
goto show_usage

:show_usage
echo.
echo Factorio Control Center - Windows Service ^(NSSM^)
echo.
echo   install-service.bat install   ^(Administrator^)
echo   install-service.bat remove    ^(Administrator^)
echo   install-service.bat start
echo   install-service.bat stop
echo   install-service.bat status
echo.
exit /b 0

:require_admin
net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: Run as Administrator ^(right-click Start.bat^).
    exit /b 1
)
exit /b 0

:ensure_nssm
if exist "%NSSM_EXE%" exit /b 0
echo ERROR: scripts\nssm\nssm.exe not found. Reinstall from a release archive.
exit /b 1

:find_node
set "NODE_EXE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE (
    for /f "delims=" %%N in ('where node 2^>nul') do (
        set "NODE_EXE=%%N"
        goto node_found
    )
)
if not defined NODE_EXE (
    echo ERROR: Node.js not found. Install from https://nodejs.org/ for all users.
    exit /b 1
)
:node_found
if not exist "%FCC_DIR%\dist\main.js" (
    echo ERROR: dist\main.js not found.
    exit /b 1
)
exit /b 0

:stop_and_delete_service
sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 exit /b 0
if exist "%NSSM_EXE%" (
    "%NSSM_EXE%" stop "%SERVICE_NAME%" >nul 2>&1
    "%NSSM_EXE%" remove "%SERVICE_NAME%" confirm >nul 2>&1
) else (
    sc stop "%SERVICE_NAME%" >nul 2>&1
    timeout /t 3 /nobreak >nul
    sc delete "%SERVICE_NAME%" >nul 2>&1
)
timeout /t 2 /nobreak >nul
exit /b 0

:do_install
call :require_admin
if errorlevel 1 exit /b 1
call :ensure_nssm
if errorlevel 1 exit /b 1
call :find_node
if errorlevel 1 exit /b 1

set "MAIN_JS=%FCC_DIR%\dist\main.js"
if not exist "%FCC_DIR%\logs" mkdir "%FCC_DIR%\logs"

call :stop_and_delete_service

"%NSSM_EXE%" install "%SERVICE_NAME%" "%NODE_EXE%" "%MAIN_JS%"
if errorlevel 1 (
    echo ERROR: nssm install failed.
    exit /b 1
)
"%NSSM_EXE%" set "%SERVICE_NAME%" AppDirectory "%FCC_DIR%"
"%NSSM_EXE%" set "%SERVICE_NAME%" DisplayName "%DISPLAY_NAME%"
"%NSSM_EXE%" set "%SERVICE_NAME%" Description "Factorio Control Center web panel"
"%NSSM_EXE%" set "%SERVICE_NAME%" Start SERVICE_AUTO_START
"%NSSM_EXE%" set "%SERVICE_NAME%" AppEnvironmentExtra "FCC_ROOT_DIR=%FCC_DIR%"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStdout "%FCC_DIR%\logs\service.stdout.log"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStderr "%FCC_DIR%\logs\service.stderr.log"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateFiles 1
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateBytes 1048576

"%NSSM_EXE%" start "%SERVICE_NAME%"
if errorlevel 1 (
    echo.
    echo Service created but start failed. Check logs\service.stderr.log
    exit /b 1
)

echo.
echo Windows Service installed and started.
echo   Name:   %DISPLAY_NAME% ^(%SERVICE_NAME%^)
echo   Folder: %FCC_DIR%
echo   Node:   %NODE_EXE%
echo   Starts at boot without user logon.
echo   Manage: services.msc
echo.
echo Note: Node.js cannot run as a native Windows service via sc.exe alone.
echo NSSM wraps node.exe so the panel can start from services.msc.
exit /b 0

:do_remove
call :require_admin
if errorlevel 1 exit /b 1
call :stop_and_delete_service
echo Windows Service removed.
exit /b 0

:do_start
sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 (
    echo ERROR: Service is not installed. Run install first.
    exit /b 1
)
if exist "%NSSM_EXE%" (
    "%NSSM_EXE%" start "%SERVICE_NAME%"
) else (
    sc start "%SERVICE_NAME%"
)
if errorlevel 1 (
    echo ERROR: start failed. Check logs\service.stderr.log
    exit /b 1
)
echo Service started.
exit /b 0

:do_stop
sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 (
    echo ERROR: Service is not installed. Run install first.
    exit /b 1
)
sc query "%SERVICE_NAME%" | findstr /I "RUNNING" >nul 2>&1
if errorlevel 1 (
    echo Service is not running.
    exit /b 0
)
if exist "%NSSM_EXE%" (
    "%NSSM_EXE%" stop "%SERVICE_NAME%"
) else (
    sc stop "%SERVICE_NAME%"
)
if errorlevel 1 (
    echo ERROR: stop failed.
    exit /b 1
)
echo Service stopped.
exit /b 0

:do_status
sc query "%SERVICE_NAME%"
if errorlevel 1 (
    echo.
    echo Service '%DISPLAY_NAME%' is not installed.
)
exit /b 0
