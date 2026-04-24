import * as path from 'path';
import { AgentLoop, createAgent } from '../src/main/agent-loop';
import { parseToolCallsContent } from '../src/main/agent/tool-call-parser';
import { finalizeAgentTransactionForReview } from '../src/main/agent/transaction-finalization';

const baseContext = {
  workspacePath: path.resolve('G:/AgentPrime'),
  openFiles: [],
  terminalHistory: [],
};

describe('AgentLoop core paths', () => {
  it('creates an agent instance and merges context updates', () => {
    const agent = createAgent(baseContext as any);

    expect(agent).toBeInstanceOf(AgentLoop);

    (agent as any).updateContext({ currentFile: 'src/main.ts' });

    expect((agent as any).context.currentFile).toBe('src/main.ts');
  });

  it('refreshes IDE context in the system prompt across context updates', () => {
    const agent = createAgent({
      ...baseContext,
      ideContext: {
        activeFile: {
          path: 'src/old-file.ts',
          cursorLine: 3,
          cursorColumn: 1,
          language: 'typescript',
          content: 'export const oldValue = true;',
        },
        openTabs: [{ path: 'src/old-file.ts', isDirty: false, language: 'typescript' }],
      },
    } as any);

    (agent as any).syncIdeContextPrompt();

    let systemMessage = (agent as any).messages.find((message: any) => message.role === 'system');
    expect(systemMessage.content).toContain('Active file: src/old-file.ts');

    (agent as any).updateContext({
      ideContext: {
        activeFile: {
          path: 'src/new-file.ts',
          cursorLine: 9,
          cursorColumn: 4,
          language: 'typescript',
          content: 'export const newValue = true;',
        },
        openTabs: [{ path: 'src/new-file.ts', isDirty: true, language: 'typescript' }],
      },
    });

    systemMessage = (agent as any).messages.find((message: any) => message.role === 'system');
    expect(systemMessage.content).toContain('Active file: src/new-file.ts');
    expect(systemMessage.content).toContain('Cursor: L9:4');
    expect(systemMessage.content).toContain('src/new-file.ts (modified) [typescript]');
    expect(systemMessage.content).not.toContain('Active file: src/old-file.ts');
  });

  it('parses direct JSON tool calls', () => {
    const agent = new AgentLoop(baseContext as any);
    const calls = (agent as any).parseToolCalls(JSON.stringify({
      tool_calls: [
        {
          name: 'read_file',
          parameters: { path: 'src/main.ts' },
        },
      ],
    }));

    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('read_file');
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ path: 'src/main.ts' });
  });

  it('parses tool calls wrapped in markdown code fences', () => {
    const calls = parseToolCallsContent(
      '```json\n{"name":"read_file","parameters":{"path":"src/index.ts"}}\n```',
      ['read_file']
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('read_file');
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ path: 'src/index.ts' });
  });

  it('ignores unknown tool names while preserving allowed calls', () => {
    const calls = parseToolCallsContent(
      JSON.stringify({
        tool_calls: [
          { name: 'unknown_tool', parameters: { nope: true } },
          { name: 'read_file', parameters: { path: 'src/main.ts' } },
        ],
      }),
      ['read_file']
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('read_file');
  });

  it('falls back to smart write_file extraction for malformed JSON', () => {
    const agent = new AgentLoop(baseContext as any);
    const malformedResponse = `{
      "tool_calls": [
        {
          "name": "write_file",
          "parameters": {
            "path": "src/App.tsx",
            "content": "import React from \\"react\\";\\nexport default function App() { return <div>Hello</div>; }"
          }
        }
      ]`;

    const calls = (agent as any).parseToolCalls(malformedResponse);

    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('write_file');
    expect(JSON.parse(calls[0].function.arguments)).toMatchObject({
      path: 'src/App.tsx',
      content: expect.stringContaining('Hello'),
    });
  });

  it('treats malformed done responses as completion', () => {
    const agent = new AgentLoop(baseContext as any);

    const calls = (agent as any).parseToolCalls('{"done": true');

    expect(calls).toEqual([]);
  });

  it('builds a stop message that includes the user reason', () => {
    const agent = new AgentLoop(baseContext as any);

    agent.requestStop('Paused by user');
    const stopMessage = (agent as any).buildStopMessage();

    expect(stopMessage).toContain('Agent Stopped');
    expect(stopMessage).toContain('Paused by user');
  });
});

describe('Agent transaction finalization', () => {
  function createFakeTransaction(operations: Array<{
    path: string;
    originalContent: string | null;
    newContent: string;
    existed: boolean;
  }>) {
    return {
      getOperationCount: () => operations.length,
      getOperations: () => operations,
    };
  }

  it('stages review sessions and appends review guidance when rollback succeeds', async () => {
    const stagedReview = {
      sessionId: 'review_1',
      workspacePath: baseContext.workspacePath,
      createdAt: Date.now(),
      changes: [],
    };
    const rollbackTransaction = jest.fn().mockResolvedValue(undefined);
    const commitTransaction = jest.fn();

    const result = await finalizeAgentTransactionForReview(
      {
        getActiveTransaction: () => createFakeTransaction([
          {
            path: 'src/main.ts',
            originalContent: 'old',
            newContent: 'new',
            existed: true,
          },
        ]),
        rollbackTransaction,
        commitTransaction,
      },
      {
        createSessionFromOperations: jest.fn().mockReturnValue(stagedReview),
      },
      {
        workspacePath: baseContext.workspacePath,
        finalAnswer: 'done',
      }
    );

    expect(rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(commitTransaction).not.toHaveBeenCalled();
    expect(result.stagedReview).toBe(true);
    expect(result.pendingReviewSession).toBe(stagedReview);
    expect(result.finalAnswer).toContain('Review Required');
  });

  it('falls back to commit when staged-review rollback fails', async () => {
    const rollbackTransaction = jest.fn().mockRejectedValue(new Error('rollback failed'));
    const commitTransaction = jest.fn();

    const result = await finalizeAgentTransactionForReview(
      {
        getActiveTransaction: () => createFakeTransaction([
          {
            path: 'src/main.ts',
            originalContent: 'old',
            newContent: 'new',
            existed: true,
          },
        ]),
        rollbackTransaction,
        commitTransaction,
      },
      {
        createSessionFromOperations: jest.fn().mockReturnValue({
          sessionId: 'review_2',
          workspacePath: baseContext.workspacePath,
          createdAt: Date.now(),
          changes: [],
        }),
      },
      {
        workspacePath: baseContext.workspacePath,
        finalAnswer: 'done',
      }
    );

    expect(commitTransaction).toHaveBeenCalledTimes(1);
    expect(result.stagedReview).toBe(false);
    expect(result.pendingReviewSession).toBeNull();
    expect(result.finalAnswer).toBe('done');
  });

  it('commits directly when staged review is bypassed', async () => {
    const commitTransaction = jest.fn();

    const result = await finalizeAgentTransactionForReview(
      {
        getActiveTransaction: () => createFakeTransaction([]),
        rollbackTransaction: jest.fn(),
        commitTransaction,
      },
      {
        createSessionFromOperations: jest.fn(),
      },
      {
        workspacePath: baseContext.workspacePath,
        finalAnswer: 'done',
        monolithicApplyImmediately: true,
      }
    );

    expect(commitTransaction).toHaveBeenCalledTimes(1);
    expect(result.pendingReviewSession).toBeNull();
    expect(result.finalAnswer).toBe('done');
  });
});
