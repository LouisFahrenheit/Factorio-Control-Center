@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "RELEASE_URL=https://github.com/LouisFahrenheit/Factorio-Control-Center/releases/latest/download/factorio-control-center-win.zip"

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "FCC_DIR=%SCRIPT_DIR%\.."
if "%FCC_DIR:~-1%"=="\" set "FCC_DIR=%FCC_DIR:~0,-1%"

set "CURRENT_VER=?"
for /f "usebackq delims=" %%V in (`node "%SCRIPT_DIR%\read-app-version.mjs" 2^>nul`) do set "CURRENT_VER=%%V"

echo.
echo Factorio Control Center - update
echo Current version: %CURRENT_VER%
echo.
echo WARNING: The panel will be stopped. data\ and fcc-settings.ini are kept.
echo          Back up data\ and fcc-settings.ini before continuing.
echo.

set "ARCHIVE="
set "ARCHIVE_SOURCE="
set "UPDATE_PLAN="
call :find_local_archive
if not errorlevel 1 goto show_plan

set "UPDATE_PLAN=GitHub download"
set "ARCHIVE_SOURCE=download"
set "ARCHIVE=%RELEASE_URL%"
goto show_plan

:find_local_archive
if exist "%FCC_DIR%\factorio-control-center-win.zip" (
    set "ARCHIVE=%FCC_DIR%\factorio-control-center-win.zip"
    set "ARCHIVE_SOURCE=local"
    set "UPDATE_PLAN=Local archive"
    exit /b 0
)
if exist "%FCC_DIR%\..\factorio-control-center-win.zip" (
    set "ARCHIVE=%FCC_DIR%\..\factorio-control-center-win.zip"
    set "ARCHIVE_SOURCE=local"
    set "UPDATE_PLAN=Local archive"
    exit /b 0
)
for /f "delims=" %%F in ('dir /b /O-D "%FCC_DIR%\factorio-control-center-*-win.zip" 2^>nul') do (
    set "ARCHIVE=%FCC_DIR%\%%F"
    set "ARCHIVE_SOURCE=local"
    set "UPDATE_PLAN=Local archive (legacy name)"
    exit /b 0
)
for /f "delims=" %%F in ('dir /b /O-D "%FCC_DIR%\..\factorio-control-center-*-win.zip" 2^>nul') do (
    set "ARCHIVE=%FCC_DIR%\..\%%F"
    set "ARCHIVE_SOURCE=local"
    set "UPDATE_PLAN=Local archive (legacy name)"
    exit /b 0
)
exit /b 1

:show_plan
echo Update source: !UPDATE_PLAN!
echo   !ARCHIVE!
echo.
set /p "CONFIRM=Start update? [y/N]: "
if /I not "!CONFIRM!"=="y" (
    echo Update cancelled.
    exit /b 0
)
echo.

call "%SCRIPT_DIR%\stop-panel.bat"

if /I "!ARCHIVE_SOURCE!"=="download" (
    echo Downloading from GitHub...
    set "ARCHIVE=%TEMP%\fcc-update-download.zip"
    if exist "!ARCHIVE!" del /f /q "!ARCHIVE!" >nul 2>&1
    curl -fsSL -o "!ARCHIVE!" "%RELEASE_URL%"
    if errorlevel 1 (
        echo ERROR: Download failed: %RELEASE_URL%
        echo Put factorio-control-center-win.zip next to the panel folder and retry.
        exit /b 1
    )
)

echo Using archive:
echo   !ARCHIVE!
echo.

set "STAGING=%TEMP%\fcc-update-%RANDOM%%RANDOM%"
mkdir "%STAGING%" 2>nul
if not exist "%STAGING%" (
    echo ERROR: Could not create temp folder.
    exit /b 1
)

echo Extracting...
tar -xf "!ARCHIVE!" -C "%STAGING%"
if errorlevel 1 (
    echo ERROR: Could not extract archive.
    rmdir /s /q "%STAGING%" 2>nul
    exit /b 1
)

set "SRC=%STAGING%"
if not exist "%SRC%\dist\main.js" (
    for /d %%D in ("%STAGING%\*") do (
        if exist "%%D\dist\main.js" set "SRC=%%D"
    )
)
if not exist "%SRC%\dist\main.js" (
    echo ERROR: Invalid release archive ^(dist\main.js not found^).
    rmdir /s /q "%STAGING%" 2>nul
    exit /b 1
)

(
echo Updating %FCC_DIR% ...
robocopy "%SRC%" "%FCC_DIR%" /E /XD data logs /XF fcc-settings.ini /NFL /NDL /NJH /NJS /nc /ns /np
if errorlevel 8 (
    echo ERROR: Update copy failed.
    rmdir /s /q "%STAGING%" 2>nul
    exit /b 1
)

pushd "%FCC_DIR%"
echo Installing dependencies...
call npm ci --omit=dev
set "NPM_ERR=!ERRORLEVEL!"
popd
rmdir /s /q "%STAGING%" 2>nul

if not "!NPM_ERR!"=="0" (
    echo ERROR: npm ci failed.
    exit /b 1
)

set "NEW_VER=?"
for /f "usebackq delims=" %%V in (`node "%SCRIPT_DIR%\read-app-version.mjs" 2^>nul`) do set "NEW_VER=%%V"

echo.
echo Update complete: %CURRENT_VER% -^> !NEW_VER!

sc query "FactorioControlCenter" >nul 2>&1
if errorlevel 1 (
    echo You can start the panel with Start.bat -^> 1. Start panel.
    exit /b 0
)

echo Starting Windows service...
call "%SCRIPT_DIR%\install-service.bat" start
if errorlevel 1 (
    echo Service start failed. Try Start.bat -^> 5. Start service or 1. Start panel.
)
exit /b 0
)
