@echo off
rem ---------------------------------------------------------------------------
rem  BuildPlanner - upload local changes to GitHub.
rem
rem  This file is deliberately ASCII-only. Korean text inside a .bat breaks the
rem  cmd parser depending on the active code page, so every message lives in
rem  scripts\github-upload.ps1 (UTF-8 with BOM) instead.
rem ---------------------------------------------------------------------------
title BuildPlanner - GitHub Upload
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\github-upload.ps1" %*

echo.
pause
