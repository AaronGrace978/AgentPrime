import {
  recordAIRuntimeExecution,
  resetAIRuntimeExecution,
  resolveEffectiveAIRuntime,
} from '../src/main/core/ai-runtime-state';

describe('AI runtime state', () => {
  beforeEach(() => {
    resetAIRuntimeExecution();
  });

  it('demotes unconfigured hosted providers to the Ollama runtime', () => {
    const runtime = resolveEffectiveAIRuntime({
      activeProvider: 'openai',
      activeModel: 'gpt-5.4',
      providers: {
        ollama: { model: 'qwen2.5-coder:7b' },
        openai: { apiKey: '' },
      },
    } as any);

    expect(runtime.requestedProvider).toBe('openai');
    expect(runtime.requestedModel).toBe('gpt-5.4');
    expect(runtime.effectiveProvider).toBe('ollama');
    expect(runtime.effectiveModel).toBe('qwen2.5-coder:7b');
    expect(runtime.displayModel).toBe('qwen2.5-coder:7b');
    expect(runtime.resolution).toBe('demoted_to_ollama');
  });

  it('surfaces the executed fallback runtime for the active selection', () => {
    recordAIRuntimeExecution({
      requestedProvider: 'ollama',
      requestedModel: 'qwen2.5-coder:7b',
      effectiveProvider: 'ollama',
      effectiveModel: 'qwen2.5-coder:7b',
      executionProvider: 'ollama',
      executionModel: 'deepseek-coder:6.7b',
      viaFallback: true,
      reason: 'Primary model timed out; using fallback model.',
    });

    const runtime = resolveEffectiveAIRuntime({
      activeProvider: 'ollama',
      activeModel: 'qwen2.5-coder:7b',
      providers: {
        ollama: { model: 'qwen2.5-coder:7b' },
      },
    } as any);

    expect(runtime.effectiveModel).toBe('qwen2.5-coder:7b');
    expect(runtime.executionModel).toBe('deepseek-coder:6.7b');
    expect(runtime.displayModel).toBe('deepseek-coder:6.7b');
    expect(runtime.viaFallback).toBe(true);
    expect(runtime.resolution).toBe('fallback_execution');
  });

  it('ignores stale execution metadata from a different selection', () => {
    recordAIRuntimeExecution({
      requestedProvider: 'ollama',
      requestedModel: 'qwen2.5-coder:7b',
      effectiveProvider: 'ollama',
      effectiveModel: 'qwen2.5-coder:7b',
      executionProvider: 'ollama',
      executionModel: 'deepseek-coder:6.7b',
      viaFallback: true,
    });

    const runtime = resolveEffectiveAIRuntime({
      activeProvider: 'ollama',
      activeModel: 'glm-4.6:cloud',
      providers: {
        ollama: { model: 'glm-4.6:cloud' },
      },
    } as any);

    expect(runtime.displayModel).toBe('glm-4.6:cloud');
    expect(runtime.executionModel).toBeUndefined();
    expect(runtime.viaFallback).toBe(false);
  });
});
