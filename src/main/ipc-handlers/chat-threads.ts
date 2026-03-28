/**
 * Chat Threads — Durable, persistent conversation threads
 * 
 * Stores and restores full chat threads across restarts.
 * Each thread is a separate JSON file for reliability.
 * This is what makes AgentPrime feel like a real IDE — your
 * conversations never disappear.
 */

import { IpcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  workspacePath?: string;
  model?: string;
  tags?: string[];
}

interface ThreadSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  preview: string;
  model?: string;
}

function getThreadsDir(): string {
  const dir = path.join(app.getPath('userData'), 'chat-threads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getThreadPath(threadId: string): string {
  return path.join(getThreadsDir(), `${threadId}.json`);
}

function generateId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (firstUser) {
    const text = firstUser.content.replace(/\n/g, ' ').trim();
    return text.length > 60 ? text.substring(0, 57) + '...' : text;
  }
  return `Chat ${new Date().toLocaleDateString()}`;
}

export function registerChatThreadHandlers(deps: { ipcMain: IpcMain; getWorkspacePath: () => string | null }): void {
  const { ipcMain, getWorkspacePath } = deps;

  ipcMain.handle('threads:list', async () => {
    try {
      const dir = getThreadsDir();
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

      const summaries: ThreadSummary[] = [];
      for (const file of files) {
        try {
          const thread: ChatThread = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
          const lastMessage = thread.messages[thread.messages.length - 1];
          summaries.push({
            id: thread.id,
            title: thread.title,
            messageCount: thread.messages.length,
            createdAt: thread.createdAt,
            updatedAt: thread.updatedAt,
            preview: lastMessage ? lastMessage.content.substring(0, 80) : '',
            model: thread.model,
          });
        } catch {
          // Skip corrupted files
        }
      }

      summaries.sort((a, b) => b.updatedAt - a.updatedAt);
      return { success: true, threads: summaries };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('threads:get', async (_event, threadId: string) => {
    try {
      const threadPath = getThreadPath(threadId);
      if (!fs.existsSync(threadPath)) {
        return { success: false, error: 'Thread not found' };
      }
      const thread: ChatThread = JSON.parse(fs.readFileSync(threadPath, 'utf-8'));
      return { success: true, thread };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('threads:create', async (_event, options?: { title?: string; model?: string }) => {
    const id = generateId();
    const thread: ChatThread = {
      id,
      title: options?.title || 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workspacePath: getWorkspacePath() || undefined,
      model: options?.model,
      tags: [],
    };

    fs.writeFileSync(getThreadPath(id), JSON.stringify(thread, null, 2));
    return { success: true, thread };
  });

  ipcMain.handle('threads:addMessage', async (_event, threadId: string, message: ChatMessage) => {
    try {
      const threadPath = getThreadPath(threadId);
      if (!fs.existsSync(threadPath)) {
        return { success: false, error: 'Thread not found' };
      }

      const thread: ChatThread = JSON.parse(fs.readFileSync(threadPath, 'utf-8'));
      thread.messages.push({ ...message, timestamp: message.timestamp || Date.now() });
      thread.updatedAt = Date.now();

      if (thread.title === 'New Chat' && thread.messages.length >= 1) {
        thread.title = generateTitle(thread.messages);
      }

      fs.writeFileSync(threadPath, JSON.stringify(thread, null, 2));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('threads:delete', async (_event, threadId: string) => {
    try {
      const threadPath = getThreadPath(threadId);
      if (fs.existsSync(threadPath)) {
        fs.unlinkSync(threadPath);
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('threads:rename', async (_event, threadId: string, newTitle: string) => {
    try {
      const threadPath = getThreadPath(threadId);
      const thread: ChatThread = JSON.parse(fs.readFileSync(threadPath, 'utf-8'));
      thread.title = newTitle;
      thread.updatedAt = Date.now();
      fs.writeFileSync(threadPath, JSON.stringify(thread, null, 2));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('[ChatThreads] Durable chat thread handlers registered');
}
