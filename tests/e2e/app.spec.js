/**
 * AgentPrime - Electron smoke tests
 * Keeps assertions resilient to UI iteration while validating app boot.
 */

const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
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

  test('stages agent changes until apply, then verifies and runs the project', async () => {
    test.setTimeout(90000);
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-e2e-review-'));

    await window.evaluate(async (nextWorkspacePath) => {
      await window.agentAPI.updateSettings({
        activeProvider: 'ollama',
        activeModel: 'qwen2.5-coder:7b',
        useSpecializedAgents: true
      });
      await window.agentAPI.setWorkspace(nextWorkspacePath);
    }, workspacePath);

    await window.reload();
    await window.waitForLoadState('domcontentloaded');

    const chatInput = window.getByPlaceholder('Describe what you want to build... (@ to mention files)');
    if (!(await chatInput.isVisible())) {
      await window.keyboard.press(process.platform === 'darwin' ? 'Meta+L' : 'Control+L');
      await expect(chatInput).toBeVisible();
    }
    await chatInput.fill('__AGENTPRIME_TEST_REVIEW__');
    await window.getByRole('button', { name: 'Run Agent' }).click();

    const reviewHeading = window.getByText('Review Agent Changes');
    await expect(reviewHeading).toBeVisible();
    expect(fs.existsSync(path.join(workspacePath, 'index.html'))).toBe(false);

    await window.getByRole('button', { name: /Accept Pending/ }).click();
    await window.getByRole('button', { name: 'Apply Accepted Changes' }).click();

    await expect.poll(() => fs.existsSync(path.join(workspacePath, 'index.html'))).toBe(true);
    await expect(window.getByText(/verified successfully/i)).toBeVisible({ timeout: 15000 });

    const runButton = window.getByRole('button', { name: 'Run Project' });
    await expect(runButton).toBeVisible();
    await runButton.click();

    await expect(window.locator('iframe')).toBeVisible({ timeout: 10000 });
  });
});
