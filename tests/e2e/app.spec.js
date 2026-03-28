/**
 * AgentPrime - Electron smoke tests
 * Keeps assertions resilient to UI iteration while validating app boot.
 */

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { execSync } = require('child_process');

let electronApp;
let window;

test.beforeAll(async () => {
  const appDir = path.resolve(__dirname, '../../');
  electronApp = await electron.launch({
    args: [appDir],
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  });
});

test.afterAll(async () => {
  if (electronApp) {
    const proc = electronApp.process();
    if (proc && !proc.killed) {
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
        } catch {
          // Ignore if process is already gone.
        }
      } else {
        proc.kill('SIGKILL');
      }
    }
  }
});

test.beforeEach(async () => {
  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
});

test.describe('Application Smoke', () => {
  test('opens a renderer window', async () => {
    expect(window).toBeTruthy();
    expect(window.isClosed()).toBeFalsy();
  });

  test('renders the root application container', async () => {
    await expect(window.locator('#root')).toBeVisible();
  });

  test('shows AgentPrime branding in the UI', async () => {
    await expect(window.getByText('AgentPrime', { exact: false }).first()).toBeVisible();
  });

  test('uses a reasonable viewport size', async () => {
    const size = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));

    expect(size.width).toBeGreaterThan(900);
    expect(size.height).toBeGreaterThan(600);
  });
});
