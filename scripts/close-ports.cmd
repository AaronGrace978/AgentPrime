@echo off
REM Close AgentPrime-related ports (8000=Python backend, 11434/11435=Ollama)
REM Run as Administrator if you get "Access denied"

echo Finding processes on ports 8000, 11434, 11435...
for %%p in (8000 11434 11435) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p" ^| findstr "LISTENING"') do (
    echo Killing PID %%a on port %%p
    taskkill /F /PID %%a 2>nul
  )
)
echo Done.
