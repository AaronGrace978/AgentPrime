<p align="center">
  <img src="assets/agentprime-readme-banner.png" alt="AgentPrime banner" />
</p>

<h1 align="center">AgentPrime</h1>

<p align="center">
  Local-first AI coding workspace for desktop.
</p>

<p align="center">
  Built with Electron, React, TypeScript, Monaco, and an optional Python "Brain" backend.
</p>

<p align="center">
  Owned and maintained by <a href="https://BostonAI.io">BostonAI.io</a>.
</p>

## Overview

AgentPrime is a desktop IDE designed to keep AI assistance close to the real coding workflow instead of turning the product into a generic chat shell.

It combines:

- A lean Electron desktop app with workspace, tabs, file tree, terminal, search, settings, and command palette
- AI chat, agent execution, inline edit, and model routing across multiple providers
- Template-based project starts, Git-aware workflows, live preview, and deployment helpers
- Secure renderer-to-main IPC with a preload bridge and desktop-first privacy defaults

The goal is simple: give you a practical local coding environment that feels fast, workspace-aware, and useful from the first launch.

## What AgentPrime Can Do

- Open a project and work in a full desktop IDE shell with Monaco editor, tabs, file tree, terminal, and search/replace
- Talk to AI in chat mode or let the agent operate on a workspace with file context, open tabs, and terminal history
- Route requests through fast, deep, or auto model selection
- Use multiple providers without locking the app to a single vendor
- Run specialized agents for more structured multi-step work
- Review streamed agent progress and capture file changes for review
- Apply inline AI edits directly from the editor
- Use ghost text completions and contextual coding assistance
- Generate projects from built-in templates
- Preview and deploy projects from inside the app
- Work with Git actions and VibeHub-style repository workflows

## Recent Upgrades

- Better AI Composer stability. Once the composer has been opened, it stays mounted when collapsed so in-flight work is not reset.
- Faster, richer chat rendering with a virtualized message list and improved code blocks with copy/apply actions.
- Safer chat payload handling through schema-validated IPC context with stricter bounds on incoming data.
- Faster workspace source discovery with new glob-based helpers for agent context, verification, and indexing.
- Better specialized-agent execution with bounded parallel tool work and stronger review/verification plumbing.
- Improved Ollama handling so cloud-style endpoints do not get treated like a local daemon health check path.
- Shortcut behavior aligned with the UI: `Ctrl+K` opens the command palette outside the editor, while `Ctrl+K` in Monaco remains inline AI edit.

## Core Features

### AI Workspace

- AI chat with streaming responses
- Agent mode for workspace-aware autonomous tasks
- Chat, agent, and alternate assistant modes in the composer
- File mentions and focused workspace context
- Error recovery UI for auth, context, and provider failures

### Model Routing

- Multi-provider support: OpenAI, Anthropic, Ollama, and OpenRouter
- Fast, deep, and auto routing modes
- In-app model selection and settings persistence
- Local-model friendly workflows through Ollama

### Coding Tools

- Monaco editor with inline AI edit
- Ghost text completions
- Command palette
- Search and replace
- Symbol and analysis plumbing for deeper workspace awareness
- Keyboard shortcuts editor

### Project Workflow

- Integrated terminal
- Git panel and repository helpers
- Template-driven project creation
- Live preview
- Deploy helpers for common frontend hosting workflows
- Recent projects and workspace-aware startup flow

### Optional Brain Backend

- FastAPI-based Python backend for extended orchestration and memory-style workflows
- Backend manager support from the Electron app
- Packaged backend resources for desktop builds

## Architecture

```text
AgentPrime
├── src/main          Electron main process, IPC, providers, security, backend manager
├── src/renderer      React UI, IDE shell, AI chat, editor, panels
├── src/types         Shared types
├── src/cli           CLI entrypoints and commands
├── src/main/agent    Agent loop, specialist orchestration, tool validation
├── src/main/ipc-handlers
│                     Files, git, search, chat, analysis, terminal, deploy, completions
├── src/main/security Secure storage and IPC validation
├── src/main/search   Symbol and codebase indexing
├── backend           Python Brain service
├── templates         Starter templates
└── tests             Unit, integration, and e2e coverage
```

## Security Model

AgentPrime is desktop-first, but it still treats the renderer like an untrusted surface.

- `nodeIntegration` is disabled
- `contextIsolation` is enabled
- Renderer access flows through a preload bridge
- Chat IPC context is validated before it reaches the main process
- API keys are stored through secure storage mechanisms with encrypted fallback handling
- CSP rules and backend origin restrictions are applied to reduce unsafe surface area

## Quick Start

### Prerequisites

- Node.js LTS, 18+ recommended
- npm
- Git

### Install

```bash
git clone https://github.com/AaronGrace978/AgentPrime.git
cd AgentPrime
npm install
```

### Run The App

```bash
# Recommended local run
npm run quick-start

# Or build then launch
npm run build
npm start
```

### Development Watch Mode

```bash
npm run dev
```

That runs webpack watch tasks for the main and renderer bundles. When you want to launch the desktop app from the built output, use `npm start`.

## Scripts

```bash
# App
npm start
npm run dev
npm run quick-start
npm run start:dev

# Build
npm run build
npm run build:main
npm run build:renderer

# Quality
npm run lint
npm run typecheck

# Tests
npm test
npm run test:watch
npm run test:coverage
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:performance
npm run test:all

# Distribution
npm run dist
npm run dist:win
npm run dist:mac
npm run dist:linux
npm run dist:all

# CLI
npm run cli
npm run cli:build
npm run agent
npm run chat
```

## CLI

AgentPrime also ships a CLI-oriented surface for local workflows.

- `agentprime agent`
- `agentprime doctor`
- `agentprime onboard`
- `agentprime status`

You can build the CLI with:

```bash
npm run cli:build
```

## Configuration

Provider selection and most app configuration live in the in-app settings panel.

Supported providers:

- OpenAI
- Anthropic
- Ollama
- OpenRouter

Typical setup flow:

1. Launch the app.
2. Open Settings.
3. Configure your provider keys or local model endpoint.
4. Choose an active model and dual-model routing preferences.

## Keyboard Shortcuts

- `Ctrl+K`: Command palette outside the editor
- `Ctrl+K`: Inline AI edit when Monaco editor focus owns the shortcut
- `Ctrl+L`: Toggle AI composer
- `Ctrl+O`: Open project
- `Ctrl+S`: Save current file
- `Ctrl+B`: Toggle sidebar
- `Ctrl+Shift+F`: Search and replace in files
- `Ctrl+Shift+G`: Toggle Git panel
- `Ctrl+Shift+P`: Toggle live preview
- `F5`: Run current file

The app also includes a keyboard shortcuts editor for reviewing and adjusting bindings.

## Templates

The `templates/` directory includes starter project scaffolds for common stacks and workflows so you can create a new project without starting from a blank folder.

Examples include frontend, backend, desktop, and full-stack starters such as Vite, Next.js, Electron, Tauri, and FastAPI-oriented setups.

## Packaging

Desktop packaging is handled through Electron Builder.

- Windows: NSIS and portable targets
- macOS: DMG and ZIP targets
- Linux: AppImage, DEB, and RPM targets

Build outputs are emitted under the configured release directory during distribution builds.

## Troubleshooting

### Build Issues

- Reinstall dependencies with `npm install`
- Run `npm run typecheck`
- Run `npm run lint`
- Rebuild with `npm run build`

### App Launch Issues

- Make sure `dist/main/main.js` exists by running `npm run build`
- Relaunch with `npm start`
- Check terminal output for Electron or webpack errors

### Provider Issues

- Verify API keys in Settings
- Confirm Ollama is running if you are using local models
- Recheck the selected model and routing mode

### Backend Issues

- If you use the optional Brain backend, verify the Python service is available
- Rebuild and relaunch if packaged resources or startup wiring changed

## Build With AgentPrime

AgentPrime is proprietary software owned by Aaron Alexander Grace / BostonAI.io, but builders are welcome in the ecosystem.

- You can build integrations, extensions, automations, connectors, plugins, and compatible tooling that work with AgentPrime
- You can connect your own systems or services into AgentPrime workflows
- You can contribute improvements to the project
- You cannot copy, repackage, resell, or create derivative commercial versions of the AgentPrime source code without permission
- AgentPrime, BostonAI.io, and related branding remain owned by Aaron Alexander Grace / BostonAI.io

## Contributing

1. Fork the repository.
2. Create a branch such as `git checkout -b feature/my-change`.
3. Make your changes.
4. Run relevant checks.
5. Open a pull request.

Contributions are welcome. By submitting a contribution, you affirm that you have the right to submit it and agree that it may be used, modified, and distributed as part of AgentPrime under this project's ownership and license terms.

## License

This repository is source-available for evaluation and review, but it is not open source.

- Copyright remains with Aaron Alexander Grace / BostonAI.io
- Builders are welcome to create integrations, extensions, plugins, and compatible tooling around AgentPrime
- No right is granted to copy, modify, redistribute, sublicense, sell, or create derivative commercial works without prior written permission
- See `LICENSE` for the full proprietary license terms