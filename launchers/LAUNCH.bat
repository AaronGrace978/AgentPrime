@echo off
title AgentPrime Launcher
color 0A

:MENU
cls
echo.
echo   ╔══════════════════════════════════════════════════════════════╗
echo   ║                                                              ║
echo   ║     █████╗  ██████╗ ███████╗███╗   ██╗████████╗             ║
echo   ║    ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝             ║
echo   ║    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║                ║
echo   ║    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║                ║
echo   ║    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║                ║
echo   ║    ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝                ║
echo   ║                                                              ║
echo   ║    ██████╗ ██████╗ ██╗███╗   ███╗███████╗                   ║
echo   ║    ██╔══██╗██╔══██╗██║████╗ ████║██╔════╝                   ║
echo   ║    ██████╔╝██████╔╝██║██╔████╔██║█████╗                     ║
echo   ║    ██╔═══╝ ██╔══██╗██║██║╚██╔╝██║██╔══╝                     ║
echo   ║    ██║     ██║  ██║██║██║ ╚═╝ ██║███████╗                   ║
echo   ║    ╚═╝     ╚═╝  ╚═╝╚═╝╚═╝     ╚═╝╚══════╝                   ║
echo   ║                                                              ║
echo   ║           Your AI Coding Companion                           ║
echo   ║                                                              ║
echo   ╚══════════════════════════════════════════════════════════════╝
echo.
echo   ┌────────────────────────────────────────────────────────────┐
echo   │                      MAIN MENU                             │
echo   ├────────────────────────────────────────────────────────────┤
echo   │                                                            │
echo   │    1. Launch Electron App (Desktop IDE)                    │
echo   │    2. Start Gateway Server                                 │
echo   │    3. Run Diagnostics (Doctor)                             │
echo   │    4. Check System Status                                  │
echo   │    5. View Messaging Channels                              │
echo   │    6. Setup Wizard (Onboard)                               │
echo   │    7. Build CLI                                            │
echo   │    8. Install Dependencies                                 │
echo   │                                                            │
echo   │    0. Exit                                                 │
echo   │                                                            │
echo   └────────────────────────────────────────────────────────────┘
echo.
set /p choice="   Select [0-8]: "

if "%choice%"=="1" goto ELECTRON
if "%choice%"=="2" goto GATEWAY
if "%choice%"=="3" goto DOCTOR
if "%choice%"=="4" goto STATUS
if "%choice%"=="5" goto CHANNELS
if "%choice%"=="6" goto ONBOARD
if "%choice%"=="7" goto BUILD
if "%choice%"=="8" goto INSTALL
if "%choice%"=="0" goto EXIT
goto MENU

:ELECTRON
cls
echo.
echo   Starting Electron App...
echo.
call npm run start:dev
pause
goto MENU

:GATEWAY
cls
echo.
echo   Starting Gateway Server on port 18789...
echo   Press Ctrl+C to stop
echo.
node "%~dp0dist\cli\agentprime.js" gateway --port 18789
pause
goto MENU

:DOCTOR
cls
node "%~dp0dist\cli\agentprime.js" doctor
pause
goto MENU

:STATUS
cls
node "%~dp0dist\cli\agentprime.js" status
pause
goto MENU

:CHANNELS
cls
node "%~dp0dist\cli\agentprime.js" channels list
pause
goto MENU

:ONBOARD
cls
node "%~dp0dist\cli\agentprime.js" onboard
pause
goto MENU

:BUILD
cls
echo.
echo   Building CLI...
echo.
if not exist dist\cli mkdir dist\cli
call npx esbuild src/cli/index.ts --bundle --platform=node --outfile=dist/cli/agentprime.js --external:playwright --external:keytar --external:electron --format=cjs
echo.
echo   Done! CLI built to dist\cli\agentprime.js
echo.
pause
goto MENU

:INSTALL
cls
echo.
echo   Installing dependencies...
echo.
call npm install
echo.
echo   Done!
echo.
pause
goto MENU

:EXIT
cls
echo.
echo   Goodbye!
echo.
exit
