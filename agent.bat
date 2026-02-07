@echo off
:: AgentPrime - Personal AI Assistant
:: Quick launch: just run "agent" from anywhere

cd /d "%~dp0"
node dist\cli\agentprime.js agent %*
