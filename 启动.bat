@echo off
setlocal
title ID Photo Tool
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
echo.
echo Server stopped. Press any key to close this window.
pause >nul
