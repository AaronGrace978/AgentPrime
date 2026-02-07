# AgentPrime Folder Organization

This document describes the current folder structure and organization of the AgentPrime project.

## Directory Structure

### Root Level
- **Configuration files**: `package.json`, `tsconfig.*.json`, `webpack.*.config.js`, `jest.config.*`, `playwright.config.js`
- **Entry point scripts**: `*.bat` files (launchers for different components)
- **README.md**: Main project documentation

### `/src` - Source Code
- **`/src/main`**: TypeScript main process code
  - **`/src/main/legacy`**: Legacy JavaScript modules still in use
    - `codebase-indexer.js` - Codebase indexing and symbol resolution
    - `agent-mode.js` - Autonomous agent mode functionality
    - `action-executor.js` - Action execution system
    - `natural-language-executor.js` - Natural language command execution
    - `intelligent-context-builder.js` - Context building utilities
    - `template-engine.js` - Template generation engine
  - **`/src/main/ai-providers`**: AI provider implementations (TypeScript)
  - **`/src/main/core`**: Core business logic (TypeScript)
  - **`/src/main/ipc-handlers`**: IPC communication handlers (TypeScript)
  - **`/src/main/mirror`**: Mirror intelligence system (TypeScript)
  - **`/src/main/tools`**: Utility tools (TypeScript)
- **`/src/renderer`**: Electron renderer process (React/TypeScript)
- **`/src/types`**: TypeScript type definitions

### `/scripts` - Utility Scripts
- **`/scripts`**: Test and utility scripts
  - `check-models.js` - Check available AI models
  - `test-model.js` - Test AI model connectivity
  - `test-template-creation.js` - Test template generation
  - `test-workspace.js` - Test workspace functionality
- **`/scripts/mirror`**: Mirror Intelligence System modules
  - `mirror-memory.js` - Memory management
  - `mirror-pattern-extractor.js` - Pattern extraction
  - `mirror-feedback-loop.js` - Feedback loop system
  - `mirror-knowledge-ingester.js` - Knowledge ingestion
  - `intelligence-expansion.js` - Intelligence expansion algorithms
  - `adaptive-code-generator.js` - Adaptive code generation
  - `claude-level-techniques.js` - Advanced techniques
  - `claude-opus-max-mirror.js` - Opus-level mirroring
  - `hyper-advanced-patterns.js` - Hyper-advanced patterns
  - `intelligence-boosting-code.js` - Intelligence boosting utilities

### `/archive` - Legacy and Archived Code
- **`/archive/legacy`**: Old JavaScript implementations (replaced by TypeScript)
  - `main.js` - Old main process entry point
  - `preload.js` - Old preload script
  - `/ai-providers` - Old AI provider implementations
  - `/ipc-handlers` - Old IPC handler implementations
  - `/tools` - Old tool implementations
- **`/archive/old-frontend`**: Old frontend code
- **`/archive/projects`**: Archived project files
- **`/archive/tests`**: Archived test files

### `/docs` - Documentation
- `API.md` - API documentation
- `MIGRATION_STATUS.md` - Migration status from JS to TS
- `MIRROR_KNOWLEDGE_GUIDE.md` - Mirror system guide
- `MODEL_SETUP.md` - AI model setup instructions
- `PROJECT_TEMPLATES.md` - Template system documentation
- `TEMPLATE_SYSTEM.md` - Template system details
- `UI_REDESIGN_PROPOSAL.md` - UI redesign proposal
- `VIBE_CODING_METHODS.md` - Coding methods documentation
- `QWEN3_CODER_UPDATE.md` - Qwen3 coder update notes
- `ORGANIZATION.md` - This file

### Other Directories
- **`/backend`**: Python FastAPI backend
- **`/templates`**: Project templates for generation
- **`/tests`**: Test files
- **`/dist`**: Build output (generated)
- **`/data`**: Application data and logs
- **`/lib`**: Utility libraries
- **`/renderer`**: Legacy renderer files (being migrated)
- **`/Projects`**: User projects directory

## Migration Notes

The project is in the process of migrating from JavaScript to TypeScript:
- New TypeScript code is in `/src/main`
- Legacy JavaScript modules still in use are in `/src/main/legacy`
- Old unused JavaScript code is in `/archive/legacy`

## Import Path Updates

When referencing moved files:
- Legacy modules: `src/main/legacy/[module-name]`
- Mirror modules: `scripts/mirror/[module-name]`
- Utility scripts: `scripts/[script-name]`

## File Locations Reference

### Core Modules (Legacy JS, still in use)
- Codebase Indexer: `src/main/legacy/codebase-indexer.js`
- Agent Mode: `src/main/legacy/agent-mode.js`
- Action Executor: `src/main/legacy/action-executor.js`
- Template Engine: `src/main/legacy/template-engine.js`
- Natural Language Executor: `src/main/legacy/natural-language-executor.js`
- Intelligent Context Builder: `src/main/legacy/intelligent-context-builder.js`

### Mirror Intelligence System
- All mirror modules: `scripts/mirror/`

### Utility Scripts
- Check Models: `scripts/check-models.js`
- Test Model: `scripts/test-model.js`
- Test Template Creation: `scripts/test-template-creation.js`
- Test Workspace: `scripts/test-workspace.js`

