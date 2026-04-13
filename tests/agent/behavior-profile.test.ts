import {
  buildVibeCoderDirectResponseSystemPrompt,
  classifyVibeCoderIntent,
  getVibeCoderToolPolicyError,
  injectBehaviorProfilePrompt,
  normalizeAssistantBehaviorProfile,
  resolveVibeCoderExecutionPolicy,
} from '../../src/main/agent/behavior-profile';

describe('behavior-profile', () => {
  it('defaults unknown profiles to default', () => {
    expect(normalizeAssistantBehaviorProfile(undefined)).toBe('default');
    expect(normalizeAssistantBehaviorProfile('other')).toBe('default');
    expect(normalizeAssistantBehaviorProfile('vibecoder')).toBe('vibecoder');
  });

  it('classifies planning requests as plan-only', () => {
    expect(classifyVibeCoderIntent('Analyze the best way to structure auth here')).toBe('plan-only');
  });

  it('classifies review requests before broad analysis wording', () => {
    expect(classifyVibeCoderIntent('Review this change and look for issues')).toBe('review-only');
  });

  it('classifies repair requests as repair-only', () => {
    expect(classifyVibeCoderIntent('This is broken, fix it and make it work')).toBe('repair-only');
  });

  it('falls back to build-now for implementation asks', () => {
    expect(classifyVibeCoderIntent('Vibe code the login flow')).toBe('build-now');
  });

  it('injects and replaces the VibeCoder doctrine cleanly', () => {
    const basePrompt = 'Base system prompt';
    const injected = injectBehaviorProfilePrompt(basePrompt, 'vibecoder', 'repair-only');

    expect(injected).toContain('AARON GRACE VIBECODER DOCTRINE');
    expect(injected).toContain('Current request classification: repair-only.');

    const reinjected = injectBehaviorProfilePrompt(injected, 'default');
    expect(reinjected).toBe(basePrompt);
  });

  it('builds direct-response prompts for plan and review requests', () => {
    expect(buildVibeCoderDirectResponseSystemPrompt('plan-only')).toContain('This request is plan-only');
    expect(buildVibeCoderDirectResponseSystemPrompt('plan-only')).toContain('lead with the cleanest recommendation first');
    expect(buildVibeCoderDirectResponseSystemPrompt('plan-only')).toContain('avoid absolute claims');
    expect(buildVibeCoderDirectResponseSystemPrompt('review-only')).toContain('Return findings first');
    expect(buildVibeCoderDirectResponseSystemPrompt('review-only')).toContain('do not turn the answer into a formal essay');
  });

  it('derives a direct read-only policy for planning requests', () => {
    expect(resolveVibeCoderExecutionPolicy('vibecoder', 'Analyze the auth architecture')).toEqual({
      intent: 'plan-only',
      responseMode: 'direct',
      allowWrites: false,
      allowCommands: false,
      allowScaffold: false,
      allowInstalls: false,
    });
  });

  it('derives a repair policy that still blocks scaffold/create work', () => {
    expect(resolveVibeCoderExecutionPolicy('vibecoder', 'Fix the broken build')).toEqual({
      intent: 'repair-only',
      responseMode: 'agent',
      allowWrites: true,
      allowCommands: true,
      allowScaffold: false,
      allowInstalls: true,
    });
  });

  it('leaves default profile without an execution policy', () => {
    expect(resolveVibeCoderExecutionPolicy('default', 'Analyze the auth architecture')).toBeUndefined();
  });

  it('reports tool-level policy violations for non-mutating intents', () => {
    const policy = resolveVibeCoderExecutionPolicy('vibecoder', 'Review this implementation');
    expect(getVibeCoderToolPolicyError(policy, 'write_file', { path: 'src/App.tsx' })).toContain('review-only');
    expect(getVibeCoderToolPolicyError(policy, 'run_command', { command: 'npm install' })).toContain('review-only');
  });
});
