import { looksSimpleStaticWebsiteTask, resolveReflectionBudget } from '../../src/main/agent/reflection-policy';

describe('reflection policy', () => {
  it('treats basic website phrasing as simple static website work', () => {
    expect(looksSimpleStaticWebsiteTask('Make a basic website with HTML and CSS')).toBe(true);
  });

  it('respects standard budget for simple static website creation', () => {
    const plan = resolveReflectionBudget({
      requestedBudget: 'standard',
      userMessage: 'Build me a Cookie website that helps me sell cookies',
      isUpdate: false,
      retryCount: 0,
    });

    expect(looksSimpleStaticWebsiteTask('Build me a Cookie website that helps me sell cookies')).toBe(true);
    expect(plan.budget).toBe('standard');
    expect(plan.planningMode).toBe('skip');
    expect(plan.maxRepairPasses).toBe(2);
  });

  it('keeps simple static website creation on instant only when instant is requested', () => {
    const plan = resolveReflectionBudget({
      requestedBudget: 'instant',
      userMessage: 'Build a simple website for Dino Buddy',
      isUpdate: false,
      retryCount: 0,
    });

    expect(plan.budget).toBe('instant');
    expect(plan.planningMode).toBe('skip');
  });

  it('does not treat framework app requests as simple static website work', () => {
    const plan = resolveReflectionBudget({
      requestedBudget: 'deep',
      userMessage: 'Build a React website with auth and a dashboard',
      isUpdate: false,
      retryCount: 0,
    });

    expect(looksSimpleStaticWebsiteTask('Build a React website with auth and a dashboard')).toBe(false);
    expect(plan.budget).toBe('deep');
  });

  it('keeps risky creation on standard when standard is explicitly selected', () => {
    const plan = resolveReflectionBudget({
      requestedBudget: 'standard',
      userMessage: 'Build a full Tauri desktop app with authentication and deployment',
      isUpdate: false,
      retryCount: 0,
    });

    expect(plan.risky).toBe(true);
    expect(plan.budget).toBe('standard');
    expect(plan.planningMode).toBe('compact');
  });

  it('keeps standard repair retries on standard instead of escalating to deep', () => {
    const plan = resolveReflectionBudget({
      requestedBudget: 'standard',
      userMessage: 'Repair the failed reviewed project changes',
      isUpdate: true,
      retryCount: 1,
      verificationFailed: true,
    });

    expect(plan.budget).toBe('standard');
    expect(plan.maxRepairPasses).toBe(2);
  });

  it('caps simple static repair retries at standard instead of deep', () => {
    const plan = resolveReflectionBudget({
      requestedBudget: 'deep',
      userMessage: 'Build a simple static website',
      isUpdate: false,
      retryCount: 1,
      verificationFailed: true,
    });

    expect(plan.budget).toBe('standard');
    expect(plan.planningMode).toBe('compact');
  });
});
