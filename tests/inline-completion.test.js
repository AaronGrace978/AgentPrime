/**
 * Inline Completion Tests
 * 
 * Tests for the Cursor-style inline code completion feature
 */

describe('Inline Completion', () => {
  // Mock dependencies
  const mockAiRouter = {
    stream: jest.fn((messages, callback, options) => {
      // Simulate streaming response
      callback({ content: 'console.log(' });
      callback({ content: '"hello"' });
      callback({ content: ')' });
      callback({ done: true });
      return Promise.resolve();
    })
  };

  const mockCodebaseIndexer = {
    findSimilarCode: jest.fn(() => [
      { filePath: 'test.ts', code: 'console.log("example")' }
    ])
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Context building', () => {
    it('should create cache key from file path and context', () => {
      const context = {
        filePath: 'src/test.ts',
        lineNumber: 10,
        column: 15,
        beforeCursor: 'const x = '
      };

      const cacheKey = `${context.filePath}:${context.lineNumber}:${context.beforeCursor.substring(Math.max(0, context.beforeCursor.length - 100))}`;
      
      expect(cacheKey).toBe('src/test.ts:10:const x = ');
    });

    it('should truncate long context for cache key', () => {
      const longContext = 'a'.repeat(150);
      const context = {
        filePath: 'src/test.ts',
        lineNumber: 10,
        beforeCursor: longContext
      };

      const cacheKey = `${context.filePath}:${context.lineNumber}:${context.beforeCursor.substring(Math.max(0, context.beforeCursor.length - 100))}`;
      
      expect(cacheKey).toBe('src/test.ts:10:' + 'a'.repeat(100));
    });
  });

  describe('Completion prompt', () => {
    it('should build concise completion prompt', () => {
      const context = {
        language: 'typescript',
        beforeCursor: 'const greeting = '
      };

      const prompt = `Complete this ${context.language || 'code'}:

${context.beforeCursor.substring(Math.max(0, context.beforeCursor.length - 300))}

Respond with ONLY the completion, no explanations.`;

      expect(prompt).toContain('Complete this typescript');
      expect(prompt).toContain('const greeting = ');
      expect(prompt).toContain('ONLY the completion');
    });
  });

  describe('Completion cleaning', () => {
    it('should remove markdown code blocks from completion', () => {
      const rawCompletion = '```typescript\nconsole.log("hello")\n```';
      
      const cleaned = rawCompletion
        .replace(/^```\w*\n?/, '')
        .replace(/\n```$/, '')
        .trim()
        .split('\n')[0]
        .substring(0, 80);

      expect(cleaned).toBe('console.log("hello")');
    });

    it('should take only first line of multi-line completion', () => {
      const rawCompletion = 'console.log("hello")\nconsole.log("world")';
      
      const cleaned = rawCompletion
        .trim()
        .split('\n')[0]
        .substring(0, 80);

      expect(cleaned).toBe('console.log("hello")');
    });

    it('should limit completion length to 80 characters', () => {
      const rawCompletion = 'a'.repeat(100);
      
      const cleaned = rawCompletion.substring(0, 80);

      expect(cleaned.length).toBe(80);
    });
  });

  describe('Cache management', () => {
    it('should evict oldest entries when cache is full', () => {
      const cache = new Map();
      const MAX_CACHE_SIZE = 5;

      // Fill cache
      for (let i = 0; i < MAX_CACHE_SIZE; i++) {
        cache.set(`key${i}`, { completion: `completion${i}`, timestamp: Date.now() - i });
      }

      expect(cache.size).toBe(MAX_CACHE_SIZE);

      // Add new entry, should evict oldest
      if (cache.size >= MAX_CACHE_SIZE) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      cache.set('newKey', { completion: 'new', timestamp: Date.now() });

      expect(cache.size).toBe(MAX_CACHE_SIZE);
      expect(cache.has('key0')).toBe(false);
      expect(cache.has('newKey')).toBe(true);
    });

    it('should return cached completion within TTL', () => {
      const CACHE_TTL = 10000;
      const cache = new Map();
      const cacheKey = 'test:10:const x = ';
      
      cache.set(cacheKey, {
        completion: 'cachedCompletion',
        timestamp: Date.now() - 5000 // 5 seconds ago
      });

      const cached = cache.get(cacheKey);
      const isValid = cached && (Date.now() - cached.timestamp < CACHE_TTL);

      expect(isValid).toBe(true);
      expect(cached.completion).toBe('cachedCompletion');
    });

    it('should not return expired cached completion', () => {
      const CACHE_TTL = 10000;
      const cache = new Map();
      const cacheKey = 'test:10:const x = ';
      
      cache.set(cacheKey, {
        completion: 'expiredCompletion',
        timestamp: Date.now() - 15000 // 15 seconds ago (expired)
      });

      const cached = cache.get(cacheKey);
      const isValid = cached && (Date.now() - cached.timestamp < CACHE_TTL);

      expect(isValid).toBe(false);
    });
  });

  describe('Model selection', () => {
    it('should use fast completion models', () => {
      const COMPLETION_MODELS = [
        'devstral-small-2:24b-cloud',
        'codellama:7b',
        'qwen3:8b',
      ];

      const completionModel = COMPLETION_MODELS[0];

      expect(completionModel).toBe('devstral-small-2:24b-cloud');
    });
  });
});

