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
        activeModel: 'qwen3-coder-next:cloud',
        useSpecializedAgents: true
      });
      await window.agentAPI.setWorkspace(nextWorkspacePath);
    }, workspacePath);

    await window.reload();
    await window.waitForLoadState('domcontentloaded');

    const chatInput = window.getByPlaceholder('Describe what you want to build... (@ to mention files)');
    if (!(await chatInput.isVisible())) {
      const agentModeButton = window.getByRole('button', { name: /^Agent$/ }).first();
      if (await agentModeButton.isVisible()) {
        await agentModeButton.click();
      } else {
        await window.keyboard.press(process.platform === 'darwin' ? 'Meta+L' : 'Control+L');
      }
      await expect(chatInput).toBeVisible({ timeout: 10000 });
    }
    await chatInput.fill('__AGENTPRIME_TEST_REVIEW__');
    await window.getByRole('button', { name: 'Run Agent' }).click();

    const reviewHeading = window.getByText('Review Agent Changes');
    await expect(reviewHeading).toBeVisible();
    expect(fs.existsSync(path.join(workspacePath, 'index.html'))).toBe(false);

    await window.getByRole('button', { name: /Accept Pending/ }).click();
    await window.getByRole('button', { name: 'Apply Accepted Changes' }).click();

    await expect.poll(() => fs.existsSync(path.join(workspacePath, 'index.html'))).toBe(true);
    const runButton = window.getByRole('button', { name: 'Run Project' });
    await expect(runButton).toBeVisible({ timeout: 15000 });
    await runButton.click();

    await expect(window.locator('iframe')).toBeVisible({ timeout: 10000 });
  });

  test('stages a real scaffolded project through the specialized agent stack', async () => {
    test.setTimeout(120000);
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprime-e2e-real-review-'));

    const result = await window.evaluate(async (nextWorkspacePath) => {
      await window.agentAPI.updateSettings({
        activeProvider: 'ollama',
        activeModel: 'qwen3-coder-next:cloud',
        useSpecializedAgents: true
      });
      await window.agentAPI.setWorkspace(nextWorkspacePath);
      return await window.agentAPI.chat(
        'Create a static landing page with a hero section, two CTA buttons, and a status panel.',
        {
          agent_mode: true,
          use_agent_loop: true,
          use_specialized_agents: true,
          deterministic_scaffold_only: true,
          model: 'qwen3-coder-next:cloud',
          runtime_budget: 'standard',
          dual_mode: 'auto'
        }
      );
    }, workspacePath);

    expect(result.success).toBe(true);
    expect(result.reviewSessionId).toBeTruthy();
    expect(Array.isArray(result.reviewChanges)).toBe(true);
    expect(result.reviewChanges.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(workspacePath, 'index.html'))).toBe(false);
    expect(fs.existsSync(path.join(workspacePath, 'styles.css'))).toBe(false);
    expect(result.reviewChanges.map((change) => change.filePath)).toEqual(
      expect.arrayContaining(['index.html', 'styles.css', 'app.js'])
    );

    await window.evaluate(async ({ sessionId }) => {
      await window.agentAPI.updatePendingAgentReviewStatuses(sessionId, 'accepted');
      await window.agentAPI.applyAgentReview(sessionId);
    }, { sessionId: result.reviewSessionId });

    await expect.poll(() => fs.existsSync(path.join(workspacePath, 'index.html'))).toBe(true);
    await expect.poll(() => fs.existsSync(path.join(workspacePath, 'styles.css'))).toBe(true);

    const verification = await window.evaluate(async (nextWorkspacePath) => {
      return await window.agentAPI.verifyProject(nextWorkspacePath);
    }, workspacePath);
    expect(verification.success).toBe(true);

    const launch = await window.evaluate(async (nextWorkspacePath) => {
      return await window.agentAPI.launchProject(nextWorkspacePath);
    }, workspacePath);
    expect(launch.success).toBe(true);
    expect(launch.url).toBeTruthy();
  });
});
