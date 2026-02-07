/**
 * AgentPrime - E2E Tests
 * Tests for the Electron application using Playwright
 */

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

let electronApp;
let window;

test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
        args: [path.join(__dirname, '../../main.js')],
        env: {
            ...process.env,
            NODE_ENV: 'test'
        }
    });
});

test.afterAll(async () => {
    // Close the app
    if (electronApp) {
        await electronApp.close();
    }
});

test.beforeEach(async () => {
    // Get the first window
    window = await electronApp.firstWindow();
    // Wait for the window to be fully loaded
    await window.waitForLoadState('domcontentloaded');
});

test.describe('Application Launch', () => {
    test('should display lock screen on startup', async () => {
        // Check for lock screen element
        const lockScreen = await window.locator('#lockScreen');
        await expect(lockScreen).toBeVisible();
    });

    test('should display correct app title', async () => {
        // Check for app title in lock screen
        const title = await window.locator('.lock-title');
        await expect(title).toHaveText('AgentPrime');
    });

    test('should display current time on lock screen', async () => {
        const timeDisplay = await window.locator('#lockTime');
        await expect(timeDisplay).toBeVisible();
        // Time should be in HH:MM format
        const timeText = await timeDisplay.textContent();
        expect(timeText).toMatch(/^\d{2}:\d{2}$/);
    });
});

test.describe('Unlock Flow', () => {
    test('should unlock with Enter key', async () => {
        const lockScreen = await window.locator('#lockScreen');
        
        // Press Enter to unlock
        await window.keyboard.press('Enter');
        
        // Wait for unlock animation
        await window.waitForTimeout(700);
        
        // Lock screen should be hidden or have unlocked class
        await expect(lockScreen).toHaveClass(/unlocked/);
    });

    test('should show mode selector after unlock', async () => {
        // Press Enter to unlock
        await window.keyboard.press('Enter');
        
        // Wait for animation
        await window.waitForTimeout(700);
        
        // Mode selector should be visible
        const modeSelector = await window.locator('#modeSelector');
        await expect(modeSelector).not.toHaveClass(/hidden/);
    });
});

test.describe('Mode Selection', () => {
    test.beforeEach(async () => {
        // Unlock first
        await window.keyboard.press('Enter');
        await window.waitForTimeout(700);
    });

    test('should display VibeCoder card', async () => {
        const vibecoderCard = await window.locator('.vibecoder-card');
        await expect(vibecoderCard).toBeVisible();
    });

    test('should display AgentPrime card', async () => {
        const agentprimeCard = await window.locator('.agentprime-card');
        await expect(agentprimeCard).toBeVisible();
    });
});

test.describe('Window Properties', () => {
    test('should have correct window title', async () => {
        const title = await window.title();
        expect(title).toBe('AgentPrime');
    });

    test('should have reasonable window size', async () => {
        const { width, height } = await window.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight
        }));
        
        expect(width).toBeGreaterThan(800);
        expect(height).toBeGreaterThan(600);
    });
});
