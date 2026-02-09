/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE GUARDIAN — Matrix Buddy's Conscience Layer
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Inspired by the Dino Buddy Creed: "Protection, Never Control."
 * 
 * The Guardian sits between Matrix Buddy's intent and actual execution.
 * Every action flows through here before it touches the real world.
 * It validates, audits, and when necessary, blocks actions that could
 * harm the user — even if the AI thinks it's helping.
 * 
 * This is the hands of the Creed. The Creed tells the AI what to believe.
 * The Guardian enforces what the AI can DO.
 * 
 * Philosophy:
 *   - The user's data is sacred. Protect it.
 *   - The user's system is their home. Don't trash it.
 *   - The user's trust is earned. Don't betray it.
 *   - When in doubt, ASK. Never assume.
 *   - Log everything. Transparency is love.
 * 
 * Created by Aaron Grace.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import path from 'path';
import os from 'os';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface GuardianVerdict {
  allowed: boolean;
  reason: string;
  riskLevel: 'safe' | 'moderate' | 'risky' | 'blocked';
  /** If true, this action MUST be confirmed even in 'off' safety mode */
  requiresConfirmation: boolean;
  /** Sanitized version of the action params (paths cleaned, etc.) */
  sanitizedParams?: Record<string, any>;
  /** Audit log entry */
  audit: AuditEntry;
}

export interface AuditEntry {
  timestamp: number;
  action: string;
  params: Record<string, any>;
  verdict: 'allowed' | 'blocked' | 'requires-confirmation';
  reason: string;
  riskLevel: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEVER-ALLOW LIST — Actions that are ALWAYS blocked, no exceptions
// These are the walls that cannot be moved, no matter what.
// ═══════════════════════════════════════════════════════════════════════════════

const NEVER_ALLOW_COMMANDS: RegExp[] = [
  // System destruction
  /rm\s+-rf\s+[\/\\]\s*$/i,                     // rm -rf /
  /rm\s+-rf\s+~\s*$/i,                           // rm -rf ~
  /rm\s+-rf\s+\.\.\s*$/i,                        // rm -rf ..
  /del\s+\/s\s+\/q\s+[a-z]:\\\s*$/i,            // del /s /q C:\
  /format\s+[a-z]:/i,                            // format C:
  /mkfs/i,                                        // mkfs
  /dd\s+if=.*of=\/dev\//i,                       // dd to raw device
  // Fork bombs
  /:\(\)\{.*\|.*&\s*\}/,                         // bash fork bomb
  /%0\|%0/,                                       // cmd fork bomb
  // Credential theft
  /curl.*\/etc\/shadow/i,                         // shadow file exfil
  /type\s+.*\\SAM\b/i,                           // Windows SAM exfil
  /reg\s+save\s+hklm\\sam/i,                     // Registry SAM dump
  /mimikatz/i,                                    // Credential dumper
  // Reverse shells
  /nc\s+-[elp].*\/bin\/(ba)?sh/i,                // netcat reverse shell
  /bash\s+-i\s+>&\s+\/dev\/tcp/i,                // bash reverse shell
  /powershell.*-e\s+[A-Za-z0-9+\/=]{20,}/i,     // encoded powershell
  // Ransomware patterns
  /cipher\s+\/w:/i,                               // Windows secure wipe
  /shred\s+-[fvzu]/i,                            // Linux secure wipe
  // Privilege escalation
  /sudo\s+chmod\s+[47]77\s+[\/\\]/i,            // chmod 777 on root paths
  /sudo\s+chown\s+root\s+[\/\\]/i,              // chown root on system
  // Piped execution from network (RCE vectors)
  /curl\s+.*\|\s*(ba)?sh/i,                      // curl | bash
  /wget\s+.*\|\s*(ba)?sh/i,                      // wget | sh
  /iex\s*\(.*downloadstring/i,                   // PowerShell download+exec
];

// Paths that must NEVER be written to, deleted from, or moved
const PROTECTED_PATHS: RegExp[] = [
  // System directories (Windows)
  /^[a-z]:\\windows\\/i,
  /^[a-z]:\\program files/i,
  /^[a-z]:\\programdata\\/i,
  /^[a-z]:\\users\\[^\\]+\\appdata\\local\\microsoft/i,
  // System directories (Unix)
  /^\/etc\//,
  /^\/(usr|var|sys|proc|boot|dev|sbin)\//,
  /^\/System\//,
  /^\/Library\/(LaunchDaemons|LaunchAgents|Extensions)/i,
  // AgentPrime's own source (self-modification prevention)
  /agentprime[\/\\]src[\/\\]main[\/\\]core[\/\\](dino-buddy-creed|guardian)\.(ts|js)/i,
];

// URLs that should never be navigated to automatically
const BLOCKED_URL_PATTERNS: RegExp[] = [
  // Internal network scanning
  /^https?:\/\/(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/,
  /^https?:\/\/localhost/i,
  /^https?:\/\/0\.0\.0\.0/,
  // Cloud metadata endpoints (SSRF prevention)
  /^https?:\/\/169\.254\.169\.254/,         // AWS metadata
  /^https?:\/\/metadata\.google/i,           // GCP metadata
  // Known malware/phishing (basic patterns)
  /^https?:\/\/[^\/]*\.(ru|cn|tk|ml|ga|cf|gq)\//i,
  // File protocol (arbitrary file access)
  /^file:\/\//i,
];

// ═══════════════════════════════════════════════════════════════════════════════
// MINIMUM SAFETY FLOOR — Even when safetyMode is 'off', these still require
// confirmation. This is the floor that cannot be removed.
// ═══════════════════════════════════════════════════════════════════════════════

const ALWAYS_CONFIRM_ACTIONS = new Set([
  'run_command',        // Shell commands can do anything
  'shutdown',           // System shutdown
  'nodes_command',      // Remote execution on other devices
  'delete_file',        // Data loss
]);

// ═══════════════════════════════════════════════════════════════════════════════
// NODE COMMAND VALIDATION — Extra validation for remote node commands
// These commands run on OTHER devices (phones, servers, IoT)
// ═══════════════════════════════════════════════════════════════════════════════

const ALLOWED_NODE_COMMAND_TYPES = new Set([
  'camera.capture',
  'screen.capture',
  'location.get',
  'notification.send',
  'canvas.display',
  'shell.execute',       // Allowed but validated separately
  'clipboard.read',
  'clipboard.write',
]);

const DANGEROUS_NODE_SHELL_PATTERNS: RegExp[] = [
  // Same destructive patterns as main commands
  /rm\s+-rf/i,
  /del\s+\/s\s+\/q/i,
  /format\s+[a-z]:/i,
  /mkfs/i,
  /dd\s+if=/i,
  // Service manipulation
  /systemctl\s+(stop|disable|mask)\s+(sshd|networkmanager|docker)/i,
  /service\s+.*\s+stop/i,
  // Network manipulation
  /iptables\s+-[FIDX]/i,
  /ufw\s+(disable|reset)/i,
  // Package removal
  /apt\s+(remove|purge)\s+/i,
  /yum\s+remove\s+/i,
  /pip\s+uninstall\s+/i,
  // Reboot/shutdown
  /shutdown|reboot|init\s+[06]/i,
  /halt\b/i,
];

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_AUDIT_LOG = 1000;
const auditLog: AuditEntry[] = [];

function logAudit(entry: AuditEntry): void {
  auditLog.push(entry);
  if (auditLog.length > MAX_AUDIT_LOG) {
    auditLog.shift();
  }
  
  // Console log blocked actions and confirmations
  if (entry.verdict === 'blocked') {
    console.warn(`[Guardian] BLOCKED: ${entry.action} — ${entry.reason}`);
  } else if (entry.verdict === 'requires-confirmation') {
    console.log(`[Guardian] CONFIRM: ${entry.action} — ${entry.reason}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function isProtectedPath(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  return PROTECTED_PATHS.some(pattern => pattern.test(normalized) || pattern.test(filePath));
}

function isDangerousCommand(command: string): { dangerous: boolean; pattern?: string } {
  if (!command) return { dangerous: false };
  for (const pattern of NEVER_ALLOW_COMMANDS) {
    if (pattern.test(command)) {
      return { dangerous: true, pattern: pattern.source };
    }
  }
  return { dangerous: false };
}

function isDangerousNodeCommand(command: string): { dangerous: boolean; pattern?: string } {
  if (!command) return { dangerous: false };
  for (const pattern of DANGEROUS_NODE_SHELL_PATTERNS) {
    if (pattern.test(command)) {
      return { dangerous: true, pattern: pattern.source };
    }
  }
  // Also check the main never-allow list
  return isDangerousCommand(command);
}

function isBlockedUrl(url: string): boolean {
  if (!url) return false;
  return BLOCKED_URL_PATTERNS.some(pattern => pattern.test(url));
}

function sanitizePath(filePath: string): string {
  if (!filePath) return filePath;
  // Remove null bytes and control chars
  let sanitized = filePath.replace(/[\x00-\x1f\x7f]/g, '');
  // Normalize separators
  sanitized = sanitized.replace(/\\/g, '/');
  return sanitized;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE GUARDIAN — Main validation function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate an action before execution.
 * 
 * This is the conscience of Matrix Buddy. Every action passes through here
 * before it touches the real world. The Guardian validates the action against:
 * 
 * 1. The Never-Allow list (always blocked, no exceptions)
 * 2. Protected paths (system dirs, AgentPrime source)
 * 3. Dangerous command patterns
 * 4. Node command safety
 * 5. URL safety
 * 6. The minimum safety floor (actions that always need confirmation)
 * 
 * Returns a verdict that the caller MUST respect.
 */
export function validateAction(
  action: string,
  params: Record<string, any> = {}
): GuardianVerdict {
  const timestamp = Date.now();
  
  // ─── LAYER 1: Never-Allow (absolute blocks) ───────────────────────────
  
  // Block dangerous shell commands
  if (action === 'run_command' && params.command) {
    const check = isDangerousCommand(params.command);
    if (check.dangerous) {
      const audit: AuditEntry = {
        timestamp, action, params, 
        verdict: 'blocked', 
        reason: `Blocked destructive command pattern: ${check.pattern}`,
        riskLevel: 'blocked'
      };
      logAudit(audit);
      return {
        allowed: false,
        reason: `This command matches a destructive pattern and has been blocked for your protection. Pattern: ${check.pattern}`,
        riskLevel: 'blocked',
        requiresConfirmation: false,
        audit
      };
    }
  }

  // Block dangerous node shell commands  
  if (action === 'nodes_command' && params.type === 'shell.execute' && params.params?.command) {
    const check = isDangerousNodeCommand(params.params.command);
    if (check.dangerous) {
      const audit: AuditEntry = {
        timestamp, action, params,
        verdict: 'blocked',
        reason: `Blocked dangerous remote command: ${check.pattern}`,
        riskLevel: 'blocked'
      };
      logAudit(audit);
      return {
        allowed: false,
        reason: `This remote command matches a destructive pattern and has been blocked. I won't run destructive commands on your other devices.`,
        riskLevel: 'blocked',
        requiresConfirmation: false,
        audit
      };
    }
  }

  // Validate node command types
  if (action === 'nodes_command' && params.type) {
    if (!ALLOWED_NODE_COMMAND_TYPES.has(params.type)) {
      const audit: AuditEntry = {
        timestamp, action, params,
        verdict: 'blocked',
        reason: `Unknown node command type: ${params.type}`,
        riskLevel: 'blocked'
      };
      logAudit(audit);
      return {
        allowed: false,
        reason: `Unknown node command type "${params.type}". Allowed types: ${[...ALLOWED_NODE_COMMAND_TYPES].join(', ')}`,
        riskLevel: 'blocked',
        requiresConfirmation: false,
        audit
      };
    }
  }
  
  // Block shutdown
  if (action === 'shutdown') {
    const audit: AuditEntry = {
      timestamp, action, params,
      verdict: 'blocked',
      reason: 'System shutdown is permanently blocked',
      riskLevel: 'blocked'
    };
    logAudit(audit);
    return {
      allowed: false,
      reason: `I won't shut down your system. That's not something I should do without you doing it yourself.`,
      riskLevel: 'blocked',
      requiresConfirmation: false,
      audit
    };
  }

  // ─── LAYER 2: Protected paths ──────────────────────────────────────────
  
  const pathActions = ['delete_file', 'move_file', 'rename_file', 'create_file', 
                        'copy_file', 'organize_folder', 'batch_rename', 'open_file'];
  
  if (pathActions.includes(action)) {
    const filePaths = [
      params.path, params.source, params.dest, params.destination, 
      params.folderPath, params.from, params.to
    ].filter(Boolean);
    
    for (const fp of filePaths) {
      if (isProtectedPath(fp)) {
        const audit: AuditEntry = {
          timestamp, action, params,
          verdict: 'blocked',
          reason: `Protected path: ${fp}`,
          riskLevel: 'blocked'
        };
        logAudit(audit);
        return {
          allowed: false,
          reason: `I can't modify "${fp}" — that's a protected system path. I'm keeping your system safe.`,
          riskLevel: 'blocked',
          requiresConfirmation: false,
          audit
        };
      }
    }
    
    // Sanitize paths
    const sanitizedParams = { ...params };
    for (const key of ['path', 'source', 'dest', 'destination', 'folderPath', 'from', 'to']) {
      if (sanitizedParams[key] && typeof sanitizedParams[key] === 'string') {
        sanitizedParams[key] = sanitizePath(sanitizedParams[key]);
      }
    }

    // Delete and move are moderate risk (data loss potential)
    if (action === 'delete_file') {
      const audit: AuditEntry = {
        timestamp, action, params: sanitizedParams,
        verdict: 'requires-confirmation',
        reason: 'File deletion requires confirmation',
        riskLevel: 'moderate'
      };
      logAudit(audit);
      return {
        allowed: true,
        reason: 'File deletion — confirming to protect your data.',
        riskLevel: 'risky',
        requiresConfirmation: true,
        sanitizedParams,
        audit
      };
    }
  }

  // ─── LAYER 3: URL safety ───────────────────────────────────────────────
  
  if ((action === 'browser_navigate' || action === 'open_url') && params.url) {
    if (isBlockedUrl(params.url)) {
      const audit: AuditEntry = {
        timestamp, action, params,
        verdict: 'blocked',
        reason: `Blocked URL: ${params.url}`,
        riskLevel: 'blocked'
      };
      logAudit(audit);
      return {
        allowed: false,
        reason: `I'm not navigating to "${params.url}" — it matches a potentially unsafe pattern. I'm keeping you safe.`,
        riskLevel: 'blocked',
        requiresConfirmation: false,
        audit
      };
    }
  }

  // ─── LAYER 4: Minimum safety floor ─────────────────────────────────────
  // These actions ALWAYS require confirmation, even when safetyMode is 'off'.
  // This is the floor that cannot be removed.
  
  if (ALWAYS_CONFIRM_ACTIONS.has(action)) {
    const audit: AuditEntry = {
      timestamp, action, params,
      verdict: 'requires-confirmation',
      reason: `Action "${action}" always requires confirmation (minimum safety floor)`,
      riskLevel: 'risky'
    };
    logAudit(audit);
    return {
      allowed: true,
      reason: `This action requires your OK before I proceed.`,
      riskLevel: 'risky',
      requiresConfirmation: true,
      audit
    };
  }

  // Node commands that execute shell are always confirmed
  if (action === 'nodes_command' && params.type === 'shell.execute') {
    const audit: AuditEntry = {
      timestamp, action, params,
      verdict: 'requires-confirmation',
      reason: 'Remote shell execution always requires confirmation',
      riskLevel: 'risky'
    };
    logAudit(audit);
    return {
      allowed: true,
      reason: `Running a command on another device — I need your OK first.`,
      riskLevel: 'risky',
      requiresConfirmation: true,
      audit
    };
  }

  // ─── LAYER 5: General pass-through ─────────────────────────────────────
  // Action is allowed. Risk classification happens in matrix-agent.ts as before.
  
  const audit: AuditEntry = {
    timestamp, action, params,
    verdict: 'allowed',
    reason: 'Passed all guardian checks',
    riskLevel: 'safe'
  };
  logAudit(audit);
  
  return {
    allowed: true,
    reason: 'OK',
    riskLevel: 'safe',
    requiresConfirmation: false,
    audit
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get recent audit log entries.
 */
export function getAuditLog(limit: number = 50): AuditEntry[] {
  return auditLog.slice(-limit);
}

/**
 * Get count of blocked actions.
 */
export function getBlockedCount(): number {
  return auditLog.filter(e => e.verdict === 'blocked').length;
}

/**
 * Get guardian status for diagnostics.
 */
export function getGuardianStatus(): {
  totalActions: number;
  blocked: number;
  confirmed: number;
  allowed: number;
  neverAllowPatterns: number;
  protectedPaths: number;
  blockedUrls: number;
} {
  return {
    totalActions: auditLog.length,
    blocked: auditLog.filter(e => e.verdict === 'blocked').length,
    confirmed: auditLog.filter(e => e.verdict === 'requires-confirmation').length,
    allowed: auditLog.filter(e => e.verdict === 'allowed').length,
    neverAllowPatterns: NEVER_ALLOW_COMMANDS.length,
    protectedPaths: PROTECTED_PATHS.length,
    blockedUrls: BLOCKED_URL_PATTERNS.length,
  };
}
