# AgentPrime Runtime Architecture Guide

This guide explains what runs where, how startup works, and which toggles control optional subsystems.

## 1) Runtime Map

```text
Renderer (React UI)
  - Monaco editor, file tree, chat/composer, review UI
  - Calls secure preload bridge (window.agentAPI)
            |
            v
Main Process (Electron)
  - File system / terminal / git / agent loop / model routing
  - AI provider clients + guardrails + autonomy controls
  - Optional Python Brain lifecycle manager
            |
            v
Python Brain (FastAPI, optional)
  - Orchestration decisions
  - Persistent memory + conversation stats
  - Background workspace analysis
```

## 2) Startup Sequence

1. Electron main boots and loads `.env` from project root.
2. Main initializes providers, settings, telemetry, and IPC handlers.
3. Feature flags are resolved in `src/main/core/feature-flags.ts`.
4. If `pythonBrain` is enabled, backend manager tries to start `backend/run.py`.
5. Renderer connects to IPC and (if available) polls Brain status.
6. Startup config preflight runs and logs actionable warnings before optional subsystems initialize.

## 3) Config Contract (Important)

Desktop app variables (main process):
- `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_FAST_MODEL`, `OLLAMA_MODEL_FALLBACK`
- `OLLAMA_API_KEY`, `OLLAMA_API_KEY_DESKTOP`
- `AGENTPRIME_ENABLE_BRAIN`, `BRAIN_URL`

Python Brain variables:
- `OLLAMA_BASE_URL` (now compatible with `OLLAMA_URL` fallback)
- `OLLAMA_MODEL`, `OLLAMA_API_KEY`
- `AGENTPRIME_BACKEND_HOST`, `AGENTPRIME_BACKEND_PORT`

Env loading behavior for backend (`backend/run.py`):
- Loads root `.env` first (shared app config)
- Then loads `backend/.env` for backend-specific overrides

## 4) Common "What Is Happening?" Scenarios

### Brain keeps showing disconnected
- Ensure `AGENTPRIME_ENABLE_BRAIN=true`
- Run backend manually once: `cd backend && python run.py`
- Verify `BRAIN_URL` matches backend host/port

### I only want desktop IDE right now
- Set `AGENTPRIME_ENABLE_BRAIN=false`
- Run `npm run quick-start`

### Desktop works but backend hits wrong model endpoint
- Set `OLLAMA_URL` (desktop)
- Optionally set `OLLAMA_BASE_URL` (backend override)

## 5) Current Architecture Gaps (Hardening Backlog)

1. Packaging still depends on local PyInstaller toolchain availability for backend artifacts.
2. Optional subsystem ergonomics: Brain is default-enabled and can confuse first-run flow.
3. Docs fragmentation across many files; one canonical "operator guide" is still needed.
4. Startup diagnostics are in Settings but not yet promoted to an always-visible status signal.

## 6) Practical Next Hardening Steps

1. Add explicit "Desktop-only mode" first-run toggle in Settings.
2. Add backend artifact build telemetry/log persistence for CI troubleshooting.
3. Expose startup preflight diagnostics in a lightweight status bar badge.
4. Consolidate setup + troubleshooting into one canonical operator doc.
