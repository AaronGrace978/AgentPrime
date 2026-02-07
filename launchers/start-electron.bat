@echo off
chcp 65001 >nul
title AgentPrime - Electron App
cd /d "%~dp0"

echo.
echo    ╔══════════════════════════════════════════════════════════════╗
echo    ║                    AGENT PRIME                                ║
echo    ║              Starting Electron App...                        ║
echo    ╚══════════════════════════════════════════════════════════════╝
echo.

if not exist "node_modules" (
    echo [*] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [X] Error: npm not found! Please install Node.js first.
        echo [*] Download from: https://nodejs.org/
        pause
        exit /b 1
    )
)

echo [*] Building AgentPrime...
call npm run build
if errorlevel 1 (
    echo [X] Build failed! Check errors above.
    pause
    exit /b 1
)

echo [*] Launching AgentPrime...
call npx electron .

