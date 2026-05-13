import { parseChatIpcContext } from '../src/main/security/chat-ipc-context';
import {
  buildIdeContextSnapshotFromChatIpc,
  resolveOpenFilesForAgent,
  resolveCurrentFileForAgent,
} from '../src/main/agent/ide-context-bridge';
import { appendIdeContextToUserTask } from '../src/main/agent/ide-context-format';

describe('parseChatIpcContext', () => {
  it('accepts agent_run_context with open tabs and active file', () => {
    const parsed = parseChatIpcContext({
      use_agent_loop: true,
      agent_run_context: {
        workspace_path_relay: '/ws',
        open_tabs: [{ path: 'a.ts', language: 'typescript', is_dirty: true }],
        active_file: { path: 'a.ts', cursor_line: 3, selected_text: 'foo' },
        folder_tree: { tree: [] },
      },
    });
    expect(parsed.agent_run_context?.workspace_path_relay).toBe('/ws');
    expect(parsed.agent_run_context?.open_tabs).toHaveLength(1);
    expect(parsed.agent_run_context?.active_file?.path).toBe('a.ts');
  });

  it('drops oversized folder_tree without discarding safe agent flags', () => {
    const huge = { x: 'y'.repeat(500_000) };
    const parsed = parseChatIpcContext({
      use_agent_loop: true,
      agent_mode: true,
      agent_run_context: { folder_tree: huge },
    });
    expect(parsed.use_agent_loop).toBe(true);
    expect(parsed.agent_mode).toBe(true);
    expect(parsed.agent_run_context?.folder_tree).toBeUndefined();
  });

  it('accepts diagnostics and git status in agent_run_context', () => {
    const parsed = parseChatIpcContext({
      agent_run_context: {
        diagnostics: [{
          filePath: 'src/app.ts',
          line: 4,
          column: 2,
          message: 'Type mismatch',
          severity: 'error',
          source: 'typescript',
          ruleId: '2322',
          origin: 'language',
        }],
        git_status: 'branch: main, modified: 1',
      },
    });

    expect(parsed.agent_run_context?.diagnostics?.[0].message).toBe('Type mismatch');
    expect(parsed.agent_run_context?.git_status).toContain('branch: main');
  });
});

describe('ide-context-bridge', () => {
  it('maps IPC payload to IdeContextSnapshot', () => {
    const ctx = parseChatIpcContext({
      agent_run_context: {
        open_tabs: [{ path: 'src/x.tsx' }],
        active_file: { path: 'src/x.tsx', content: 'export {}' },
      },
    });
    const snap = buildIdeContextSnapshotFromChatIpc(ctx);
    expect(snap?.openTabs?.[0].path).toBe('src/x.tsx');
    expect(snap?.activeFile?.content).toBe('export {}');
  });

  it('maps diagnostics and git status to IdeContextSnapshot', () => {
    const ctx = parseChatIpcContext({
      agent_run_context: {
        diagnostics: [{
          filePath: 'src/x.ts',
          line: 1,
          column: 1,
          message: 'Broken',
          severity: 'error',
        }],
        git_status: 'branch: feature',
      },
    });
    const snap = buildIdeContextSnapshotFromChatIpc(ctx);
    expect(snap?.diagnostics?.[0].message).toBe('Broken');
    expect(snap?.gitStatus).toBe('branch: feature');
  });

  it('resolveOpenFilesForAgent prefers open_files then tabs', () => {
    const a = parseChatIpcContext({ open_files: ['/a', '/b'] });
    expect(resolveOpenFilesForAgent(a)).toEqual(['/a', '/b']);

    const b = parseChatIpcContext({
      agent_run_context: { open_tabs: [{ path: '/c' }] },
    });
    expect(resolveOpenFilesForAgent(b)).toEqual(['/c']);
  });

  it('resolveCurrentFileForAgent uses nested active_file', () => {
    const ctx = parseChatIpcContext({
      agent_run_context: { active_file: { path: 'z.go' } },
    });
    expect(resolveCurrentFileForAgent(ctx, () => null)).toBe('z.go');
  });
});

describe('appendIdeContextToUserTask', () => {
  it('appends IDE block when snapshot present', () => {
    const out = appendIdeContextToUserTask('do thing', {
      openTabs: [{ path: 'p.ts' }],
    });
    expect(out).toContain('do thing');
    expect(out).toContain('IDE_CONTEXT');
    expect(out).toContain('p.ts');
  });

  it('includes diagnostics and git status in the IDE block', () => {
    const out = appendIdeContextToUserTask('fix this', {
      gitStatus: 'branch: main',
      diagnostics: [{
        filePath: 'src/app.ts',
        line: 2,
        column: 3,
        message: 'Cannot find name',
        severity: 'error',
        source: 'typescript',
        ruleId: '2304',
      }],
    });
    expect(out).toContain('Git status');
    expect(out).toContain('Cannot find name');
  });
});
