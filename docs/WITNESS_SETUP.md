# The Witness - Python Backend + DeepSeek Integration

## ✅ Complete Setup (Python + DeepSeek)!

The Witness now uses a **Python backend** with **DeepSeek integration** built-in:

- **Python Backend**: Advanced NLP processing and AI integration using `A:\Python\`
- **DeepSeek API**: Imported from AgentPrime, automatically configured
- **SQLite Database**: Persistent conversation memory
- **FastAPI Server**: REST API for seamless Electron integration

## Quick Start

1. **Diagnose Setup**: Run `diagnose-python.bat` (optional)
   - Checks Python installation and dependencies
   - Identifies any setup issues

2. **Setup Python Backend**: Choose one method:
   - **Standard**: `setup-python-backend.bat` (comprehensive setup)
   - **Simple**: `setup-python-backend-simple.bat` (alternative method)
   - **Manual**: Follow `MANUAL_PYTHON_SETUP.md` (step-by-step guide)

3. **Run The Witness**: Use `run-witness.bat`
   - Starts Python backend server (port 8000)
   - Launches Electron UI
   - DeepSeek integration active

## Manual Override (Optional)

If you want to use a different API key, you can still use:
- `setup-witness-ollama.bat` - Set custom environment variables
- `run-witness-ollama.bat` - Edit with custom API key

## Environment Variables

The scripts set these environment variables:

- `WITNESS_USE_OLLAMA=true` - Enable DeepSeek integration
- `WITNESS_OLLAMA_URL=https://ollama.deepseek.com` - Ollama endpoint
- `WITNESS_OLLAMA_MODEL=deepseek-v3.1:671b-cloud` - DeepSeek model
- `WITNESS_OLLAMA_API_KEY=your_key` - Your API key

## Getting a DeepSeek API Key

1. Go to [DeepSeek Platform](https://platform.deepseek.com/)
2. Sign up for an account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key for use with The Witness

## Architecture

```
Electron UI (React) ←→ FastAPI Backend (Python) ←→ DeepSeek API
     ↓                        ↓                          ↓
   User Input            NLP Processing          AI Enhancement
   Display              SQLite Storage          Presence Logic
```

## Features

- **Advanced NLP**: Sentiment analysis, topic extraction, emotional shifts
- **Memory System**: Remembers conversations from weeks ago
- **Presence Detection**: Notices long pauses, incomplete thoughts
- **DeepSeek Enhancement**: Optional AI-powered response improvement
- **Real-time UI**: Live presence indicators and conversation flow

## DeepSeek Integration

When active, The Witness uses DeepSeek to:

- **Enhance presence responses** with more nuanced understanding
- **Improve emotional detection** using advanced language models
- **Provide context-aware responses** that maintain radical presence
- **Maintain privacy** - all processing happens through secure API calls

## Fallback Behavior

If Ollama/DeepSeek is not available, The Witness automatically falls back to its base presence logic using built-in NLP libraries. The app will still function perfectly for radical presence conversations.

## Troubleshooting

### Diagnostic Tools
- **Run Diagnostics**: `diagnose-python.bat` - Comprehensive system check
- **Test Backend**: `test-python-backend.bat` - Test Python backend functionality
- **Manual Setup**: `MANUAL_PYTHON_SETUP.md` - Step-by-step troubleshooting guide

### Common Issues
- **Python Not Found**: Ensure `A:\Python\python.exe` exists and is accessible
- **Pip Path Issues**: Try `setup-python-backend-simple.bat` (uses `python -m pip`)
- **Dependencies Missing**: Run setup scripts or follow manual installation
- **Port Conflict**: Ensure port 8000 is available (Python backend)
- **Permission Issues**: Run Command Prompt as Administrator
- **API Key Issues**: DeepSeek key is built-in, but check internet for API calls
- **Connection Problems**: Check internet connection and DeepSeek service status
- **Backend Won't Start**: Check Python backend console output for errors

### Alternative Setup Methods
- **Simple Setup**: `setup-python-backend-simple.bat` (uses python -m pip)
- **Manual Installation**: Follow `MANUAL_PYTHON_SETUP.md`
- **Package-by-Package**: Install dependencies individually to identify issues

The Witness will show "DeepSeek Active" in the UI when the integration is working properly.

## Manual Override (Optional)

For custom configuration:
- `setup-witness-ollama.bat` - Set custom environment variables
- `run-witness-ollama.bat` - Edit with custom API key
