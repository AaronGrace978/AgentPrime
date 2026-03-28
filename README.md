<p align="center">
  <img src="assets/agentprime-readme-banner.png" alt="AgentPrime banner" />
</p>

<h1 align="center">AgentPrime</h1>

<p align="center">
  Private, local-first coding workspace with integrated AI assistance.
</p>

<p align="center">
  Built with Electron, React, TypeScript, and a lean desktop-first workflow.
</p>

## Overview

AgentPrime is an AI coding workspace designed around a simple idea: keep the desktop app focused, fast, and useful. Instead of booting every experimental subsystem by default, the current public build centers on the core tools you actually use while coding:

- File navigation and editor workflow
- AI chat with fast / auto / deep model routing
- Curated model selection across OpenAI, Anthropic, Ollama, and OpenRouter
- Settings, keyboard shortcuts, command palette, and Git-aware actions
- Template-driven project setup for quick starts

## Why It Exists

AgentPrime aims to feel closer to a practical local coding tool than a bloated AI dashboard.

- Local desktop app with a familiar IDE-style shell
- Faster startup through a lean core profile
- Private, workspace-aware AI assistance
- Multi-provider model support instead of locking into one vendor
- Cleaner model routing for quick edits, deeper reasoning, and everyday coding tasks

## Current AI Stack

The in-app model selectors are organized around current provider families and curated defaults.

- OpenAI: GPT-5.4, GPT-5.4 Mini, GPT-5.4 Nano, GPT-5.3 Instant, GPT-4o
- Anthropic: Claude Opus 4.6, Claude Sonnet 4.6, Claude Haiku 4.5, older 4.5 and 4.0 fallbacks
- Ollama: local models plus newer Ollama Cloud picks such as Qwen 3.5, Qwen 3 Coder Next, DeepSeek v3.2, GLM-5, MiniMax M2.7, Devstral 2, and more
- OpenRouter: multi-provider access for teams that prefer a single routing layer

Default routing is tuned around:

- Fast model: `gpt-5.4-mini`
- Deep model: `claude-sonnet-4-6`
- Active default model: `gpt-5.4`

## Lean Core Profile

The current public-facing app intentionally keeps the default experience tight:

- Focused surface area: editor, workspace tools, AI composer, settings, command palette, and Git panel
- No auto-boot heavy subsystems at launch
- Better startup behavior with fewer background services and IPC registrations

## Quick Start

### Prerequisites

- Node.js 16+
- npm
- Git

### Install

```bash
git clone https://github.com/AaronGrace978/AgentPrime.git
cd AgentPrime
npm install
```

### Run

```bash
# Recommended
npm run quick-start

# Or manually
npm run build
npm run start:dev
```

## Development Scripts

```bash
# Build
npm run build
npm run build:main
npm run build:renderer

# Development
npm run dev
npm run start:dev
npm run quick-start

# Testing
npm test
npm run test:watch
npm run test:coverage
npm run test:e2e

# Quality
npm run lint
npm run typecheck

# Distribution
npm run dist
npm run dist:win
npm run dist:mac
npm run dist:linux
```

## Project Structure

```text
AgentPrime/
├── src/
│   ├── main/        # Electron main process
│   ├── renderer/    # React UI
│   └── types/       # Shared types
├── templates/       # Starter templates and project scaffolds
├── tests/           # Unit, integration, and e2e coverage
├── scripts/         # Build and utility scripts
└── dist/            # Build output
```

## Configuration

Provider and model selection live in the in-app settings panel.

Supported providers:

- Ollama
- Anthropic
- OpenAI
- OpenRouter

## Troubleshooting

### Build Issues

- Confirm Node.js 16+ is installed
- Reinstall dependencies with `npm install`
- Run `npm run typecheck` to catch TypeScript issues

### Runtime Issues

- Check the Electron console output for errors
- Verify provider keys and settings are configured
- Rebuild with `npm run build` and relaunch

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/my-change`
3. Make your changes
4. Run relevant tests or checks
5. Commit and push your branch
6. Open a pull request

## License

This project is open source and available under the MIT License. See `LICENSE` for details.