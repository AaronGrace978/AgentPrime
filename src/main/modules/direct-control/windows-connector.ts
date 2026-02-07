/**
 * Windows Connector - Native Windows API integrations
 * Toast notifications, system info, quick actions
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { ToastNotification, Reminder } from './types';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Show a Windows toast notification
 */
export async function showToast(notification: ToastNotification): Promise<{ success: boolean; error?: string }> {
  const script = `
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $template = @"
    <toast>
      <visual>
        <binding template="ToastGeneric">
          <text>${notification.title.replace(/"/g, '&quot;')}</text>
          <text>${notification.message.replace(/"/g, '&quot;')}</text>
        </binding>
      </visual>
      <audio src="ms-winsoundevent:Notification.Default"/>
    </toast>
"@

    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    
    $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("AgentPrime")
    $notifier.Show($toast)
    
    'success'
  `;

  try {
    await execAsync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`);
    console.log('[WindowsConnector] Toast shown:', notification.title);
    return { success: true };
  } catch (error: any) {
    // Fallback to simpler notification method
    try {
      const fallbackScript = `
        Add-Type -AssemblyName System.Windows.Forms
        $balloon = New-Object System.Windows.Forms.NotifyIcon
        $balloon.Icon = [System.Drawing.SystemIcons]::Information
        $balloon.BalloonTipTitle = '${notification.title.replace(/'/g, "''")}'
        $balloon.BalloonTipText = '${notification.message.replace(/'/g, "''")}'
        $balloon.Visible = $true
        $balloon.ShowBalloonTip(5000)
        Start-Sleep -Seconds 1
        $balloon.Dispose()
      `;
      await execAsync(`powershell -NoProfile -Command "${fallbackScript.replace(/"/g, '\\"')}"`);
      return { success: true };
    } catch (fallbackError: any) {
      console.error('[WindowsConnector] Failed to show toast:', fallbackError);
      return { success: false, error: fallbackError.message };
    }
  }
}

/**
 * Show a quick reminder notification
 */
export async function showReminder(title: string, message: string): Promise<{ success: boolean; error?: string }> {
  return showToast({ title, message });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULED REMINDERS
// ═══════════════════════════════════════════════════════════════════════════════

// In-memory reminder storage (for session-based reminders)
const activeReminders: Map<string, NodeJS.Timeout> = new Map();

/**
 * Create a timed reminder
 */
export function createReminder(reminder: Reminder): { success: boolean; id: string } {
  const id = `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();
  const reminderTime = reminder.time.getTime();
  const delay = reminderTime - now;
  
  if (delay <= 0) {
    // Reminder time already passed, show immediately
    showToast({ title: reminder.title, message: reminder.message });
    return { success: true, id };
  }
  
  const timeout = setTimeout(async () => {
    await showToast({ title: reminder.title, message: reminder.message });
    activeReminders.delete(id);
    
    // Handle recurring reminders
    if (reminder.recurring) {
      const nextTime = new Date(reminder.time);
      switch (reminder.recurring) {
        case 'daily':
          nextTime.setDate(nextTime.getDate() + 1);
          break;
        case 'weekly':
          nextTime.setDate(nextTime.getDate() + 7);
          break;
        case 'monthly':
          nextTime.setMonth(nextTime.getMonth() + 1);
          break;
      }
      createReminder({ ...reminder, time: nextTime });
    }
  }, delay);
  
  activeReminders.set(id, timeout);
  console.log('[WindowsConnector] Reminder created:', id, 'in', Math.round(delay / 1000), 'seconds');
  
  return { success: true, id };
}

/**
 * Cancel a reminder
 */
export function cancelReminder(id: string): { success: boolean } {
  const timeout = activeReminders.get(id);
  if (timeout) {
    clearTimeout(timeout);
    activeReminders.delete(id);
    console.log('[WindowsConnector] Reminder cancelled:', id);
    return { success: true };
  }
  return { success: false };
}

/**
 * List active reminders
 */
export function listReminders(): string[] {
  return Array.from(activeReminders.keys());
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM QUICK ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get current date/time info
 */
export function getDateTime(): {
  date: string;
  time: string;
  dayOfWeek: string;
  timezone: string;
  timestamp: number;
} {
  const now = new Date();
  return {
    date: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: now.getTime()
  };
}

/**
 * Get system uptime
 */
export async function getSystemUptime(): Promise<{ success: boolean; uptime?: string; error?: string }> {
  const script = `
    $uptime = (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
    "$($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)m"
  `;
  
  try {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${script}"`);
    return { success: true, uptime: stdout.trim() };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get battery status (for laptops)
 */
export async function getBatteryStatus(): Promise<{
  success: boolean;
  percentage?: number;
  isCharging?: boolean;
  error?: string;
}> {
  const script = `
    $battery = Get-CimInstance Win32_Battery
    if ($battery) {
      @{
        percentage = $battery.EstimatedChargeRemaining
        isCharging = $battery.BatteryStatus -eq 2
      } | ConvertTo-Json
    } else {
      @{ error = 'No battery found' } | ConvertTo-Json
    }
  `;
  
  try {
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${script}"`);
    const result = JSON.parse(stdout.trim());
    if (result.error) {
      return { success: false, error: result.error };
    }
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Lock the workstation
 */
export async function lockWorkstation(): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync('rundll32.exe user32.dll,LockWorkStation');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Set system volume
 */
export async function setVolume(level: number): Promise<{ success: boolean; error?: string }> {
  const volume = Math.max(0, Math.min(100, level));
  const script = `
    $volume = ${volume}
    $wshShell = New-Object -ComObject WScript.Shell
    # Mute first, then set volume
    1..50 | ForEach-Object { $wshShell.SendKeys([char]174) }  # Volume down
    1..($volume / 2) | ForEach-Object { $wshShell.SendKeys([char]175) }  # Volume up
  `;
  
  try {
    await execAsync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Toggle mute
 */
export async function toggleMute(): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync('powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
