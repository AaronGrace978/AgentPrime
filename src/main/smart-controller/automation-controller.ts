/**
 * Smart Controller - Automation Controller
 * Mouse, keyboard, and system automation
 * Uses native system commands for broad compatibility
 */

import { exec, execSync } from 'child_process';
import { platform } from 'os';

export interface MousePosition {
  x: number;
  y: number;
}

export interface ClickOptions {
  button?: 'left' | 'right' | 'middle';
  double?: boolean;
  modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[];
}

export interface TypeOptions {
  delay?: number;  // Delay between keystrokes in ms
  modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[];
}

export interface ScrollOptions {
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;  // Number of scroll units
}

export interface AutomationResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Automation Controller
 * Cross-platform mouse/keyboard automation
 */
export class AutomationController {
  private isWindows = platform() === 'win32';
  private isMac = platform() === 'darwin';
  private isLinux = platform() === 'linux';
  private actionLog: { action: string; timestamp: number; success: boolean }[] = [];
  private maxLogSize = 100;
  private isEmergencyStop = false;

  constructor() {
    // Check for required tools
    this.checkDependencies();
  }

  /**
   * Check if required automation tools are available
   */
  private async checkDependencies(): Promise<void> {
    if (this.isLinux) {
      try {
        execSync('which xdotool', { encoding: 'utf-8' });
      } catch {
        console.warn('[AutomationController] xdotool not found on Linux. Install with: sudo apt install xdotool');
      }
    }
  }

  /**
   * Emergency stop - halt all automation
   */
  emergencyStop(): void {
    this.isEmergencyStop = true;
    console.log('[AutomationController] 🛑 EMERGENCY STOP ACTIVATED');
  }

  /**
   * Resume after emergency stop
   */
  resume(): void {
    this.isEmergencyStop = false;
    console.log('[AutomationController] ▶️ Automation resumed');
  }

  /**
   * Check if stopped
   */
  private checkStop(): void {
    if (this.isEmergencyStop) {
      throw new Error('EMERGENCY STOP: Automation halted by user');
    }
  }

  /**
   * Move mouse to absolute position
   */
  async moveMouse(x: number, y: number): Promise<AutomationResult> {
    this.checkStop();
    
    try {
      if (this.isWindows) {
        // PowerShell with .NET for Windows
        const script = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
        `;
        await this.runPowerShell(script);
      } else if (this.isMac) {
        // AppleScript for macOS
        await this.runCommand(`osascript -e 'tell application "System Events" to set position of mouse cursor to {${x}, ${y}}'`);
      } else {
        // xdotool for Linux
        await this.runCommand(`xdotool mousemove ${x} ${y}`);
      }

      this.logAction(`moveMouse(${x}, ${y})`, true);
      return { success: true, message: `Moved mouse to (${x}, ${y})` };
    } catch (error: any) {
      this.logAction(`moveMouse(${x}, ${y})`, false);
      return { success: false, message: `Failed to move mouse: ${error.message}` };
    }
  }

  /**
   * Get current mouse position
   */
  async getMousePosition(): Promise<MousePosition> {
    try {
      if (this.isWindows) {
        const script = `
          Add-Type -AssemblyName System.Windows.Forms
          $pos = [System.Windows.Forms.Cursor]::Position
          "$($pos.X)|$($pos.Y)"
        `;
        const result = await this.runPowerShell(script);
        const [x, y] = result.trim().split('|').map(Number);
        return { x: x || 0, y: y || 0 };
      } else if (this.isMac) {
        // Use mouse location from system
        const result = await this.runCommand(`osascript -e 'tell application "System Events" to get position of mouse cursor'`);
        const [x, y] = result.trim().split(', ').map(Number);
        return { x: x || 0, y: y || 0 };
      } else {
        const result = await this.runCommand('xdotool getmouselocation --shell');
        const match = result.match(/X=(\d+)\s+Y=(\d+)/);
        if (match) {
          return { x: parseInt(match[1]), y: parseInt(match[2]) };
        }
      }
      return { x: 0, y: 0 };
    } catch (error: any) {
      console.error('Failed to get mouse position:', error.message);
      return { x: 0, y: 0 };
    }
  }

  /**
   * Click at current position or specified coordinates
   */
  async click(options?: ClickOptions & { x?: number; y?: number }): Promise<AutomationResult> {
    this.checkStop();
    
    const { button = 'left', double = false, x, y } = options || {};
    
    try {
      // Move mouse first if coordinates provided
      if (x !== undefined && y !== undefined) {
        await this.moveMouse(x, y);
        await this.sleep(50); // Small delay for movement
      }

      if (this.isWindows) {
        const clickType = button === 'right' ? 2 : button === 'middle' ? 4 : 1;
        const script = `
          Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class Mouse {
              [DllImport("user32.dll")]
              public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
              public const int MOUSEEVENTF_LEFTDOWN = 0x02;
              public const int MOUSEEVENTF_LEFTUP = 0x04;
              public const int MOUSEEVENTF_RIGHTDOWN = 0x08;
              public const int MOUSEEVENTF_RIGHTUP = 0x10;
              public const int MOUSEEVENTF_MIDDLEDOWN = 0x20;
              public const int MOUSEEVENTF_MIDDLEUP = 0x40;
            }
"@
          ${button === 'left' ? '[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)' :
            button === 'right' ? '[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0); [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)' :
            '[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, 0); [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0)'}
          ${double ? 'Start-Sleep -Milliseconds 100; ' + (button === 'left' ? '[Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0); [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)' : '') : ''}
        `;
        await this.runPowerShell(script);
      } else if (this.isMac) {
        const buttonNum = button === 'right' ? 2 : button === 'middle' ? 3 : 1;
        const clicks = double ? 2 : 1;
        await this.runCommand(`osascript -e 'tell application "System Events" to click at {${x || 0}, ${y || 0}}'`);
      } else {
        const buttonNum = button === 'right' ? 3 : button === 'middle' ? 2 : 1;
        const cmd = double ? `xdotool click --repeat 2 ${buttonNum}` : `xdotool click ${buttonNum}`;
        await this.runCommand(cmd);
      }

      const desc = `${double ? 'double-' : ''}${button} click${x !== undefined ? ` at (${x}, ${y})` : ''}`;
      this.logAction(desc, true);
      return { success: true, message: `Performed ${desc}` };
    } catch (error: any) {
      this.logAction('click', false);
      return { success: false, message: `Failed to click: ${error.message}` };
    }
  }

  /**
   * Type text with keyboard
   * If delay > 0, types character by character so you can see it happen
   */
  async typeText(text: string, options?: TypeOptions): Promise<AutomationResult> {
    this.checkStop();
    
    const { delay = 50 } = options || {}; // Default 50ms delay for visible typing
    
    try {
      if (this.isWindows) {
        if (delay > 0) {
          // Type character by character with visible delay
          for (const char of text) {
            this.checkStop(); // Allow emergency stop during typing
            
            // Escape special SendKeys characters
            let sendChar = char;
            if (['+', '^', '%', '~', '(', ')', '{', '}', '[', ']'].includes(char)) {
              sendChar = `{${char}}`;
            }
            
            const script = `
              Add-Type -AssemblyName System.Windows.Forms
              [System.Windows.Forms.SendKeys]::SendWait('${sendChar.replace(/'/g, "''")}')
            `;
            await this.runPowerShell(script);
            await this.sleep(delay);
          }
        } else {
          // Fast mode - send all at once
          const escapedText = text.replace(/[`$"\\]/g, '`$&').replace(/'/g, "''");
          const script = `
            Add-Type -AssemblyName System.Windows.Forms
            [System.Windows.Forms.SendKeys]::SendWait('${escapedText.replace(/[+^%~(){}[\]]/g, '{$&}')}')
          `;
          await this.runPowerShell(script);
        }
      } else if (this.isMac) {
        if (delay > 0) {
          // Type character by character on Mac
          for (const char of text) {
            this.checkStop();
            const escapedChar = char.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            await this.runCommand(`osascript -e 'tell application "System Events" to keystroke "${escapedChar}"'`);
            await this.sleep(delay);
          }
        } else {
          // Fast mode
          const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          await this.runCommand(`osascript -e 'tell application "System Events" to keystroke "${escapedText}"'`);
        }
      } else {
        // xdotool for Linux - has native delay support
        const escapedText = text.replace(/'/g, "'\\''");
        await this.runCommand(`xdotool type ${delay > 0 ? `--delay ${delay} ` : ''}'${escapedText}'`);
      }

      this.logAction(`typeText("${text.substring(0, 20)}${text.length > 20 ? '...' : ''}")`, true);
      return { success: true, message: `Typed ${text.length} characters` };
    } catch (error: any) {
      this.logAction('typeText', false);
      return { success: false, message: `Failed to type: ${error.message}` };
    }
  }

  /**
   * Press a specific key or key combination
   */
  async pressKey(key: string, modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[]): Promise<AutomationResult> {
    this.checkStop();
    
    try {
      if (this.isWindows) {
        // Map key names to SendKeys format
        const keyMap: Record<string, string> = {
          'enter': '{ENTER}',
          'return': '{ENTER}',
          'tab': '{TAB}',
          'escape': '{ESC}',
          'esc': '{ESC}',
          'backspace': '{BACKSPACE}',
          'delete': '{DELETE}',
          'home': '{HOME}',
          'end': '{END}',
          'pageup': '{PGUP}',
          'pagedown': '{PGDN}',
          'up': '{UP}',
          'down': '{DOWN}',
          'left': '{LEFT}',
          'right': '{RIGHT}',
          'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}',
          'f5': '{F5}', 'f6': '{F6}', 'f7': '{F7}', 'f8': '{F8}',
          'f9': '{F9}', 'f10': '{F10}', 'f11': '{F11}', 'f12': '{F12}',
          'space': ' ',
        };
        
        let sendKey = keyMap[key.toLowerCase()] || key;
        
        // Add modifiers
        if (modifiers?.includes('ctrl')) sendKey = '^' + sendKey;
        if (modifiers?.includes('alt')) sendKey = '%' + sendKey;
        if (modifiers?.includes('shift')) sendKey = '+' + sendKey;
        
        const script = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait('${sendKey}')
        `;
        await this.runPowerShell(script);
      } else if (this.isMac) {
        let cmd = 'tell application "System Events" to key code ';
        // Would need to map to Mac key codes
        // For now, use keystroke for simple keys
        let modStr = '';
        if (modifiers?.includes('ctrl')) modStr += ' using control down';
        if (modifiers?.includes('alt')) modStr += ' using option down';
        if (modifiers?.includes('shift')) modStr += ' using shift down';
        if (modifiers?.includes('meta')) modStr += ' using command down';
        
        await this.runCommand(`osascript -e 'tell application "System Events" to keystroke "${key}"${modStr}'`);
      } else {
        // xdotool
        let modStr = '';
        if (modifiers?.includes('ctrl')) modStr += 'ctrl+';
        if (modifiers?.includes('alt')) modStr += 'alt+';
        if (modifiers?.includes('shift')) modStr += 'shift+';
        if (modifiers?.includes('meta')) modStr += 'super+';
        
        await this.runCommand(`xdotool key ${modStr}${key}`);
      }

      const desc = `pressKey(${modifiers ? modifiers.join('+') + '+' : ''}${key})`;
      this.logAction(desc, true);
      return { success: true, message: `Pressed ${desc}` };
    } catch (error: any) {
      this.logAction(`pressKey(${key})`, false);
      return { success: false, message: `Failed to press key: ${error.message}` };
    }
  }

  /**
   * Keyboard shortcut (e.g., Ctrl+C, Ctrl+V)
   */
  async hotkey(...keys: string[]): Promise<AutomationResult> {
    this.checkStop();
    
    try {
      const modifiers: ('ctrl' | 'alt' | 'shift' | 'meta')[] = [];
      let mainKey = '';
      
      for (const key of keys) {
        const lowerKey = key.toLowerCase();
        if (['ctrl', 'control'].includes(lowerKey)) modifiers.push('ctrl');
        else if (['alt', 'option'].includes(lowerKey)) modifiers.push('alt');
        else if (['shift'].includes(lowerKey)) modifiers.push('shift');
        else if (['meta', 'cmd', 'command', 'win', 'super'].includes(lowerKey)) modifiers.push('meta');
        else mainKey = key;
      }
      
      return await this.pressKey(mainKey, modifiers);
    } catch (error: any) {
      return { success: false, message: `Failed hotkey: ${error.message}` };
    }
  }

  /**
   * Scroll the mouse wheel
   */
  async scroll(options: ScrollOptions): Promise<AutomationResult> {
    this.checkStop();
    
    const { direction, amount = 3 } = options;
    
    try {
      if (this.isWindows) {
        const scrollAmount = direction === 'up' || direction === 'left' ? 120 * amount : -120 * amount;
        const isHorizontal = direction === 'left' || direction === 'right';
        
        const script = `
          Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class Mouse {
              [DllImport("user32.dll")]
              public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
              public const int MOUSEEVENTF_WHEEL = 0x0800;
              public const int MOUSEEVENTF_HWHEEL = 0x1000;
            }
"@
          [Mouse]::mouse_event(${isHorizontal ? '[Mouse]::MOUSEEVENTF_HWHEEL' : '[Mouse]::MOUSEEVENTF_WHEEL'}, 0, 0, ${scrollAmount}, 0)
        `;
        await this.runPowerShell(script);
      } else if (this.isMac) {
        // AppleScript scroll
        const scrollDir = direction === 'up' ? '-' : direction === 'down' ? '' : '';
        await this.runCommand(`osascript -e 'tell application "System Events" to scroll mouse ${scrollDir}${amount}'`);
      } else {
        // xdotool
        const button = direction === 'up' ? 4 : direction === 'down' ? 5 : direction === 'left' ? 6 : 7;
        await this.runCommand(`xdotool click --repeat ${amount} ${button}`);
      }

      this.logAction(`scroll(${direction}, ${amount})`, true);
      return { success: true, message: `Scrolled ${direction} ${amount} units` };
    } catch (error: any) {
      this.logAction('scroll', false);
      return { success: false, message: `Failed to scroll: ${error.message}` };
    }
  }

  /**
   * Drag from one point to another
   */
  async drag(fromX: number, fromY: number, toX: number, toY: number, duration: number = 500): Promise<AutomationResult> {
    this.checkStop();
    
    try {
      // Move to start position
      await this.moveMouse(fromX, fromY);
      await this.sleep(100);
      
      // Press and hold
      if (this.isWindows) {
        const script = `
          Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class Mouse {
              [DllImport("user32.dll")]
              public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
              public const int MOUSEEVENTF_LEFTDOWN = 0x02;
              public const int MOUSEEVENTF_LEFTUP = 0x04;
            }
"@
          [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        `;
        await this.runPowerShell(script);
      } else if (this.isLinux) {
        await this.runCommand('xdotool mousedown 1');
      }
      
      // Smooth move to destination
      const steps = Math.max(10, Math.floor(duration / 20));
      for (let i = 1; i <= steps; i++) {
        this.checkStop(); // Check for emergency stop during drag
        const x = fromX + (toX - fromX) * (i / steps);
        const y = fromY + (toY - fromY) * (i / steps);
        await this.moveMouse(Math.round(x), Math.round(y));
        await this.sleep(duration / steps);
      }
      
      // Release
      if (this.isWindows) {
        const script = `
          Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class Mouse {
              [DllImport("user32.dll")]
              public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
              public const int MOUSEEVENTF_LEFTUP = 0x04;
            }
"@
          [Mouse]::mouse_event([Mouse]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        `;
        await this.runPowerShell(script);
      } else if (this.isLinux) {
        await this.runCommand('xdotool mouseup 1');
      }

      this.logAction(`drag(${fromX},${fromY} -> ${toX},${toY})`, true);
      return { success: true, message: `Dragged from (${fromX}, ${fromY}) to (${toX}, ${toY})` };
    } catch (error: any) {
      this.logAction('drag', false);
      return { success: false, message: `Failed to drag: ${error.message}` };
    }
  }

  /**
   * Focus a window by title
   */
  async focusWindow(title: string): Promise<AutomationResult> {
    this.checkStop();
    
    try {
      if (this.isWindows) {
        const script = `
          Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class Win32 {
              [DllImport("user32.dll")]
              public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
              [DllImport("user32.dll")]
              public static extern bool SetForegroundWindow(IntPtr hWnd);
              [DllImport("user32.dll")]
              public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
            }
"@
          $hwnd = [Win32]::FindWindow([NullString]::Value, "${title.replace(/"/g, '""')}")
          if ($hwnd -ne [IntPtr]::Zero) {
            [Win32]::ShowWindow($hwnd, 9)  # SW_RESTORE
            [Win32]::SetForegroundWindow($hwnd)
            "OK"
          } else {
            # Try partial match
            Get-Process | Where-Object { $_.MainWindowTitle -like "*${title}*" } | ForEach-Object {
              [Win32]::ShowWindow($_.MainWindowHandle, 9)
              [Win32]::SetForegroundWindow($_.MainWindowHandle)
              "OK"
            }
          }
        `;
        await this.runPowerShell(script);
      } else if (this.isMac) {
        await this.runCommand(`osascript -e 'tell application "${title}" to activate'`);
      } else {
        await this.runCommand(`xdotool search --name "${title}" windowactivate`);
      }

      this.logAction(`focusWindow("${title}")`, true);
      return { success: true, message: `Focused window: ${title}` };
    } catch (error: any) {
      this.logAction(`focusWindow("${title}")`, false);
      return { success: false, message: `Failed to focus window: ${error.message}` };
    }
  }

  /**
   * Wait for specified duration
   */
  async wait(ms: number): Promise<AutomationResult> {
    await this.sleep(ms);
    return { success: true, message: `Waited ${ms}ms` };
  }

  /**
   * Get list of open windows
   */
  async getOpenWindows(): Promise<{ title: string; app?: string; pid?: number }[]> {
    try {
      if (this.isWindows) {
        const script = `
          Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | 
          Select-Object Id, ProcessName, MainWindowTitle | 
          ForEach-Object { "$($_.Id)|$($_.ProcessName)|$($_.MainWindowTitle)" }
        `;
        const result = await this.runPowerShell(script);
        return result.trim().split('\n').filter(Boolean).map(line => {
          const [pid, app, title] = line.split('|');
          return { pid: parseInt(pid), app, title };
        });
      } else if (this.isMac) {
        const result = await this.runCommand(`osascript -e 'tell application "System Events" to get name of every process whose background only is false'`);
        return result.split(', ').map(app => ({ title: app, app }));
      } else {
        const result = await this.runCommand('wmctrl -l 2>/dev/null || xdotool search --name ""');
        return result.trim().split('\n').filter(Boolean).map(line => {
          const parts = line.split(/\s+/);
          return { title: parts.slice(3).join(' ') || parts[0] };
        });
      }
    } catch (error: any) {
      console.error('Failed to get windows:', error.message);
      return [];
    }
  }

  /**
   * Get action log
   */
  getActionLog(): { action: string; timestamp: number; success: boolean }[] {
    return [...this.actionLog];
  }

  /**
   * Clear action log
   */
  clearActionLog(): void {
    this.actionLog = [];
  }

  // Helper methods

  private async runPowerShell(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      exec(`powershell -EncodedCommand ${encoded}`, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }

  private async runCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private logAction(action: string, success: boolean): void {
    this.actionLog.push({ action, timestamp: Date.now(), success });
    if (this.actionLog.length > this.maxLogSize) {
      this.actionLog.shift();
    }
  }
}

// Export singleton
export const automationController = new AutomationController();
