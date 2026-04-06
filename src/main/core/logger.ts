/**
 * AgentPrime Structured Logger
 *
 * Replaces raw console.log calls with leveled, filterable output.
 * Levels: debug < info < warn < error
 *
 * Set AGENTPRIME_LOG_LEVEL env var (debug|info|warn|error) to control verbosity.
 * Default: "info" in production, "debug" in development.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function resolveMinLevel(): LogLevel {
  const env = (process.env.AGENTPRIME_LOG_LEVEL || '').toLowerCase();
  if (env in LEVEL_ORDER) return env as LogLevel;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const minLevel = resolveMinLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function formatPrefix(tag: string, level: LogLevel): string {
  const ts = new Date().toISOString().slice(11, 23);
  const lvl = level.toUpperCase().padEnd(5);
  return `${ts} ${lvl} [${tag}]`;
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createOperationId(prefix: string = 'op'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createLogger(tag: string): Logger {
  return {
    debug(...args: unknown[]) {
      if (shouldLog('debug')) console.log(formatPrefix(tag, 'debug'), ...args);
    },
    info(...args: unknown[]) {
      if (shouldLog('info')) console.log(formatPrefix(tag, 'info'), ...args);
    },
    warn(...args: unknown[]) {
      if (shouldLog('warn')) console.warn(formatPrefix(tag, 'warn'), ...args);
    },
    error(...args: unknown[]) {
      if (shouldLog('error')) console.error(formatPrefix(tag, 'error'), ...args);
    },
  };
}
