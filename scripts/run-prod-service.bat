@echo off
setlocal EnableExtensions

set "FCC_DIR=%~dp0.."
if "%FCC_DIR:~-1%"=="\" set "FCC_DIR=%FCC_DIR:~0,-1%"
set "FCC_ROOT_DIR=%FCC_DIR%"

cd /d "%FCC_DIR%"

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found in PATH.
    exit /b 1
)

if not exist "%FCC_DIR%\dist\main.js" (
    echo ERROR: dist\main.js not found. Run from a release bundle or build first.
    exit /b 1
)

node dist\main.js
