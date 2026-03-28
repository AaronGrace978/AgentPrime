# Lean Core Overhaul Analysis

## Goal
Return AgentPrime to a Cursor-like core product: code editing + AI assistance + project navigation, without auto-starting heavy optional systems.

## Root Causes of Bloat

### 1) Startup overload in main process
- `src/main/main.ts` auto-started non-core systems at boot:
  - Matrix mode backend (memory, scheduler, browser automation, integrations, nodes)
  - Inference server for external project sharing
- Result: unnecessary startup work and larger runtime footprint before user asks for those features.

### 2) Oversized IPC surface
- `src/main/ipc-handlers/index.ts` registered many optional systems by default:
  - Matrix agent and matrix system handlers
  - Smart controller automation
  - Asset generation
  - Enterprise/collaboration/performance/fine-tuning stacks
  - VibeHub and refactoring extras
- Result: wider attack surface, higher complexity, and more background initialization than needed for core IDE use.

### 3) Renderer shell drift
- `src/renderer/components/App/index.tsx` had become a mega-orchestrator for many non-core panels/modes.
- Result: larger cognitive surface, more state churn, heavier imports/lazy modules, and confusing user flow.

## Overhaul Applied (This Pass)

### Main process
- Removed auto-start for inference server in default flow.
- Removed auto-start matrix backend bootstrap block.
- Removed shutdown hooks tied to those auto-started services.
- Kept core app boot path intact (settings, providers, backend manager, core IPC, window).

### IPC registration
- Switched to lean default registration by removing optional subsystem auto-registration:
  - mirror/refactoring/vibehub
  - phase2/phase3 enterprise handlers
  - asset generation
  - matrix-agent / matrix-mode-systems / smart-controller / genesis
- Left core handlers active (files, git, templates, commands, scripts, analysis, search, agent, completions, telemetry).

### Renderer shell
- Replaced oversized `App` shell with lean core surface:
  - explorer, tabs, editor, AI composer, settings, search/replace, command palette, status bar
  - optional git panel retained
- Removed non-core UI paths from the root shell:
  - dino buddy, onboarding flow, matrix/agent mode panels, lock screen, words-to-code, plan/refactor/team/debugger overlays, task runner/task manager extras, VibeHub panel, mirror panel

### Header/welcome cleanup
- Simplified header controls to core actions.
- Removed non-core actions and dead controls from welcome experience.

## Validation
- `npm run typecheck` passed.
- `npm run build` passed (main + renderer).

## Phase 2 Hard Prune (Completed)

### Deleted backend stacks
- Removed Matrix-mode runtime tree (`src/main/matrix-mode/*`).
- Removed Smart Controller runtime tree (`src/main/smart-controller/*`).
- Removed matrix-only modules in `src/main/modules/*`:
  - `action-engine`, `local-brain`, `anticipator`, `direct-control`.
- Removed non-core IPC handlers that were no longer registered:
  - matrix-agent, matrix-mode-systems, smart-controller, assets,
    collaboration, performance, fine-tuning, plugin-system,
    edge-deployment, phase2-system, genesis, mirror, refactoring, vibehub.

### Deleted backend support files
- Removed non-core support/services:
  - `src/main/system-executor.ts`
  - `src/main/system-discovery.ts`
  - `src/main/ai-providers/fine-tuning-manager.ts`
  - `src/main/plugins/plugin-system.ts`
- Removed phase2 core services not used by lean profile:
  - `src/main/core/cloud-sync.ts`
  - `src/main/core/collaboration-engine.ts`
  - `src/main/core/distributed-coordinator.ts`
  - `src/main/core/edge-deployment.ts`
  - `src/main/core/memory-optimization.ts`
  - `src/main/core/performance-tracker.ts`
  - `src/main/core/plugin-marketplace.ts`
  - `src/main/core/scaling-manager.ts`

### Deleted renderer dead surfaces
- Removed non-core component trees:
  - `src/renderer/components/AgentMode/*`
  - `src/renderer/components/LockScreen/*`
  - `src/renderer/components/MatrixEffects/*`
  - `src/renderer/components/MatrixShowcase/*`
- Removed non-core overlays/panels no longer reachable in lean shell:
  - DinoBuddy, Onboarding, VibeHubPanel, VoiceControl, TaskManager,
    TodoApp, MirrorIntelligence, JustChat, WordsToCode, PlanMode,
    RefactoringPanel, TeamPatterns, Debugger, PerformanceMonitor, TaskRunner.
- Removed legacy unused renderer components:
  - `Composer.tsx`, `NaturalLanguageCommands.tsx`, `Settings.tsx`,
    `AssetManager.tsx`, root `OutputPanel.tsx`.

### CLI cleanup
- Removed Matrix-only CLI command files:
  - `src/cli/commands/gateway.ts`
  - `src/cli/commands/channels.ts`
- Removed command registration from `src/cli/index.ts` for `gateway` and `channels`.
- Removed voice->system-executor bridge from `src/main/ipc-handlers/commands.ts`.

### Dependency pruning
- Removed unused packages from `package.json` and lockfile:
  - `adm-zip`
  - `chroma-js`
  - `lib0`
  - `y-protocols`
  - `yjs`
- Refreshed lockfile via `npm install`.

## Recommended Next Passes

### Pass 2: Physical code and dependency cleanup
- Remove orphaned components/modules no longer reachable from lean shell.
- Run dependency usage audit and drop unused packages to reduce install/build cost.

### Pass 3: Feature profile architecture
- Reintroduce advanced modules behind explicit profiles/feature flags instead of default boot.
- Example: `profile=core` (default), `profile=extended` (opt-in).

### Pass 4: Product boundary enforcement
- Define strict "core product contract" for what ships by default.
- Add CI guardrails to prevent non-core autoload regressions.
