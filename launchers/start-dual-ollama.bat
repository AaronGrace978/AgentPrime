@echo off
chcp 65001 >nul
title AgentPrime - Dual Ollama Setup
cd /d "%~dp0"

echo.
echo    ╔══════════════════════════════════════════════════════════════╗
echo    ║          AgentPrime - Dual Ollama Instance Setup             ║
echo    ╚══════════════════════════════════════════════════════════════╝
echo.

echo [*] Starting PRIMARY Ollama instance on port 11434...
echo     Model: qwen3-coder:480b-cloud
start "Ollama Primary (11434)" ollama serve

timeout /t 3 /nobreak >nul

echo [*] Starting SECONDARY Ollama instance on port 11435...
echo     Model: deepseek-v3.1:671b-cloud
set OLLAMA_HOST=127.0.0.1:11435
start "Ollama Secondary (11435)" ollama serve

echo.
echo ═══════════════════════════════════════════════════════════════════
echo  DUAL OLLAMA RUNNING!
echo ═══════════════════════════════════════════════════════════════════
echo.
echo  Instance 1: http://localhost:11434 (Primary - qwen3-coder)
echo  Instance 2: http://localhost:11435 (Secondary - deepseek-v3.1)
echo.
echo  AgentPrime will use Instance 1 as primary
echo  and fail over to Instance 2 if needed
echo.
echo  Press any key to launch AgentPrime...
pause >nul

echo.
echo [*] Launching AgentPrime...
npm start
