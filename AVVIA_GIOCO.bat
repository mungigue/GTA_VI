@echo off
title VICE COAST - Avvio gioco
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0avvia-gioco.ps1"
