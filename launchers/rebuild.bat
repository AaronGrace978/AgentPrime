@echo off
cd /d "%~dp0"

REM Try to find npm in common locations
where npm >nul 2>&1
if %errorlevel% neq 0 (
    REM Check common Node.js installation paths (supports both PC and laptop)
    if exist "A:\Nodejs\npm.cmd" (
        set "PATH=A:\Nodejs;%PATH%"
    ) else if exist "C:\Program Files\nodejs\npm.cmd" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else if exist "%ProgramFiles%\nodejs\npm.cmd" (
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
    ) else if exist "%LOCALAPPDATA%\Programs\nodejs\npm.cmd" (
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    ) else if exist "%APPDATA%\nvm\current\npm.cmd" (
        set "PATH=%APPDATA%\nvm\current;%PATH%"
    ) else (
        echo ERROR: npm not found! Please ensure Node.js is installed.
        echo Try running from Node.js Command Prompt or add Node.js to your PATH.
        pause
        exit /b 1
    )
)

echo Building AgentPrime...
echo.
echo Building main process...
call npm run build:main
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Main build failed!
    pause
    exit /b %errorlevel%
)
echo.
echo Building renderer process...
call npm run build:renderer
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Renderer build failed!
    pause
    exit /b %errorlevel%
)
echo.
echo ========================================
echo Build completed successfully!
echo ========================================
pause

