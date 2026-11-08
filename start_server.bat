@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting Custom AI Research Studio Server on http://localhost:8080 ...
py server.py
pause
