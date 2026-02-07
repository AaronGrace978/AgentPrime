/**
 * Matrix Mode Browser Automation
 * Playwright-style browser control with AI snapshots
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

// Types
export interface BrowserProfile {
  id: string;
  name: string;
  userDataDir: string;
  cdpPort: number;
  status: 'stopped' | 'starting' | 'running' | 'error';
  lastUsed?: number;
}

export interface BrowserAction {
  action: string;
  params?: Record<string, any>;
}

export interface AISnapshot {
  url: string;
  title: string;
  elements: AIElement[];
  screenshot?: string;
  timestamp: number;
}

export interface AIElement {
  ref: string;
  tag: string;
  role?: string;
  name?: string;
  text?: string;
  placeholder?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  visible: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  attributes?: Record<string, string>;
}

export interface AriaSnapshot {
  tree: AriaNode;
  timestamp: number;
}

export interface AriaNode {
  role: string;
  name?: string;
  children?: AriaNode[];
  ref?: string;
}

export interface BrowserConfig {
  defaultProfile: string;
  profilesDir: string;
  headless: boolean;
  viewport: { width: number; height: number };
  timeout: number;
  portRangeStart: number;
}

const DEFAULT_CONFIG: BrowserConfig = {
  defaultProfile: 'default',
  profilesDir: '',
  headless: false,
  viewport: { width: 1280, height: 720 },
  timeout: 30000,
  portRangeStart: 18800
};

// Dynamic Playwright types
let playwright: any = null;
let Browser: any = null;
let Page: any = null;

/**
 * Browser Controller - Manages browser instances and profiles
 */
export class BrowserController extends EventEmitter {
  private config: BrowserConfig;
  private profiles: Map<string, BrowserProfile> = new Map();
  private browsers: Map<string, any> = new Map();
  private pages: Map<string, any> = new Map();
  private elementRefs: Map<string, Map<string, any>> = new Map();
  private nextRefId: number = 1;
  private playwrightAvailable: boolean = false;

  constructor(config: Partial<BrowserConfig> = {}) {
    super();
    const userDataPath = app?.getPath?.('userData') || process.cwd();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      profilesDir: config.profilesDir || path.join(userDataPath, 'matrix-browser-profiles')
    };
  }

  /**
   * Initialize browser controller
   */
  async initialize(): Promise<void> {
    // Try to load Playwright
    try {
      playwright = await import('playwright');
      this.playwrightAvailable = true;
      console.log('[BrowserController] Playwright available');
    } catch {
      console.warn('[BrowserController] Playwright not available, using CDP fallback');
    }

    // Ensure profiles directory exists
    if (!fs.existsSync(this.config.profilesDir)) {
      fs.mkdirSync(this.config.profilesDir, { recursive: true });
    }

    // Load existing profiles
    await this.loadProfiles();

    // Ensure default profile exists
    if (!this.profiles.has(this.config.defaultProfile)) {
      await this.createProfile(this.config.defaultProfile);
    }

    console.log(`[BrowserController] Initialized with ${this.profiles.size} profiles`);
  }

  /**
   * Load profiles from disk
   */
  private async loadProfiles(): Promise<void> {
    const profilesFile = path.join(this.config.profilesDir, 'profiles.json');
    if (fs.existsSync(profilesFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(profilesFile, 'utf-8'));
        for (const profile of data) {
          this.profiles.set(profile.id, { ...profile, status: 'stopped' });
        }
      } catch (error) {
        console.warn('[BrowserController] Failed to load profiles:', error);
      }
    }
  }

  /**
   * Save profiles to disk
   */
  private async saveProfiles(): Promise<void> {
    const profilesFile = path.join(this.config.profilesDir, 'profiles.json');
    const data = Array.from(this.profiles.values()).map(p => ({
      id: p.id,
      name: p.name,
      userDataDir: p.userDataDir,
      cdpPort: p.cdpPort
    }));
    fs.writeFileSync(profilesFile, JSON.stringify(data, null, 2));
  }

  /**
   * Create a new browser profile
   */
  async createProfile(name: string, cdpPort?: number): Promise<BrowserProfile> {
    const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    if (this.profiles.has(id)) {
      throw new Error(`Profile already exists: ${id}`);
    }

    const port = cdpPort || this.config.portRangeStart + this.profiles.size;
    const userDataDir = path.join(this.config.profilesDir, id);

    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    const profile: BrowserProfile = {
      id,
      name,
      userDataDir,
      cdpPort: port,
      status: 'stopped'
    };

    this.profiles.set(id, profile);
    await this.saveProfiles();

    return profile;
  }

  /**
   * Delete a profile
   */
  async deleteProfile(profileId: string): Promise<boolean> {
    if (profileId === this.config.defaultProfile) {
      throw new Error('Cannot delete default profile');
    }

    await this.stopBrowser(profileId);
    
    const profile = this.profiles.get(profileId);
    if (profile) {
      // Remove user data directory
      if (fs.existsSync(profile.userDataDir)) {
        fs.rmSync(profile.userDataDir, { recursive: true, force: true });
      }
      this.profiles.delete(profileId);
      await this.saveProfiles();
      return true;
    }

    return false;
  }

  /**
   * Start browser for a profile
   */
  async startBrowser(profileId?: string): Promise<any> {
    const id = profileId || this.config.defaultProfile;
    const profile = this.profiles.get(id);
    
    if (!profile) {
      throw new Error(`Profile not found: ${id}`);
    }

    if (this.browsers.has(id)) {
      return this.browsers.get(id);
    }

    profile.status = 'starting';

    try {
      let browser: any;

      if (this.playwrightAvailable) {
        browser = await playwright.chromium.launchPersistentContext(profile.userDataDir, {
          headless: this.config.headless,
          viewport: this.config.viewport,
          args: [`--remote-debugging-port=${profile.cdpPort}`]
        });
      } else {
        // CDP fallback - launch Chrome directly
        const { spawn } = await import('child_process');
        const chromeArgs = [
          `--user-data-dir=${profile.userDataDir}`,
          `--remote-debugging-port=${profile.cdpPort}`,
          this.config.headless ? '--headless' : '',
          `--window-size=${this.config.viewport.width},${this.config.viewport.height}`
        ].filter(Boolean);

        // Try to find Chrome executable
        const chromePaths = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/usr/bin/google-chrome',
          '/usr/bin/chromium'
        ];

        let chromePath = chromePaths.find(p => fs.existsSync(p));
        if (!chromePath) {
          throw new Error('Chrome not found');
        }

        spawn(chromePath, chromeArgs, { detached: true, stdio: 'ignore' });
        
        // Wait for CDP to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        browser = { cdpPort: profile.cdpPort }; // Minimal browser object
      }

      this.browsers.set(id, browser);
      profile.status = 'running';
      profile.lastUsed = Date.now();

      console.log(`[BrowserController] Browser started: ${id}`);
      return browser;

    } catch (error) {
      profile.status = 'error';
      throw error;
    }
  }

  /**
   * Stop browser for a profile
   */
  async stopBrowser(profileId?: string): Promise<void> {
    const id = profileId || this.config.defaultProfile;
    const browser = this.browsers.get(id);
    const profile = this.profiles.get(id);

    if (browser) {
      try {
        if (browser.close) {
          await browser.close();
        }
      } catch {
        // Ignore close errors
      }
      this.browsers.delete(id);
      this.pages.delete(id);
      this.elementRefs.delete(id);
    }

    if (profile) {
      profile.status = 'stopped';
    }
  }

  /**
   * Get or create page for profile
   */
  async getPage(profileId?: string): Promise<any> {
    const id = profileId || this.config.defaultProfile;
    
    if (this.pages.has(id)) {
      return this.pages.get(id);
    }

    const browser = await this.startBrowser(id);
    
    let page: any;
    if (this.playwrightAvailable && browser.pages) {
      const pages = await browser.pages();
      page = pages[0] || await browser.newPage();
    } else {
      page = { profileId: id }; // Minimal page object for CDP
    }

    this.pages.set(id, page);
    return page;
  }

  /**
   * Navigate to URL
   */
  async navigate(url: string, profileId?: string): Promise<void> {
    const page = await this.getPage(profileId);
    
    if (page.goto) {
      await page.goto(url, { timeout: this.config.timeout });
    } else {
      // CDP navigation would go here
      console.log(`[BrowserController] Navigate to: ${url}`);
    }
  }

  /**
   * Take AI-readable snapshot
   */
  async takeAISnapshot(profileId?: string): Promise<AISnapshot> {
    const page = await this.getPage(profileId);
    const id = profileId || this.config.defaultProfile;
    
    // Initialize element refs for this profile
    if (!this.elementRefs.has(id)) {
      this.elementRefs.set(id, new Map());
    }
    const refs = this.elementRefs.get(id)!;
    refs.clear();

    const snapshot: AISnapshot = {
      url: page.url ? await page.url() : 'unknown',
      title: page.title ? await page.title() : 'unknown',
      elements: [],
      timestamp: Date.now()
    };

    if (this.playwrightAvailable && page.evaluate) {
      // Use Playwright to extract elements
      const elements = await page.evaluate(() => {
        const interactiveElements: any[] = [];
        const selectors = 'button, a, input, textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [onclick]';
        
        document.querySelectorAll(selectors).forEach((el: Element) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          
          const htmlEl = el as HTMLElement;
          interactiveElements.push({
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role'),
            name: el.getAttribute('aria-label') || el.getAttribute('name'),
            text: el.textContent?.trim().substring(0, 100),
            placeholder: (el as HTMLInputElement).placeholder,
            value: (el as HTMLInputElement).value,
            checked: (el as HTMLInputElement).checked,
            disabled: (el as HTMLInputElement).disabled,
            visible: htmlEl.offsetParent !== null,
            bounds: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            }
          });
        });
        
        return interactiveElements;
      });

      // Assign refs to elements
      for (const el of elements) {
        const ref = `e${this.nextRefId++}`;
        el.ref = ref;
        refs.set(ref, el);
        snapshot.elements.push(el);
      }
    }

    return snapshot;
  }

  /**
   * Take ARIA accessibility tree snapshot
   */
  async takeAriaSnapshot(profileId?: string): Promise<AriaSnapshot> {
    const page = await this.getPage(profileId);
    
    const tree: AriaNode = {
      role: 'document',
      name: page.title ? await page.title() : 'unknown',
      children: []
    };

    if (this.playwrightAvailable && page.accessibility) {
      const snapshot = await page.accessibility.snapshot();
      if (snapshot) {
        tree.children = this.convertAriaTree(snapshot.children || []);
      }
    }

    return {
      tree,
      timestamp: Date.now()
    };
  }

  private convertAriaTree(nodes: any[]): AriaNode[] {
    return nodes.map((node, index) => ({
      role: node.role,
      name: node.name,
      ref: `a${index}`,
      children: node.children ? this.convertAriaTree(node.children) : undefined
    }));
  }

  /**
   * Perform action on element
   */
  async act(
    ref: string,
    action: 'click' | 'type' | 'fill' | 'hover' | 'select' | 'check' | 'uncheck',
    value?: string,
    profileId?: string
  ): Promise<boolean> {
    const page = await this.getPage(profileId);
    const id = profileId || this.config.defaultProfile;
    const refs = this.elementRefs.get(id);
    
    const element = refs?.get(ref);
    if (!element) {
      throw new Error(`Element not found: ${ref}`);
    }

    if (this.playwrightAvailable && page.click) {
      // Use Playwright to perform action
      const { x, y, width, height } = element.bounds;
      const centerX = x + width / 2;
      const centerY = y + height / 2;

      switch (action) {
        case 'click':
          await page.mouse.click(centerX, centerY);
          break;
        case 'type':
          await page.mouse.click(centerX, centerY);
          if (value) await page.keyboard.type(value);
          break;
        case 'fill':
          await page.mouse.click(centerX, centerY);
          await page.keyboard.press('Control+A');
          if (value) await page.keyboard.type(value);
          break;
        case 'hover':
          await page.mouse.move(centerX, centerY);
          break;
        default:
          throw new Error(`Unsupported action: ${action}`);
      }

      return true;
    }

    return false;
  }

  /**
   * Take screenshot
   */
  async screenshot(profileId?: string, fullPage?: boolean): Promise<Buffer | null> {
    const page = await this.getPage(profileId);
    
    if (this.playwrightAvailable && page.screenshot) {
      return await page.screenshot({ fullPage });
    }

    return null;
  }

  /**
   * Generate PDF
   */
  async pdf(profileId?: string): Promise<Buffer | null> {
    const page = await this.getPage(profileId);
    
    if (this.playwrightAvailable && page.pdf) {
      return await page.pdf();
    }

    return null;
  }

  /**
   * Evaluate JavaScript
   */
  async evaluate(script: string, profileId?: string): Promise<any> {
    const page = await this.getPage(profileId);
    
    if (this.playwrightAvailable && page.evaluate) {
      return await page.evaluate(script);
    }

    return null;
  }

  /**
   * Get browser status
   */
  getStatus(profileId?: string): BrowserProfile | null {
    const id = profileId || this.config.defaultProfile;
    return this.profiles.get(id) || null;
  }

  /**
   * Get all profiles
   */
  getProfiles(): BrowserProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Get open tabs
   */
  async getTabs(profileId?: string): Promise<Array<{ url: string; title: string }>> {
    const id = profileId || this.config.defaultProfile;
    const browser = this.browsers.get(id);
    
    if (this.playwrightAvailable && browser?.pages) {
      const pages = await browser.pages();
      return Promise.all(pages.map(async (p: any) => ({
        url: await p.url(),
        title: await p.title()
      })));
    }

    return [];
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    for (const id of this.browsers.keys()) {
      await this.stopBrowser(id);
    }
  }
}

// Singleton
let browserControllerInstance: BrowserController | null = null;

export function getBrowserController(): BrowserController {
  if (!browserControllerInstance) {
    browserControllerInstance = new BrowserController();
  }
  return browserControllerInstance;
}

export async function initializeBrowserController(): Promise<BrowserController> {
  const controller = getBrowserController();
  await controller.initialize();
  return controller;
}

export default BrowserController;
