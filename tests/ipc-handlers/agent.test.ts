import { EventEmitter } from 'events';
import * as path from 'path';
import { register } from '../../src/main/ipc-handlers/agent';

const spawnMock = jest.fn();

jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

type RegisteredHandler = (...args: any[]) => Promise<any>;

function createMockChild(exitCode = 0, stdout = '', stderr = '') {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: jest.Mock;
  };

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();

  process.nextTick(() => {
    if (stdout) {
      child.stdout.emit('data', Buffer.from(stdout));
    }
    if (stderr) {
      child.stderr.emit('data', Buffer.from(stderr));
    }
    child.emit('close', exitCode);
  });

  return child;
}

describe('agent IPC handler', () => {
  const workspacePath = path.resolve('G:/AgentPrime');
  let handlers: Map<string, RegisteredHandler>;

  beforeEach(() => {
    handlers = new Map();
    spawnMock.mockReset();

    register({
      ipcMain: {
        handle: (channel: string, handler: RegisteredHandler) => {
          handlers.set(channel, handler);
        },
      },
      getWorkspacePath: () => workspacePath,
    });
  });

  it('rejects run-command cwd values that escape the workspace', async () => {
    const runCommand = handlers.get('agent:run-command');
    expect(runCommand).toBeDefined();

    const result = await runCommand!({} as any, 'npm test', '..\\..\\outside', 1);

    expect(result).toMatchObject({
      success: false,
    });
    expect(result.error).toMatch(/Invalid working directory|outside of workspace/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('executes run-command inside a validated workspace subdirectory', async () => {
    const runCommand = handlers.get('agent:run-command');
    expect(runCommand).toBeDefined();

    spawnMock.mockImplementation((_shell: string, _args: string[], options: { cwd: string }) => {
      expect(options.cwd).toBe(path.resolve(workspacePath, 'src'));
      return createMockChild(0, 'ok');
    });

    const result = await runCommand!({} as any, 'npm test', 'src', 1);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      command: 'npm test',
      cwd: 'src',
      stdout: 'ok',
      stderr: '',
      exit_code: 0,
    });
  });

  it('rejects empty agent commands before spawning a shell', async () => {
    const runCommand = handlers.get('agent:run-command');
    expect(runCommand).toBeDefined();

    const result = await runCommand!({} as any, '   ', 'src', 1);

    expect(result).toMatchObject({
      success: false,
    });
    expect(result.error).toMatch(/Invalid command|must not be empty/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects legacy run-command requests with shell control operators', async () => {
    const runCommand = handlers.get('run-command');
    expect(runCommand).toBeDefined();

    const result = await runCommand!({} as any, 'npm test && echo hacked');

    expect(result).toMatchObject({
      success: false,
    });
    expect(result.error).toMatch(/Invalid command|disallowed shell control operators/);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
