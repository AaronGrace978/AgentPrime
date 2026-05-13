import {
  createChatRequestId,
  getActiveChatControllerCountForTest,
  runWithTrackedChatController,
} from '../../src/main/ipc-handlers/chat';

describe('chat IPC lifecycle helpers', () => {
  it('creates collision-resistant chat request ids', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createChatRequestId()));

    expect(ids.size).toBe(20);
    for (const id of ids) {
      expect(id).toMatch(/^chat_/);
    }
  });

  it('cleans tracked controllers after successful work', async () => {
    await expect(
      runWithTrackedChatController('chat_test_success', new AbortController(), async () => 'ok')
    ).resolves.toBe('ok');

    expect(getActiveChatControllerCountForTest()).toBe(0);
  });

  it('cleans tracked controllers after failed work', async () => {
    await expect(
      runWithTrackedChatController('chat_test_failure', new AbortController(), async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(getActiveChatControllerCountForTest()).toBe(0);
  });
});
