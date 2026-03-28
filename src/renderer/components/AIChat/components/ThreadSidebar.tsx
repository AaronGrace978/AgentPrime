/**
 * ThreadSidebar — Durable chat thread list and management
 * 
 * Shows all past conversations, allows switching between them,
 * creating new threads, renaming and deleting. Conversations
 * persist across app restarts.
 */

import React, { useState, useEffect, useCallback } from 'react';

interface ThreadSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  preview: string;
  model?: string;
}

interface ThreadSidebarProps {
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  visible: boolean;
  onClose: () => void;
}

const ThreadSidebar: React.FC<ThreadSidebarProps> = ({
  activeThreadId,
  onSelectThread,
  onNewThread,
  visible,
  onClose,
}) => {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const loadThreads = useCallback(async () => {
    try {
      const result = await (window as any).agentAPI.threadsList();
      if (result.success) {
        setThreads(result.threads);
      }
    } catch (e) {
      console.error('Failed to load threads:', e);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadThreads();
    }
  }, [visible, loadThreads]);

  const deleteThread = useCallback(async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this conversation?')) {
      await (window as any).agentAPI.threadsDelete(threadId);
      loadThreads();
    }
  }, [loadThreads]);

  const filteredThreads = searchQuery
    ? threads.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.preview.toLowerCase().includes(searchQuery.toLowerCase()))
    : threads;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (!visible) return null;

  return (
    <div style={{
      width: '280px',
      height: '100%',
      background: 'var(--prime-bg)',
      borderRight: '1px solid var(--prime-border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--prime-border)',
      }}>
        <span style={{ fontWeight: 600, fontSize: '13px', flex: 1 }}>Conversations</span>
        <button
          onClick={onNewThread}
          style={{
            padding: '4px 12px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--prime-accent)',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + New
        </button>
        <button onClick={onClose} style={{
          background: 'none',
          border: 'none',
          color: 'var(--prime-text-muted)',
          cursor: 'pointer',
          fontSize: '14px',
        }}>
          x
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search conversations..."
          style={{
            width: '100%',
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid var(--prime-border)',
            background: 'var(--prime-surface)',
            color: 'var(--prime-text)',
            fontSize: '12px',
            outline: 'none',
          }}
        />
      </div>

      {/* Thread list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px' }}>
        {filteredThreads.length === 0 && (
          <div style={{
            padding: '24px 12px',
            textAlign: 'center',
            color: 'var(--prime-text-muted)',
            fontSize: '12px',
          }}>
            {searchQuery ? 'No matching conversations' : 'No conversations yet'}
          </div>
        )}

        {filteredThreads.map((thread) => (
          <div
            key={thread.id}
            onClick={() => onSelectThread(thread.id)}
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              marginBottom: '2px',
              background: thread.id === activeThreadId ? 'var(--prime-accent-glow)' : 'transparent',
              borderLeft: thread.id === activeThreadId ? '2px solid var(--prime-accent)' : '2px solid transparent',
              transition: 'all 0.1s',
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}>
              <span style={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--prime-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {thread.title}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <span style={{
                  fontSize: '10px',
                  color: 'var(--prime-text-muted)',
                }}>
                  {formatDate(thread.updatedAt)}
                </span>
                <button
                  onClick={(e) => deleteThread(thread.id, e)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--prime-text-muted)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '0 2px',
                    opacity: 0.5,
                  }}
                >
                  x
                </button>
              </div>
            </div>
            <div style={{
              fontSize: '11px',
              color: 'var(--prime-text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: '2px',
            }}>
              {thread.preview || 'Empty conversation'}
            </div>
            <div style={{
              display: 'flex',
              gap: '6px',
              marginTop: '4px',
            }}>
              <span style={{
                fontSize: '10px',
                color: 'var(--prime-text-muted)',
              }}>
                {thread.messageCount} messages
              </span>
              {thread.model && (
                <span style={{
                  fontSize: '9px',
                  color: 'var(--prime-accent)',
                  background: 'var(--prime-accent-glow)',
                  padding: '0 4px',
                  borderRadius: '3px',
                  fontWeight: 600,
                }}>
                  {thread.model}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ThreadSidebar;
