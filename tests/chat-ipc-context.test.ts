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

  it('rejects oversized folder_tree', () => {
    const huge = { x: 'y'.repeat(500_000) };
    const parsed = parseChatIpcContext({
      agent_run_context: { folder_tree: huge },
    });
    expect(parsed.agent_run_context).toBeUndefined();
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
});
