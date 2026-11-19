@echo off
chcp 65001 >nul
title Yupiii - Despliegue
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\desplegar.ps1"
echo.
pause
