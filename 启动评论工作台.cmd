@echo off
setlocal
cd /d "%~dp0"
title Comment Console

set "NODE_BIN=%~dp0runtime\node.exe"
if exist "%NODE_BIN%" goto runtime_ready

where node >nul 2>nul
if errorlevel 1 goto no_runtime
set "NODE_BIN=node"

:runtime_ready
if not exist "node_modules\ws\package.json" goto incomplete_package

echo Starting Comment Console...
"%NODE_BIN%" launcher.js
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" exit /b 0

echo.
echo Startup failed with exit code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%

:no_runtime
echo [ERROR] Portable Node.js runtime was not found.
echo Please extract the entire ZIP package before starting.
pause
exit /b 1

:incomplete_package
echo [ERROR] Program files are incomplete.
echo Please extract the entire ZIP package again.
pause
exit /b 1
