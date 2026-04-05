import { createLogger } from '../../src/main/core/logger';

describe('Structured Logger', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.AGENTPRIME_LOG_LEVEL;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENTPRIME_LOG_LEVEL;
    } else {
      process.env.AGENTPRIME_LOG_LEVEL = originalEnv;
    }
  });

  it('creates a logger with all four level methods', () => {
    const log = createLogger('TestTag');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('does not throw when called with various argument types', () => {
    const log = createLogger('Safe');
    expect(() => log.info('string')).not.toThrow();
    expect(() => log.info(42)).not.toThrow();
    expect(() => log.info({ key: 'value' })).not.toThrow();
    expect(() => log.info(null)).not.toThrow();
    expect(() => log.error('err', new Error('test'))).not.toThrow();
  });
});
