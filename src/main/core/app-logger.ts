/**
 * Structured logging (electron-log) + append-only crash JSONL (Sentry-style payloads, local-first).
 * Optional remote: install @sentry/electron and set AGENTPRIME_SENTRY_DSN (or SENTRY_DSN).
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';

let crashLogDir: string | null = null;
let sentryInitialized = false;
const SENTRY_MODULE_ID = ['@sentry', 'electron/main'].join('/');

function loadOptionalRuntimeModule<T>(moduleId: string): T | null {
  try {
    const runtimeRequire = Function('return require')() as (id: string) => T;
    return runtimeRequire(moduleId);
  } catch {
    return null;
  }
}

function resolveLogBase(): string {
  try {
    if (app?.isReady?.()) return app.getPath('userData');
  } catch {
    /* app not ready */
  }
  return process.cwd();
}

export function initAppLogging(): void {
  const base = resolveLogBase();
  crashLogDir = path.join(base, 'logs');
  try {
    fs.mkdirSync(crashLogDir, { recursive: true });
  } catch {
    /* ignore */
  }

  log.transports.file.level = 'info';
  log.transports.console.level =
    process.env.AGENTPRIME_LOG_LEVEL === 'debug' ? 'debug' : 'info';

  log.transports.file.resolvePathFn = () => path.join(crashLogDir!, 'main.log');

  log.info('[app-logger] initialized', { logDir: crashLogDir });
}

/**
 * Call from app.whenReady() so userData path is stable; safe to no-op if DSN unset.
 */
export function initOptionalSentry(): void {
  const dsn = process.env.AGENTPRIME_SENTRY_DSN || process.env.SENTRY_DSN;
  if (!dsn || sentryInitialized) return;
  const Sentry = loadOptionalRuntimeModule<{ init: (options: { dsn: string }) => void }>(SENTRY_MODULE_ID);
  if (!Sentry) {
    log.warn('[app-logger] Sentry DSN set but @sentry/electron not installed or init failed');
    return;
  }
  Sentry.init({ dsn });
  sentryInitialized = true;
  log.info('[app-logger] Sentry enabled');
}

function appendCrashJsonl(payload: Record<string, unknown>): void {
  const dir = crashLogDir || path.join(resolveLogBase(), 'logs');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const crashPath = path.join(dir, 'crashes.jsonl');
    fs.appendFileSync(crashPath, `${JSON.stringify(payload)}\n`);
  } catch {
    /* ignore */
  }
}

function captureSentry(err: unknown, extra: Record<string, unknown>): void {
  if (!sentryInitialized) return;
  const Sentry = loadOptionalRuntimeModule<{
    captureException: (error: Error, context: { extra: Record<string, unknown> }) => void;
    captureMessage: (
      message: string,
      context: { level: 'error'; extra: Record<string, unknown> }
    ) => void;
  }>(SENTRY_MODULE_ID);
  if (!Sentry) {
    return;
  }
  if (err instanceof Error) {
    Sentry.captureException(err, { extra });
  } else {
    Sentry.captureMessage(String(err), { level: 'error', extra });
  }
}

export function logCrash(
  kind: 'uncaughtException' | 'unhandledRejection',
  err: unknown,
  origin?: string
): void {
  const payload = {
    ts: new Date().toISOString(),
    kind,
    origin: origin ?? null,
    name: err instanceof Error ? err.name : typeof err,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    appVersion: typeof app?.getVersion === 'function' ? app.getVersion() : 'unknown'
  };

  log.error('[crash]', payload);
  appendCrashJsonl(payload);
  captureSentry(err, { kind, origin });
}

export { log as appLog };
