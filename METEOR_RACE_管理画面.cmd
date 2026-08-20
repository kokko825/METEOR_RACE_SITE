@echo off
cd /d "%~dp0"
title METEOR RACE OPERATIONS STUDIO
"C:\Program Files\nodejs\npm.cmd" run admin
if errorlevel 1 pause
