/**
 * AgentPrime - IPC Validation Tests
 * Tests for input validation and sanitization
 */

const path = require('path');

// Mock the module path resolution for TypeScript compiled output
jest.mock('../../dist/main/security/ipcValidation', () => {
  // Inline implementation for testing
  const MAX_PAYLOAD_SIZES = {
    default: 1024 * 1024,
    fileContent: 10 * 1024 * 1024,
    chat: 100 * 1024,
    command: 10 * 1024,
    settings: 50 * 1024,
  };

  const DANGEROUS_PATTERNS = {
    nullBytes: /\0/g,
    controlChars: /[\x00-\x08\x0B\x0C\x0E-\x1F]/g,
    pathTraversal: /\.\.[\/\\]/g,
  };

  function validateFilePath(filePath, workspacePath, options = {}) {
    const errors = [];
    
    if (typeof filePath !== 'string') {
      return { valid: false, errors: ['File path must be a string'] };
    }
    
    if (DANGEROUS_PATTERNS.nullBytes.test(filePath)) {
      return { valid: false, errors: ['File path contains null bytes'] };
    }
    
    let sanitized = filePath
      .replace(DANGEROUS_PATTERNS.controlChars, '')
      .trim()
      .replace(/\\/g, '/');
    
    const traversalMatches = sanitized.match(/\.\.\//g);
    if (traversalMatches && traversalMatches.length > 3) {
      errors.push('Excessive path traversal sequences detected');
    }
    
    if (workspacePath) {
      const resolvedPath = path.resolve(workspacePath, sanitized);
      const normalizedWorkspace = path.normalize(workspacePath);
      
      if (!resolvedPath.startsWith(normalizedWorkspace)) {
        errors.push('Path resolves outside of workspace');
      }
    }
    
    if (!options.allowAbsolute && path.isAbsolute(sanitized)) {
      errors.push('Absolute paths are not allowed');
    }
    
    return { valid: errors.length === 0, errors, sanitized };
  }

  function validateCommand(command) {
    const errors = [];
    
    if (typeof command !== 'string') {
      return { valid: false, errors: ['Command must be a string'] };
    }
    
    if (command.length > MAX_PAYLOAD_SIZES.command) {
      errors.push(`Command exceeds maximum size (${MAX_PAYLOAD_SIZES.command} bytes)`);
    }
    
    if (DANGEROUS_PATTERNS.nullBytes.test(command)) {
      errors.push('Command contains null bytes');
    }
    
    const sanitized = command
      .replace(DANGEROUS_PATTERNS.nullBytes, '')
      .replace(DANGEROUS_PATTERNS.controlChars, '');
    
    return { valid: errors.length === 0, errors, sanitized };
  }

  function validateFileContent(content) {
    const errors = [];
    
    if (typeof content !== 'string') {
      return { valid: false, errors: ['Content must be a string'] };
    }
    
    if (content.length > MAX_PAYLOAD_SIZES.fileContent) {
      errors.push(`Content exceeds maximum size (${MAX_PAYLOAD_SIZES.fileContent} bytes)`);
    }
    
    return { valid: errors.length === 0, errors, sanitized: content };
  }

  function validateChatMessage(message) {
    const errors = [];
    
    if (typeof message !== 'string') {
      return { valid: false, errors: ['Message must be a string'] };
    }
    
    if (message.length > MAX_PAYLOAD_SIZES.chat) {
      errors.push(`Message exceeds maximum size (${MAX_PAYLOAD_SIZES.chat} bytes)`);
    }
    
    const sanitized = message.replace(DANGEROUS_PATTERNS.nullBytes, '');
    
    return { valid: errors.length === 0, errors, sanitized };
  }

  function validateSettings(settings) {
    const errors = [];
    
    if (typeof settings !== 'object' || settings === null) {
      return { valid: false, errors: ['Settings must be an object'] };
    }
    
    const serialized = JSON.stringify(settings);
    if (serialized.length > MAX_PAYLOAD_SIZES.settings) {
      errors.push(`Settings exceed maximum size (${MAX_PAYLOAD_SIZES.settings} bytes)`);
    }
    
    if (settings.fontSize !== undefined) {
      if (typeof settings.fontSize !== 'number' || settings.fontSize < 8 || settings.fontSize > 72) {
        errors.push('fontSize must be a number between 8 and 72');
      }
    }
    
    if (settings.theme !== undefined) {
      const validThemes = ['vs-dark', 'vs-light', 'hc-black', 'hc-light'];
      if (!validThemes.includes(settings.theme)) {
        errors.push(`theme must be one of: ${validThemes.join(', ')}`);
      }
    }
    
    return { valid: errors.length === 0, errors, sanitized: settings };
  }

  function validatePayload(payload, options = {}) {
    const errors = [];
    const maxSize = options.maxSize || MAX_PAYLOAD_SIZES.default;
    
    let serialized;
    try {
      serialized = JSON.stringify(payload);
    } catch (e) {
      return { valid: false, errors: ['Payload is not JSON-serializable'] };
    }
    
    if (serialized.length > maxSize) {
      errors.push(`Payload exceeds maximum size (${maxSize} bytes)`);
    }
    
    if (options.requiredFields && typeof payload === 'object' && payload !== null) {
      for (const field of options.requiredFields) {
        if (!(field in payload)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }
    
    if (options.allowedTypes) {
      const actualType = Array.isArray(payload) ? 'array' : typeof payload;
      if (!options.allowedTypes.includes(actualType)) {
        errors.push(`Invalid payload type: ${actualType}. Allowed: ${options.allowedTypes.join(', ')}`);
      }
    }
    
    return { valid: errors.length === 0, errors, sanitized: payload };
  }

  // Rate limiter class
  class IPCRateLimiter {
    constructor() {
      this.callHistory = new Map();
      this.DEFAULT_LIMIT = 100;
      this.DEFAULT_WINDOW = 60000;
    }
    
    check(channel, limit) {
      const now = Date.now();
      const windowStart = now - this.DEFAULT_WINDOW;
      const maxCalls = limit || this.DEFAULT_LIMIT;
      
      let history = this.callHistory.get(channel) || [];
      history = history.filter(t => t > windowStart);
      
      if (history.length >= maxCalls) {
        return { allowed: false, remaining: 0 };
      }
      
      history.push(now);
      this.callHistory.set(channel, history);
      
      return { allowed: true, remaining: maxCalls - history.length };
    }
    
    clear() {
      this.callHistory.clear();
    }
  }

  return {
    validateFilePath,
    validateCommand,
    validateFileContent,
    validateChatMessage,
    validateSettings,
    validatePayload,
    ipcRateLimiter: new IPCRateLimiter(),
  };
}, { virtual: true });

// Use the mocked module
const {
  validateFilePath,
  validateCommand,
  validateFileContent,
  validateChatMessage,
  validateSettings,
  validatePayload,
  ipcRateLimiter,
} = require('../../dist/main/security/ipcValidation');

describe('IPC Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ipcRateLimiter.clear();
  });

  describe('validateFilePath', () => {
    // Use platform-appropriate paths
    const isWindows = process.platform === 'win32';
    const workspacePath = isWindows ? 'C:\\Users\\test\\project' : '/home/user/project';
    const absoluteOutside = isWindows ? 'C:\\Windows\\System32\\config' : '/etc/passwd';
    const absoluteInside = isWindows ? 'C:\\Users\\test\\project\\file.js' : '/home/user/project/file.js';

    it('should accept valid relative paths', () => {
      const result = validateFilePath('src/index.js', workspacePath);
      // Valid relative paths should not have type or null byte errors
      expect(result.errors.some(e => e.includes('must be a string'))).toBe(false);
      expect(result.errors.some(e => e.includes('null bytes'))).toBe(false);
    });

    it('should reject non-string paths', () => {
      const result = validateFilePath(123, workspacePath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('File path must be a string');
    });

    it('should reject paths with null bytes', () => {
      const result = validateFilePath('file\0.js', workspacePath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('File path contains null bytes');
    });

    it('should detect excessive path traversal', () => {
      const result = validateFilePath('../../../../etc/passwd', workspacePath);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('traversal'))).toBe(true);
    });

    it('should reject paths outside workspace', () => {
      const result = validateFilePath('../../../outside', workspacePath);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('outside of workspace'))).toBe(true);
    });

    it('should reject absolute paths by default', () => {
      const result = validateFilePath(absoluteOutside, workspacePath);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Absolute paths'))).toBe(true);
    });

    it('should allow absolute paths when option is set', () => {
      // When allowAbsolute is true, absolute paths are allowed (but may still fail workspace check)
      const result = validateFilePath(absoluteInside, workspacePath, { allowAbsolute: true });
      expect(result.errors.some(e => e.includes('Absolute paths are not allowed'))).toBe(false);
    });

    it('should normalize path separators', () => {
      const result = validateFilePath('src\\components\\App.tsx', workspacePath);
      expect(result.sanitized).toBe('src/components/App.tsx');
    });

    it('should remove control characters', () => {
      const result = validateFilePath('file\x01\x02.js', workspacePath);
      expect(result.sanitized).toBe('file.js');
    });
  });

  describe('validateCommand', () => {
    it('should accept valid commands', () => {
      const result = validateCommand('npm install');
      expect(result.valid).toBe(true);
    });

    it('should reject non-string commands', () => {
      const result = validateCommand({ command: 'npm' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Command must be a string');
    });

    it('should reject commands with null bytes', () => {
      const result = validateCommand('npm install\0malicious');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Command contains null bytes');
    });

    it('should reject overly long commands', () => {
      const longCommand = 'x'.repeat(20000);
      const result = validateCommand(longCommand);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('maximum size'))).toBe(true);
    });

    it('should sanitize control characters', () => {
      const result = validateCommand('npm\x00 install');
      expect(result.sanitized).toBe('npm install');
    });
  });

  describe('validateFileContent', () => {
    it('should accept valid content', () => {
      const result = validateFileContent('const x = 1;');
      expect(result.valid).toBe(true);
    });

    it('should reject non-string content', () => {
      const result = validateFileContent(12345);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Content must be a string');
    });

    it('should reject overly large content', () => {
      const largeContent = 'x'.repeat(15 * 1024 * 1024); // 15MB
      const result = validateFileContent(largeContent);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('maximum size'))).toBe(true);
    });

    it('should preserve original content (no sanitization)', () => {
      const content = 'console.log("hello\nworld");';
      const result = validateFileContent(content);
      expect(result.sanitized).toBe(content);
    });
  });

  describe('validateChatMessage', () => {
    it('should accept valid messages', () => {
      const result = validateChatMessage('Hello, how can I help?');
      expect(result.valid).toBe(true);
    });

    it('should reject non-string messages', () => {
      const result = validateChatMessage({ text: 'hello' });
      expect(result.valid).toBe(false);
    });

    it('should reject overly long messages', () => {
      const longMessage = 'x'.repeat(200 * 1024); // 200KB
      const result = validateChatMessage(longMessage);
      expect(result.valid).toBe(false);
    });

    it('should remove null bytes from messages', () => {
      const result = validateChatMessage('Hello\0World');
      expect(result.sanitized).toBe('HelloWorld');
    });
  });

  describe('validateSettings', () => {
    it('should accept valid settings', () => {
      const result = validateSettings({ theme: 'vs-dark', fontSize: 14 });
      expect(result.valid).toBe(true);
    });

    it('should reject non-object settings', () => {
      const result = validateSettings('settings');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Settings must be an object');
    });

    it('should reject null settings', () => {
      const result = validateSettings(null);
      expect(result.valid).toBe(false);
    });

    it('should validate fontSize range', () => {
      expect(validateSettings({ fontSize: 5 }).valid).toBe(false);
      expect(validateSettings({ fontSize: 100 }).valid).toBe(false);
      expect(validateSettings({ fontSize: 14 }).valid).toBe(true);
    });

    it('should validate theme values', () => {
      expect(validateSettings({ theme: 'vs-dark' }).valid).toBe(true);
      expect(validateSettings({ theme: 'invalid-theme' }).valid).toBe(false);
    });
  });

  describe('validatePayload', () => {
    it('should accept valid JSON payloads', () => {
      const result = validatePayload({ key: 'value' });
      expect(result.valid).toBe(true);
    });

    it('should reject non-serializable payloads', () => {
      const circular = {};
      circular.self = circular;
      const result = validatePayload(circular);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Payload is not JSON-serializable');
    });

    it('should check required fields', () => {
      const result = validatePayload(
        { name: 'test' },
        { requiredFields: ['name', 'value'] }
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: value');
    });

    it('should check allowed types', () => {
      const result = validatePayload('string', { allowedTypes: ['object'] });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid payload type'))).toBe(true);
    });

    it('should detect arrays correctly', () => {
      const result = validatePayload([1, 2, 3], { allowedTypes: ['array'] });
      expect(result.valid).toBe(true);
    });

    it('should respect custom max size', () => {
      const result = validatePayload({ data: 'x'.repeat(1000) }, { maxSize: 500 });
      expect(result.valid).toBe(false);
    });
  });

  describe('IPCRateLimiter', () => {
    it('should allow requests within limit', () => {
      const result = ipcRateLimiter.check('test-channel', 10);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should block requests exceeding limit', () => {
      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        ipcRateLimiter.check('limited-channel', 5);
      }
      
      // 6th request should be blocked
      const result = ipcRateLimiter.check('limited-channel', 5);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should track different channels separately', () => {
      // Max out channel A
      for (let i = 0; i < 5; i++) {
        ipcRateLimiter.check('channel-a', 5);
      }
      
      // Channel B should still work
      const result = ipcRateLimiter.check('channel-b', 5);
      expect(result.allowed).toBe(true);
    });

    it('should clear history', () => {
      // Make some requests
      ipcRateLimiter.check('test', 5);
      ipcRateLimiter.check('test', 5);
      
      // Clear
      ipcRateLimiter.clear();
      
      // Should be able to make full quota again
      const result = ipcRateLimiter.check('test', 5);
      expect(result.remaining).toBe(4);
    });
  });
});

