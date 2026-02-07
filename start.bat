@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title AgentPrime

REM Add Node.js to PATH for this session (supports both PC and laptop)
REM PC location
if exist "A:\Nodejs\npm.cmd" (
    set "PATH=A:\Nodejs;%PATH%"
)
REM Laptop location
if exist "C:\Program Files\nodejs\npm.cmd" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
)

REM Add Python to PATH for this session (supports both PC and laptop)
REM Laptop Python 3.13 locations
if exist "C:\Users\AGrac\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Python 3.13" (
    set "PATH=C:\Users\AGrac\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Python 3.13;%PATH%"
)
if exist "C:\Users\AGrac\AppData\Local\Programs\Python\Python3.13" (
    set "PATH=C:\Users\AGrac\AppData\Local\Programs\Python\Python3.13;C:\Users\AGrac\AppData\Local\Programs\Python\Python3.13\Scripts;%PATH%"
)

echo.
echo    ╔══════════════════════════════════════════════════════════════╗
echo    ║                                                              ║
echo    ║     █████╗  ██████╗ ███████╗███╗   ██╗████████╗             ║
echo    ║    ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝             ║
echo    ║    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║                ║
echo    ║    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║                ║
echo    ║    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║                ║
echo    ║    ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝                ║
echo    ║                                                              ║
echo    ║    ██████╗ ██████╗ ██╗███╗   ███╗███████╗                   ║
echo    ║    ██╔══██╗██╔══██╗██║████╗ ████║██╔════╝                   ║
echo    ║    ██████╔╝██████╔╝██║██╔████╔██║█████╗                     ║
echo    ║    ██╔═══╝ ██╔══██╗██║██║╚██╔╝██║██╔══╝                     ║
echo    ║    ██║     ██║  ██║██║██║ ╚═╝ ██║███████╗                   ║
echo    ║    ╚═╝     ╚═╝  ╚═╝╚═╝╚═╝     ╚═╝╚══════╝                   ║
echo    ║                                                              ║
echo    ║           🤖 Your AI Coding Companion 🤖                     ║
echo    ║                                                              ║
echo    ╚══════════════════════════════════════════════════════════════╝
echo.

echo [?] What do you want to run?
echo.
echo     1. Electron App (Desktop IDE - Recommended)
echo     2. Python Backend Server (Web UI)
echo.
set /p "mode=Select [1-2]: "

if "!mode!"=="1" (
    echo.
    echo [*] Starting Electron App...
    echo.
    cd /d "%~dp0"
    if not exist "node_modules" (
        echo [*] Installing dependencies...
        call npm install
        if errorlevel 1 (
            echo [X] Error: npm install failed!
            pause
            goto :end
        )
    )

    echo [*] Building main process...
    call npx webpack --config webpack.main.config.js
    if errorlevel 1 (
        echo [X] Main process build failed! Check errors above.
        pause
        goto :end
    )
    
    echo [*] Building renderer process...
    call npx webpack --config webpack.renderer.config.js
    if errorlevel 1 (
        echo [X] Renderer build failed! Check errors above.
        pause
        goto :end
    )
    
    echo [*] Launching AgentPrime...
    call npx electron .
    goto :end
)

REM Python Backend Mode
cd /d "%~dp0backend"

if "%WORKSPACE_ROOT%"=="" (
    echo [?] Which project do you want to open?
    echo.
    echo     1. SoulMirror
    echo     2. AgentPrimeAi
    echo     3. EduAi
    echo     4. DestinyMap
    echo     5. GlyphLogicAi
    echo     6. AgentPrime
    echo     7. Custom path
    echo.
    set /p "choice=Select [1-7]: "
    
    if "!choice!"=="1" set "WORKSPACE_ROOT=F:\SoulMirror"
    if "!choice!"=="2" set "WORKSPACE_ROOT=F:\AgentPrimeAi"
    if "!choice!"=="3" set "WORKSPACE_ROOT=F:\EduAi"
    if "!choice!"=="4" set "WORKSPACE_ROOT=F:\DestinyMap"
    if "!choice!"=="5" set "WORKSPACE_ROOT=F:\GlyphLogicAi"
    if "!choice!"=="6" set "WORKSPACE_ROOT=F:\AgentPrime"
    if "!choice!"=="7" (
        set /p "WORKSPACE_ROOT=Enter full path: "
    )
)

echo.
echo [*] Opening: !WORKSPACE_ROOT!
echo [*] Server: http://localhost:8000
echo.

REM Check for Python - Try multiple locations for cross-machine compatibility
REM Supports both laptop (E:\, A:\) and desktop (C:\, G:\, etc.) configurations
REM Also supports laptop Python 3.13 installation
set PYTHON_EXE=

REM Laptop Python 3.13 location (from Start Menu Programs path)
"C:\Users\AGrac\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Python 3.13\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=C:\Users\AGrac\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Python 3.13\python.exe
    echo [*] Using Python at C:\Users\AGrac\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Python 3.13\python.exe
    goto :python_found
)

REM Also check common Python 3.13 installation paths
"C:\Users\AGrac\AppData\Local\Programs\Python\Python3.13\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=C:\Users\AGrac\AppData\Local\Programs\Python\Python3.13\python.exe
    echo [*] Using Python at C:\Users\AGrac\AppData\Local\Programs\Python\Python3.13\python.exe
    goto :python_found
)

REM Desktop locations (common)
"C:\Python\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=C:\Python\python.exe
    echo [*] Using Python at C:\Python\python.exe
    goto :python_found
)

"C:\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=C:\python.exe
    echo [*] Using Python at C:\python.exe
    goto :python_found
)

"G:\Python\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=G:\Python\python.exe
    echo [*] Using Python at G:\Python\python.exe
    goto :python_found
)

"G:\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=G:\python.exe
    echo [*] Using Python at G:\python.exe
    goto :python_found
)

REM Laptop locations (preserved for compatibility)
"E:\Python\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=E:\Python\python.exe
    echo [*] Using Python at E:\Python\python.exe
    goto :python_found
)

"E:\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=E:\python.exe
    echo [*] Using Python at E:\python.exe
    goto :python_found
)

"A:\Python\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=A:\Python\python.exe
    echo [*] Using Python at A:\Python\python.exe
    goto :python_found
)

"A:\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=A:\python.exe
    echo [*] Using Python at A:\python.exe
    goto :python_found
)

REM Other common drives
"D:\Python\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=D:\Python\python.exe
    echo [*] Using Python at D:\Python\python.exe
    goto :python_found
)

"D:\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=D:\python.exe
    echo [*] Using Python at D:\python.exe
    goto :python_found
)

"F:\Python\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=F:\Python\python.exe
    echo [*] Using Python at F:\Python\python.exe
    goto :python_found
)

"F:\python.exe" --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=F:\python.exe
    echo [*] Using Python at F:\python.exe
    goto :python_found
)

REM Try py launcher
py --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=py
    echo [*] Using Python via py launcher
    goto :python_found
)

REM Try python command from PATH
where python >nul 2>&1
if not errorlevel 1 (
    set PYTHON_EXE=python
    echo [*] Using Python from PATH
    goto :python_found
)

echo [X] Error: Python not found!
echo [*] Checked locations:
echo     - C:\Users\AGrac\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Python 3.13\python.exe (laptop)
echo     - C:\Users\AGrac\AppData\Local\Programs\Python\Python3.13\python.exe (laptop)
echo     - C:\Python\python.exe, C:\python.exe
echo     - G:\Python\python.exe, G:\python.exe
echo     - E:\Python\python.exe, E:\python.exe (laptop)
echo     - A:\Python\python.exe, A:\python.exe (laptop)
echo     - D:\Python\python.exe, D:\python.exe
echo     - F:\Python\python.exe, F:\python.exe
echo     - py launcher
echo     - PATH environment variable
echo [*] Please install Python or ensure it's accessible.
echo [*] Download from: https://www.python.org/downloads/
pause
goto :end

:python_found
if not exist "venv" (
    echo [*] Creating virtual environment...
    %PYTHON_EXE% -m venv venv
    if errorlevel 1 (
        echo [X] Error: Failed to create virtual environment
        pause
        goto :end
    )
)

if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    echo [X] Error: Virtual environment not found at venv\Scripts\activate.bat
    pause
    goto :end
)

REM Use the venv Python if available, otherwise use detected Python
if exist "venv\Scripts\python.exe" (
    set PIP_CMD=venv\Scripts\pip.exe
    set PYTHON_CMD=venv\Scripts\python.exe
) else (
    set PIP_CMD=%PYTHON_EXE% -m pip
    set PYTHON_CMD=%PYTHON_EXE%
)

%PIP_CMD% install -q -r requirements.txt 2>nul
if errorlevel 1 (
    echo [*] Installing requirements (this may take a moment)...
    %PIP_CMD% install -r requirements.txt
)

rem Set OLLAMA_API_KEY in your environment or .env file
if not defined OLLAMA_API_KEY set OLLAMA_API_KEY=
set OLLAMA_MODEL=qwen3-coder:480b-cloud

start http://localhost:8000
%PYTHON_CMD% run.py

:end
pause
