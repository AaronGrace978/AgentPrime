/**
 * AgentChat - Terminal-style chat interface for Agent Mode
 * Green monospace text on black, Matrix aesthetic
 */

import React, { useState, useRef, useEffect } from 'react';
import { AgentMessage, AgentAction } from './types';

interface AgentChatProps {
  messages: AgentMessage[];
  onSendMessage: (message: string) => void;
  isProcessing: boolean;
  pendingActions: AgentAction[];
  webSearchEnabled?: boolean;
  streamingContent?: string;
  isStreaming?: boolean;
}

const AgentChat: React.FC<AgentChatProps> = ({
  messages,
  onSendMessage,
  isProcessing,
  pendingActions,
  webSearchEnabled = false,
  streamingContent = '',
  isStreaming = false
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isProcessing) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const renderMessage = (message: AgentMessage) => {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';

    return (
      <div 
        key={message.id} 
        className={`agent-chat-message ${message.role}`}
      >
        <div className="message-header">
          <span className="message-role">
            {isUser ? '> USER' : isSystem ? '> SYSTEM' : '> AGENT'}
          </span>
          <span className="message-time">[{formatTime(message.timestamp)}]</span>
        </div>
        <div className="message-content">
          {message.content}
        </div>
        {message.actions && message.actions.length > 0 && (
          <div className="message-actions">
            {message.actions.map((action, idx) => (
              <div key={action.id} className="inline-action">
                <span className="action-bullet">▸</span>
                <span className="action-label">{action.action}:</span>
                <span className="action-value">
                  {Object.values(action.params).join(', ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="agent-chat">
      <div className="agent-chat-messages">
        {/* Welcome message */}
        {messages.length === 0 && (
          <div className="agent-chat-welcome">
            <div className="welcome-ascii">
{webSearchEnabled ? `
 ██╗    ██╗███████╗██████╗     █████╗  ██████╗ ███████╗███╗   ██╗████████╗
 ██║    ██║██╔════╝██╔══██╗   ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
 ██║ █╗ ██║█████╗  ██████╔╝   ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   
 ██║███╗██║██╔══╝  ██╔══██╗   ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   
 ╚███╔███╔╝███████╗██████╔╝   ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   
  ╚══╝╚══╝ ╚══════╝╚═════╝    ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   
` : `
  █████╗  ██████╗ ███████╗███╗   ██╗████████╗
 ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
 ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   
 ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   
 ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   
 ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   
`}
            </div>
            <p className="welcome-text">
              {webSearchEnabled 
                ? '🌐 WEB SEARCH MODE ENABLED - ASK ME ANYTHING!' 
                : 'MATRIX COMPUTER CONTROL INITIALIZED'}
            </p>
            <p className="welcome-hint">
              {webSearchEnabled 
                ? 'I can search the web to answer your questions...'
                : 'Control apps, launch games, automate your PC...'}
            </p>
            <div className="welcome-examples">
              {webSearchEnabled ? (
                <>
                  <span className="example" onClick={() => !isProcessing && onSendMessage("What's the weather in New York?")}>"What's the weather in New York?"</span>
                  <span className="example" onClick={() => !isProcessing && onSendMessage("Who won the latest Super Bowl?")}>"Who won the latest Super Bowl?"</span>
                  <span className="example" onClick={() => !isProcessing && onSendMessage("How do I center a div in CSS?")}>"How do I center a div in CSS?"</span>
                  <span className="example" onClick={() => !isProcessing && onSendMessage("What are the latest AI news?")}>"What are the latest AI news?"</span>
                </>
              ) : (
                <>
                  <span className="example" onClick={() => !isProcessing && onSendMessage("Open Chrome and go to GitHub")}>"Open Chrome and go to GitHub"</span>
                  <span className="example" onClick={() => !isProcessing && onSendMessage("Open Steam")}>"Open Steam"</span>
                  <span className="example" onClick={() => !isProcessing && onSendMessage("Open Spotify")}>"Open Spotify"</span>
                </>
              )}
            </div>
          </div>
        )}

        {messages.map(renderMessage)}

        {/* Streaming response */}
        {isStreaming && streamingContent && (
          <div className="agent-chat-message assistant streaming">
            <div className="message-header">
              <span className="message-role">&gt; AGENT</span>
              <span className="streaming-indicator">
                <span className="stream-dot"></span>
                STREAMING
              </span>
            </div>
            <div className="message-content">
              {streamingContent}
              <span className="stream-cursor">▌</span>
            </div>
          </div>
        )}

        {/* Processing indicator (when not streaming) */}
        {isProcessing && !isStreaming && (
          <div className="agent-chat-message assistant processing">
            <div className="message-header">
              <span className="message-role">&gt; AGENT</span>
              <span className="processing-indicator">
                <span className="dot">.</span>
                <span className="dot">.</span>
                <span className="dot">.</span>
              </span>
            </div>
            <div className="message-content">
              {webSearchEnabled ? 'Searching the web...' : 'Processing request...'}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="agent-chat-input-form">
        <span className="input-prompt">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isProcessing ? 'Processing...' : 'Enter command...'}
          disabled={isProcessing}
          className="agent-chat-input"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="input-cursor">█</span>
      </form>
    </div>
  );
};

export default AgentChat;
