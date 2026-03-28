/**
 * AgentPrime - Jest Configuration
 * 
 * Test Directories:
 * - tests/security/        - Security module tests
 * - tests/validators/      - Validator tests
 * - tests/agent/           - Agent tool tests
 * - tests/ipc-handlers/    - IPC handler tests
 * - tests/e2e/             - End-to-end tests
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Keep Jest focused on source + tests to avoid package-name collisions
  roots: ['<rootDir>/src', '<rootDir>/tests'],

  // TypeScript preset
  preset: 'ts-jest',

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.test.ts',
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.test.ts'
  ],

  // Files to ignore
  testPathIgnorePatterns: [
    '/node_modules/',
    '/Projects/',
    '/templates/',
    '/archive/',
    '/dist/',
    // Legacy phase suites target removed modules
    '[/\\\\]tests[/\\\\]integration[/\\\\]phase2-integration\\.test\\.js$',
    '[/\\\\]tests[/\\\\]integration[/\\\\]phase3-integration\\.test\\.ts$',
    '[/\\\\]tests[/\\\\]core[/\\\\]collaboration-engine\\.test\\.(js|ts)$',
    '[/\\\\]tests[/\\\\]core[/\\\\]performance-monitor\\.test\\.ts$',
    '[/\\\\]tests[/\\\\]ai-providers[/\\\\]fine-tuning\\.test\\.ts$'
  ],

  modulePathIgnorePatterns: [
    '<rootDir>/templates/',
    '<rootDir>/archive/',
    '<rootDir>/Projects/',
    '<rootDir>/dist/'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.js',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!**/node_modules/**'
  ],

  // Coverage thresholds - Phase 3: 80%+ target
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Component-specific thresholds
    'src/main/ai-providers/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    'src/main/core/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    'src/main/agent/': {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },

  // Coverage output directory
  coverageDirectory: 'coverage',

  // Verbose output
  verbose: true,

  // Setup files
  setupFilesAfterEnv: ['./tests/setup.js'],

  // Module name mapper for aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^../dist/(.*)$': '<rootDir>/dist/$1'
  },

  // Transform configuration for TypeScript
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }]
  },

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Test timeout (increased for slower tests)
  testTimeout: 15000,

  // Reporter configuration (jest-junit optional for CI)
  reporters: ['default']
};
