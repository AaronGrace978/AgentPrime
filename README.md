<p align="center">
 <img width="1917" height="1030" alt="image" src="https://github.com/user-attachments/assets/1937adbc-d62e-42cd-aaa3-0f45875076c9" />
</p>

<p align="center">
<img width="1895" height="949" alt="image" src="https://github.com/user-attachments/assets/9e8ffd6f-b5a9-4b93-b10b-f4f857ce18d9" />
</p>

<h1 align="center">AgentPrime</h1>

<p align="center">
  Desktop AI coding workspace with agent execution, multi-provider chat, and review-first automation.
</p>

<p align="center">
  <strong>Now shipping:</strong> explicit review/apply checkpoints, `instant` / `standard` / `deep` reflection budgets, discipline-first specialists, and calmer mode-aware chat.
</p>

<p align="center">
  Built with Electron, React, TypeScript, Monaco, and an optional Python "Brain" backend.
</p>

<p align="center">
  Owned and maintained by <a href="https://BostonAI.io">BostonAI.io</a>.
</p>

## Overview

AgentPrime is a desktop AI IDE built to keep coding assistance inside a real workspace instead of reducing everything to a generic browser chat box.

It combines:

- A full Electron desktop shell with tabs, Monaco editor, file tree, terminal, search, settings, and command palette
- Multiple interaction styles: Agent Mode for workspace actions, Just Chat for general conversation, and Dino Buddy for calm companion chat
- Multi-provider AI routing across Ollama, OpenAI, Anthropic, and OpenRouter
- Review-first agent workflows with staged multi-file changes, verification, and repair loops
- Template-based project starts, Git-aware workflows, live preview, and deployment helpers
- Secure renderer-to-main IPC, preload isolation, and desktop-first key handling

The goal is simple: make AI feel like part of your IDE, not a separate website.

## Project Status

AgentPrime is beyond the “shell only” phase now. The desktop app, composer, settings, provider configuration, review flows, templates, and agent runtime are all live, and the current work is focused on making the end-to-end coding loop more dependable.

Current status:

- The desktop workspace is real and usable: editor, tabs, terminal, file tree, search, settings, model selection, and runtime status all exist in-app.
- Agent execution now uses bounded discipline specialists with file ownership, validation, explicit review sessions, and structured repair passes.
- Provider setup is safer: API keys stay out of plain settings files, with secure storage and renderer-safe IPC.
- Chat modes are now treated as distinct experiences instead of a single blended prompt surface.
- The core target loop is `create -> review -> apply -> install -> run -> repair`.

Recently verified:

- Transactional template materialization with rollback support on failed generation.
- Deterministic scaffold routing for canonical template requests like `threejs-game` and `threejs-platformer`.
- Specialist-aware tool validation for file, tool, and command boundaries.
- Review-session plumbing for staged multi-file changes before final apply.
- Nested Vite path handling, Python shell quoting, and CI install-script parity improvements.
- Provider API key UX and secure runtime wiring across settings, preload, and main process.
- Mode-scoped chat history plus provider/model controls for non-agent chat.

Confidence snapshot:

- Typecheck, targeted regression coverage, and template/browser smoke work are part of the normal hardening path.
- The riskiest active areas are now less about “can the app render?” and more about tightening the agent runtime, verification loop, and UX polish.

This is still an active build, but it now behaves much more like an actual AI IDE product than a prototype with good intentions.

### Dino Buddy (chat)

- **AgentPrime voice:** Dino Buddy in AgentPrime is intentionally **calm, warm, and grounded** — a soft companion mode you can leave open while working or decompressing.
- **Mode separation:** Agent, Just Chat, and Dino are meant to feel like different lanes with different context, history, and tone rather than one merged assistant.
- **ActivatePrime contrast:** Same lineage and heart, different delivery. ActivatePrime can go louder and more explosive; AgentPrime’s Dino defaults to the steadier version.

## What AgentPrime Can Do

- Open a project and work inside a full desktop IDE shell with Monaco, tabs, file tree, terminal, search, and settings
- Use Agent Mode for workspace-aware implementation, edits, commands, and repair loops
- Use Just Chat or Dino Buddy without needing an open workspace
- Pick providers and models across OpenAI, Anthropic, Ollama, and OpenRouter
- Route work through fast, deep, or auto runtime budgets
- Run bounded specialized agents for more structured multi-step tasks
- Review staged multi-file changes behind explicit `plan -> review -> apply -> verify/repair` checkpoints
- See which reflection budget (`instant`, `standard`, or `deep`) the agent used before a patch set is applied
- Apply inline AI edits directly from the editor
- Use ghost text completions and contextual coding assistance
- Run natural-language file operations with confirmation before risky bulk actions
- Generate projects from built-in templates and then verify / repair them
- Preview and deploy projects from inside the app
- Work with Git actions and repository workflows without leaving the desktop shell

## Recent Upgrades

### Review checkpoints, reflection budgets, and discipline routing (April 2026)

- **Explicit staged checkpoints:** Review sessions now carry first-class checkpoint metadata so the UI can show `Plan`, `Review`, `Apply`, and `Verify` / `Repair` as real agent states instead of deriving them purely from renderer state.
- **Reflection budgets:** Specialized execution now resolves `instant`, `standard`, and `deep` reflection policies in one place and uses them to control planning depth, reflection-question count, repair-pass limits, and specialist recovery retries.
- **Discipline-first verifier routing:** Runtime findings are now classified toward concrete owners like `security_specialist`, `performance_specialist`, and `data_contract_specialist` before retry planning, instead of sending every issue to a generic repair lane and depending mostly on keyword guesses later.
- **Repair-scope continuity:** Suggested owners are preserved in structured verifier findings so staged-review repair flows can reopen the composer with a narrower, better-routed repair scope.
- **Template sweeps broadened:** Template smoke coverage now supports broader runtime-oriented sweeps, and the Rust CLI template/runtime path was hardened by introducing a Rust-safe crate identifier during template materialization.
- **UI-level review regression coverage:** Electron E2E now asserts the staged review budget/checkpoint surface in addition to the existing apply-and-run happy path.

### Agent & validation fixes (April 2026)

- **Review UX & progress visibility:** `src/renderer/components/AgentProgressTracker.tsx` and `src/renderer/components/MultiFileDiffReview.tsx` now give the staged-review flow more structure, making it easier to see agent progress, inspect multi-file diffs, and understand what is ready to apply.
- **Quieter settings hydration:** `src/renderer/components/AIChat/index.tsx` no longer writes unchanged `useSpecializedAgents` or `agentAutonomyLevel` values back to settings during startup hydration, which reduces noisy persistence on first load.
- **Honest OpenAI model loading:** `src/main/ai-providers/openai-provider.ts`, `src/main/main.ts`, and the AI chat UI now surface OpenAI auth/model-list failures directly instead of silently substituting a misleading default list. The chat UI still falls back to curated static model options so the selector stays usable.
- **Safer TypeScript option validation:** `src/main/agent/tools/project-auto-fixer.ts` no longer depends on internal `ts.optionDeclarations`; compiler-option cleanup now uses the public TypeScript validation path so it is less brittle across TS upgrades.
- **Controlled dependency backfill:** Inferred runtime dependencies now resolve through npm metadata instead of writing raw `'latest'` into generated `package.json` files. When a version cannot be resolved safely, the auto-fixer skips it and records the issue instead of guessing.
- **Focused regression coverage:** Added/extended tests around auto-fixer compiler-option cleanup and OpenAI model loading so these hardening changes are covered by the normal regression path.

### Three.js scaffold hardening (April 2026)

- Added a new deterministic `threejs-platformer` template under `templates/threejs-platformer` for side-scroller/platformer prompts with stable WASD movement, jump physics, collectibles, a handcrafted course, and a buildable Vite + React + Three.js baseline.
- Canonical scaffold detection in `src/main/agent/scaffold-resolver.ts` now treats prompts like `three.js side scroller`, `platformer`, `jump`, and `WASD` as a platformer request instead of falling back to the generic Three.js starter.
- Generic 3D/Three.js projects still route to `threejs-game`, so open-ended ideas that are not platformers can continue to scaffold from the neutral space-game baseline.
- When a scaffold-first create run for a canonical template still fails verification after retries, `src/main/agent/specialized-agent-loop.ts` now rolls back the broken generative pass and stages the clean deterministic scaffold for review instead of surfacing a busted project.
- Added `threejs_platformer` project-pattern recognition, scaffold routing coverage, specialized-loop fallback tests, and template smoke coverage so the new template is exercised by the hardening path.
- Updated Ollama-facing model defaults/options to prefer cloud-safe IDs like `glm-5.1:cloud` and `gemma4:31b-cloud` rather than plain `gemma4` in the planning fallback chain.

- **Glob matching (`tool-validation.ts`):** `**` in patterns like `src/**/*.tsx` / `src/**/*.css` now matches files directly under `src/` (e.g. `src/App.tsx`, `src/index.css`). The previous regex incorrectly required an extra path segment and caused false “outside writable scope” rejections for specialists.
- **Specialist writable scopes (`specialist-contracts.ts`):** `javascript_specialist` may read `index.html`, write `src/**/*.css`, and edit root `README.md` when co-wiring Vite/React entrypoints; `pipeline_specialist` includes `README.md`, `*.bat`, `Makefile`, and `Dockerfile*` alongside existing manifest/config globs. Pipeline and mirror prompts clarify that pipeline must not rewrite application source under `src/`.
- **Task Master claims (`task-master.ts`):** Per-step `claimedFiles` for `javascript_specialist` and `pipeline_specialist` are aligned with those scopes (including `src/**/*.css`, `index.html`, and `README.md`). This fixes tool calls that passed writable globs but failed with **“outside assigned file claims”** during multi-specialist runs.

- **Plugin sandbox (`plugin-sandbox.ts`):** Replaced dynamic `require(moduleId)` with static requires for allowed Node built-ins so webpack no longer emits “Critical dependency: the request of a dependency is an expression” on the main bundle.
- **Tests:** Extended `tests/agent/tool-validation-specialists.test.ts` and `tests/agent/task-master-plan.test.ts` for the above behavior.

- **TypeScript config & bundler-aware JS checks (`tool-validation.ts`):** `tsconfig.json` is validated with the TypeScript compiler API so unknown or malformed options surface before build. JavaScript validation treats Vite/webpack-style projects as bundler-backed and avoids noisy warnings for normal `import './index.css'` entry wiring. Duplicate game-module paths (e.g. parallel `src/game/World.ts` and `src/game/world/World.ts`) are flagged to reduce import drift.
- **Styling specialist prompts (`specialized-agents.ts`):** `workspacePath` is passed into JS validation so bundler detection matches the real project. Prompts and mirror guidance stress that styling must not edit gameplay under `src/game/**` or documentation like `README.md`.
- **Retry loop & verification logs (`specialized-agent-loop.ts`):** On repair retries, `styling_ux_specialist` and `integration_analyst` are skipped when the failure pattern is not in their lane (fewer wasted tokens and fewer out-of-scope tool attempts). The early structural check is logged as “Structural verification passed (pre-install/build/runtime checks)” so it is not confused with a full `npm run build` pass. Long command output in errors keeps both head and tail for context.
- **Repair specialist claims (`task-master.ts`):** Repair steps include a baseline claim set (`src/**`, manifests, configs, `README.md`, etc.) alongside `retryFiles`, so fix passes are not rejected as “outside assigned file claims” when the model needs to touch several project files.

### Memory, security, and agent hardening (April 2026)

This batch tightens long-term memory, auth, logging, startup reliability, UI feedback, validation, and specialist boundaries so create → verify → repair behaves more predictably.

- **Long-term memory (`backend/app/core/memory.py`):** Optional semantic retrieval using SentenceTransformers (`all-MiniLM-L6-v2`) with cosine similarity over stored embeddings; TF-IDF remains when embeddings are disabled or unavailable. Python deps include `sentence-transformers`, `numpy`, and `httpx>=0.27` (compatible with `ollama`).
- **Prompt injection mitigation:** `src/main/security/prompt-sanitizer.ts` detects and neutralizes risky user text; wired into `src/main/agent-loop.ts` and `src/main/agent/specialized-agent-loop.ts` before messages drive tools.
- **Enterprise password verification:** `src/main/security/enterprise-security.ts` verifies passwords against stored material with SHA-256 and `crypto.timingSafeEqual` (removes the previous always-true placeholder).
- **Structured logging:** `src/main/core/logger.ts` provides leveled logging; set `AGENTPRIME_LOG_LEVEL` to `debug`, `info`, `warn`, or `error`. Used in high-traffic paths such as the brain IPC handler, backend manager, and specialized agent loop.
- **Renderer short-term memory:** `src/renderer/agent/shortTermMemory.ts` runs a periodic cleanup timer so LRU entries do not linger past TTL. Covered by `tests/renderer/shortTermMemory.test.ts`.
- **Mirror and specialist prompts:** `src/main/agent/specialized-agents.ts` caches mirror context per task and limits full Opus example injection to the initial planning pass; later specialists get short summaries to save tokens. Mirror is enabled by default in `src/main/core/feature-flags.ts` (still overridable by env).
- **Brain HTTP client and backend startup:** `src/main/ipc-handlers/brain-handler.ts` waits for the FastAPI brain with exponential backoff instead of spamming connection errors. `src/main/core/backend-manager.ts` uses backoff when probing readiness during backend start.
- **Chat UI:** `src/renderer/components/AIChat/components/ChatHeader.tsx` shows a **Brain offline** state when the Python backend is not connected; styles in `src/renderer/vibe-styles.css`.
- **Package manifest validation:** `src/main/agent/tool-validation.ts` rejects obviously invalid npm dependency major versions for common packages before writes, reducing `npm install` failures from hallucinated versions.
- **Production builds from the runner:** `src/main/agent/tools/projectRunner.ts` sets `NODE_ENV=production` for `runBuild` so frameworks like Next.js receive the correct build mode (dev env is still used for install/dev run paths as before).
- **Specialist writable scopes:** `src/main/agent/specialist-contracts.ts` extends templates and specialists for modern app layouts (`app/`, `pages/`, `lib/`, `components/`), env and root configs (`.env`, `.env.local`, `next.config.*`, Tailwind/PostCSS, shared `*.config.*`), and gives `repair_specialist` bounded `run_command` allowances (`npm install`, `npm run`, `npx`, `node`) so repair passes can fix manifests and configs without false “outside writable scope” errors.
- **Smart task router:** `src/renderer/agent/smartRouter.ts` caches recent task analyses (up to 100 entries) to avoid redundant routing work for similar prompts.
- **Tests added or extended:** `tests/security/prompt-sanitizer.test.ts`, `tests/core/logger.test.ts`, `tests/renderer/shortTermMemory.test.ts`, and package-json validation coverage in `tests/tool-validation.test.ts`.

### Scaffold contracts & build-retry routing (`specialized-agents.ts`, `specialized-agent-loop.ts`)

- When a template is already on disk, orchestrator and specialist prompts include stronger scaffold context (key gameplay files like `Entity.ts`, `Player.ts`, `Controls.ts`, nested `world/World.ts`) plus explicit rules: do not invent parallel paths (e.g. `src/game/World.ts` vs `src/game/world/World.ts`), and keep subclass method signatures and call-site APIs consistent across files. On **build-heavy** verification retries (`[build]`, TypeScript errors), `tool_orchestrator` is skipped so the pass focuses on repair instead of re-orchestrating the whole project.
- **Tests:** `tests/specialized-agent-loop.test.ts` asserts build-heavy retries drop `tool_orchestrator` and `integration_analyst` from the active role set.

- Added a typed bounded-specialist contract matrix with discipline metadata and reflection checklists in `src/main/agent/specialist-contracts.ts`.
- Added blackboard ownership tracking and bounded step planning through `src/main/agent/task-master.ts` and `src/main/agent/specialized-agent-loop.ts`.
- Hardened `src/main/legacy/template-engine.ts` so failed template generation can roll back cleanly instead of leaving partial projects behind.
- Added deterministic scaffold routing and bootstrap coverage for browser Three.js projects.
- Added specialist-boundary regression tests, template rollback tests, and smoke validation for the current create path.
- Better AI Composer stability. Once the composer has been opened, it stays mounted when collapsed so in-flight work is not reset.
- Faster, richer chat rendering with a virtualized message list and improved code blocks with copy/apply actions.
- Safer chat payload handling through schema-validated IPC context with stricter bounds on incoming data.
- Faster workspace source discovery with new glob-based helpers for agent context, verification, and indexing.
- Better specialized-agent execution with bounded parallel tool work and stronger review/verification plumbing.
- Improved Ollama handling so cloud-style endpoints do not get treated like a local daemon health check path.
- Shortcut behavior aligned with the UI: `Ctrl+K` opens the command palette outside the editor, while `Ctrl+K` in Monaco remains inline AI edit.
- Added a model capability estimator for the chat status bar so the active-model "Power" meter updates from model IDs (size and named frontier tiers).
- Switched default dual-model routing in chat to Ollama cloud-first models (`devstral-small-2:24b-cloud` fast, `qwen3-coder-next:cloud` deep).
- Raised default Ollama cloud `agent` and `words_to_code` token budgets to `32768` and added regression coverage.
- Added focused renderer tests for model capability scoring and stabilized the e2e agent-mode input path.
- Ignored transient local artifacts (`playwright-report/`, `test-results/`, `build_output.txt`, `tsc_output.txt`) for cleaner commit hygiene.
- Added an Agent Autonomy dial in settings/composer and enforced backend autonomy policies for tool calls, command usage, and file-write limits.
- Upgraded staged multi-file review with file search, status filters, expand/collapse visible controls, and per-file diff impact badges.
- Improved semantic indexing reliability by reusing the shared workspace indexer and handling in-flight indexing requests more predictably.
- Refreshed the README hero artwork for a stronger AgentPrime visual identity.
- Added a dedicated organize intent in the command pipeline so prompts like `organize my downloads folder` route to file operations (with safety confirmation) instead of coding mode.

## Next Goals

The next major milestones are focused on making AgentPrime feel like a proper AI IDE instead of a promising prototype:

1. Route even more verifier findings through direct owner assignments so retries use evidence-first specialist selection instead of broad fallback lanes.
2. Keep expanding template/runtime/browser sweeps until every maintained starter has a meaningful install/build/run or browser proof path.
3. Tighten the `install -> run -> verify -> repair` loop so AgentPrime can recover from failures with smaller, more targeted fixes.
4. Keep reducing latency in the agent path so the system feels closer to a fast local assistant than a slow multi-agent committee.
5. Keep shrinking false-positive validation and ownership mismatches where writable scopes, claims, and repair plans still disagree.
6. Improve provider/runtime health visibility so auth, endpoint, and dependency failures are obvious before a long agent run starts.

### Near-Term Likely Fixes

- Continue reducing false-positive validation failures where specialist writable scopes, claimed files, and repair passes disagree on what is allowed.
- Add a clearer provider-health surface in the UI so auth, rate-limit, and endpoint issues are visible before a chat run fails.
- Expand hardening around generated project manifests so dependency inference, install retries, and bundler detection keep converging toward one predictable path.
- Add more focused smoke coverage around the review/apply flow, non-agent provider/model switching, and startup hydration behavior.
- Keep trimming noisy agent retries by improving failure classification so only the specialists relevant to the current breakage get called back in.

For the current specialist architecture direction, see `docs/BOUNDED_SPECIALIST_MATRIX.md`.

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
- Cloud-first Ollama workflows by default, with local-model support still available

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

### File Operations (Natural Language)

- Parse plain-language file requests before normal AI chat routing
- Support direct organize/sort commands for folders with confirmation before execution
- Keep operations explicit and reversible where possible through the existing undo/safety path

Examples:

- `organize my downloads folder`
- `sort this folder by extension`
- `organize "C:\Users\yourname\Desktop"`

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

For a runtime-focused walkthrough (startup order, config contract, and optional Brain behavior), see `docs/ARCHITECTURE_RUNTIME_GUIDE.md`.

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

- Node.js 18+ (20 LTS recommended)
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

### User guide

- From the welcome screen, use **Open User Guide** to open the styled HTML guide in your system default handler (usually your browser). The file lives at [`docs/user-guide.html`](docs/user-guide.html); plain Markdown is still available as [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md).

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
npm run verify:ci
npm run verify

# Tests
npm test
npm run test:watch
npm run test:coverage
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:templates
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

For Three.js specifically:

- `threejs-game` is still the general-purpose starter for open-ended 3D or non-platformer browser game ideas.
- `threejs-platformer` is the deterministic side-scroller/platformer starter used for prompts that clearly ask for WASD movement, jumping, and platforming-style gameplay.

## Packaging

Desktop packaging is handled through Electron Builder.

- Windows: NSIS and portable targets
- macOS: DMG and ZIP targets
- Linux: AppImage, DEB, and RPM targets
- Distribution scripts now run `npm run preflight:dist` first to validate `build.extraResources` inputs.
- Distribution scripts pass `--build-backend`, so preflight will attempt `backend/dist` auto-build via PyInstaller when available.
- If backend artifacts are still missing, build manually: `cd backend && pyinstaller agentprime-backend.spec`.
- You can enable backend auto-build when running preflight directly with `AGENTPRIME_BUILD_BACKEND_DIST=true npm run preflight:dist`.
- You can bypass the preflight intentionally with `AGENTPRIME_SKIP_DIST_PREFLIGHT=true` (not recommended for release builds).

Build outputs are emitted under the configured release directory during distribution builds.

### Release Smoke Test (Windows)

After `npm run dist:win` succeeds:

1. Launch `release/win-unpacked/AgentPrime.exe`
2. Verify the app window opens and remains running for at least 10 seconds
3. Close the app cleanly
4. Verify installer artifacts exist:
   - `release/AgentPrime Setup <version>.exe`
   - `release/AgentPrime <version>.exe` (portable)

## Troubleshooting

### Build Issues

- Reinstall dependencies with `npm install`
- Run `npm run typecheck`
- Run `npm run lint`
- Rebuild with `npm run build`
- If you hit `MSB8040` while rebuilding native modules (for example `node-pty`), install the Visual Studio Spectre libraries:
  - `MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)`
- If packaging fails with `EPERM` on `node_modules/sharp/build/Release/libglib-2.0-0.dll`, close any running `AgentPrime.exe` processes and rerun packaging.

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
