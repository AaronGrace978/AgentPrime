import { createPipeline } from '../../src/main/agent-pipeline';
import { buildAgentRoutePlan } from '../../src/main/agent/agent-router';

function testRoutePlan(message = 'fix the app') {
  return buildAgentRoutePlan({
    message,
    workspacePath: 'G:/repo',
    requestedBranch: 'monolithic',
    runtimeBudget: 'standard',
    selectedProvider: 'ollama',
    selectedModel: 'deepseek-v4-flash:cloud',
  });
}

describe('AgentPipeline route validation', () => {
  it('uses route verification semantics for modified files', () => {
    const pipeline = createPipeline({
      workspacePath: 'G:/repo',
      openFiles: [],
      terminalHistory: [],
      ideContext: {
        diagnostics: [
          { severity: 'error', filePath: 'G:/repo/src/App.tsx', line: 7, column: 2, message: 'Bad type' },
        ],
      },
      agentRoutePlan: testRoutePlan(),
    } as any);

    const result = (pipeline as any).validateModifiedFiles(['src/App.tsx']);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Bad type');
  });

  it('does not fail inspect-only route plans', () => {
    const pipeline = createPipeline({
      workspacePath: 'G:/repo',
      openFiles: [],
      terminalHistory: [],
      ideContext: {
        diagnostics: [
          { severity: 'error', filePath: 'src/App.tsx', line: 7, column: 2, message: 'Bad type' },
        ],
      },
      agentRoutePlan: testRoutePlan('review this app'),
    } as any);

    const result = (pipeline as any).validateModifiedFiles(['src/App.tsx']);

    expect(result.success).toBe(true);
  });
});
