/**
 * Browser Automation Tool - Web interaction using Puppeteer
 * Enables form filling, navigation, clicking, and data extraction
 */

import { BaseTool, ToolParameter } from './base-tool';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Puppeteer types (loaded dynamically)
let puppeteer: any = null;
let activeBrowser: any = null;
let activePage: any = null;

/**
 * Initialize Puppeteer (lazy load)
 */
async function initPuppeteer(): Promise<boolean> {
  if (puppeteer) return true;
  
  try {
    puppeteer = require('puppeteer');
    return true;
  } catch (error) {
    console.warn('[Browser] Puppeteer not installed. Run: npm install puppeteer');
    return false;
  }
}

/**
 * Get or create browser instance
 */
async function getBrowser(): Promise<any> {
  if (!await initPuppeteer()) {
    throw new Error('Puppeteer is not installed. Run: npm install puppeteer');
  }
  
  if (!activeBrowser || !activeBrowser.isConnected()) {
    console.log('[Browser] Launching new browser instance...');
    activeBrowser = await puppeteer.launch({
      headless: false, // Show browser for user to see actions
      defaultViewport: { width: 1280, height: 800 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    
    // Get first page or create one
    const pages = await activeBrowser.pages();
    activePage = pages[0] || await activeBrowser.newPage();
  }
  
  return activeBrowser;
}

/**
 * Get active page
 */
async function getPage(): Promise<any> {
  await getBrowser();
  if (!activePage || activePage.isClosed()) {
    activePage = await activeBrowser.newPage();
  }
  return activePage;
}

/**
 * Browser Navigate Tool
 */
export class BrowserNavigateTool extends BaseTool {
  constructor() {
    super(
      'browser_navigate',
      'Navigate the browser to a URL. Opens a browser window if not already open.',
      {
        url: {
          type: 'string',
          required: true,
          description: 'The URL to navigate to'
        },
        waitFor: {
          type: 'string',
          required: false,
          description: 'Wait for: "load", "domcontentloaded", "networkidle0", "networkidle2"'
        }
      }
    );
  }

  async execute(args: { url: string; waitFor?: string }): Promise<{ success: boolean; url: string; title: string }> {
    const { url, waitFor = 'domcontentloaded' } = args;
    console.log(`[Browser] Navigating to: ${url}`);

    try {
      const page = await getPage();
      await page.goto(url, { 
        waitUntil: waitFor as any,
        timeout: 30000
      });
      
      const title = await page.title();
      const finalUrl = page.url();
      
      console.log(`[Browser] Loaded: ${title}`);
      return { success: true, url: finalUrl, title };
      
    } catch (error: any) {
      console.error('[Browser] Navigation error:', error.message);
      return { success: false, url, title: `Error: ${error.message}` };
    }
  }
}

/**
 * Browser Click Tool
 */
export class BrowserClickTool extends BaseTool {
  constructor() {
    super(
      'browser_click',
      'Click on an element in the browser. Use CSS selectors or text content.',
      {
        selector: {
          type: 'string',
          required: false,
          description: 'CSS selector to click (e.g., "button.submit", "#login-btn")'
        },
        text: {
          type: 'string',
          required: false,
          description: 'Text content to find and click (e.g., "Sign In", "Submit")'
        },
        waitAfter: {
          type: 'number',
          required: false,
          description: 'Milliseconds to wait after clicking (default: 1000)'
        }
      }
    );
  }

  async execute(args: { selector?: string; text?: string; waitAfter?: number }): Promise<{ success: boolean; message: string }> {
    const { selector, text, waitAfter = 1000 } = args;
    
    if (!selector && !text) {
      return { success: false, message: 'Must provide either selector or text' };
    }

    try {
      const page = await getPage();
      
      if (selector) {
        console.log(`[Browser] Clicking selector: ${selector}`);
        await page.waitForSelector(selector, { timeout: 10000 });
        await page.click(selector);
      } else if (text) {
        console.log(`[Browser] Clicking text: "${text}"`);
        // Find element by text content
        const element = await page.evaluateHandle((searchText: string) => {
          const elements = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"], [role="button"]'));
          for (const el of elements) {
            if (el.textContent?.includes(searchText) || (el as HTMLInputElement).value?.includes(searchText)) {
              return el;
            }
          }
          // Also check all clickable elements
          const allClickable = Array.from(document.querySelectorAll('[onclick], [role="button"], .btn, .button'));
          for (const el of allClickable) {
            if (el.textContent?.includes(searchText)) {
              return el;
            }
          }
          return null;
        }, text);
        
        if (element) {
          await element.click();
        } else {
          return { success: false, message: `Could not find element with text: "${text}"` };
        }
      }
      
      await page.waitForTimeout(waitAfter);
      return { success: true, message: `Clicked successfully` };
      
    } catch (error: any) {
      console.error('[Browser] Click error:', error.message);
      return { success: false, message: error.message };
    }
  }
}

/**
 * Browser Type Tool
 */
export class BrowserTypeTool extends BaseTool {
  constructor() {
    super(
      'browser_type',
      'Type text into an input field in the browser.',
      {
        selector: {
          type: 'string',
          required: false,
          description: 'CSS selector for the input field'
        },
        label: {
          type: 'string',
          required: false,
          description: 'Label text near the input field to find it'
        },
        text: {
          type: 'string',
          required: true,
          description: 'Text to type into the field'
        },
        clear: {
          type: 'boolean',
          required: false,
          description: 'Clear the field before typing (default: true)'
        },
        pressEnter: {
          type: 'boolean',
          required: false,
          description: 'Press Enter after typing (default: false)'
        }
      }
    );
  }

  async execute(args: { 
    selector?: string; 
    label?: string; 
    text: string; 
    clear?: boolean;
    pressEnter?: boolean;
  }): Promise<{ success: boolean; message: string }> {
    const { selector, label, text, clear = true, pressEnter = false } = args;
    
    if (!selector && !label) {
      return { success: false, message: 'Must provide either selector or label' };
    }

    try {
      const page = await getPage();
      let element: any;
      
      if (selector) {
        console.log(`[Browser] Typing into selector: ${selector}`);
        await page.waitForSelector(selector, { timeout: 10000 });
        element = await page.$(selector);
      } else if (label) {
        console.log(`[Browser] Finding field by label: "${label}"`);
        // Find input by associated label
        element = await page.evaluateHandle((labelText: string) => {
          // Try to find by label element
          const labels = Array.from(document.querySelectorAll('label'));
          for (const lbl of labels) {
            if (lbl.textContent?.toLowerCase().includes(labelText.toLowerCase())) {
              const forId = lbl.getAttribute('for');
              if (forId) {
                return document.getElementById(forId);
              }
              // Check for nested input
              const input = lbl.querySelector('input, textarea');
              if (input) return input;
            }
          }
          // Try by placeholder
          const inputs = Array.from(document.querySelectorAll('input, textarea'));
          for (const input of inputs) {
            const placeholder = (input as HTMLInputElement).placeholder?.toLowerCase() || '';
            const name = (input as HTMLInputElement).name?.toLowerCase() || '';
            const ariaLabel = input.getAttribute('aria-label')?.toLowerCase() || '';
            if (placeholder.includes(labelText.toLowerCase()) ||
                name.includes(labelText.toLowerCase()) ||
                ariaLabel.includes(labelText.toLowerCase())) {
              return input;
            }
          }
          return null;
        }, label);
      }
      
      if (!element || !(await element.asElement())) {
        return { success: false, message: `Could not find input field` };
      }
      
      // Clear field if requested
      if (clear) {
        await element.click({ clickCount: 3 }); // Select all
        await page.keyboard.press('Backspace');
      }
      
      // Type the text
      await element.type(text, { delay: 50 });
      
      // Press Enter if requested
      if (pressEnter) {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
      }
      
      return { success: true, message: `Typed "${text}" successfully` };
      
    } catch (error: any) {
      console.error('[Browser] Type error:', error.message);
      return { success: false, message: error.message };
    }
  }
}

/**
 * Browser Fill Form Tool - Fill multiple form fields at once
 */
export class BrowserFillFormTool extends BaseTool {
  constructor() {
    super(
      'browser_fill_form',
      'Fill multiple form fields at once. Provide a mapping of field names/labels to values.',
      {
        fields: {
          type: 'object',
          required: true,
          description: 'Object mapping field labels/names to values. Example: {"Email": "user@example.com", "Password": "secret"}'
        },
        submit: {
          type: 'boolean',
          required: false,
          description: 'Submit the form after filling (default: false)'
        }
      }
    );
  }

  async execute(args: { fields: Record<string, string>; submit?: boolean }): Promise<{ success: boolean; filled: string[]; failed: string[] }> {
    const { fields, submit = false } = args;
    const filled: string[] = [];
    const failed: string[] = [];

    console.log(`[Browser] Filling form with ${Object.keys(fields).length} fields`);

    try {
      const page = await getPage();
      
      for (const [label, value] of Object.entries(fields)) {
        try {
          // Find field by label, name, placeholder, or aria-label
          const element = await page.evaluateHandle((searchText: string) => {
            const searchLower = searchText.toLowerCase();
            
            // By label element
            const labels = Array.from(document.querySelectorAll('label'));
            for (const lbl of labels) {
              if (lbl.textContent?.toLowerCase().includes(searchLower)) {
                const forId = lbl.getAttribute('for');
                if (forId) return document.getElementById(forId);
                const input = lbl.querySelector('input, textarea, select');
                if (input) return input;
              }
            }
            
            // By input attributes
            const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
            for (const input of inputs) {
              const el = input as HTMLInputElement;
              if (el.name?.toLowerCase().includes(searchLower) ||
                  el.placeholder?.toLowerCase().includes(searchLower) ||
                  el.id?.toLowerCase().includes(searchLower) ||
                  input.getAttribute('aria-label')?.toLowerCase().includes(searchLower)) {
                return input;
              }
            }
            
            return null;
          }, label);
          
          if (element && await element.asElement()) {
            // Determine input type
            const tagName = await page.evaluate((el: any) => el.tagName.toLowerCase(), element);
            const inputType = await page.evaluate((el: any) => el.type?.toLowerCase() || '', element);
            
            if (tagName === 'select') {
              // Handle select dropdown
              await element.select(value);
            } else if (inputType === 'checkbox' || inputType === 'radio') {
              // Handle checkbox/radio
              const shouldCheck = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
              const isChecked = await page.evaluate((el: any) => el.checked, element);
              if (shouldCheck !== isChecked) {
                await element.click();
              }
            } else {
              // Handle text input
              await element.click({ clickCount: 3 });
              await page.keyboard.press('Backspace');
              await element.type(value, { delay: 30 });
            }
            
            filled.push(label);
          } else {
            failed.push(label);
          }
        } catch (fieldError: any) {
          console.warn(`[Browser] Failed to fill "${label}": ${fieldError.message}`);
          failed.push(label);
        }
      }
      
      // Submit form if requested
      if (submit && filled.length > 0) {
        console.log('[Browser] Submitting form...');
        // Try to find and click submit button
        const submitted = await page.evaluate(() => {
          const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], button:contains("Submit"), button:contains("Sign")');
          if (submitBtn) {
            (submitBtn as HTMLElement).click();
            return true;
          }
          // Try submitting the form directly
          const form = document.querySelector('form');
          if (form) {
            form.submit();
            return true;
          }
          return false;
        });
        
        if (submitted) {
          await page.waitForTimeout(2000);
        }
      }
      
      console.log(`[Browser] Form fill complete. Filled: ${filled.length}, Failed: ${failed.length}`);
      return { success: failed.length === 0, filled, failed };
      
    } catch (error: any) {
      console.error('[Browser] Form fill error:', error.message);
      return { success: false, filled, failed: [...failed, `Error: ${error.message}`] };
    }
  }
}

/**
 * Browser Screenshot Tool
 */
export class BrowserScreenshotTool extends BaseTool {
  constructor() {
    super(
      'browser_screenshot',
      'Take a screenshot of the current browser page.',
      {
        path: {
          type: 'string',
          required: false,
          description: 'Path to save the screenshot (default: auto-generated in temp folder)'
        },
        fullPage: {
          type: 'boolean',
          required: false,
          description: 'Capture full page including scroll (default: false)'
        }
      }
    );
  }

  async execute(args: { path?: string; fullPage?: boolean }): Promise<{ success: boolean; path: string }> {
    const { fullPage = false } = args;
    const screenshotPath = args.path || path.join(
      process.env.TEMP || '/tmp',
      `screenshot-${Date.now()}.png`
    );

    try {
      const page = await getPage();
      await page.screenshot({ 
        path: screenshotPath, 
        fullPage 
      });
      
      console.log(`[Browser] Screenshot saved: ${screenshotPath}`);
      return { success: true, path: screenshotPath };
      
    } catch (error: any) {
      console.error('[Browser] Screenshot error:', error.message);
      return { success: false, path: `Error: ${error.message}` };
    }
  }
}

/**
 * Browser Extract Tool - Extract data from the page
 */
export class BrowserExtractTool extends BaseTool {
  constructor() {
    super(
      'browser_extract',
      'Extract text content, links, or specific data from the current page.',
      {
        selector: {
          type: 'string',
          required: false,
          description: 'CSS selector to extract from (default: entire page)'
        },
        extractType: {
          type: 'string',
          required: false,
          description: 'What to extract: "text", "html", "links", "inputs", "all" (default: "text")'
        }
      }
    );
  }

  async execute(args: { selector?: string; extractType?: string }): Promise<any> {
    const { selector, extractType = 'text' } = args;

    try {
      const page = await getPage();
      
      const result = await page.evaluate((sel: string, type: string) => {
        const target = sel ? document.querySelector(sel) : document.body;
        if (!target) return { error: 'Selector not found' };
        
        switch (type) {
          case 'html':
            return { html: target.innerHTML };
            
          case 'links':
            const links = target.querySelectorAll('a[href]');
            return {
              links: Array.from(links).map((a: any) => ({
                text: a.textContent?.trim(),
                href: a.href
              }))
            };
            
          case 'inputs':
            const inputs = target.querySelectorAll('input, textarea, select');
            return {
              inputs: Array.from(inputs).map((input: any) => ({
                name: input.name || input.id,
                type: input.type || input.tagName.toLowerCase(),
                value: input.value,
                placeholder: input.placeholder,
                label: input.labels?.[0]?.textContent?.trim()
              }))
            };
            
          case 'all':
            return {
              text: target.textContent?.replace(/\s+/g, ' ').trim(),
              title: document.title,
              url: window.location.href,
              links: Array.from(target.querySelectorAll('a[href]')).slice(0, 20).map((a: any) => ({
                text: a.textContent?.trim(),
                href: a.href
              }))
            };
            
          default: // text
            return { text: target.textContent?.replace(/\s+/g, ' ').trim() };
        }
      }, selector || '', extractType);
      
      console.log(`[Browser] Extracted ${extractType} content`);
      return result;
      
    } catch (error: any) {
      console.error('[Browser] Extract error:', error.message);
      return { error: error.message };
    }
  }
}

/**
 * Browser Close Tool
 */
export class BrowserCloseTool extends BaseTool {
  constructor() {
    super(
      'browser_close',
      'Close the browser instance.',
      {}
    );
  }

  async execute(): Promise<{ success: boolean }> {
    try {
      if (activeBrowser) {
        await activeBrowser.close();
        activeBrowser = null;
        activePage = null;
        console.log('[Browser] Browser closed');
      }
      return { success: true };
    } catch (error: any) {
      console.error('[Browser] Close error:', error.message);
      return { success: false };
    }
  }
}

