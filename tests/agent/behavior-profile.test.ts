import {
  buildVibeCoderDirectResponseSystemPrompt,
  classifyVibeCoderIntent,
  injectBehaviorProfilePrompt,
  normalizeAssistantBehaviorProfile,
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
});
