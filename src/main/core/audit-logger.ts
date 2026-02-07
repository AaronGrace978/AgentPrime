/**
 * AgentPrime - Audit Logger
 * Comprehensive logging and compliance reporting
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { IpcMainInvokeEvent } from 'electron';

/**
 * Audit event types
 */
export type AuditEventType =
  | 'user_action'
  | 'ai_operation'
  | 'file_change'
  | 'security_event'
  | 'system_event'
  | 'compliance_event';

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  type: AuditEventType;
  userId?: string;
  sessionId?: string;
  action: string;
  resource?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  error?: string;
  signature?: string; // Cryptographic signature for tamper-proofing
}

/**
 * Compliance report filters
 */
export interface ComplianceFilters {
  startDate?: number;
  endDate?: number;
  userId?: string;
  eventType?: AuditEventType;
  resource?: string;
}

/**
 * Audit Logger - Comprehensive audit logging
 */
export class AuditLogger {
  private logDirectory: string;
  private logFile: string;
  private retentionDays: number = 365; // 1 year default
  private enableSigning: boolean = true;
  private signingKey: Buffer;

  constructor(logDirectory?: string) {
    this.logDirectory = logDirectory || path.join(process.cwd(), 'logs', 'audit');
    
    // Ensure log directory exists
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }

    // Create daily log file
    const today = new Date().toISOString().split('T')[0];
    this.logFile = path.join(this.logDirectory, `audit-${today}.log`);

    // Generate signing key (in production, would load from secure storage)
    this.signingKey = crypto.randomBytes(32);
  }

  /**
   * Log an audit event
   */
  async log(
    type: AuditEventType,
    action: string,
    details: {
      userId?: string;
      sessionId?: string;
      resource?: string;
      success?: boolean;
      error?: string;
      [key: string]: any;
    },
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<string> {
    const entry: AuditLogEntry = {
      id: crypto.randomBytes(16).toString('hex'),
      timestamp: Date.now(),
      type,
      userId: details.userId,
      sessionId: details.sessionId,
      action,
      resource: details.resource,
      details: { ...details },
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      success: details.success !== false,
      error: details.error
    };

    // Sign entry for tamper-proofing
    if (this.enableSigning) {
      entry.signature = this.signEntry(entry);
    }

    // Write to log file
    await this.writeLogEntry(entry);

    return entry.id;
  }

  /**
   * Log user action
   */
  async logUserAction(
    userId: string,
    action: string,
    resource?: string,
    success: boolean = true,
    error?: string
  ): Promise<string> {
    return this.log('user_action', action, {
      userId,
      resource,
      success,
      error
    });
  }

  /**
   * Log AI operation
   */
  async logAIOperation(
    userId: string,
    operation: string,
    details: Record<string, any>,
    success: boolean = true
  ): Promise<string> {
    return this.log('ai_operation', operation, {
      userId,
      ...details,
      success
    });
  }

  /**
   * Log file change
   */
  async logFileChange(
    userId: string,
    filePath: string,
    changeType: 'created' | 'modified' | 'deleted',
    details?: Record<string, any>
  ): Promise<string> {
    return this.log('file_change', `file_${changeType}`, {
      userId,
      resource: filePath,
      changeType,
      ...details
    });
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    event: string,
    details: Record<string, any>,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<string> {
    return this.log('security_event', event, {
      ...details,
      severity
    });
  }

  /**
   * Query audit logs
   */
  async queryLogs(filters: ComplianceFilters): Promise<AuditLogEntry[]> {
    const entries: AuditLogEntry[] = [];

    // Read log files in date range
    const startDate = filters.startDate || Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
    const endDate = filters.endDate || Date.now();

    const logFiles = this.getLogFilesInRange(startDate, endDate);

    for (const logFile of logFiles) {
      const fileEntries = await this.readLogFile(logFile);
      
      for (const entry of fileEntries) {
        // Apply filters
        if (filters.userId && entry.userId !== filters.userId) continue;
        if (filters.eventType && entry.type !== filters.eventType) continue;
        if (filters.resource && entry.resource !== filters.resource) continue;
        if (entry.timestamp < startDate || entry.timestamp > endDate) continue;

        // Verify signature
        if (this.enableSigning && entry.signature) {
          const isValid = this.verifyEntry(entry);
          if (!isValid) {
            console.warn(`[AuditLogger] Tampered log entry detected: ${entry.id}`);
            continue;
          }
        }

        entries.push(entry);
      }
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    reportType: 'SOC2' | 'GDPR' | 'HIPAA',
    filters: ComplianceFilters
  ): Promise<{
    reportType: string;
    generatedAt: number;
    period: { start: number; end: number };
    summary: {
      totalEvents: number;
      eventsByType: Record<string, number>;
      eventsByUser: Record<string, number>;
      securityEvents: number;
      errors: number;
    };
    entries: AuditLogEntry[];
  }> {
    const entries = await this.queryLogs(filters);

    // Generate summary
    const eventsByType: Record<string, number> = {};
    const eventsByUser: Record<string, number> = {};
    let securityEvents = 0;
    let errors = 0;

    for (const entry of entries) {
      eventsByType[entry.type] = (eventsByType[entry.type] || 0) + 1;
      
      if (entry.userId) {
        eventsByUser[entry.userId] = (eventsByUser[entry.userId] || 0) + 1;
      }

      if (entry.type === 'security_event') {
        securityEvents++;
      }

      if (!entry.success) {
        errors++;
      }
    }

    return {
      reportType,
      generatedAt: Date.now(),
      period: {
        start: filters.startDate || Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000),
        end: filters.endDate || Date.now()
      },
      summary: {
        totalEvents: entries.length,
        eventsByType,
        eventsByUser,
        securityEvents,
        errors
      },
      entries
    };
  }

  /**
   * Mask PII in log entries (for GDPR compliance)
   */
  maskPII(entries: AuditLogEntry[]): AuditLogEntry[] {
    return entries.map(entry => {
      const masked = { ...entry };

      // Mask email addresses
      if (masked.userId && masked.userId.includes('@')) {
        const [local, domain] = masked.userId.split('@');
        masked.userId = `${local.substring(0, 2)}***@${domain}`;
      }

      // Mask IP addresses (keep first octet)
      if (masked.ipAddress) {
        const parts = masked.ipAddress.split('.');
        masked.ipAddress = `${parts[0]}.${parts[1]}.xxx.xxx`;
      }

      // Remove sensitive details
      if (masked.details.password) {
        delete masked.details.password;
      }
      if (masked.details.apiKey) {
        masked.details.apiKey = '***masked***';
      }

      return masked;
    });
  }

  /**
   * Write log entry to file
   */
  private async writeLogEntry(entry: AuditLogEntry): Promise<void> {
    const logLine = JSON.stringify(entry) + '\n';
    
    // Append to daily log file
    fs.appendFileSync(this.logFile, logLine, 'utf-8');
  }

  /**
   * Read log file
   */
  private async readLogFile(filePath: string): Promise<AuditLogEntry[]> {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    return lines.map(line => {
      try {
        return JSON.parse(line) as AuditLogEntry;
      } catch {
        return null;
      }
    }).filter((entry): entry is AuditLogEntry => entry !== null);
  }

  /**
   * Get log files in date range
   */
  private getLogFilesInRange(startDate: number, endDate: number): string[] {
    const files: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Iterate through dates
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const filePath = path.join(this.logDirectory, `audit-${dateStr}.log`);
      
      if (fs.existsSync(filePath)) {
        files.push(filePath);
      }

      current.setDate(current.getDate() + 1);
    }

    return files;
  }

  /**
   * Sign log entry
   */
  private signEntry(entry: AuditLogEntry): string {
    const entryCopy = { ...entry };
    delete entryCopy.signature; // Remove signature before signing

    const hmac = crypto.createHmac('sha256', this.signingKey);
    hmac.update(JSON.stringify(entryCopy));
    return hmac.digest('hex');
  }

  /**
   * Verify log entry signature
   */
  private verifyEntry(entry: AuditLogEntry): boolean {
    if (!entry.signature) return false;

    const entryCopy = { ...entry };
    const signature = entryCopy.signature;
    delete entryCopy.signature;

    const hmac = crypto.createHmac('sha256', this.signingKey);
    hmac.update(JSON.stringify(entryCopy));
    const computedSignature = hmac.digest('hex');

    return signature === computedSignature;
  }

  /**
   * Clean up old logs
   */
  async cleanupOldLogs(): Promise<{ deleted: number; errors: string[] }> {
    const cutoffDate = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
    const errors: string[] = [];
    let deleted = 0;

    try {
      const files = fs.readdirSync(this.logDirectory);
      
      for (const file of files) {
        if (!file.startsWith('audit-') || !file.endsWith('.log')) continue;

        const filePath = path.join(this.logDirectory, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime.getTime() < cutoffDate) {
          try {
            fs.unlinkSync(filePath);
            deleted++;
          } catch (error: any) {
            errors.push(`Failed to delete ${file}: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      errors.push(`Cleanup failed: ${error.message}`);
    }

    return { deleted, errors };
  }

  /**
   * Get audit statistics
   */
  getStats(): {
    totalEntries: number;
    entriesToday: number;
    logFileSize: number;
    retentionDays: number;
  } {
    const today = new Date().toISOString().split('T')[0];
    const todayFile = path.join(this.logDirectory, `audit-${today}.log`);

    let entriesToday = 0;
    let logFileSize = 0;

    if (fs.existsSync(todayFile)) {
      const content = fs.readFileSync(todayFile, 'utf-8');
      entriesToday = content.split('\n').filter(line => line.trim()).length;
      logFileSize = fs.statSync(todayFile).size;
    }

    // Count total entries (simplified - would be more efficient with database)
    let totalEntries = entriesToday; // Approximation

    return {
      totalEntries,
      entriesToday,
      logFileSize,
      retentionDays: this.retentionDays
    };
  }
}

// Singleton instance
let auditLoggerInstance: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger();
  }
  return auditLoggerInstance;
}

