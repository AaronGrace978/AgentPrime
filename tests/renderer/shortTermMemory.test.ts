/**
 * Short-Term Memory tests
 * 
 * Note: The module uses a singleton with auto-start cleanup timer.
 * We test the class behavior through the exported instance.
 */

describe('ShortTermMemory', () => {
  // Dynamic import to avoid singleton side-effects during module load
  let shortTermMemory: any;

  beforeEach(async () => {
    const mod = await import('../../src/renderer/agent/shortTermMemory');
    shortTermMemory = mod.shortTermMemory;
    shortTermMemory.clear();
  });

  afterEach(() => {
    shortTermMemory.stopCleanupTimer();
  });

  it('caches and retrieves file content', () => {
    shortTermMemory.cacheFileRead('/src/app.ts', 'const x = 1;');
    expect(shortTermMemory.getFileContent('/src/app.ts')).toBe('const x = 1;');
  });

  it('returns null for uncached files', () => {
    expect(shortTermMemory.getFileContent('/does/not/exist.ts')).toBeNull();
  });

  it('detects file changes via hash comparison', () => {
    shortTermMemory.cacheFileRead('/f.ts', 'version1');
    expect(shortTermMemory.hasFileChanged('/f.ts', 'version1')).toBe(false);
    expect(shortTermMemory.hasFileChanged('/f.ts', 'version2')).toBe(true);
  });

  it('tracks file writes and updates read cache', () => {
    shortTermMemory.recordFileWrite('/f.ts', 'new content');
    expect(shortTermMemory.getFileContent('/f.ts')).toBe('new content');
    const writeInfo = shortTermMemory.wasRecentlyWritten('/f.ts');
    expect(writeInfo.written).toBe(true);
  });

  it('refuses to cache files exceeding maxFileSize', () => {
    const huge = 'x'.repeat(200 * 1024);
    shortTermMemory.cacheFileRead('/huge.ts', huge);
    expect(shortTermMemory.getFileContent('/huge.ts')).toBeNull();
  });

  it('tracks hit/miss stats', () => {
    shortTermMemory.cacheFileRead('/a.ts', 'a');
    shortTermMemory.getFileContent('/a.ts'); // hit
    shortTermMemory.getFileContent('/b.ts'); // miss
    const stats = shortTermMemory.getStats();
    expect(stats.hitRate).toBeGreaterThan(0);
  });

  it('lists read files', () => {
    shortTermMemory.cacheFileRead('/x.ts', 'x');
    shortTermMemory.cacheFileRead('/y.ts', 'y');
    const files = shortTermMemory.getReadFiles();
    expect(files).toContain('/x.ts');
    expect(files).toContain('/y.ts');
  });

  it('produces a recent actions summary', () => {
    shortTermMemory.cacheFileRead('/z.ts', 'z');
    const summary = shortTermMemory.getRecentActionsSummary();
    expect(summary).toContain('/z.ts');
  });
});
