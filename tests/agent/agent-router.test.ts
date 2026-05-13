import { buildAgentRoutePlan } from '../../src/main/agent/agent-router';
import { scoreToolRisk } from '../../src/main/agent/risk-scoring';

const baseInput = {
  workspacePath: 'C:/Users/AGrac/OneDrive/Desktop/Prime',
  requestedBranch: 'specialized' as const,
  runtimeBudget: 'standard' as const,
  selectedProvider: 'ollama',
  selectedModel: 'deepseek-v4-flash:cloud',
  autonomyLevel: 5 as const,
};

describe('buildAgentRoutePlan', () => {
  it('routes delete requests to monolithic file-management with project verification skipped', () => {
    const plan = buildAgentRoutePlan({
      ...baseInput,
      message: 'delete it',
    });

    expect(plan.intent).toBe('delete');
    expect(plan.branch).toBe('monolithic');
    expect(plan.allowedTools).toContain('delete_path');
    expect(plan.blockedTools).toContain('scaffold_project');
    expect(plan.verificationPlan.skipProjectVerification).toBe(true);
    expect(plan.confirmationRequired).toBe(true);
  });

  it('keeps review requests read-only', () => {
    const plan = buildAgentRoutePlan({
      ...baseInput,
      message: 'review this app for security issues',
    });

    expect(plan.intent).toBe('review');
    expect(plan.branch).toBe('monolithic');
    expect(plan.allowedTools).toEqual(expect.arrayContaining(['read_file', 'list_dir', 'search_codebase']));
    expect(plan.blockedTools).toEqual(expect.arrayContaining(['write_file', 'run_command', 'delete_path']));
  });

  it('keeps normal fix requests on the dependable monolithic builder by default', () => {
    const plan = buildAgentRoutePlan({
      ...baseInput,
      message: 'fix the React TypeScript compile error',
    });

    expect(plan.intent).toBe('fix');
    expect(plan.branch).toBe('monolithic');
    expect(plan.specialists).toEqual([]);
    expect(plan.verificationPlan.gates).toContain('diagnostics_clean');
  });

  it('uses specialist fanout for deep or high-risk implementation work', () => {
    const plan = buildAgentRoutePlan({
      ...baseInput,
      runtimeBudget: 'deep',
      message: 'fix the React TypeScript compile error',
    });

    expect(plan.branch).toBe('specialized');
    expect(plan.specialists).toContain('tool_orchestrator');
    expect(plan.specialists).toContain('repair_specialist');
  });

  it('routes generic build requests as create work', () => {
    const plan = buildAgentRoutePlan({
      ...baseInput,
      message: 'Can you build me a cern?',
    });

    expect(plan.intent).toBe('create');
    expect(plan.taskMode).toBe('create');
    expect(plan.verificationPlan.skipProjectVerification).toBe(false);
  });

  it('routes visual polish requests as enhancement work', () => {
    const plan = buildAgentRoutePlan({
      ...baseInput,
      message: 'can you make it look beautiful?',
    });

    expect(plan.intent).toBe('enhance');
    expect(plan.taskMode).toBe('enhance');
    expect(plan.blockedTools).not.toContain('write_file');
  });

  it('keeps execute model metadata aligned with the selected runtime', () => {
    const plan = buildAgentRoutePlan({
      ...baseInput,
      selectedProvider: 'openai',
      selectedModel: 'gpt-5.4',
      message: 'fix this small bug',
    });

    const executePhase = plan.modelPlan.find((phase) => phase.phase === 'execute');
    const classifyPhase = plan.modelPlan.find((phase) => phase.phase === 'classify');

    expect(classifyPhase?.capability).toBe('fast');
    expect(executePhase).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.4',
    });
  });
});

describe('scoreToolRisk', () => {
  it('scores workspace deletion as critical risk', () => {
    const risk = scoreToolRisk({
      name: 'delete_path',
      arguments: { path: '.', confirm: 'DELETE_WORKSPACE' },
    });

    expect(risk.level).toBe('critical');
    expect(risk.destructive).toBe(true);
    expect(risk.requiresConfirmation).toBe(true);
  });

  it('scores read tools as low risk', () => {
    const risk = scoreToolRisk({ name: 'read_file', arguments: { path: 'README.md' } });

    expect(risk.level).toBe('low');
    expect(risk.destructive).toBe(false);
  });
});
