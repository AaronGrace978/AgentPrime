/**
 * AgentPrime - ESLint Configuration
 */

module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true, jest: true },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  extends: ['eslint:recommended'],

  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'warn',
    'no-var': 'warn',
    eqeqeq: ['warn', 'smart'],
    'no-eval': 'error',
    'no-inner-declarations': 'warn',
    'no-empty': 'warn',
    'no-case-declarations': 'warn',
    'no-useless-escape': 'warn',
    'no-control-regex': 'warn',
    'no-prototype-builtins': 'warn',
    'no-unreachable': 'warn',
    'no-dupe-class-members': 'warn',
    'no-redeclare': 'warn'
  },

  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.d.ts'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      rules: {
        'no-undef': 'off',
        'no-redeclare': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'off'
      }
    },
    {
      files: ['src/renderer/**/*.js', 'src/renderer/**/*.jsx'],
      globals: {
        agentAPI: 'readonly',
        monaco: 'readonly',
        Prism: 'readonly',
        AppState: 'readonly',
        DOMUtils: 'readonly'
      }
    },
    {
      files: ['tests/**/*.{js,ts}'],
      rules: { 'no-console': 'off' }
    }
  ],

  ignorePatterns: ['node_modules/', 'dist/', 'Projects/', 'templates/', 'archive/', 'coverage/']
};
