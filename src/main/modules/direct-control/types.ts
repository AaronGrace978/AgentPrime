/**
 * DirectControl Module Types
 * Native API integrations for instant PC control
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDAR TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CalendarEvent {
  id?: string;
  subject: string;
  start: Date;
  end: Date;
  location?: string;
  body?: string;
  isAllDay?: boolean;
  reminder?: number; // minutes before
  categories?: string[];
  importance?: 'low' | 'normal' | 'high';
}

export interface CalendarQuery {
  startDate?: Date;
  endDate?: Date;
  subject?: string;
  maxResults?: number;
}

export interface CalendarResult {
  success: boolean;
  event?: CalendarEvent;
  events?: CalendarEvent[];
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Email {
  id?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  attachments?: string[]; // file paths
  importance?: 'low' | 'normal' | 'high';
}

export interface EmailQuery {
  folder?: 'inbox' | 'sent' | 'drafts' | 'trash';
  unreadOnly?: boolean;
  from?: string;
  subject?: string;
  maxResults?: number;
  since?: Date;
}

export interface EmailSummary {
  id: string;
  from: string;
  to: string[];
  subject: string;
  received: Date;
  isRead: boolean;
  preview: string;
}

export interface EmailResult {
  success: boolean;
  email?: EmailSummary;
  emails?: EmailSummary[];
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Contact {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
}

export interface ContactResult {
  success: boolean;
  contact?: Contact;
  contacts?: Contact[];
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REMINDER/NOTIFICATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Reminder {
  id?: string;
  title: string;
  message: string;
  time: Date;
  recurring?: 'daily' | 'weekly' | 'monthly';
}

export interface ToastNotification {
  title: string;
  message: string;
  icon?: string;
  duration?: 'short' | 'long';
  actions?: { label: string; action: string }[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECT CONTROL RESULT
// ═══════════════════════════════════════════════════════════════════════════════

export interface DirectControlResult {
  success: boolean;
  action: string;
  data?: any;
  error?: string;
  executionTime?: number;
}
