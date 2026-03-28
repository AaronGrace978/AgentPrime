/**
 * Command Security Utilities - Rate limiting, audit logging, and validation
 * 
 * Extracted from agent-loop.ts for modularity and testability.
 * Prevents abuse of command execution in the agent loop.
 */

import * as fs from 'fs';
import * as path from 'path';

export class CommandRateLimiter {
  private commandHistory: Array<{ command: string; timestamp: number; workspacePath: string }> = [];
  private readonly MAX_COMMANDS_PER_MINUTE = 30;
  private readonly MAX_COMMANDS_PER_SECOND = 5;
  private readonly HISTORY_RETENTION_MS = 60000;

  canExecute(): { allowed: boolean; reason?: string; waitMs?: number } {
    this.cleanup();

    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const oneMinuteAgo = now - 60000;

    const commandsLastSecond = this.commandHistory.filter(c => c.timestamp > oneSecondAgo).length;
    if (commandsLastSecond >= this.MAX_COMMANDS_PER_SECOND) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${commandsLastSecond}/${this.MAX_COMMANDS_PER_SECOND} commands per second`,
        waitMs: 1000 - (now - this.commandHistory[this.commandHistory.length - 1].timestamp)
      };
    }

    const commandsLastMinute = this.commandHistory.filter(c => c.timestamp > oneMinuteAgo).length;
    if (commandsLastMinute >= this.MAX_COMMANDS_PER_MINUTE) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${commandsLastMinute}/${this.MAX_COMMANDS_PER_MINUTE} commands per minute`,
        waitMs: 60000 - (now - this.commandHistory[0].timestamp)
      };
    }

    return { allowed: true };
  }

  record(command: string, workspacePath: string): void {
    this.commandHistory.push({ command, timestamp: Date.now(), workspacePath });
    this.cleanup();
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.HISTORY_RETENTION_MS;
    this.commandHistory = this.commandHistory.filter(c => c.timestamp > cutoff);
  }

  getStats(): { lastMinute: number; lastSecond: number } {
    this.cleanup();
    const now = Date.now();
    return {
      lastMinute: this.commandHistory.filter(c => c.timestamp > now - 60000).length,
      lastSecond: this.commandHistory.filter(c => c.timestamp > now - 1000).length
    };
  }
}

export class CommandAuditLogger {
  private logPath: string;
  private enabled: boolean = true;

  constructor() {
    const userDataPath = process.env.APPDATA || process.env.HOME || '.';
    const agentPrimeDir = path.join(userDataPath, 'AgentPrime');

    try {
      if (!fs.existsSync(agentPrimeDir)) {
        fs.mkdirSync(agentPrimeDir, { recursive: true });
      }
      this.logPath = path.join(agentPrimeDir, 'command-audit.log');
    } catch (e) {
      console.warn('[Security] Could not create audit log directory, logging disabled');
      this.logPath = '';
      this.enabled = false;
    }
  }

  log(entry: {
    command: string;
    workspacePath: string;
    status: 'executed' | 'blocked' | 'error';
    reason?: string;
    exitCode?: number;
    duration?: number;
  }): void {
    if (!this.enabled || !this.logPath) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
      command: this.sanitizeCommand(entry.command)
    };

    try {
      const line = JSON.stringify(logEntry) + '\n';
      fs.appendFileSync(this.logPath, line, 'utf-8');
    } catch (e) {
      console.warn('[Security] Could not write to audit log');
    }
  }

  private sanitizeCommand(command: string): string {
    return command
      .replace(/(?:api[_-]?key|password|token|secret|auth)[=:\s]+\S+/gi, '$1=***REDACTED***')
      .replace(/Bearer\s+\S+/gi, 'Bearer ***REDACTED***')
      .replace(/Basic\s+\S+/gi, 'Basic ***REDACTED***');
  }

  getRecentEntries(count: number = 50): any[] {
    if (!this.enabled || !this.logPath || !fs.existsSync(this.logPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);
      return lines.slice(-count).map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
    } catch (e) {
      return [];
    }
  }
}

export class CommandSecurityValidator {
  private static readonly DANGEROUS_PATTERNS: Array<{ pattern: RegExp; description: string; severity: 'critical' | 'high' | 'medium' }> = [
    { pattern: /rm\s+-rf\s+\/(?!\w)/i, description: 'Recursive delete from root', severity: 'critical' },
    { pattern: /rm\s+-rf\s+~\/?$/i, description: 'Delete home directory', severity: 'critical' },
    { pattern: /rm\s+-rf\s+\.\.\/?$/i, description: 'Delete parent directory', severity: 'critical' },
    { pattern: /del\s+\/s\s+\/q\s+c:\\/i, description: 'Delete system drive', severity: 'critical' },
    { pattern: /format\s+[a-z]:/i, description: 'Format drive', severity: 'critical' },
    { pattern: /mkfs\./i, description: 'Make filesystem (format)', severity: 'critical' },
    { pattern: /dd\s+if=.*of=\/dev\//i, description: 'Direct disk write', severity: 'critical' },
    { pattern: />\s*\/dev\/sd[a-z]/i, description: 'Write to disk device', severity: 'critical' },
    { pattern: /shutdown\s+(-[sfr]|\/[sfr])/i, description: 'System shutdown/restart', severity: 'critical' },
    { pattern: /reboot/i, description: 'System reboot', severity: 'critical' },
    { pattern: /init\s+[0-6]/i, description: 'Change runlevel', severity: 'critical' },
    { pattern: /:()\{\s*:\|:&\s*\};:/i, description: 'Fork bomb', severity: 'critical' },
    { pattern: /sudo\s+rm\s+-rf/i, description: 'Sudo recursive delete', severity: 'high' },
    { pattern: /sudo\s+chmod\s+777/i, description: 'Sudo chmod 777', severity: 'high' },
    { pattern: /sudo\s+chown.*root/i, description: 'Sudo chown to root', severity: 'high' },
    { pattern: /chmod\s+777\s+\//i, description: 'chmod 777 on root', severity: 'high' },
    { pattern: /chown\s+-R\s+root\s+\//i, description: 'Recursive chown to root', severity: 'high' },
    { pattern: /curl.*\|\s*bash/i, description: 'Pipe curl to bash', severity: 'high' },
    { pattern: /wget.*\|\s*sh/i, description: 'Pipe wget to shell', severity: 'high' },
    { pattern: /nc\s+-e/i, description: 'Netcat with execute', severity: 'high' },
    { pattern: /netcat.*-e/i, description: 'Netcat reverse shell', severity: 'high' },
    { pattern: />\s*\/etc\//i, description: 'Write to /etc/', severity: 'medium' },
    { pattern: />\s*\/usr\//i, description: 'Write to /usr/', severity: 'medium' },
    { pattern: /rm\s+-rf\s+node_modules/i, description: 'Delete node_modules (use with caution)', severity: 'medium' },
    { pattern: /git\s+push\s+.*--force/i, description: 'Force push', severity: 'medium' },
    { pattern: /git\s+reset\s+--hard/i, description: 'Hard reset', severity: 'medium' },
  ];

  static validate(command: string): {
    safe: boolean;
    issues: Array<{ description: string; severity: string }>;
    blocked: boolean;
  } {
    const issues: Array<{ description: string; severity: string }> = [];
    let blocked = false;

    for (const { pattern, description, severity } of this.DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        issues.push({ description, severity });
        if (severity === 'critical' || severity === 'high') {
          blocked = true;
        }
      }
    }

    if (/[;&|]{2,}/.test(command) && issues.length > 0) {
      issues.push({ description: 'Command chaining with dangerous patterns', severity: 'high' });
      blocked = true;
    }

    if (/base64\s+-d.*\|\s*(bash|sh|python|node)/i.test(command)) {
      issues.push({ description: 'Base64 decoded execution', severity: 'high' });
      blocked = true;
    }

    if (/\$\([^)]+\).*rm|rm.*\$\([^)]+\)/i.test(command)) {
      issues.push({ description: 'Command substitution with rm', severity: 'high' });
      blocked = true;
    }

    return { safe: issues.length === 0, issues, blocked };
  }

  static validateWorkspaceBoundary(command: string, _workspacePath: string): boolean {
    if (/\.\.[\/\\]/.test(command) && !command.includes('node_modules')) {
      const suspiciousMatches = command.match(/\.\.[\/\\]/g) || [];
      if (suspiciousMatches.length > 2) {
        return false;
      }
    }

    const absolutePathMatches = command.match(/(?:^|[\s"'])([\/\\](?:usr|etc|var|home|root|windows|system32|program files)[\/\\])/gi);
    if (absolutePathMatches && absolutePathMatches.length > 0) {
      return false;
    }

    return true;
  }
}

export const commandRateLimiter = new CommandRateLimiter();
export const commandAuditLogger = new CommandAuditLogger();
