/**
 * AgentPrime - ESLint Configuration
 */

module.exports = {
    root: true,
    env: { browser: true, node: true, es2022: true, jest: true },
    parserOptions: { ecmaVersion: 2022 },
    extends: ['eslint:recommended'],
    
    rules: {
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'prefer-const': 'warn',
        'no-var': 'warn',
        'eqeqeq': ['warn', 'smart'],
        'no-eval': 'error'
    },
    
    overrides: [
        {
            files: ['renderer/**/*.js'],
            globals: {
                agentAPI: 'readonly',
                monaco: 'readonly',
                Prism: 'readonly',
                AppState: 'readonly',
                DOMUtils: 'readonly'
            }
        },
        {
            files: ['tests/**/*.js'],
            rules: { 'no-console': 'off' }
        }
    ],
    
    ignorePatterns: ['node_modules/', 'dist/', 'Projects/', 'templates/']
};
