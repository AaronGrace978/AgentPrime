import React, { useState, useRef, useEffect, useCallback } from 'react';

// @ts-ignore - window.agentAPI is injected by preload script
declare const window: any;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface JustChatProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional session ID to load chat history */
  initialSessionId?: string;
}

/** Simple markdown-to-html for chat messages */
function renderMarkdownInline(text: string): string {
  return text
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
      `<pre class="jc-code-block"><code class="lang-${lang || 'text'}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim()}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="jc-inline-code">$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="jc-link" target="_blank" rel="noopener">$1</a>')
    // Line breaks (preserve newlines)
    .replace(/\n/g, '<br/>');
}

const CONVERSATION_STARTERS = [
  { icon: '💡', label: 'Brainstorm ideas', prompt: 'Help me brainstorm some creative project ideas' },
  { icon: '🧠', label: 'Explain a concept', prompt: 'Explain how neural networks work in simple terms' },
  { icon: '📝', label: 'Help me write', prompt: 'Help me draft a professional email about...' },
  { icon: '🎯', label: 'Career advice', prompt: 'What skills should I focus on as a developer in 2026?' },
];

const JustChat: React.FC<JustChatProps> = ({ isOpen, onClose, initialSessionId }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hey! 👋 This is just a chill chat - no coding, no tools, no agents. Just you and me talking. What's on your mind?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load session history when initialSessionId is provided
  useEffect(() => {
    if (!isOpen || !initialSessionId) return;
    const api = (window as any).agentAPI;
    if (!api?.getChatHistoryForSession) return;
    setLoadingSession(true);
    api.getChatHistoryForSession(initialSessionId)
      .then((result: { success: boolean; history?: Array<{ role: string; content: string; timestamp?: Date }> }) => {
        if (result.success && result.history && result.history.length > 0) {
          const loaded: ChatMessage[] = result.history.map((msg, i) => ({
            id: `session-${i}-${msg.role}`,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
          }));
          setMessages(loaded);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSession(false));
  }, [isOpen, initialSessionId]);

  // Setup streaming listener
  useEffect(() => {
    if (!isOpen) return;

    const handleStream = (data: any) => {
      if (data.content) {
        setStreamingContent(prev => prev + data.content);
      }
      if (data.done) {
        setIsStreaming(false);
      }
    };

    window.agentAPI?.onChatStream?.(handleStream);
    return () => {
      window.agentAPI?.removeChatStream?.();
    };
  }, [isOpen]);

  // When streaming finishes, push the full message
  useEffect(() => {
    if (!isStreaming && streamingContent) {
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: streamingContent,
        timestamp: new Date()
      }]);
      setStreamingContent('');
      setIsLoading(false);
    }
  }, [isStreaming, streamingContent]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);
    setStreamingContent('');
    setIsStreaming(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const agentAPI = (window as any).agentAPI;
      
      if (agentAPI && agentAPI.chat) {
        const result = await agentAPI.chat(currentInput, {
          use_agent_loop: false,
          agent_mode: false,
          just_chat_mode: true
        });
        
        // If streaming didn't fire (non-streaming provider), handle the response directly
        if (streamingContent === '' || !isStreaming) {
          let response = '';
          if (result?.success === false) {
            const errorDetail = result.error || 'Unknown error occurred';
            response = `Something went wrong: ${errorDetail}\n\nCheck your AI provider settings in **Settings > AI Assistant**.`;
          } else {
            response = result?.response || result?.content || result?.message || "Hmm, I'm having trouble responding. Try again?";
          }
          
          setIsStreaming(false);
          setStreamingContent('');
          setMessages(prev => [...prev, {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: response,
            timestamp: new Date()
          }]);
          setIsLoading(false);
        }
      } else {
        setIsStreaming(false);
        setStreamingContent('');
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: "I'd love to chat, but my AI connection seems offline right now. Check your API settings!",
          timestamp: new Date()
        }]);
        setIsLoading(false);
      }
    } catch (error: any) {
      setIsStreaming(false);
      setStreamingContent('');
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Oops! Something went wrong: ${error.message}. Let's try again?`,
        timestamp: new Date()
      }]);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: 'welcome-new',
      role: 'assistant',
      content: "Fresh start! What would you like to chat about?",
      timestamp: new Date()
    }]);
  };

  const handleStarter = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  const showStarters = messages.length <= 1 && !isLoading;

  return (
    <div className="just-chat-overlay" onClick={onClose}>
      <div className="just-chat-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="just-chat-header">
          <div className="just-chat-title">
            <div className="jc-header-icon">
              <span>💬</span>
            </div>
            <div className="jc-header-text">
              <h3>Just Chat</h3>
              <span className="just-chat-subtitle">No code, just vibes</span>
            </div>
          </div>
          <div className="just-chat-actions">
            <button onClick={clearChat} className="jc-header-btn" title="New conversation">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
            <button onClick={onClose} className="jc-header-btn close" title="Close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="just-chat-messages">
          {loadingSession && (
            <div className="jc-loading-session">
              <div className="jc-spinner" />
              <span>Loading conversation...</span>
            </div>
          )}

          {!loadingSession && messages.map((message) => (
            <div key={message.id} className={`jc-message ${message.role}`}>
              <div className="jc-avatar">
                {message.role === 'user' ? '👤' : '✨'}
              </div>
              <div className="jc-bubble">
                <div
                  className="jc-text"
                  dangerouslySetInnerHTML={{ __html: renderMarkdownInline(message.content) }}
                />
                <div className="jc-time">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {/* Streaming message */}
          {isStreaming && streamingContent && (
            <div className="jc-message assistant">
              <div className="jc-avatar">✨</div>
              <div className="jc-bubble">
                <div
                  className="jc-text"
                  dangerouslySetInnerHTML={{ __html: renderMarkdownInline(streamingContent) }}
                />
                <div className="jc-streaming-dot" />
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {isLoading && !streamingContent && (
            <div className="jc-message assistant">
              <div className="jc-avatar">✨</div>
              <div className="jc-bubble">
                <div className="jc-typing">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          {/* Conversation starters */}
          {showStarters && (
            <div className="jc-starters">
              {CONVERSATION_STARTERS.map((s, i) => (
                <button key={i} className="jc-starter" onClick={() => handleStarter(s.prompt)}>
                  <span className="jc-starter-icon">{s.icon}</span>
                  <span className="jc-starter-label">{s.label}</span>
                </button>
              ))}
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="jc-input-area">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="What's on your mind?"
            rows={1}
            disabled={isLoading}
          />
          <button 
            onClick={sendMessage} 
            disabled={!input.trim() || isLoading}
            className="jc-send-btn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        /* ========== JUST CHAT - ENHANCED ========== */

        .just-chat-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: jcFadeIn 0.2s ease;
        }

        @keyframes jcFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes jcSlideUp { from { opacity: 0; transform: translateY(24px) scale(0.97) } to { opacity: 1; transform: none } }

        .just-chat-container {
          width: 560px;
          max-width: 92vw;
          height: 680px;
          max-height: 85vh;
          background: #0c0f1a;
          border-radius: 20px;
          border: 1px solid rgba(99, 102, 241, 0.15);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04),
            0 24px 80px rgba(0, 0, 0, 0.6),
            0 0 120px rgba(99, 102, 241, 0.06);
          animation: jcSlideUp 0.3s ease;
        }

        /* Header */
        .just-chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, transparent 100%);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .just-chat-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .jc-header-icon {
          width: 36px; height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }
        .jc-header-text h3 {
          margin: 0; font-size: 15px; font-weight: 600; color: #f1f5f9;
        }
        .just-chat-subtitle {
          font-size: 11px; color: #64748b; font-weight: 400;
        }
        .just-chat-actions { display: flex; gap: 4px; }
        .jc-header-btn {
          width: 32px; height: 32px;
          border: none; border-radius: 8px;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .jc-header-btn:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
        .jc-header-btn.close:hover { background: rgba(239, 68, 68, 0.15); color: #ef4444; }

        /* Messages */
        .just-chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .just-chat-messages::-webkit-scrollbar { width: 5px; }
        .just-chat-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        .just-chat-messages::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

        .jc-message {
          display: flex;
          gap: 10px;
          max-width: 88%;
          animation: jcMsgIn 0.25s ease;
        }
        .jc-message.user { flex-direction: row-reverse; align-self: flex-end; }
        @keyframes jcMsgIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }

        .jc-avatar {
          width: 30px; height: 30px;
          border-radius: 50%;
          background: rgba(255,255,255,0.05);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; flex-shrink: 0;
          margin-top: 2px;
        }
        .jc-message.user .jc-avatar {
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
        }

        .jc-bubble {
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.6;
        }
        .jc-message.assistant .jc-bubble {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255,255,255,0.06);
          color: #e2e8f0;
          border-top-left-radius: 4px;
        }
        .jc-message.user .jc-bubble {
          background: linear-gradient(135deg, #4f46e5, #6366f1);
          color: white;
          border-top-right-radius: 4px;
        }

        .jc-text { word-break: break-word; }
        .jc-text strong { color: #c4b5fd; font-weight: 600; }
        .jc-message.user .jc-text strong { color: #e0e7ff; }
        .jc-text em { color: #a5b4fc; }

        .jc-inline-code {
          background: rgba(99, 102, 241, 0.15);
          color: #a5b4fc;
          padding: 1px 6px;
          border-radius: 4px;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 0.9em;
        }
        .jc-code-block {
          background: #0a0d16;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          padding: 12px;
          margin: 8px 0;
          overflow-x: auto;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 12px;
          line-height: 1.5;
          color: #e2e8f0;
        }
        .jc-code-block code { font-family: inherit; }
        .jc-link { color: #818cf8; text-decoration: underline; text-underline-offset: 2px; }
        .jc-link:hover { color: #a5b4fc; }

        .jc-time {
          font-size: 10px;
          color: #475569;
          margin-top: 6px;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .jc-message:hover .jc-time { opacity: 1; }
        .jc-message.user .jc-time { text-align: right; color: rgba(255,255,255,0.4); }

        /* Streaming indicator */
        .jc-streaming-dot {
          display: inline-block;
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #6366f1;
          margin-left: 4px;
          animation: jcPulse 1s infinite;
        }
        @keyframes jcPulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }

        /* Typing indicator */
        .jc-typing {
          display: flex;
          gap: 5px;
          padding: 4px 0;
        }
        .jc-typing span {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: #6366f1;
          animation: jcBounce 1.4s infinite;
        }
        .jc-typing span:nth-child(2) { animation-delay: 0.16s; }
        .jc-typing span:nth-child(3) { animation-delay: 0.32s; }
        @keyframes jcBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }

        /* Conversation starters */
        .jc-starters {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 8px;
          animation: jcFadeIn 0.4s ease 0.2s both;
        }
        .jc-starter {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 14px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          color: #94a3b8;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }
        .jc-starter:hover {
          background: rgba(99, 102, 241, 0.08);
          border-color: rgba(99, 102, 241, 0.2);
          color: #e2e8f0;
          transform: translateY(-1px);
        }
        .jc-starter-icon { font-size: 18px; }
        .jc-starter-label { font-weight: 500; }

        /* Loading session */
        .jc-loading-session {
          display: flex; align-items: center; gap: 10px;
          justify-content: center;
          padding: 20px;
          color: #64748b;
          font-size: 13px;
        }
        .jc-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(99, 102, 241, 0.2);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: jcSpin 0.8s linear infinite;
        }
        @keyframes jcSpin { to { transform: rotate(360deg) } }

        /* Input area */
        .jc-input-area {
          display: flex;
          gap: 10px;
          padding: 14px 16px;
          background: rgba(255,255,255,0.02);
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .jc-input-area textarea {
          flex: 1;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 10px 14px;
          color: #e2e8f0;
          font-size: 14px;
          font-family: inherit;
          resize: none;
          min-height: 20px;
          max-height: 120px;
          line-height: 1.4;
          transition: border-color 0.2s;
        }
        .jc-input-area textarea:focus {
          outline: none;
          border-color: rgba(99, 102, 241, 0.4);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }
        .jc-input-area textarea::placeholder { color: #475569; }

        .jc-send-btn {
          width: 40px; height: 40px;
          background: linear-gradient(135deg, #4f46e5, #6366f1);
          border: none;
          border-radius: 12px;
          color: white;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
          flex-shrink: 0;
          align-self: flex-end;
        }
        .jc-send-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #4338ca, #4f46e5);
          transform: scale(1.05);
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.3);
        }
        .jc-send-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default JustChat;
