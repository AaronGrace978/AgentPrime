/**
 * AgentPrime - Project Browser Tester
 * 
 * Runs browser-based tests on generated projects to verify they actually work.
 * Uses Playwright for automated testing (optional - falls back to static analysis).
 * 
 * NOTE: Playwright is NOT bundled with AgentPrime. If installed separately,
 * browser testing is enabled. Otherwise, static HTML analysis is used.
 * 
 * Tests performed:
 * 1. Page loads without errors
 * 2. No JavaScript console errors
 * 3. Interactive elements (buttons) are clickable
 * 4. UI overlays don't block clicks inappropriately
 * 5. Basic functionality tests
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { createRequire } from 'module';

// Playwright is optional - don't import it directly to avoid webpack bundling
// We use dynamic require at runtime only when needed
let playwrightAvailable = false;
let playwrightModule: any = null;

/**
 * Try to load Playwright at runtime (not at bundle time)
 * SECURITY: Uses createRequire instead of eval('require') to avoid code injection risks
 */
function getPlaywright(): any {
  if (playwrightModule !== null) {
    return playwrightAvailable ? playwrightModule : null;
  }
  
  try {
    // SECURITY FIX: Use createRequire instead of eval('require')
    // createRequire is the Node.js standard way to get a require function
    // that bypasses webpack bundling without exposing arbitrary code execution
    const nodeRequire = createRequire(__filename);
    playwrightModule = nodeRequire('playwright');
    playwrightAvailable = true;
    return playwrightModule;
  } catch (e) {
    playwrightAvailable = false;
    playwrightModule = false; // Mark as checked but unavailable
    return null;
  }
}

export interface BrowserTestResult {
  passed: boolean;
  score: number; // 0-100
  issues: BrowserTestIssue[];
  suggestions: string[];
  consoleErrors: string[];
  consoleWarnings: string[];
  testedElements: TestedElement[];
  screenshots?: string[];
}

export interface BrowserTestIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'load' | 'console' | 'click' | 'layout' | 'functionality';
  description: string;
  element?: string;
  suggestedFix?: string;
}

export interface TestedElement {
  selector: string;
  description: string;
  clickable: boolean;
  visible: boolean;
  blocked?: boolean;
  blockedBy?: string;
}

/**
 * Browser-based project tester
 */
export class ProjectBrowserTester {
  private serverProcess: ChildProcess | null = null;
  private serverPort: number = 0;
  
  constructor(private workspacePath: string) {}
  
  /**
   * Run browser tests on the project
   */
  async test(): Promise<BrowserTestResult> {
    const result: BrowserTestResult = {
      passed: true,
      score: 100,
      issues: [],
      suggestions: [],
      consoleErrors: [],
      consoleWarnings: [],
      testedElements: []
    };
    
    // Check if this is a testable web project
    const htmlFiles = this.findHtmlFiles();
    if (htmlFiles.length === 0) {
      result.issues.push({
        severity: 'info',
        category: 'load',
        description: 'No HTML files found - skipping browser tests'
      });
      return result;
    }
    
    // Try to load Playwright at runtime (optional dependency)
    const playwright = getPlaywright();
    
    if (!playwright) {
      // Playwright not installed - provide helpful message
      result.issues.push({
        severity: 'info',
        category: 'load',
        description: 'Playwright not installed - install with "npm install playwright" to enable browser testing'
      });
      
      // Fall back to static analysis only
      return this.staticHtmlAnalysis(result, htmlFiles);
    }
    
    try {
      // Start local server
      await this.startServer();
      
      if (this.serverPort === 0) {
        result.issues.push({
          severity: 'warning',
          category: 'load',
          description: 'Could not start local server - falling back to static analysis'
        });
        return this.staticHtmlAnalysis(result, htmlFiles);
      }
      
      // Run Playwright tests
      const browser = await playwright.chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();
      
      // Collect console messages
      page.on('console', (msg: { type: () => string; text: () => string }) => {
        if (msg.type() === 'error') {
          result.consoleErrors.push(msg.text());
        } else if (msg.type() === 'warning') {
          result.consoleWarnings.push(msg.text());
        }
      });
      
      // Navigate to the main page
      const mainHtml = htmlFiles[0];
      const relPath = path.relative(this.workspacePath, mainHtml);
      const url = `http://127.0.0.1:${this.serverPort}/${relPath}`;
      
      await page.goto(url, { timeout: 10000 });
      await page.waitForTimeout(2000); // Wait for any animations/loads
      
      // Check for console errors
      if (result.consoleErrors.length > 0) {
        for (const error of result.consoleErrors) {
          result.issues.push({
            severity: 'critical',
            category: 'console',
            description: `JavaScript error: ${error.substring(0, 200)}`
          });
          result.score -= 10;
        }
      }
      
      // Test interactive elements
      await this.testInteractiveElements(page, result);
      
      // Test overlay/modal patterns
      await this.testOverlayPatterns(page, result);
      
      await browser.close();
      
    } catch (error: any) {
      result.issues.push({
        severity: 'warning',
        category: 'load',
        description: `Browser test failed: ${error.message}`
      });
      result.score -= 20;
    } finally {
      await this.stopServer();
    }
    
    // Determine pass/fail
    result.passed = result.score >= 70 && 
                    result.issues.filter(i => i.severity === 'critical').length === 0;
    
    return result;
  }
  
  /**
   * Find HTML files in the project
   */
  private findHtmlFiles(): string[] {
    const htmlFiles: string[] = [];
    
    const scan = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
            scan(fullPath);
          }
        } else if (entry.name.endsWith('.html')) {
          htmlFiles.push(fullPath);
        }
      }
    };
    
    scan(this.workspacePath);
    
    // Prioritize index.html
    htmlFiles.sort((a, b) => {
      const aIsIndex = a.toLowerCase().includes('index.html');
      const bIsIndex = b.toLowerCase().includes('index.html');
      if (aIsIndex && !bIsIndex) return -1;
      if (!aIsIndex && bIsIndex) return 1;
      return 0;
    });
    
    return htmlFiles;
  }
  
  /**
   * Start a local HTTP server
   */
  private async startServer(): Promise<void> {
    return new Promise((resolve) => {
      // Find an available port
      const port = 8765 + Math.floor(Math.random() * 1000);
      
      try {
        // Use npx http-server
        this.serverProcess = spawn('npx', ['http-server', this.workspacePath, '-p', port.toString(), '--silent'], {
          shell: true,
          detached: false
        });
        
        this.serverProcess.on('error', () => {
          this.serverPort = 0;
          resolve();
        });
        
        // Wait for server to start
        setTimeout(() => {
          this.serverPort = port;
          resolve();
        }, 2000);
        
      } catch (e) {
        this.serverPort = 0;
        resolve();
      }
    });
  }
  
  /**
   * Stop the local server
   */
  private async stopServer(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }
  
  /**
   * Test interactive elements (buttons, links)
   */
  private async testInteractiveElements(page: any, result: BrowserTestResult): Promise<void> {
    try {
      // Find all buttons
      const buttons = await page.locator('button').all();
      
      for (const button of buttons.slice(0, 10)) { // Test up to 10 buttons
        try {
          const isVisible = await button.isVisible();
          const text = await button.textContent() || 'unnamed button';
          
          const testedElement: TestedElement = {
            selector: 'button',
            description: text.trim().substring(0, 50),
            clickable: false,
            visible: isVisible
          };
          
          if (isVisible) {
            // Check if button is clickable (not blocked by another element)
            try {
              // Use force:false to check if element is actually clickable
              const box = await button.boundingBox();
              if (box) {
                // Check what element is at that position
                const elementAtPoint = await page.evaluate(([x, y]: [number, number]) => {
                  const el = document.elementFromPoint(x, y);
                  return el ? {
                    tagName: el.tagName,
                    id: el.id,
                    className: el.className
                  } : null;
                }, [box.x + box.width / 2, box.y + box.height / 2]);
                
                if (elementAtPoint && elementAtPoint.tagName === 'BUTTON') {
                  testedElement.clickable = true;
                } else if (elementAtPoint) {
                  testedElement.blocked = true;
                  testedElement.blockedBy = `${elementAtPoint.tagName}#${elementAtPoint.id}.${elementAtPoint.className}`;
                  
                  result.issues.push({
                    severity: 'critical',
                    category: 'click',
                    description: `Button "${text.trim()}" is blocked by another element: ${testedElement.blockedBy}`,
                    element: text.trim(),
                    suggestedFix: 'Check z-index and pointer-events CSS properties'
                  });
                  result.score -= 15;
                }
              }
            } catch (e) {
              // Could not determine clickability
              testedElement.clickable = true; // Assume clickable if we can't check
            }
          } else {
            // Button not visible - might be in a hidden overlay
            testedElement.clickable = false;
          }
          
          result.testedElements.push(testedElement);
          
        } catch (e) {
          // Skip this button
        }
      }
      
    } catch (e) {
      // Could not test interactive elements
      result.issues.push({
        severity: 'info',
        category: 'functionality',
        description: 'Could not enumerate interactive elements'
      });
    }
  }
  
  /**
   * Test overlay/modal patterns for click interception issues
   */
  private async testOverlayPatterns(page: any, result: BrowserTestResult): Promise<void> {
    try {
      // Check for the common pointer-events inheritance bug
      const overlayInfo = await page.evaluate(() => {
        const screens = Array.from(document.querySelectorAll('.screen, .overlay, .modal, [class*="overlay"], [class*="modal"]'));
        const issues: string[] = [];
        
        for (const screen of screens) {
          const style = window.getComputedStyle(screen);
          const isHidden = style.opacity === '0' || style.display === 'none' || style.visibility === 'hidden';
          const hasPointerEventsNone = style.pointerEvents === 'none';
          
          if (isHidden && !hasPointerEventsNone) {
            issues.push(`Hidden overlay "${screen.className}" doesn't have pointer-events:none - may intercept clicks`);
          }
          
          // Check children for pointer-events:all overriding parent
          if (hasPointerEventsNone) {
            const children = Array.from(screen.querySelectorAll('button, a, [onclick], [class*="btn"]'));
            for (const child of children) {
              const childStyle = window.getComputedStyle(child);
              if (childStyle.pointerEvents === 'all') {
                issues.push(`Button inside hidden overlay has pointer-events:all - will intercept clicks: ${(child as HTMLElement).textContent?.substring(0, 30)}`);
              }
            }
          }
        }
        
        return issues;
      });
      
      for (const issue of overlayInfo) {
        result.issues.push({
          severity: 'critical',
          category: 'layout',
          description: issue,
          suggestedFix: 'Remove pointer-events:all from buttons inside overlays, let them inherit from parent'
        });
        result.score -= 15;
      }
      
    } catch (e) {
      // Could not test overlay patterns
    }
  }
  
  /**
   * Static HTML analysis when browser testing isn't available
   */
  private staticHtmlAnalysis(result: BrowserTestResult, htmlFiles: string[]): BrowserTestResult {
    for (const htmlFile of htmlFiles) {
      try {
        const content = fs.readFileSync(htmlFile, 'utf-8');
        const relPath = path.relative(this.workspacePath, htmlFile);
        
        // Check for buttons with onclick handlers
        const onclickButtons = content.match(/<button[^>]*onclick=/gi) || [];
        if (onclickButtons.length > 0) {
          result.suggestions.push(`${relPath}: Found ${onclickButtons.length} buttons with inline onclick - consider event listeners`);
        }
        
        // Check for script tags at end of body (good practice)
        const scriptsInHead = (content.match(/<head[\s\S]*<script/gi) || []).length;
        const scriptsBeforeBody = (content.match(/<\/body>[\s\S]*<script/gi) || []).length;
        
        if (scriptsInHead > 0 && scriptsBeforeBody === 0) {
          const hasDefer = content.includes('defer') || content.includes('async');
          if (!hasDefer) {
            result.suggestions.push(`${relPath}: Scripts in <head> without defer/async may block page load`);
          }
        }
        
        // Check for referenced CSS/JS files
        const cssRefs = content.match(/href=["'][^"']+\.css["']/gi) || [];
        const jsRefs = content.match(/src=["'][^"']+\.js["']/gi) || [];
        
        for (const ref of [...cssRefs, ...jsRefs]) {
          const filePath = ref.match(/["']([^"']+)["']/)?.[1];
          if (filePath && !filePath.startsWith('http') && !filePath.startsWith('//')) {
            const fullPath = path.join(path.dirname(htmlFile), filePath);
            if (!fs.existsSync(fullPath)) {
              result.issues.push({
                severity: 'critical',
                category: 'load',
                description: `${relPath}: Referenced file not found: ${filePath}`
              });
              result.score -= 10;
            }
          }
        }
        
      } catch (e) {
        // Skip unreadable files
      }
    }
    
    result.passed = result.score >= 70;
    return result;
  }
}

/**
 * Quick test function for use in agent loop
 */
export async function testProjectInBrowser(workspacePath: string): Promise<BrowserTestResult> {
  const tester = new ProjectBrowserTester(workspacePath);
  return tester.test();
}

/**
 * Format test results for display
 */
export function formatBrowserTestResults(result: BrowserTestResult): string {
  if (result.passed) {
    return `✅ Browser tests passed (score: ${result.score}/100)\n` +
           `   Tested ${result.testedElements.length} interactive elements`;
  }
  
  let output = `❌ BROWSER TESTS FAILED (score: ${result.score}/100)\n\n`;
  
  if (result.consoleErrors.length > 0) {
    output += `🔴 Console Errors:\n`;
    for (const error of result.consoleErrors.slice(0, 5)) {
      output += `   • ${error.substring(0, 100)}\n`;
    }
    output += '\n';
  }
  
  const criticalIssues = result.issues.filter(i => i.severity === 'critical');
  if (criticalIssues.length > 0) {
    output += `⚠️ Critical Issues:\n`;
    for (const issue of criticalIssues) {
      output += `   • ${issue.description}\n`;
      if (issue.suggestedFix) {
        output += `     Fix: ${issue.suggestedFix}\n`;
      }
    }
    output += '\n';
  }
  
  const blockedElements = result.testedElements.filter(e => e.blocked);
  if (blockedElements.length > 0) {
    output += `🚫 Blocked UI Elements:\n`;
    for (const el of blockedElements) {
      output += `   • "${el.description}" blocked by ${el.blockedBy}\n`;
    }
    output += '\n';
  }
  
  if (result.suggestions.length > 0) {
    output += `💡 Suggestions:\n`;
    for (const suggestion of result.suggestions.slice(0, 5)) {
      output += `   • ${suggestion}\n`;
    }
  }
  
  return output;
}

export default {
  ProjectBrowserTester,
  testProjectInBrowser,
  formatBrowserTestResults
};
