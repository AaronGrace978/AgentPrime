import * as fs from 'fs';
import * as path from 'path';

export interface SessionPathAppLike {
  getPath(name: 'userData' | 'temp'): string;
  setPath(name: 'sessionData', value: string): void;
}

export interface SingleInstanceAppLike {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: 'second-instance', listener: () => void): void;
}

function isTruthy(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value || '');
}

export function allowMultipleInstances(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'test' || isTruthy(env.AGENTPRIME_ALLOW_MULTI_INSTANCE);
}

export function resolveSessionDataPath(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  userDataPath: string,
  tempPath: string,
  pid: number = process.pid
): string | null {
  if (platform !== 'win32') {
    return null;
  }

  if (allowMultipleInstances(env)) {
    return path.join(tempPath, 'agentprime-session-data', String(pid));
  }

  if (env.LOCALAPPDATA) {
    return path.join(env.LOCALAPPDATA, 'agentprime', 'session-data');
  }

  return path.join(userDataPath, 'session-data');
}

export function configureWindowsSessionDataPath(
  appLike: SessionPathAppLike,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  pid: number = process.pid
): string | null {
  const sessionDataPath = resolveSessionDataPath(
    platform,
    env,
    appLike.getPath('userData'),
    appLike.getPath('temp'),
    pid
  );

  if (!sessionDataPath) {
    return null;
  }

  fs.mkdirSync(sessionDataPath, { recursive: true });
  appLike.setPath('sessionData', sessionDataPath);
  return sessionDataPath;
}

export function setupSingleInstanceGuard(
  appLike: SingleInstanceAppLike,
  onSecondInstance: () => void,
  enabled: boolean = true
): boolean {
  if (!enabled) {
    return true;
  }

  const hasLock = appLike.requestSingleInstanceLock();
  if (!hasLock) {
    appLike.quit();
    return false;
  }

  appLike.on('second-instance', onSecondInstance);
  return true;
}
