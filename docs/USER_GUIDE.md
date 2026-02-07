# AgentPrime User Guide

## Getting Started

### First Launch

When you first launch AgentPrime, you'll see the Onboarding wizard which will guide you through the initial setup.

### Opening a Project

1. Press `Ctrl+O` (Windows/Linux) or `Cmd+O` (macOS)
2. Or use the Command Palette (`Ctrl+K`) and search for "Open Project"
3. Select a folder to open as your workspace

### Setting Up AI Providers

1. Open Settings (`Ctrl+,` or Command Palette > Settings)
2. Navigate to "AI Providers"
3. Enter your API keys for the providers you want to use:
   - **Anthropic**: Get your key from https://console.anthropic.com
   - **OpenAI**: Get your key from https://platform.openai.com
   - **Ollama**: Run locally, no key needed
   - **OpenRouter**: Get your key from https://openrouter.ai

## Keyboard Shortcuts

### File Operations
- `Ctrl+O` - Open Project
- `Ctrl+S` - Save File
- `Ctrl+Shift+S` - Save All
- `Ctrl+W` - Close Tab

### AI Features
- `Ctrl+Shift+C` - Open AI Composer
- `Ctrl+J` - Just Chat (casual conversation)
- `Ctrl+Shift+W` - Words to Code
- `Ctrl+Shift+M` - Mirror Intelligence

### Navigation
- `Ctrl+K` - Command Palette
- `Ctrl+B` - Toggle File Explorer
- `Ctrl+\`` - Toggle Terminal
- `Ctrl+Shift+G` - Git Panel

### Editor
- `Ctrl+F` - Search & Replace
- `Tab` - Accept ghost text completion
- `Escape` - Clear ghost text

## AI Features

### AI Composer

The AI Composer is your primary interface for interacting with AI. It can:
- Answer questions about your code
- Generate new code
- Refactor existing code
- Debug issues
- Explain complex logic

### Ghost Text Completions

As you type, AgentPrime provides inline suggestions. Press `Tab` to accept a suggestion.

### Mirror Intelligence

Mirror Intelligence learns from your coding patterns and provides personalized suggestions based on your style.

### Words to Code

Describe what you want to build in natural language, and AgentPrime will generate the code structure for you.

## Project Management

### Task Manager

Access the Task Manager with `Ctrl+Shift+T` to:
- Create and track tasks
- Organize work with priorities
- Mark tasks as complete

### Git Integration

The Git Panel (`Ctrl+Shift+G`) provides:
- File staging
- Commit creation
- Branch management
- Push/pull operations

## Settings

### Theme

Switch between light and dark themes in Settings.

### Font Size

Adjust editor font size from 10-24pt.

### AI Model Selection

Choose which AI model to use for different tasks:
- **Fast Model**: Quick tasks, completions
- **Deep Model**: Complex analysis, refactoring

## Troubleshooting

### AI Not Responding

1. Check your API key is correct in Settings
2. Verify you have internet connection
3. Check the provider's status page

### Performance Issues

1. Close unused files and panels
2. Restart AgentPrime
3. Check system resources (RAM, CPU)

### Files Not Saving

1. Check file permissions
2. Ensure disk space is available
3. Try "Save As" to a different location

## Getting Help

- Press `F1` to view all keyboard shortcuts
- Use the Command Palette (`Ctrl+K`) to find features
- Check the README for technical details
