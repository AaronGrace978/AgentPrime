/**
 * AgentPrime - Playwright Configuration
 * For E2E testing of the Electron application
 */

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    
    // Timeout for each test
    timeout: 30000,
    
    // Timeout for expect assertions
    expect: {
        timeout: 5000
    },
    
    // Fail the build on CI if you accidentally left test.only in the source code
    forbidOnly: !!process.env.CI,
    
    // Retry failed tests on CI
    retries: process.env.CI ? 2 : 0,
    
    // Parallel execution
    workers: process.env.CI ? 1 : undefined,
    
    // Reporter
    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['list']
    ],
    
    // Shared settings for all projects
    use: {
        // Collect trace when retrying the failed test
        trace: 'on-first-retry',
        
        // Screenshot on failure
        screenshot: 'only-on-failure',
        
        // Video recording
        video: 'on-first-retry'
    },
    
    // No web server needed for Electron app
    // Tests will launch the Electron app directly
});
