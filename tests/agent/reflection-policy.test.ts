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
    expect(plan.planningMode).toBe('compact');
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
