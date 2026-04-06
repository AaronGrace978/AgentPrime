/**
 * IPC Input Validation & Sanitization
 * 
 * Provides security validation for all IPC messages to prevent:
 * - Path traversal attacks
 * - Payload size DoS attacks
 * - Injection attacks
 * - Malformed data attacks
 */

import * as path from 'path';

// Maximum payload sizes (in bytes)
const MAX_PAYLOAD_SIZES = {
  default: 1024 * 1024, // 1MB default
  fileContent: 10 * 1024 * 1024, // 10MB for file content
  chat: 100 * 1024, // 100KB for chat messages
  command: 10 * 1024, // 10KB for commands
  settings: 50 * 1024, // 50KB for settings
};

// Dangerous characters/patterns to sanitize
const DANGEROUS_PATTERNS = {
  nullBytes: /\0/g,
  controlChars: /[\x00-\x08\x0B\x0C\x0E-\x1F]/g,
  pathTraversal: /\.\.[\/\\]/g,
};
const SHELL_CONTROL_PATTERN = /(?:&&|\|\||[;&`]|[<>]|\$\()/;
const DEFAULT_ALLOWED_SHELLS = [
  'powershell.exe',
  'pwsh.exe',
  'cmd.exe',
  'bash',
  'sh',
  'zsh',
];

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: any;
}

/**
 * Sanitize a folder or project name for safe filesystem usage.
 * - Removes/replaces invalid characters for Windows/Unix
 * - Trims whitespace from both ends
 * - Removes trailing dots/spaces (Windows restriction)
 * - Replaces consecutive dashes/underscores
 * - Returns a safe, usable folder name
 */
export function sanitizeFolderName(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'untitled';
  }
  
  let sanitized = name
    // Remove null bytes and control characters
    .replace(/\0/g, '')
    .replace(/[\x00-\x1F]/g, '')
    // Replace Windows-invalid characters: < > : " / \ | ? *
    .replace(/[<>:"/\\|?*]/g, '-')
    // Trim whitespace from both ends
    .trim()
    // Remove trailing dots and spaces (Windows restriction)
    .replace(/[\s.]+$/g, '')
    // Remove leading dots (hidden files on Unix, problematic on Windows)
    .replace(/^\.+/g, '')
    // Replace consecutive dashes/underscores with single dash
    .replace(/[-_]+/g, '-')
    // Remove leading/trailing dashes
    .replace(/^-+|-+$/g, '');
  
  // If sanitization removed everything, return default name
  if (!sanitized || sanitized.length === 0) {
    return 'untitled';
  }
  
  // Limit length (Windows MAX_PATH considerations)
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200);
  }
  
  return sanitized;
}

/**
 * Sanitize a file name for safe filesystem usage.
 * Similar to sanitizeFolderName but:
 * - Preserves file extensions
 * - Preserves dots in filename (except leading/trailing)
 * - Handles special unicode characters (em dashes, etc.)
 */
export function sanitizeFileName(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'untitled';
  }
  
  // Detect leading-dot prefix (dotfiles like .gitignore, .eslintrc.js, .env)
  const leadingDotMatch = name.match(/^(\.+)/);
  const leadingDots = leadingDotMatch ? leadingDotMatch[1] : '';
  const nameWithoutLeadingDots = leadingDots ? name.substring(leadingDots.length) : name;

  // Split the non-dot portion into name and extension
  const lastDotIndex = nameWithoutLeadingDots.lastIndexOf('.');
  let baseName: string;
  let extension: string;
  
  if (lastDotIndex > 0) {
    baseName = nameWithoutLeadingDots.substring(0, lastDotIndex);
    extension = nameWithoutLeadingDots.substring(lastDotIndex); // includes the dot
  } else if (lastDotIndex === -1 || lastDotIndex === 0) {
    baseName = nameWithoutLeadingDots;
    extension = '';
  } else {
    baseName = nameWithoutLeadingDots;
    extension = '';
  }
  
  // Sanitize the base name (but NOT the leading dot prefix)
  let sanitized = baseName
    .replace(/\0/g, '')
    .replace(/[\x00-\x1F]/g, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/[\u2014\u2013\u2012\u2011\u2010]/g, '-')
    .replace(/[\u00A0]/g, ' ')
    .trim()
    .replace(/[\s.]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  // If sanitization removed the base but we had a leading dot, keep it as a dotfile
  if ((!sanitized || sanitized.length === 0) && !leadingDots) {
    sanitized = 'untitled';
  }
  
  // Limit length (Windows MAX_PATH considerations, leave room for extension)
  const maxBaseLength = 200 - extension.length - leadingDots.length;
  if (sanitized.length > maxBaseLength) {
    sanitized = sanitized.substring(0, maxBaseLength);
  }
  
  // Sanitize extension too (just in case)
  extension = extension
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/[\x00-\x1F]/g, '');

  return leadingDots + sanitized + extension;
}

/**
 * Validate and sanitize a file path
 */
export function validateFilePath(
  filePath: string,
  workspacePath: string,
  options: { allowAbsolute?: boolean; sanitizeFilename?: boolean } = {}
): ValidationResult {
  const errors: string[] = [];
  
  if (typeof filePath !== 'string') {
    return { valid: false, errors: ['File path must be a string'] };
  }
  
  // Check for null bytes (can bypass path checks)
  if (DANGEROUS_PATTERNS.nullBytes.test(filePath)) {
    return { valid: false, errors: ['File path contains null bytes'] };
  }
  
  // Sanitize path
  let sanitized = filePath
    .replace(DANGEROUS_PATTERNS.controlChars, '') // Remove control characters
    .trim();
  
  // Normalize path separators
  sanitized = sanitized.replace(/\\/g, '/');
  
  // Sanitize the filename component (removes invalid characters like * < > : " | ? etc.)
  // This is enabled by default but can be disabled with sanitizeFilename: false
  if (options.sanitizeFilename !== false) {
    const parts = sanitized.split('/');
    if (parts.length > 0) {
      const fileName = parts[parts.length - 1];
      // Only sanitize if it looks like a filename (has content)
      if (fileName && fileName.length > 0) {
        const sanitizedFileName = sanitizeFileName(fileName);
        // Log if filename was changed for debugging
        if (sanitizedFileName !== fileName) {
          console.log(`[Path Validation] Sanitized filename: "${fileName}" -> "${sanitizedFileName}"`);
        }
        parts[parts.length - 1] = sanitizedFileName;
        sanitized = parts.join('/');
      }
    }
  }
  
  // Check for path traversal attempts
  const traversalMatches = sanitized.match(/\.\.\//g);
  if (traversalMatches && traversalMatches.length > 3) {
    errors.push('Excessive path traversal sequences detected');
  }
  
  // Resolve and check if within workspace
  if (workspacePath) {
    const resolvedPath = path.resolve(workspacePath, sanitized);
    const normalizedWorkspace = path.normalize(workspacePath);
    
    if (!resolvedPath.startsWith(normalizedWorkspace)) {
      errors.push('Path resolves outside of workspace');
    }
  }
  
  // Check for absolute paths (if not allowed)
  if (!options.allowAbsolute && path.isAbsolute(sanitized)) {
    errors.push('Absolute paths are not allowed');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Validate a command string
 */
export function validateCommand(
  command: string,
  options: { allowShellOperators?: boolean; requireNonEmpty?: boolean } = {}
): ValidationResult {
  const errors: string[] = [];
  
  if (typeof command !== 'string') {
    return { valid: false, errors: ['Command must be a string'] };
  }
  
  // Check size
  if (command.length > MAX_PAYLOAD_SIZES.command) {
    errors.push(`Command exceeds maximum size (${MAX_PAYLOAD_SIZES.command} bytes)`);
  }
  
  // Check for null bytes
  if (DANGEROUS_PATTERNS.nullBytes.test(command)) {
    errors.push('Command contains null bytes');
  }
  
  // Sanitize
  const sanitized = command
    .replace(DANGEROUS_PATTERNS.nullBytes, '')
    .replace(DANGEROUS_PATTERNS.controlChars, '')
    .trim();

  if (options.requireNonEmpty !== false && sanitized.length === 0) {
    errors.push('Command must not be empty');
  }

  if (/[\r\n]/.test(command)) {
    errors.push('Command must be a single line');
  }

  if (options.allowShellOperators === false && SHELL_CONTROL_PATTERN.test(sanitized)) {
    errors.push('Command contains disallowed shell control operators');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

export function resolveValidatedPath(
  targetPath: string,
  workspacePath: string,
  options: { allowAbsolute?: boolean; sanitizeFilename?: boolean } = {}
): ValidationResult & { resolvedPath?: string } {
  const validation = validateFilePath(targetPath, workspacePath, options);
  if (!validation.valid) {
    return validation;
  }

  const sanitizedPath = validation.sanitized || targetPath;
  const resolvedPath = path.isAbsolute(sanitizedPath)
    ? path.normalize(sanitizedPath)
    : path.resolve(workspacePath, sanitizedPath);
  const normalizedWorkspace = path.normalize(workspacePath);

  if (!resolvedPath.startsWith(normalizedWorkspace)) {
    return {
      valid: false,
      errors: ['Path resolves outside of workspace'],
      sanitized: sanitizedPath,
    };
  }

  return {
    ...validation,
    sanitized: sanitizedPath,
    resolvedPath,
  };
}

export function validateShellExecutable(
  shell: string,
  allowedShells: string[] = DEFAULT_ALLOWED_SHELLS
): ValidationResult {
  const errors: string[] = [];

  if (typeof shell !== 'string') {
    return { valid: false, errors: ['Shell must be a string'] };
  }

  const sanitized = shell.replace(DANGEROUS_PATTERNS.nullBytes, '').trim();
  if (!sanitized) {
    return { valid: false, errors: ['Shell must not be empty'] };
  }

  if (path.basename(sanitized) !== sanitized) {
    errors.push('Shell must not include path segments');
  }

  if (!allowedShells.includes(sanitized.toLowerCase())) {
    errors.push(`Shell must be one of: ${allowedShells.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * Validate file content
 */
export function validateFileContent(content: string): ValidationResult {
  const errors: string[] = [];
  
  if (typeof content !== 'string') {
    return { valid: false, errors: ['Content must be a string'] };
  }
  
  // Check size
  if (content.length > MAX_PAYLOAD_SIZES.fileContent) {
    errors.push(`Content exceeds maximum size (${MAX_PAYLOAD_SIZES.fileContent} bytes)`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: content // File content is not sanitized (preserve original)
  };
}

/**
 * Validate chat message
 */
export function validateChatMessage(message: string): ValidationResult {
  const errors: string[] = [];
  
  if (typeof message !== 'string') {
    return { valid: false, errors: ['Message must be a string'] };
  }
  
  // Check size
  if (message.length > MAX_PAYLOAD_SIZES.chat) {
    errors.push(`Message exceeds maximum size (${MAX_PAYLOAD_SIZES.chat} bytes)`);
  }
  
  // Sanitize (remove null bytes but preserve other content)
  const sanitized = message.replace(DANGEROUS_PATTERNS.nullBytes, '');
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Validate settings object
 */
export function validateSettings(settings: any): ValidationResult {
  const errors: string[] = [];
  
  if (typeof settings !== 'object' || settings === null) {
    return { valid: false, errors: ['Settings must be an object'] };
  }
  
  // Check serialized size
  const serialized = JSON.stringify(settings);
  if (serialized.length > MAX_PAYLOAD_SIZES.settings) {
    errors.push(`Settings exceed maximum size (${MAX_PAYLOAD_SIZES.settings} bytes)`);
  }
  
  // Validate specific settings fields
  if (settings.fontSize !== undefined) {
    if (typeof settings.fontSize !== 'number' || settings.fontSize < 8 || settings.fontSize > 72) {
      errors.push('fontSize must be a number between 8 and 72');
    }
  }
  
  if (settings.theme !== undefined) {
    const validThemes = ['vs-dark', 'vs-light', 'hc-black', 'hc-light'];
    if (!validThemes.includes(settings.theme)) {
      errors.push(`theme must be one of: ${validThemes.join(', ')}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: settings
  };
}

/**
 * Validate generic IPC payload
 */
export function validatePayload(
  payload: any,
  options: {
    maxSize?: number;
    requiredFields?: string[];
    allowedTypes?: string[];
  } = {}
): ValidationResult {
  const errors: string[] = [];
  const maxSize = options.maxSize || MAX_PAYLOAD_SIZES.default;
  
  // Check if payload is valid JSON-serializable
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch (e) {
    return { valid: false, errors: ['Payload is not JSON-serializable'] };
  }
  
  // Check size
  if (serialized.length > maxSize) {
    errors.push(`Payload exceeds maximum size (${maxSize} bytes)`);
  }
  
  // Check required fields
  if (options.requiredFields && typeof payload === 'object' && payload !== null) {
    for (const field of options.requiredFields) {
      if (!(field in payload)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }
  
  // Check allowed types
  if (options.allowedTypes) {
    const actualType = Array.isArray(payload) ? 'array' : typeof payload;
    if (!options.allowedTypes.includes(actualType)) {
      errors.push(`Invalid payload type: ${actualType}. Allowed: ${options.allowedTypes.join(', ')}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: payload
  };
}

/**
 * IPC Rate Limiter
 * Prevents flooding of IPC channels
 */
class IPCRateLimiter {
  private callHistory: Map<string, number[]> = new Map();
  private readonly DEFAULT_LIMIT = 100; // calls per minute
  private readonly DEFAULT_WINDOW = 60000; // 1 minute in ms
  
  /**
   * Check if a channel call is allowed
   */
  check(channel: string, limit?: number): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const windowStart = now - this.DEFAULT_WINDOW;
    const maxCalls = limit || this.DEFAULT_LIMIT;
    
    // Get history for this channel
    let history = this.callHistory.get(channel) || [];
    
    // Filter to only recent calls
    history = history.filter(t => t > windowStart);
    
    if (history.length >= maxCalls) {
      return { allowed: false, remaining: 0 };
    }
    
    // Record this call
    history.push(now);
    this.callHistory.set(channel, history);
    
    return { allowed: true, remaining: maxCalls - history.length };
  }
  
  /**
   * Get stats for monitoring
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    const now = Date.now();
    const windowStart = now - this.DEFAULT_WINDOW;
    
    for (const [channel, history] of this.callHistory.entries()) {
      stats[channel] = history.filter(t => t > windowStart).length;
    }
    
    return stats;
  }
  
  /**
   * Clear all history
   */
  clear(): void {
    this.callHistory.clear();
  }
}

// Global rate limiter instance
export const ipcRateLimiter = new IPCRateLimiter();

/**
 * Wrapper to validate IPC handler input
 * Use this to wrap IPC handlers for automatic validation
 */
export function withValidation<T extends (...args: any[]) => any>(
  handler: T,
  validators: Array<(arg: any) => ValidationResult>
): T {
  return (async (...args: any[]) => {
    for (let i = 0; i < validators.length && i < args.length; i++) {
      const validation = validators[i](args[i]);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
      }
      // Use sanitized value
      if (validation.sanitized !== undefined) {
        args[i] = validation.sanitized;
      }
    }
    return handler(...args);
  }) as T;
}

export default {
  sanitizeFolderName,
  sanitizeFileName,
  validateFilePath,
  resolveValidatedPath,
  validateCommand,
  validateShellExecutable,
  validateFileContent,
  validateChatMessage,
  validateSettings,
  validatePayload,
  ipcRateLimiter,
  withValidation,
};

