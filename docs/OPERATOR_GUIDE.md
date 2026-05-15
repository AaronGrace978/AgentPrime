# AgentPrime Operator Guide

This is the canonical setup and troubleshooting guide for running AgentPrime as a lean desktop AI coding workspace.

## Default Mode: Desktop Only

AgentPrime ships best as a desktop-first IDE loop:

1. Open a workspace folder.
2. Configure one AI provider.
3. Ask AgentPrime to create or edit code.
4. Review staged changes.
5. Apply accepted files.
6. Verify, run, and repair from verifier evidence.

Optional systems such as Python Brain, Witness, Mirror learning, and the inference server are not required for the core loop.

Recommended default:

```bash
AGENTPRIME_ENABLE_BRAIN=false
npm run quick-start
```

## Ollama Cloud

Use the official Ollama Cloud endpoint for all cloud models, including DeepSeek models:

```bash
OLLAMA_URL=https://ollama.com
OLLAMA_API_KEY=your-ollama-cloud-api-key
OLLAMA_MODEL=kimi-k2.6:cloud
OLLAMA_FAST_MODEL=deepseek-v4-flash:cloud
OLLAMA_MODEL_FALLBACK=qwen3-coder-next:cloud
```

Do not use `https://api.ollama.com` or `https://ollama.deepseek.com` as the app base URL. AgentPrime rewrites those legacy hosts where possible and reports startup preflight warnings when they are still configured.

Model ids should be plain Ollama ids, for example `qwen3-coder-next:cloud`, not `ollama/qwen3-coder-next:cloud`.

## Local Ollama

Use local Ollama when you want an offline or free model path:

```bash
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:14b
```

Start Ollama before launching AgentPrime:

```bash
ollama serve
ollama pull qwen2.5-coder:14b
```

If a selected model ends in `:cloud` or `-cloud`, AgentPrime treats it as a cloud model and uses `https://ollama.com` instead of sending the cloud id to a local daemon.

## Runtime Truth

The model selector shows what AgentPrime is configured to request. Runtime status shows what actually executed.

Use the status bar and chat runtime strip to check:

- Requested provider/model.
- Effective provider/model after settings resolution.
- Actual provider/model when fallback routing served the request.
- Startup preflight warnings and provider connectivity.

If the actual model differs from the requested model, trust the actual runtime status for debugging and cost/performance decisions.

## Review And Repair

The core product loop is review-first:

1. AgentPrime stages file changes into a review session.
2. You accept or reject files.
3. Accepted files are applied.
4. Verification runs after apply.
5. Repair passes are scoped to verifier-failed accepted files.

Repair scope is enforced. If a repair pass attempts to edit rejected files or accepted files that were not named by verifier findings, AgentPrime rolls the pass back and asks for a narrower or wider repair scope.

## Optional Python Brain

Python Brain is optional and disabled by default in the lean core profile.

Enable it only when you are intentionally testing memory/orchestration features:

```bash
AGENTPRIME_ENABLE_BRAIN=true
BRAIN_URL=http://127.0.0.1:8000
```

Backend model endpoint variables:

```bash
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_MODEL=qwen3-coder-next:cloud
OLLAMA_API_KEY=your-ollama-cloud-api-key
```

`backend/run.py` loads root `.env` first, then `backend/.env` for backend-specific overrides.

## Witness Mode

Witness integration should use the same Ollama Cloud host:

```bash
WITNESS_USE_OLLAMA=true
WITNESS_OLLAMA_URL=https://ollama.com
WITNESS_OLLAMA_MODEL=deepseek-v3.1:671b-cloud
WITNESS_OLLAMA_API_KEY=your_key
```

Witness should remain an optional companion path, not a dependency for the main AgentPrime coding loop.

## Verification Gate

Before calling a branch release-ready, run:

```bash
npm run lint
npm run typecheck
npm run build
npm test
```

Before publishing installers, use the release gate in `docs/RELEASE_READINESS.md`.
