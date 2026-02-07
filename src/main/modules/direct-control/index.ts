/**
 * DirectControl Module
 * Native API integrations for instant PC control
 * 
 * Provides direct access to:
 * - Outlook (Calendar, Email, Contacts)
 * - Windows (Notifications, System actions)
 * 
 * No UI automation - these are direct API calls for speed
 */

import * as outlook from './outlook-connector';
import * as windows from './windows-connector';
import * as desktop from './desktop-control';
import { DirectControlResult, CalendarEvent, Email, CalendarQuery, EmailQuery, Reminder } from './types';

// Re-export types
export * from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED CONTROL INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DirectControl - Unified interface for native API control
 */
export const DirectControl = {
  // ─────────────────────────────────────────────────────────────────────────────
  // CALENDAR
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Add a calendar event
   */
  async addCalendarEvent(event: CalendarEvent): Promise<DirectControlResult> {
    const start = performance.now();
    const result = await outlook.addCalendarEvent(event);
    return {
      success: result.success,
      action: 'calendar_add_event',
      data: result.event,
      error: result.error,
      executionTime: performance.now() - start
    };
  },
  
  /**
   * Read calendar events
   */
  async readCalendar(query?: CalendarQuery): Promise<DirectControlResult> {
    const start = performance.now();
    const result = await outlook.readCalendarEvents(query);
    return {
      success: result.success,
      action: 'calendar_read',
      data: result.events,
      error: result.error,
      executionTime: performance.now() - start
    };
  },
  
  /**
   * Get today's events
   */
  async getTodayEvents(): Promise<DirectControlResult> {
    const start = performance.now();
    const result = await outlook.getTodayEvents();
    return {
      success: result.success,
      action: 'calendar_today',
      data: result.events,
      error: result.error,
      executionTime: performance.now() - start
    };
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // EMAIL
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Send an email
   */
  async sendEmail(email: Email): Promise<DirectControlResult> {
    const start = performance.now();
    const result = await outlook.sendEmail(email);
    return {
      success: result.success,
      action: 'email_send',
      error: result.error,
      executionTime: performance.now() - start
    };
  },
  
  /**
   * Read emails
   */
  async readEmails(query?: EmailQuery): Promise<DirectControlResult> {
    const start = performance.now();
    const result = await outlook.readEmails(query);
    return {
      success: result.success,
      action: 'email_read',
      data: result.emails,
      error: result.error,
      executionTime: performance.now() - start
    };
  },
  
  /**
   * Get unread email count
   */
  async getUnreadCount(): Promise<DirectControlResult> {
    const start = performance.now();
    const result = await outlook.getUnreadCount();
    return {
      success: result.success,
      action: 'email_unread_count',
      data: { count: result.count },
      error: result.error,
      executionTime: performance.now() - start
    };
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // CONTACTS
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Search contacts
   */
  async searchContacts(query: string): Promise<DirectControlResult> {
    const start = performance.now();
    const result = await outlook.searchContacts(query);
    return {
      success: result.success,
      action: 'contacts_search',
      data: result.contacts,
      error: result.error,
      executionTime: performance.now() - start
    };
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // NOTIFICATIONS & REMINDERS
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Show a toast notification
   */
  async showNotification(title: string, message: string): Promise<DirectControlResult> {
    const start = performance.now();
    const result = await windows.showToast({ title, message });
    return {
      success: result.success,
      action: 'notification_show',
      error: result.error,
      executionTime: performance.now() - start
    };
  },
  
  /**
   * Create a reminder
   */
  createReminder(title: string, message: string, time: Date, recurring?: 'daily' | 'weekly' | 'monthly'): DirectControlResult {
    const start = performance.now();
    const result = windows.createReminder({ title, message, time, recurring });
    return {
      success: result.success,
      action: 'reminder_create',
      data: { id: result.id },
      executionTime: performance.now() - start
    };
  },
  
  /**
   * Cancel a reminder
   */
  cancelReminder(id: string): DirectControlResult {
    const result = windows.cancelReminder(id);
    return {
      success: result.success,
      action: 'reminder_cancel'
    };
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // SYSTEM QUICK ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get current date/time
   */
  getDateTime(): DirectControlResult {
    const data = windows.getDateTime();
    return {
      success: true,
      action: 'datetime_get',
      data
    };
  },
  
  /**
   * Get system uptime
   */
  async getUptime(): Promise<DirectControlResult> {
    const result = await windows.getSystemUptime();
    return {
      success: result.success,
      action: 'uptime_get',
      data: { uptime: result.uptime },
      error: result.error
    };
  },
  
  /**
   * Get battery status
   */
  async getBattery(): Promise<DirectControlResult> {
    const result = await windows.getBatteryStatus();
    return {
      success: result.success,
      action: 'battery_get',
      data: { percentage: result.percentage, isCharging: result.isCharging },
      error: result.error
    };
  },
  
  /**
   * Lock the workstation
   */
  async lock(): Promise<DirectControlResult> {
    const result = await windows.lockWorkstation();
    return {
      success: result.success,
      action: 'system_lock',
      error: result.error
    };
  },
  
  /**
   * Set system volume
   */
  async setVolume(level: number): Promise<DirectControlResult> {
    const result = await windows.setVolume(level);
    return {
      success: result.success,
      action: 'volume_set',
      data: { level },
      error: result.error
    };
  },
  
  /**
   * Toggle mute
   */
  async toggleMute(): Promise<DirectControlResult> {
    const result = await windows.toggleMute();
    return {
      success: result.success,
      action: 'mute_toggle',
      error: result.error
    };
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // STATUS
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Check if Outlook is available
   */
  async isOutlookAvailable(): Promise<boolean> {
    return outlook.isOutlookAvailable();
  },
  
  // ─────────────────────────────────────────────────────────────────────────────
  // DESKTOP CONTROL (Smart file/icon manipulation)
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * List all desktop icons
   */
  async listDesktopIcons(): Promise<DirectControlResult> {
    const start = performance.now();
    const result = await desktop.listDesktopIcons();
    return {
      success: result.success,
      action: 'desktop_list',
      data: { icons: result.icons },
      message: result.message,
      executionTime: performance.now() - start
    };
  },
  
  /**
   * Move a desktop icon relative to another
   * @param iconName - Name of icon to move
   * @param targetName - Name of reference icon  
   * @param position - Where to place: 'left' | 'right' | 'above' | 'below'
   */
  async moveDesktopIcon(
    iconName: string, 
    targetName: string, 
    position: 'left' | 'right' | 'above' | 'below' = 'right'
  ): Promise<DirectControlResult> {
    const start = performance.now();
    const result = await desktop.moveDesktopIcon(iconName, targetName, position);
    return {
      success: result.success,
      action: 'desktop_move',
      data: { from: result.fromPosition, to: result.toPosition },
      message: result.message,
      error: result.success ? undefined : result.message,
      executionTime: performance.now() - start
    };
  },
  
  /**
   * Find a desktop icon by name
   */
  async findDesktopIcon(name: string): Promise<DirectControlResult> {
    const start = performance.now();
    const icon = await desktop.findDesktopIcon(name);
    return {
      success: icon !== null,
      action: 'desktop_find',
      data: icon,
      message: icon ? `Found "${icon.name}" at (${icon.x}, ${icon.y})` : `"${name}" not found on desktop`,
      executionTime: performance.now() - start
    };
  },
  
  /**
   * Arrange desktop icons
   */
  async arrangeDesktop(arrangement: 'by-name' | 'by-type' | 'auto' = 'auto'): Promise<DirectControlResult> {
    const start = performance.now();
    const result = await desktop.arrangeDesktopIcons(arrangement);
    return {
      success: result.success,
      action: 'desktop_arrange',
      message: result.message,
      executionTime: performance.now() - start
    };
  }
};

export default DirectControl;
