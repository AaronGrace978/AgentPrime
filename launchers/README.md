# AgentPrime Launchers

Secondary launcher scripts. Main launchers are at project root.

## Main Launchers (Root)

- **`agent.bat`** - CLI Agent (interactive AI assistant with tools)
- **`start.bat`** - Full app launcher (Electron IDE or Python backend)

## These Launchers (Secondary)

| Script | Purpose |
|--------|---------|
| `gateway.bat` | Start the WebSocket gateway server |
| `doctor.bat` | Run system diagnostics |
| `status.bat` | Check system status |
| `channels.bat` | Manage messaging channels |
| `rebuild.bat` | Rebuild the project |
| `setup.bat` | Initial setup |
| `start-electron.bat` | Start Electron app directly |
| `start-dual-ollama.bat` | Start dual Ollama instances |
| `LAUNCH.bat` | Legacy launcher |
| `agentprime.bat` | Legacy CLI launcher |

## Usage

From project root:
```batch
:: Quick AI chat
agent.bat

:: Full app
start.bat

:: Or run these directly
launchers\gateway.bat
launchers\doctor.bat
```
