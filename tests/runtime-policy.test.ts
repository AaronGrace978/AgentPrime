import {
  AbortError,
  TimeoutError,
  FALLBACK_MODEL_CHAIN,
  sharedModelCallCooldown,
  sharedToolCallCooldown,
  withRuntimeGuard,
  withSmartFallback,
  type RuntimeHeartbeatEvent,
} from '../src/main/core/timeout-utils';
import { OLLAMA_CLOUD_MODEL_OPTIONS } from '../src/types/ollama-cloud-models';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('runtime timeout policy', () => {
  beforeEach(() => {
    sharedModelCallCooldown.reset();
    sharedToolCallCooldown.reset();
  });

  it('keeps slow but active operations alive past the idle window', async () => {
    const events: RuntimeHeartbeatEvent[] = [];

    const result = await withRuntimeGuard(
      async ({ markProgress }) => {
        for (let i = 0; i < 4; i++) {
          await wait(8);
          markProgress(`chunk ${i}`);
        }
        return 'ok';
      },
      {
        label: 'active model stream',
        totalTimeoutMs: 250,
        idleTimeoutMs: 20,
        heartbeatIntervalMs: 5,
        onEvent: (event) => events.push(event),
      }
    );

    expect(result).toBe('ok');
    expect(events.some((event) => event.type === 'progress')).toBe(true);
    expect(events.some((event) => event.type === 'idle_timeout')).toBe(false);
  });

  it('fails idle operations before the hard total timeout', async () => {
    const events: RuntimeHeartbeatEvent[] = [];

    await expect(
      withRuntimeGuard(
        async () => {
          await wait(100);
          return 'late';
        },
        {
          label: 'idle model call',
          totalTimeoutMs: 250,
          idleTimeoutMs: 15,
          heartbeatIntervalMs: 5,
          onEvent: (event) => events.push(event),
        }
      )
    ).rejects.toBeInstanceOf(TimeoutError);

    expect(events.some((event) => event.type === 'idle_timeout')).toBe(true);
    expect(events.some((event) => event.type === 'total_timeout')).toBe(false);
  });

  it('aborts cleanly without retrying work', async () => {
    const controller = new AbortController();
    const operation = withRuntimeGuard(
      async () => {
        await wait(100);
        return 'late';
      },
      {
        label: 'cancelled operation',
        totalTimeoutMs: 250,
        idleTimeoutMs: 200,
        signal: controller.signal,
      }
    );

    controller.abort();

    await expect(operation).rejects.toBeInstanceOf(AbortError);
  });

  it('emits fallback events when the primary model stalls', async () => {
    const events: RuntimeHeartbeatEvent[] = [];
    const result = await withSmartFallback(
      async (provider, model) => {
        if (provider === 'ollama' && model === 'deepseek-v4-pro:cloud') {
          await wait(60);
          return { success: true, content: 'too late' };
        }
        return { success: true, content: 'fallback ok', servedBy: { provider, model } };
      },
      'ollama',
      'deepseek-v4-pro:cloud',
      'complex',
      'standard',
      {
        label: 'fallback test',
        totalTimeoutMs: 200,
        idleTimeoutMs: 15,
        heartbeatIntervalMs: 5,
        onEvent: (event) => events.push(event),
      }
    );

    expect(result.usedFallback).toBe(true);
    expect(result.result.content).toBe('fallback ok');
    expect(events.some((event) => event.type === 'fallback_start')).toBe(true);
    expect(events.some((event) => event.type === 'fallback_success')).toBe(true);
  });

  it('pins every current Ollama Cloud model in the shared fallback chain', () => {
    const fallbackIds = FALLBACK_MODEL_CHAIN
      .filter((entry) => entry.provider === 'ollama')
      .map((entry) => entry.model);

    for (const model of OLLAMA_CLOUD_MODEL_OPTIONS) {
      expect(fallbackIds).toContain(model.value);
    }
  });
});
