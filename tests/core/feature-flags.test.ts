/**
 * Tests for Feature Flags system
 */

import { resolveFeatureFlags, getFeatureFlags, resetFeatureFlags } from '../../src/main/core/feature-flags';

describe('Feature Flags', () => {
  beforeEach(() => {
    resetFeatureFlags();
    delete process.env.AGENTPRIME_ENABLE_MIRROR;
    delete process.env.AGENTPRIME_ENABLE_BRAIN;
    delete process.env.AGENTPRIME_ENABLE_INFERENCE;
    delete process.env.AGENTPRIME_ENABLE_SMART_MODE;
    delete process.env.AGENTPRIME_ENABLE_CONSCIOUSNESS;
    delete process.env.AGENTPRIME_ENABLE_TELEMETRY;
    delete process.env.AGENTPRIME_ENABLE_INDEXING;
    delete process.env.AGENTPRIME_ENABLE_ACTIVATEPRIME;
  });

  it('should return defaults when no env vars or overrides set', () => {
    const flags = resolveFeatureFlags();
    expect(flags.mirror).toBe(true);
    expect(flags.activatePrime).toBe(true);
    expect(flags.pythonBrain).toBe(true);
    expect(flags.telemetry).toBe(true);
    expect(flags.codebaseIndexing).toBe(true);
    expect(flags.inferenceServer).toBe(false);
    expect(flags.smartMode).toBe(false);
    expect(flags.consciousness).toBe(false);
  });

  it('should respect environment variable overrides', () => {
    process.env.AGENTPRIME_ENABLE_MIRROR = 'false';
    process.env.AGENTPRIME_ENABLE_TELEMETRY = 'false';
    const flags = resolveFeatureFlags();
    expect(flags.mirror).toBe(false);
    expect(flags.telemetry).toBe(false);
  });

  it('should respect settings overrides', () => {
    const flags = resolveFeatureFlags({ mirror: false, consciousness: true });
    expect(flags.mirror).toBe(false);
    expect(flags.consciousness).toBe(true);
  });

  it('should cache flags after first resolution', () => {
    const flags1 = resolveFeatureFlags();
    process.env.AGENTPRIME_ENABLE_MIRROR = 'false';
    const flags2 = resolveFeatureFlags();
    expect(flags1).toBe(flags2);
    expect(flags2.mirror).toBe(true);
  });

  it('should reset cache on resetFeatureFlags()', () => {
    resolveFeatureFlags();
    resetFeatureFlags();
    process.env.AGENTPRIME_ENABLE_MIRROR = 'false';
    const flags = resolveFeatureFlags();
    expect(flags.mirror).toBe(false);
  });

  it('getFeatureFlags should auto-resolve if not yet called', () => {
    const flags = getFeatureFlags();
    expect(flags).toBeDefined();
    expect(typeof flags.mirror).toBe('boolean');
  });
});
