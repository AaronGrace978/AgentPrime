/**
 * Outlook Connector - Direct API integration via PowerShell/COM
 * No UI automation - direct control of Outlook data
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import {
  CalendarEvent,
  CalendarQuery,
  CalendarResult,
  Email,
  EmailQuery,
  EmailResult,
  EmailSummary,
  Contact,
  ContactResult
} from './types';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════════
// POWERSHELL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute PowerShell command and return parsed JSON result
 */
async function runPowerShell<T>(script: string): Promise<T> {
  // Escape for PowerShell
  const escapedScript = script.replace(/"/g, '\\"');
  
  const { stdout, stderr } = await execAsync(
    `powershell -NoProfile -NonInteractive -Command "${escapedScript}"`,
    { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large results
  );
  
  if (stderr && !stdout) {
    throw new Error(stderr);
  }
  
  try {
    return JSON.parse(stdout.trim()) as T;
  } catch {
    // If not JSON, return raw output
    return stdout.trim() as unknown as T;
  }
}

/**
 * Format date for PowerShell
 */
function formatDateForPS(date: Date): string {
  return date.toISOString();
}

/**
 * Parse date from PowerShell output
 */
function parsePSDate(dateStr: string): Date {
  return new Date(dateStr);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDAR OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Add a calendar event to Outlook
 */
export async function addCalendarEvent(event: CalendarEvent): Promise<CalendarResult> {
  const startStr = formatDateForPS(event.start);
  const endStr = formatDateForPS(event.end);
  
  const script = `
    try {
      $outlook = New-Object -ComObject Outlook.Application
      $calendar = $outlook.Session.GetDefaultFolder(9)  # 9 = olFolderCalendar
      $appointment = $outlook.CreateItem(1)  # 1 = olAppointmentItem
      
      $appointment.Subject = '${event.subject.replace(/'/g, "''")}'
      $appointment.Start = [DateTime]::Parse('${startStr}')
      $appointment.End = [DateTime]::Parse('${endStr}')
      ${event.location ? `$appointment.Location = '${event.location.replace(/'/g, "''")}'` : ''}
      ${event.body ? `$appointment.Body = '${event.body.replace(/'/g, "''")}'` : ''}
      ${event.isAllDay ? '$appointment.AllDayEvent = $true' : ''}
      ${event.reminder !== undefined ? `$appointment.ReminderMinutesBeforeStart = ${event.reminder}` : ''}
      ${event.importance ? `$appointment.Importance = ${event.importance === 'high' ? 2 : event.importance === 'low' ? 0 : 1}` : ''}
      
      $appointment.Save()
      
      @{
        success = $true
        event = @{
          id = $appointment.EntryID
          subject = $appointment.Subject
          start = $appointment.Start.ToString('o')
          end = $appointment.End.ToString('o')
          location = $appointment.Location
        }
      } | ConvertTo-Json -Depth 3
    } catch {
      @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json
    }
  `;
  
  try {
    const result = await runPowerShell<CalendarResult>(script);
    console.log('[OutlookConnector] Calendar event added:', event.subject);
    return result;
  } catch (error: any) {
    console.error('[OutlookConnector] Failed to add calendar event:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Read calendar events from Outlook
 */
export async function readCalendarEvents(query: CalendarQuery = {}): Promise<CalendarResult> {
  const startDate = query.startDate || new Date();
  const endDate = query.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default: next 7 days
  const maxResults = query.maxResults || 20;
  
  const script = `
    try {
      $outlook = New-Object -ComObject Outlook.Application
      $calendar = $outlook.Session.GetDefaultFolder(9)  # 9 = olFolderCalendar
      $items = $calendar.Items
      $items.Sort('[Start]')
      $items.IncludeRecurrences = $true
      
      $startDate = [DateTime]::Parse('${formatDateForPS(startDate)}')
      $endDate = [DateTime]::Parse('${formatDateForPS(endDate)}')
      
      $filter = "[Start] >= '$($startDate.ToString('g'))' AND [Start] <= '$($endDate.ToString('g'))'"
      $filteredItems = $items.Restrict($filter)
      
      $events = @()
      $count = 0
      foreach ($item in $filteredItems) {
        if ($count -ge ${maxResults}) { break }
        ${query.subject ? `if ($item.Subject -notlike '*${query.subject.replace(/'/g, "''")}*') { continue }` : ''}
        
        $events += @{
          id = $item.EntryID
          subject = $item.Subject
          start = $item.Start.ToString('o')
          end = $item.End.ToString('o')
          location = $item.Location
          isAllDay = $item.AllDayEvent
        }
        $count++
      }
      
      @{ success = $true; events = $events } | ConvertTo-Json -Depth 3
    } catch {
      @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json
    }
  `;
  
  try {
    const result = await runPowerShell<CalendarResult>(script);
    // Parse dates in events
    if (result.events) {
      result.events = result.events.map(e => ({
        ...e,
        start: parsePSDate(e.start as unknown as string),
        end: parsePSDate(e.end as unknown as string)
      }));
    }
    console.log('[OutlookConnector] Read calendar events:', result.events?.length || 0);
    return result;
  } catch (error: any) {
    console.error('[OutlookConnector] Failed to read calendar:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get today's calendar events
 */
export async function getTodayEvents(): Promise<CalendarResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return readCalendarEvents({ startDate: today, endDate: tomorrow });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Send an email via Outlook
 */
export async function sendEmail(email: Email): Promise<EmailResult> {
  const toList = email.to.map(t => `'${t.replace(/'/g, "''")}'`).join(',');
  const ccList = email.cc?.map(t => `'${t.replace(/'/g, "''")}'`).join(',') || '';
  
  const script = `
    try {
      $outlook = New-Object -ComObject Outlook.Application
      $mail = $outlook.CreateItem(0)  # 0 = olMailItem
      
      # Add recipients
      @(${toList}) | ForEach-Object { $mail.Recipients.Add($_).Type = 1 }  # 1 = olTo
      ${email.cc?.length ? `@(${ccList}) | ForEach-Object { $mail.Recipients.Add($_).Type = 2 }  # 2 = olCC` : ''}
      
      $mail.Subject = '${email.subject.replace(/'/g, "''")}'
      ${email.isHtml ? `$mail.HTMLBody = '${email.body.replace(/'/g, "''")}'` : `$mail.Body = '${email.body.replace(/'/g, "''")}'`}
      ${email.importance ? `$mail.Importance = ${email.importance === 'high' ? 2 : email.importance === 'low' ? 0 : 1}` : ''}
      
      # Add attachments
      ${email.attachments?.map(a => `$mail.Attachments.Add('${a.replace(/'/g, "''")}')`).join('; ') || ''}
      
      $mail.Send()
      
      @{ success = $true } | ConvertTo-Json
    } catch {
      @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json
    }
  `;
  
  try {
    const result = await runPowerShell<EmailResult>(script);
    console.log('[OutlookConnector] Email sent to:', email.to);
    return result;
  } catch (error: any) {
    console.error('[OutlookConnector] Failed to send email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Read emails from Outlook
 */
export async function readEmails(query: EmailQuery = {}): Promise<EmailResult> {
  const folderMap: Record<string, number> = {
    inbox: 6,    // olFolderInbox
    sent: 5,     // olFolderSentMail
    drafts: 16,  // olFolderDrafts
    trash: 3     // olFolderDeletedItems
  };
  
  const folder = query.folder || 'inbox';
  const maxResults = query.maxResults || 10;
  
  const script = `
    try {
      $outlook = New-Object -ComObject Outlook.Application
      $folder = $outlook.Session.GetDefaultFolder(${folderMap[folder]})
      $items = $folder.Items
      $items.Sort('[ReceivedTime]', $true)  # Sort by received time, descending
      
      $emails = @()
      $count = 0
      foreach ($item in $items) {
        if ($count -ge ${maxResults}) { break }
        if ($item.Class -ne 43) { continue }  # 43 = olMail
        
        ${query.unreadOnly ? 'if ($item.UnRead -eq $false) { continue }' : ''}
        ${query.from ? `if ($item.SenderEmailAddress -notlike '*${query.from.replace(/'/g, "''")}*') { continue }` : ''}
        ${query.subject ? `if ($item.Subject -notlike '*${query.subject.replace(/'/g, "''")}*') { continue }` : ''}
        ${query.since ? `if ($item.ReceivedTime -lt [DateTime]::Parse('${formatDateForPS(query.since)}')) { continue }` : ''}
        
        $emails += @{
          id = $item.EntryID
          from = $item.SenderEmailAddress
          to = @($item.To -split ';')
          subject = $item.Subject
          received = $item.ReceivedTime.ToString('o')
          isRead = -not $item.UnRead
          preview = $item.Body.Substring(0, [Math]::Min(200, $item.Body.Length))
        }
        $count++
      }
      
      @{ success = $true; emails = $emails } | ConvertTo-Json -Depth 3
    } catch {
      @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json
    }
  `;
  
  try {
    const result = await runPowerShell<EmailResult>(script);
    console.log('[OutlookConnector] Read emails:', result.emails?.length || 0);
    return result;
  } catch (error: any) {
    console.error('[OutlookConnector] Failed to read emails:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get unread email count
 */
export async function getUnreadCount(): Promise<{ success: boolean; count?: number; error?: string }> {
  const script = `
    try {
      $outlook = New-Object -ComObject Outlook.Application
      $inbox = $outlook.Session.GetDefaultFolder(6)  # olFolderInbox
      $unread = ($inbox.Items | Where-Object { $_.UnRead -eq $true }).Count
      @{ success = $true; count = $unread } | ConvertTo-Json
    } catch {
      @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json
    }
  `;
  
  try {
    return await runPowerShell(script);
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search contacts in Outlook
 */
export async function searchContacts(query: string, maxResults: number = 10): Promise<ContactResult> {
  const script = `
    try {
      $outlook = New-Object -ComObject Outlook.Application
      $contacts = $outlook.Session.GetDefaultFolder(10)  # 10 = olFolderContacts
      $items = $contacts.Items
      
      $results = @()
      $count = 0
      foreach ($item in $items) {
        if ($count -ge ${maxResults}) { break }
        if ($item.Class -ne 40) { continue }  # 40 = olContact
        
        $match = $item.FullName -like '*${query.replace(/'/g, "''")}*' -or 
                 $item.Email1Address -like '*${query.replace(/'/g, "''")}*' -or
                 $item.CompanyName -like '*${query.replace(/'/g, "''")}*'
        
        if ($match) {
          $results += @{
            id = $item.EntryID
            name = $item.FullName
            email = $item.Email1Address
            phone = $item.MobileTelephoneNumber
            company = $item.CompanyName
          }
          $count++
        }
      }
      
      @{ success = $true; contacts = $results } | ConvertTo-Json -Depth 3
    } catch {
      @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json
    }
  `;
  
  try {
    const result = await runPowerShell<ContactResult>(script);
    console.log('[OutlookConnector] Found contacts:', result.contacts?.length || 0);
    return result;
  } catch (error: any) {
    console.error('[OutlookConnector] Failed to search contacts:', error);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OUTLOOK STATUS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if Outlook is available/installed
 */
export async function isOutlookAvailable(): Promise<boolean> {
  const script = `
    try {
      $outlook = New-Object -ComObject Outlook.Application
      'true'
    } catch {
      'false'
    }
  `;
  
  try {
    const result = await runPowerShell<string>(script);
    return result === 'true';
  } catch {
    return false;
  }
}
