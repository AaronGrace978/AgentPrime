import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  allowMultipleInstances,
  configureWindowsSessionDataPath,
  resolveSessionDataPath,
  setupSingleInstanceGuard,
} from '../../src/main/core/electron-runtime-guard';

describe('electron runtime guard', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      if (tempRoot && fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  });

  function createTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(dir);
    return dir;
  }

  it('uses LocalAppData-backed session storage for normal Windows runs', () => {
    const sessionPath = resolveSessionDataPath(
      'win32',
      { LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local' } as NodeJS.ProcessEnv,
      'C:\\Users\\Test\\AppData\\Roaming\\agentprime',
      'C:\\Temp',
      42
    );

    expect(sessionPath).toBe(
      path.join('C:\\Users\\Test\\AppData\\Local', 'agentprime', 'session-data')
    );
  });

  it('uses a pid-scoped temp session path when multi-instance mode is allowed', () => {
    const sessionPath = resolveSessionDataPath(
      'win32',
      { NODE_ENV: 'test' } as NodeJS.ProcessEnv,
      'C:\\Users\\Test\\AppData\\Roaming\\agentprime',
      'C:\\Temp',
      1234
    );

    expect(sessionPath).toBe(path.join('C:\\Temp', 'agentprime-session-data', '1234'));
    expect(allowMultipleInstances({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('creates and applies the resolved Windows sessionData path', () => {
    const userData = createTempDir('agentprime-user-data-');
    const tempDir = createTempDir('agentprime-temp-');
    const setPath = jest.fn();

    const resolved = configureWindowsSessionDataPath(
      {
        getPath: (name) => (name === 'userData' ? userData : tempDir),
        setPath,
      },
      'win32',
      { NODE_ENV: 'test' } as NodeJS.ProcessEnv,
      77
    );

    expect(resolved).toBe(path.join(tempDir, 'agentprime-session-data', '77'));
    expect(fs.existsSync(resolved!)).toBe(true);
    expect(setPath).toHaveBeenCalledWith('sessionData', resolved);
  });

  it('quits duplicate instances when the single-instance lock is unavailable', () => {
    const quit = jest.fn();
    const on = jest.fn();

    const hasLock = setupSingleInstanceGuard(
      {
        requestSingleInstanceLock: () => false,
        quit,
        on,
      },
      jest.fn()
    );

    expect(hasLock).toBe(false);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(on).not.toHaveBeenCalled();
  });

  it('registers second-instance handling when the lock is acquired', () => {
    const on = jest.fn();
    const callback = jest.fn();

    const hasLock = setupSingleInstanceGuard(
      {
        requestSingleInstanceLock: () => true,
        quit: jest.fn(),
        on,
      },
      callback
    );

    expect(hasLock).toBe(true);
    expect(on).toHaveBeenCalledWith('second-instance', callback);
  });
});
