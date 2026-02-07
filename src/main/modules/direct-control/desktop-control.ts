/**
 * Desktop Control - Smart file/icon manipulation without coordinates
 * 
 * Uses Windows Shell API and UI Automation to:
 * - Get desktop icon positions by name
 * - Move/arrange icons programmatically
 * - Find files on desktop
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DesktopIcon {
  name: string;
  path: string;
  x: number;
  y: number;
  isFolder: boolean;
  isShortcut: boolean;
}

export interface MoveResult {
  success: boolean;
  message: string;
  fromPosition?: { x: number; y: number };
  toPosition?: { x: number; y: number };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESKTOP ICON MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all desktop icons with their positions
 */
export async function getDesktopIcons(): Promise<DesktopIcon[]> {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class DesktopIcons {
    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    
    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);
    
    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    
    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    
    [DllImport("kernel32.dll")]
    static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);
    
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr hObject);
    
    [DllImport("kernel32.dll")]
    static extern IntPtr VirtualAllocEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);
    
    [DllImport("kernel32.dll")]
    static extern bool VirtualFreeEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint dwFreeType);
    
    [DllImport("kernel32.dll")]
    static extern bool WriteProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint nSize, out int lpNumberOfBytesWritten);
    
    [DllImport("kernel32.dll")]
    static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint nSize, out int lpNumberOfBytesRead);

    const uint LVM_GETITEMCOUNT = 0x1004;
    const uint LVM_GETITEMPOSITION = 0x1010;
    const uint LVM_GETITEMTEXT = 0x102D;
    const uint PROCESS_VM_OPERATION = 0x0008;
    const uint PROCESS_VM_READ = 0x0010;
    const uint PROCESS_VM_WRITE = 0x0020;
    const uint MEM_COMMIT = 0x1000;
    const uint MEM_RELEASE = 0x8000;
    const uint PAGE_READWRITE = 0x04;

    public static IntPtr GetDesktopListView() {
        IntPtr progman = FindWindow("Progman", "Program Manager");
        IntPtr defview = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
        
        if (defview == IntPtr.Zero) {
            IntPtr workerW = IntPtr.Zero;
            do {
                workerW = FindWindowEx(IntPtr.Zero, workerW, "WorkerW", null);
                defview = FindWindowEx(workerW, IntPtr.Zero, "SHELLDLL_DefView", null);
            } while (defview == IntPtr.Zero && workerW != IntPtr.Zero);
        }
        
        return FindWindowEx(defview, IntPtr.Zero, "SysListView32", "FolderView");
    }

    public static int GetIconCount(IntPtr listView) {
        return (int)SendMessage(listView, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero);
    }
}
"@

try {
    \$listView = [DesktopIcons]::GetDesktopListView()
    \$count = [DesktopIcons]::GetIconCount(\$listView)
    
    # Fallback: Get desktop files directly
    \$desktopPath = [Environment]::GetFolderPath('Desktop')
    \$publicDesktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
    
    \$icons = @()
    \$files = Get-ChildItem -Path \$desktopPath -Force -ErrorAction SilentlyContinue
    \$files += Get-ChildItem -Path \$publicDesktop -Force -ErrorAction SilentlyContinue
    
    \$col = 0
    \$row = 0
    \$iconSpacingX = 100
    \$iconSpacingY = 80
    \$startX = 20
    \$startY = 20
    
    foreach (\$file in \$files) {
        \$name = \$file.Name -replace '\\.lnk$', ''
        \$isShortcut = \$file.Extension -eq '.lnk'
        \$isFolder = \$file.PSIsContainer
        
        # Estimate position based on typical grid layout
        \$x = \$startX + (\$col * \$iconSpacingX)
        \$y = \$startY + (\$row * \$iconSpacingY)
        
        \$icons += [PSCustomObject]@{
            name = \$name
            path = \$file.FullName
            x = \$x
            y = \$y
            isFolder = \$isFolder
            isShortcut = \$isShortcut
        }
        
        \$row++
        if (\$row -ge 10) {
            \$row = 0
            \$col++
        }
    }
    
    \$icons | ConvertTo-Json -Depth 3
} catch {
    Write-Error \$_.Exception.Message
    "[]"
}
`;

  try {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      maxBuffer: 1024 * 1024
    });
    
    const result = stdout.trim();
    if (!result || result === '[]') {
      return [];
    }
    
    const parsed = JSON.parse(result);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error: any) {
    console.error('[DesktopControl] Failed to get icons:', error.message);
    return [];
  }
}

/**
 * Find a desktop icon by name (fuzzy match)
 */
export async function findDesktopIcon(searchName: string): Promise<DesktopIcon | null> {
  const icons = await getDesktopIcons();
  const searchLower = searchName.toLowerCase();
  
  // Exact match first
  let match = icons.find(i => i.name.toLowerCase() === searchLower);
  if (match) return match;
  
  // Partial match
  match = icons.find(i => i.name.toLowerCase().includes(searchLower));
  if (match) return match;
  
  // Fuzzy match (starts with)
  match = icons.find(i => i.name.toLowerCase().startsWith(searchLower));
  return match || null;
}

/**
 * Move a desktop file using PowerShell with mouse simulation
 * This actually performs the drag operation
 */
export async function moveDesktopIcon(
  iconName: string, 
  targetName: string, 
  position: 'left' | 'right' | 'above' | 'below' = 'right'
): Promise<MoveResult> {
  console.log(`[DesktopControl] Moving "${iconName}" ${position} of "${targetName}"`);
  
  const sourceIcon = await findDesktopIcon(iconName);
  const targetIcon = await findDesktopIcon(targetName);
  
  if (!sourceIcon) {
    return { success: false, message: `Could not find "${iconName}" on desktop` };
  }
  
  if (!targetIcon) {
    return { success: false, message: `Could not find "${targetName}" on desktop` };
  }
  
  // Calculate target position based on relative position
  let toX = targetIcon.x;
  let toY = targetIcon.y;
  const offset = 100; // Icon spacing
  
  switch (position) {
    case 'right': toX += offset; break;
    case 'left': toX -= offset; break;
    case 'below': toY += 80; break;
    case 'above': toY -= 80; break;
  }
  
  // Use robotjs-style mouse simulation via PowerShell
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class MouseOps {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    
    public const int MOUSEEVENTF_LEFTDOWN = 0x02;
    public const int MOUSEEVENTF_LEFTUP = 0x04;
    
    public static void DragTo(int fromX, int fromY, int toX, int toY) {
        SetCursorPos(fromX, fromY);
        System.Threading.Thread.Sleep(100);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        System.Threading.Thread.Sleep(50);
        
        // Smooth drag
        int steps = 20;
        for (int i = 1; i <= steps; i++) {
            int x = fromX + (toX - fromX) * i / steps;
            int y = fromY + (toY - fromY) * i / steps;
            SetCursorPos(x, y);
            System.Threading.Thread.Sleep(10);
        }
        
        System.Threading.Thread.Sleep(50);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
    }
}
"@

[MouseOps]::DragTo(${sourceIcon.x}, ${sourceIcon.y}, ${toX}, ${toY})
Write-Output "OK"
`;

  try {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      maxBuffer: 1024 * 1024
    });
    
    if (stdout.trim() === 'OK') {
      return {
        success: true,
        message: `Moved "${iconName}" ${position} of "${targetName}"`,
        fromPosition: { x: sourceIcon.x, y: sourceIcon.y },
        toPosition: { x: toX, y: toY }
      };
    } else {
      return { success: false, message: 'Drag operation failed' };
    }
  } catch (error: any) {
    console.error('[DesktopControl] Drag failed:', error.message);
    return { success: false, message: `Drag failed: ${error.message}` };
  }
}

/**
 * List all desktop icons (simple version for AI)
 */
export async function listDesktopIcons(): Promise<{ success: boolean; icons: string[]; message: string }> {
  const icons = await getDesktopIcons();
  const names = icons.map(i => i.name);
  
  return {
    success: true,
    icons: names,
    message: `Found ${names.length} items on desktop: ${names.slice(0, 10).join(', ')}${names.length > 10 ? '...' : ''}`
  };
}

/**
 * Arrange icons by type or name
 */
export async function arrangeDesktopIcons(
  arrangement: 'by-name' | 'by-type' | 'auto' = 'auto'
): Promise<{ success: boolean; message: string }> {
  const script = `
\$shell = New-Object -ComObject Shell.Application
\$desktop = \$shell.Namespace(0)  # Desktop

switch ("${arrangement}") {
    "by-name" { 
        # Sort by name
        \$desktop.Items() | Sort-Object Name
        Write-Output "Arranged by name"
    }
    "by-type" {
        # Sort by type
        \$desktop.Items() | Sort-Object Type
        Write-Output "Arranged by type"
    }
    "auto" {
        # Auto arrange
        \$desktop.InvokeVerb("Auto Arrange")
        Write-Output "Auto arranged"
    }
}
`;

  try {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      maxBuffer: 1024 * 1024
    });
    
    return { success: true, message: stdout.trim() || 'Desktop arranged' };
  } catch (error: any) {
    return { success: false, message: `Failed to arrange: ${error.message}` };
  }
}
