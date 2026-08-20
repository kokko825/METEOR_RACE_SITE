@echo off
cd /d "%~dp0"
title METEOR RACE OPERATIONS STUDIO
curl.exe --silent --fail http://127.0.0.1:4317/health >nul 2>&1
if not errorlevel 1 (
  start "" http://localhost:3000/balance
  exit /b 0
)
echo [%date% %time%] START >> admin-launch.log
"C:\Program Files\nodejs\npm.cmd" run admin >> admin-launch.log 2>&1
echo [%date% %time%] STOP code=%errorlevel% >> admin-launch.log
