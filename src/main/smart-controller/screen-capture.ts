/**
 * Smart Controller - Screen Capture System
 * Captures and analyzes screen content for AI vision
 */

import { exec, execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { platform } from 'os';

export interface ScreenRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenCapture {
  base64: string;
  width: number;
  height: number;
  timestamp: number;
  region?: ScreenRegion;
  format: 'png' | 'jpeg';
}

export interface UIElement {
  type: 'button' | 'input' | 'text' | 'image' | 'link' | 'checkbox' | 'dropdown' | 'unknown';
  text?: string;
  bounds: ScreenRegion;
  confidence: number;
  clickable: boolean;
}

export interface ScreenAnalysis {
  elements: UIElement[];
  activeWindow?: {
    title: string;
    app: string;
    bounds: ScreenRegion;
  };
  rawDescription?: string;
}

/**
 * Screen Capture Service
 * Cross-platform screen capture with AI analysis ready output
 */
export class ScreenCaptureService {
  private isWindows = platform() === 'win32';
  private isMac = platform() === 'darwin';
  private isLinux = platform() === 'linux';
  private tempDir: string;
  private captureHistory: ScreenCapture[] = [];
  private maxHistory = 10;

  constructor() {
    this.tempDir = join(tmpdir(), 'agentprime-screen');
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Capture the entire screen
   */
  async captureScreen(quality: 'high' | 'medium' | 'low' = 'medium'): Promise<ScreenCapture> {
    const timestamp = Date.now();
    const filename = `screen_${timestamp}.png`;
    const filepath = join(this.tempDir, filename);

    try {
      await this.captureToFile(filepath);
      
      const imageBuffer = readFileSync(filepath);
      const base64 = imageBuffer.toString('base64');
      
      // Get dimensions (approximation - real dimensions come from the capture)
      const { width, height } = await this.getScreenDimensions();
      
      // Compress based on quality
      const processedBase64 = await this.processImage(base64, quality);
      
      const capture: ScreenCapture = {
        base64: processedBase64,
        width,
        height,
        timestamp,
        format: 'png'
      };
      
      // Add to history
      this.addToHistory(capture);
      
      // Cleanup temp file
      try { unlinkSync(filepath); } catch {}
      
      return capture;
      
    } catch (error: any) {
      throw new Error(`Screen capture failed: ${error.message}`);
    }
  }

  /**
   * Capture a specific region of the screen
   */
  async captureRegion(region: ScreenRegion, quality: 'high' | 'medium' | 'low' = 'medium'): Promise<ScreenCapture> {
    const timestamp = Date.now();
    const filename = `region_${timestamp}.png`;
    const filepath = join(this.tempDir, filename);

    try {
      await this.captureRegionToFile(filepath, region);
      
      const imageBuffer = readFileSync(filepath);
      const base64 = imageBuffer.toString('base64');
      const processedBase64 = await this.processImage(base64, quality);
      
      const capture: ScreenCapture = {
        base64: processedBase64,
        width: region.width,
        height: region.height,
        timestamp,
        region,
        format: 'png'
      };
      
      this.addToHistory(capture);
      
      try { unlinkSync(filepath); } catch {}
      
      return capture;
      
    } catch (error: any) {
      throw new Error(`Region capture failed: ${error.message}`);
    }
  }

  /**
   * Capture the active window only
   */
  async captureActiveWindow(quality: 'high' | 'medium' | 'low' = 'medium'): Promise<ScreenCapture> {
    const timestamp = Date.now();
    const filename = `window_${timestamp}.png`;
    const filepath = join(this.tempDir, filename);

    try {
      await this.captureActiveWindowToFile(filepath);
      
      const imageBuffer = readFileSync(filepath);
      const base64 = imageBuffer.toString('base64');
      const processedBase64 = await this.processImage(base64, quality);
      
      // Get window bounds
      const bounds = await this.getActiveWindowBounds();
      
      const capture: ScreenCapture = {
        base64: processedBase64,
        width: bounds.width,
        height: bounds.height,
        timestamp,
        region: bounds,
        format: 'png'
      };
      
      this.addToHistory(capture);
      
      try { unlinkSync(filepath); } catch {}
      
      return capture;
      
    } catch (error: any) {
      // Fall back to full screen if window capture fails
      console.warn('Active window capture failed, falling back to full screen');
      return this.captureScreen(quality);
    }
  }

  /**
   * Get the active window title and bounds
   */
  async getActiveWindowInfo(): Promise<{ title: string; app: string; bounds: ScreenRegion } | null> {
    try {
      if (this.isWindows) {
        // PowerShell to get active window info - use EncodedCommand to avoid escaping issues
        const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError=true)]
  public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
"@
$hwnd = [Win32]::GetForegroundWindow()
$title = New-Object System.Text.StringBuilder 256
[Win32]::GetWindowText($hwnd, $title, 256) | Out-Null
$rect = New-Object RECT
[Win32]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
Write-Output "$($title.ToString())|$($rect.Left)|$($rect.Top)|$($rect.Right - $rect.Left)|$($rect.Bottom - $rect.Top)"
`;
        
        // Encode script as Base64 UTF-16LE for PowerShell -EncodedCommand
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        const result = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
          encoding: 'utf-8',
          timeout: 5000,
          shell: true
        }).trim();
        
        const [title, x, y, width, height] = result.split('|');
        
        return {
          title: title || 'Unknown',
          app: this.extractAppName(title || ''),
          bounds: {
            x: parseInt(x) || 0,
            y: parseInt(y) || 0,
            width: parseInt(width) || 800,
            height: parseInt(height) || 600
          }
        };
      } else if (this.isMac) {
        // AppleScript for Mac
        const script = `
          tell application "System Events"
            set frontApp to first application process whose frontmost is true
            set appName to name of frontApp
            set winTitle to ""
            try
              set winTitle to name of first window of frontApp
            end try
          end tell
          return appName & "|" & winTitle
        `;
        
        const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
          encoding: 'utf-8',
          timeout: 5000
        }).trim();
        
        const [app, title] = result.split('|');
        
        return {
          title: title || app || 'Unknown',
          app: app || 'Unknown',
          bounds: await this.getActiveWindowBounds()
        };
      }
      
      return null;
    } catch (error: any) {
      console.error('Failed to get window info:', error.message);
      return null;
    }
  }

  /**
   * Get screen dimensions
   */
  private async getScreenDimensions(): Promise<{ width: number; height: number }> {
    try {
      if (this.isWindows) {
        const script = `
Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Output "$($screen.Width)|$($screen.Height)"
`;
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        const result = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
          encoding: 'utf-8',
          timeout: 5000,
          shell: true
        }).trim();
        
        const [width, height] = result.split('|').map(Number);
        return { width: width || 1920, height: height || 1080 };
      } else if (this.isMac) {
        const result = execSync('system_profiler SPDisplaysDataType | grep Resolution', {
          encoding: 'utf-8',
          timeout: 5000
        });
        const match = result.match(/(\d+)\s*x\s*(\d+)/);
        if (match) {
          return { width: parseInt(match[1]), height: parseInt(match[2]) };
        }
      }
      
      // Default fallback
      return { width: 1920, height: 1080 };
    } catch {
      return { width: 1920, height: 1080 };
    }
  }

  /**
   * Capture screen to file (platform specific)
   */
  private async captureToFile(filepath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let command: string;
      
      if (this.isWindows) {
        // Use PowerShell with .NET for Windows - fixed assembly loading
        // Use explicit coordinates instead of Point::Empty to avoid type loading issues
        const escapedPath = filepath.replace(/\\/g, '\\\\').replace(/'/g, "''");
        const psScript = `
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing')
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$point = New-Object System.Drawing.Point(0, 0)
$graphics.CopyFromScreen($screen.X, $screen.Y, 0, 0, $screen.Size)
$bitmap.Save('${escapedPath}')
$graphics.Dispose()
$bitmap.Dispose()
`;
        // Write script to temp file to avoid escaping issues
        const scriptPath = join(this.tempDir, `capture_${Date.now()}.ps1`);
        writeFileSync(scriptPath, psScript, 'utf-8');
        command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;
        
        exec(command, { timeout: 15000 }, (error) => {
          // Cleanup script file
          try { unlinkSync(scriptPath); } catch {}
          
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
        return;
      } else if (this.isMac) {
        command = `screencapture -x "${filepath}"`;
      } else {
        // Linux - try multiple methods
        command = `import -window root "${filepath}" 2>/dev/null || gnome-screenshot -f "${filepath}" 2>/dev/null || scrot "${filepath}"`;
      }
      
      exec(command, { timeout: 10000 }, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Capture region to file
   */
  private async captureRegionToFile(filepath: string, region: ScreenRegion): Promise<void> {
    return new Promise((resolve, reject) => {
      let command: string;
      
      if (this.isWindows) {
        const escapedPath = filepath.replace(/\\/g, '\\\\').replace(/'/g, "''");
        const psScript = `
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing')
$size = New-Object System.Drawing.Size(${region.width}, ${region.height})
$bitmap = New-Object System.Drawing.Bitmap(${region.width}, ${region.height})
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen(${region.x}, ${region.y}, 0, 0, $size)
$bitmap.Save('${escapedPath}')
$graphics.Dispose()
$bitmap.Dispose()
`;
        const scriptPath = join(this.tempDir, `capture_region_${Date.now()}.ps1`);
        writeFileSync(scriptPath, psScript, 'utf-8');
        command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;
        
        exec(command, { timeout: 15000 }, (error) => {
          try { unlinkSync(scriptPath); } catch {}
          if (error) reject(error);
          else resolve();
        });
        return;
      } else if (this.isMac) {
        command = `screencapture -x -R${region.x},${region.y},${region.width},${region.height} "${filepath}"`;
      } else {
        command = `import -window root -crop ${region.width}x${region.height}+${region.x}+${region.y} "${filepath}"`;
      }
      
      exec(command, { timeout: 10000 }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /**
   * Capture active window to file
   */
  private async captureActiveWindowToFile(filepath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let command: string;
      
      if (this.isWindows) {
        // Capture active window on Windows - use PowerShell script file for reliability
        const escapedPath = filepath.replace(/\\/g, '\\\\').replace(/'/g, "''");
        const psScript = `
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public class WindowCapture {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { 
        public int Left, Top, Right, Bottom; 
    }
    
    public static void CaptureActiveWindow(string savePath) {
        IntPtr hwnd = GetForegroundWindow();
        RECT rect;
        GetWindowRect(hwnd, out rect);
        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        
        if (width <= 0 || height <= 0) {
            width = 800;
            height = 600;
        }
        
        using (Bitmap bmp = new Bitmap(width, height)) {
            using (Graphics g = Graphics.FromImage(bmp)) {
                g.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height));
            }
            bmp.Save(savePath);
        }
    }
}
'@ -ReferencedAssemblies System.Drawing

[WindowCapture]::CaptureActiveWindow('${escapedPath}')
`;
        const scriptPath = join(this.tempDir, `capture_window_${Date.now()}.ps1`);
        writeFileSync(scriptPath, psScript, 'utf-8');
        command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;
        
        exec(command, { timeout: 15000 }, (error) => {
          try { unlinkSync(scriptPath); } catch {}
          if (error) reject(error);
          else resolve();
        });
        return;
      } else if (this.isMac) {
        command = `screencapture -x -w "${filepath}"`;
      } else {
        command = `import -window $(xdotool getactivewindow) "${filepath}"`;
      }
      
      exec(command, { timeout: 10000 }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /**
   * Get active window bounds
   */
  private async getActiveWindowBounds(): Promise<ScreenRegion> {
    const info = await this.getActiveWindowInfo();
    if (info) {
      return info.bounds;
    }
    // Fallback to screen dimensions
    const { width, height } = await this.getScreenDimensions();
    return { x: 0, y: 0, width, height };
  }

  /**
   * Process image for quality/compression
   * Uses Sharp if available, otherwise falls back to canvas-based resize
   */
  private async processImage(base64: string, quality: 'high' | 'medium' | 'low'): Promise<string> {
    // Quality presets: scale factor and JPEG quality
    const presets = {
      high: { scale: 1.0, jpegQuality: 90 },
      medium: { scale: 0.6, jpegQuality: 70 },
      low: { scale: 0.4, jpegQuality: 50 }
    };

    const preset = presets[quality];

    // Skip processing for high quality (no resize needed)
    if (quality === 'high') {
      return base64;
    }

    try {
      // Try Sharp for fast, high-quality compression
      const sharp = require('sharp');
      const inputBuffer = Buffer.from(base64, 'base64');
      const metadata = await sharp(inputBuffer).metadata();
      
      const newWidth = Math.round((metadata.width || 1920) * preset.scale);
      
      const outputBuffer = await sharp(inputBuffer)
        .resize(newWidth, null, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: preset.jpegQuality, mozjpeg: true })
        .toBuffer();
      
      return outputBuffer.toString('base64');
    } catch (sharpError) {
      // Sharp not available - return as-is but log once
      if (!this._sharpWarned) {
        console.log('[ScreenCapture] Sharp not available for compression. Install with: npm install sharp');
        this._sharpWarned = true;
      }
      return base64;
    }
  }

  private _sharpWarned = false;

  /**
   * Add capture to history
   */
  private addToHistory(capture: ScreenCapture): void {
    this.captureHistory.push(capture);
    if (this.captureHistory.length > this.maxHistory) {
      this.captureHistory.shift();
    }
  }

  /**
   * Get capture history
   */
  getHistory(): ScreenCapture[] {
    return [...this.captureHistory];
  }

  /**
   * Clear capture history
   */
  clearHistory(): void {
    this.captureHistory = [];
  }

  /**
   * Extract app name from window title
   */
  private extractAppName(title: string): string {
    // Common patterns in window titles
    const patterns = [
      /^(.+?)\s*[-–—]\s*.+$/,  // "App - Document"
      /^(.+?)\s*\|.+$/,        // "App | Page"
    ];
    
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return title.split(' ')[0] || 'Unknown';
  }

  /**
   * Prepare image for AI vision (Claude/GPT-4V format)
   */
  prepareForVision(capture: ScreenCapture): { type: 'image'; source: { type: 'base64'; media_type: string; data: string } } {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: capture.format === 'jpeg' ? 'image/jpeg' : 'image/png',
        data: capture.base64
      }
    };
  }
}

// Export singleton
export const screenCapture = new ScreenCaptureService();
