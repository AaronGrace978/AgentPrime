# AgentPrime Alpha Release Notes

## Version: 1.0.0-alpha

**Release Date:** January 2026

---

## Overview

AgentPrime is now in alpha stage. This document outlines known issues, limitations, and what to expect during the alpha period.

---

## What Works Well

### Core Features
- **Multi-Agent System**: Specialized agents (Tool Orchestrator, JavaScript Specialist, Python Specialist, etc.) work together to complete complex tasks
- **Multiple AI Providers**: Anthropic Claude, OpenAI GPT, Ollama, OpenRouter all supported
- **Template System**: Generate projects from pre-built templates (React, Express, FastAPI, Tauri, etc.)
- **File Operations**: Create, read, write, delete files with full workspace management
- **Code Intelligence**: Monaco editor with syntax highlighting, IntelliSense, and AI completions

### Security Features (Recently Implemented)
- **Secure API Key Storage**: API keys encrypted using OS keychain (Windows Credential Manager, macOS Keychain) with AES-256-GCM fallback
- **IPC Validation**: All inter-process communication validated and rate-limited
- **Path Traversal Protection**: File operations restricted to workspace boundaries
- **Command Sanitization**: Dangerous commands blocked, workspace boundary enforced

### Reliability Features (Recently Implemented)
- **Task Mode Protection**: FIX mode prevents destructive overwrites during bug fixes
- **Automatic Rollback**: Changes exceeding thresholds are automatically rolled back
- **Project Backup**: Automatic backups before FIX/ENHANCE operations
- **Error Boundaries**: React error boundaries catch and display errors gracefully
- **Operation Timeouts**: 10-20 minute task timeouts prevent infinite hangs

---

## Known Issues & Limitations

### High Priority (May Affect Usage)

1. **Large Components**
   - `AIChat.tsx` is now a compatibility re-export; the feature is split into modular files under `src/renderer/components/AIChat/`
   - Main chat component logic moved into `AIChat/index.tsx` with focused hooks/components
   - Lazy loading is implemented for heavy panels (AI chat and git)

2. **TypeScript Strict Mode Disabled**
   - Some `any` types exist in codebase
   - Working: Gradual migration in progress

3. **Memory Usage**
   - Main in-memory chat history is capped to recent messages
   - Long sessions can still accumulate state in deeper agent/memory paths
   - Future: Expand context compression and retention controls across all conversation stores

4. **Model Timeouts**
   - Large cloud models (671B) may timeout on complex tasks
   - Working: Adaptive timeouts based on model size
   - Fallback chain automatically tries faster models

### Medium Priority (Edge Cases)

5. **File Size Limits**
   - Very large files (>10MB) may cause slowdowns
   - Binary files not fully supported
   - Workaround: Avoid opening huge files in editor

6. **Command Execution**
   - Long-running commands timeout after 30s by default
   - Interactive commands (requiring user input) not supported
   - Workaround: Run long commands in external terminal

7. **Git Integration**
   - Basic Git operations work (status, commit, diff)
   - Complex Git workflows may need external tools
   - Rebase/merge conflicts require manual resolution

### Low Priority (Minor)

8. **UI Polish**
   - Some UI animations may stutter on older hardware
   - Dark theme only (light theme planned)
   - Keyboard shortcut conflicts possible with OS shortcuts

9. **Test Coverage**
   - Coverage thresholds are currently set to baseline guardrails while lean-core tests expand
   - E2E tests cover main flows
   - Some edge cases are still not covered

---

## Security Considerations

### What's Protected
- API keys encrypted at rest (OS keychain or AES-256-GCM)
- IPC messages validated and rate-limited
- File operations sandboxed to workspace
- Dangerous commands blocked

### What to Be Aware Of
- Projects have access to run commands in their workspace
- AI-generated code should be reviewed before running
- Don't store sensitive data in AI conversation history

---

## Recommended Configuration

### For Best Performance
```
Provider: Ollama with cloud models (devstral-small-2:24b-cloud)
Or: Anthropic Claude Sonnet 4
```

### For Complex Projects
```
Provider: Ollama with qwen3-coder:480b-cloud
Or: Anthropic Claude Opus
Timeout: Complex tasks get 20 minutes automatically
```

### For Offline Development
```
Provider: Ollama with local models
Models: qwen2.5-coder:7b or deepseek-coder:6.7b
```

---

## Reporting Issues

### Before Reporting
1. Check this document for known issues
2. Try restarting the application
3. Check the console for error messages (View > Toggle Developer Tools)

### What to Include
- Steps to reproduce
- Error messages (if any)
- Console output
- AgentPrime version
- Operating system
- AI provider and model being used

### Where to Report
- GitHub Issues (preferred)
- Include logs from `~/.agentprime/logs/` if available

---

## Upgrade Notes

### From Pre-Alpha
- API keys will be automatically migrated to secure storage
- Old `settings.json` keys will be removed after migration
- Backups are created before destructive operations

### Configuration Changes
- New task mode detection (CREATE/FIX/REVIEW/ENHANCE)
- Automatic rollback for FIX mode changes exceeding thresholds
- Project backups stored in `.agentprime-backup/`

---

## Roadmap to Beta

### Phase 1 (Current - Alpha)
- [x] Core functionality stable
- [x] Security hardening
- [x] Basic error handling
- [x] Documentation

### Phase 2 (Planned - Beta)
- [ ] Increase test coverage to 60%+
- [ ] Performance monitoring and optimization
- [ ] Light theme support
- [ ] Enhanced Git integration

### Phase 3 (Future - Release)
- [ ] Test coverage 80%+
- [ ] Plugin system
- [ ] Collaborative features
- [ ] Auto-updater fully enabled

---

## Getting Help

- **Documentation**: See `docs/` folder
- **Troubleshooting**: See README.md
- **Architecture**: See SYSTEM_ARCHITECTURE_ANALYSIS.md

---

## Thank You

Thank you for testing AgentPrime alpha! Your feedback helps make it better.

*Last Updated: January 2026*
