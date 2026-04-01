# AgentPrime Current Maturity Assessment

**Date:** March 31, 2026  
**Scope:** Current product maturity as an AI coding workspace becoming an AI IDE  
**Standard:** Brutally honest, implementation-tied, and prioritized for product trust

## Verdict

AgentPrime is no longer just a prototype. It has crossed into real product architecture territory because the core AI-IDE loop now has actual structure: staged review before write, explicit runtime budgets, bounded specialist roles, and a desktop review/apply/verify/run happy path.

It is still not a fully proper IDE.

The main gap is no longer "missing a cool AI feature." The main gap is trust at everyday product depth: the strongest proof is still partly test-driven, model/provider truth is not yet impossible to fake across all surfaces, repair is structured but not fully surgical everywhere, and core IDE ergonomics still lag behind the quality of the generation loop.

## Now

- **Pre-write review is real state, not UI theater.** Files: `src/main/agent/review-session-manager.ts`, `src/main/agent/specialized-agent-loop.ts`, `src/main/ipc-handlers/chat.ts`, `src/renderer/components/App/index.tsx`, `src/renderer/components/MultiFileDiffReview.tsx`, `tests/review-session-manager.test.ts`, `tests/e2e/app.spec.js`. The important product shift is that specialized runs now stage file operations into a review session, roll the transaction back, and only write accepted files on apply.

- **Runtime budgets are explicit and travel through the stack as a real contract.** Files: `src/types/runtime-budget.ts`, `src/main/security/chat-ipc-context.ts`, `src/main/ipc-handlers/chat.ts`, `src/main/ai-providers/index.ts`, `src/main/agent/specialized-agent-loop.ts`, `src/renderer/components/AIChat/index.tsx`. `instant`, `standard`, and `deep` are now first-class types instead of vague UX labels, and they influence routing and specialist behavior.

- **The specialist system is becoming discipline-based instead of model-flavored chaos.** Files: `src/main/agent/specialist-contracts.ts`, `src/main/agent/task-master.ts`, `src/main/agent/specialized-agents.ts`, `tests/agent/tool-validation-specialists.test.ts`. File claims, writable scopes, command prefixes, escalation paths, and repair boundaries are all more explicit than before, which is the right architecture for trustworthy autonomous work.

- **The review -> verify -> run loop exists as an actual desktop workflow.** Files: `src/renderer/components/App/reviewFlow.ts`, `src/renderer/components/App/index.tsx`, `src/renderer/components/MultiFileDiffReview.tsx`, `src/main/agent/project-runtime.ts`, `src/main/agent/tools/projectRunner.ts`, `tests/review-flow.test.ts`, `tests/project-runtime.test.ts`, `tests/e2e/app.spec.js`. This is no longer just "generate files and hope"; the product now has a path for staging, applying, verifying, and then running.

- **Project runtime detection is consolidating into a usable source of truth.** Files: `src/main/agent/project-runtime.ts`, `src/main/agent/tools/projectRunner.ts`, `tests/project-runtime.test.ts`. Static, Vite, Node, Python, and Tauri flows are at least being reasoned about through one runtime profile instead of scattered one-off assumptions.

- **There is a credible desktop happy-path proof.** Files: `tests/e2e/app.spec.js`. This matters because the product can now prove "agent proposes -> user reviews -> user applies -> app verifies -> app runs" inside the Electron shell. That is a meaningful threshold.

## Next

1. **Replace the test-only strongest proof with one real model-backed path.** Files: `src/main/ipc-handlers/chat.ts`, `src/main/agent/specialized-agents.ts`, `src/main/agent/specialized-agent-loop.ts`, `tests/e2e/app.spec.js`. Right now the sharpest desktop proof still relies on the `__AGENTPRIME_TEST_REVIEW__` sentinel. Keep that deterministic test, but add at least one real scaffold or template-backed generation flow that travels through the actual agent stack and still lands in staged review.

2. **Make actual executing provider/model truth the only truth the UI can show.** Files: `src/main/ai-providers/index.ts`, `src/main/agent/specialized-agents.ts`, `src/main/ipc-handlers/chat.ts`, `src/renderer/components/StatusBar.tsx`, `src/renderer/components/AIChat/index.tsx`, `src/renderer/components/SettingsPanel.tsx`, `src/main/core/telemetry-service.ts`. The router already annotates `servedBy`, and specialist phases already track requested vs actual provider/model, but important renderer surfaces still derive their display from saved settings or inferred model names. A proper IDE should never let the UI claim one model while another actually executed.

3. **Finish the evidence-based repair loop.** Files: `src/renderer/components/App/reviewFlow.ts`, `src/main/agent/task-master.ts`, `src/main/agent/specialized-agent-loop.ts`, `src/main/agent/specialist-contracts.ts`, `tests/review-flow.test.ts`. The scaffolding exists: repair prompts carry accepted and rejected files, retry context is built from verifier failures, and repair specialists have bounded claims. The next maturity step is enforcement and polish: touch only verifier-failed files, auto-reverify after repair, and show the user exactly why a retry happened.

4. **Broaden the runtime proof matrix with real families, not only narrow fixtures.** Files: `src/main/agent/project-runtime.ts`, `src/main/agent/tools/projectRunner.ts`, `tests/project-runtime.test.ts`, `tests/e2e/app.spec.js`. The current matrix is a good start, but a proper AI IDE needs at least one real browser-backed or template-backed proof per major runtime family it claims to support.

5. **Treat latency as a product feature, not an implementation detail.** Files: `src/main/agent/specialized-agent-loop.ts`, `src/main/agent/specialized-agents.ts`, `src/main/core/telemetry-service.ts`, `src/types/runtime-budget.ts`. Runtime budgets exist and generation phases are already being tracked, but the next step is measuring where time actually goes and then cutting avoidable multi-agent or verification overhead.

6. **Upgrade core IDE ergonomics around navigation, diagnostics, Git, and run flow.** Files: `src/renderer/components/App/index.tsx`, `src/renderer/components/MonacoEditor.tsx`, `src/main/search/symbol-index.ts`, `src/renderer/components/GitPanel.tsx`. AgentPrime now has more product maturity in its agent loop than in some of its day-to-day editor affordances. That is fixable, but it means "proper IDE" is still aspirational rather than fully earned.

## Later

- **Deepen runtime-class polish after the main trust loop is stable.** Files: `src/main/agent/project-runtime.ts`, `src/main/agent/tools/projectRunner.ts`. More Tauri polish, more Python polish, and broader scaffold coverage matter, but they come after the primary create/edit/review/repair truth loop is solid.

- **Harden review UX around verification evidence and repair explanations.** Files: `src/renderer/components/MultiFileDiffReview.tsx`, `src/renderer/components/App/reviewFlow.ts`, `src/renderer/components/App/index.tsx`. The workflow exists; the next later-phase improvement is clearer evidence presentation, failure grouping, and smoother recovery.

- **Improve symbol and refactor depth beyond the current workspace-symbol baseline.** Files: `src/main/search/symbol-index.ts`, `src/renderer/components/MonacoEditor.tsx`. There is already a lightweight navigation story, which is good. The later-phase move is richer cross-language precision and more reliable rename/refactor depth.

- **Use telemetry for product decision quality, not only event logging.** Files: `src/main/core/telemetry-service.ts`, `src/main/agent/specialized-agents.ts`, `src/main/agent/specialized-agent-loop.ts`. The instrumentation hooks are there; the later opportunity is converting them into product-facing latency and success metrics that guide roadmap decisions.

## Not Worth Doing Yet

- **Adding more specialist roles before the current bounded set earns trust.** Files: `src/main/agent/specialist-contracts.ts`, `src/main/agent/task-master.ts`, `src/main/agent/specialized-agents.ts`. The right move now is better boundaries, better repair behavior, and better runtime truth, not more agent proliferation.

- **Chasing full Cursor-style feature parity checklists before the model-driven review loop is proven.** Files: `src/main/ipc-handlers/chat.ts`, `src/main/agent/specialized-agent-loop.ts`, `tests/e2e/app.spec.js`. The product does not need to win on every IDE bullet point yet. It needs one trustworthy end-to-end loop that works the same way in real usage as it does in the deterministic proof.

- **Prioritizing cosmetic UI over execution truth.** Files: `src/renderer/components/StatusBar.tsx`, `src/renderer/components/MultiFileDiffReview.tsx`, `src/renderer/components/SettingsPanel.tsx`. Visual polish matters, but the next trust gain comes from truthful runtime state, narrower repair, and better verification evidence, not from repainting the shell.

- **Investing in an extension ecosystem before the core workflow is stable.** Files: `src/renderer/components/App/index.tsx`, `src/renderer/components/MonacoEditor.tsx`. Extension systems multiply product surface area. AgentPrime should earn stability first in create, edit, review, verify, run, and repair.

## Clear Next Milestone

The most important next milestone is simple:

**A real model-driven create or edit flow should go through the exact same staged review -> apply -> verify -> run loop that the deterministic desktop test already proves.**

When that exists, and when the UI always reports the actual provider/model/runtime that executed, AgentPrime stops feeling like a clever AI shell and starts feeling like a trustworthy AI IDE.

## Bottom Line

AgentPrime is now a plausible AI IDE foundation.

It is already more than a prototype because the right primitives exist in code and at least one end-to-end desktop path proves the intended workflow.

It is not yet a fully proper IDE because trust is still uneven across real generation, provider truth, repair maturity, runtime breadth, and everyday editor ergonomics.
