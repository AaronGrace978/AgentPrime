/**
 * MessageList - Displays chat messages with avatars
 * 
 * Enhanced with:
 * - Code block detection and syntax highlighting
 * - Apply/Copy buttons for code changes
 * - Inline diff preview support
 */

import React, { memo, useState, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Message } from '../types';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  agentRunning: boolean;
  onApplyCode?: (code: string, filePath?: string) => void;
}

// Extract code blocks from message content
interface CodeBlock {
  language: string;
  code: string;
  filePath?: string;
}

function extractCodeBlocks(content: string): { blocks: CodeBlock[]; text: string } {
  const blocks: CodeBlock[] = [];
  const codeBlockRegex = /```(\w+)?(?::([^\n]+))?\n([\s\S]*?)```/g;
  
  let match;
  let lastIndex = 0;
  let textParts: string[] = [];
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before the code block
    if (match.index > lastIndex) {
      textParts.push(content.substring(lastIndex, match.index));
    }
    
    const language = match[1] || 'text';
    const filePath = match[2];
    const code = match[3].trim();
    
    blocks.push({ language, code, filePath });
    textParts.push(`{{CODE_BLOCK_${blocks.length - 1}}}`);
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    textParts.push(content.substring(lastIndex));
  }
  
  return { blocks, text: textParts.join('') };
}

// Code block component with Apply/Copy buttons
interface CodeBlockRendererProps {
  block: CodeBlock;
  onApply?: (code: string, filePath?: string) => void;
}

const CodeBlockRenderer = memo(({ block, onApply }: CodeBlockRendererProps) => {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(block.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [block.code]);

  const handleApply = useCallback(() => {
    onApply?.(block.code, block.filePath);
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  }, [block.code, block.filePath, onApply]);

  return (
    <div style={{
      margin: '12px 0',
      borderRadius: '8px',
      overflow: 'hidden',
      border: '1px solid var(--prime-border)',
      background: 'var(--editor-bg)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'var(--bg-tertiary)',
        borderBottom: '1px solid var(--prime-border)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{
            fontSize: '11px',
            fontWeight: '600',
            color: 'var(--prime-text-muted)',
            textTransform: 'uppercase'
          }}>
            {block.language}
          </span>
          {block.filePath && (
            <span style={{
              fontSize: '11px',
              color: 'var(--prime-text-secondary)',
              fontFamily: 'monospace'
            }}>
              {block.filePath}
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={handleCopy}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: '500',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              background: copied ? 'var(--prime-success)' : 'var(--bg-hover)',
              color: copied ? 'white' : 'var(--prime-text-muted)',
              transition: 'all 0.2s'
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          
          {onApply && (
            <button
              onClick={handleApply}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: '500',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                background: applied ? 'var(--prime-success)' : 'var(--prime-accent)',
                color: 'white',
                transition: 'all 0.2s'
              }}
            >
              {applied ? 'Applied' : 'Apply'}
            </button>
          )}
        </div>
      </div>
      
      {/* Code content */}
      <pre style={{
        margin: 0,
        padding: '12px',
        overflow: 'auto',
        maxHeight: '400px',
        fontSize: '12px',
        lineHeight: '1.5',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        color: 'var(--text-primary)'
      }}>
        <code>{block.code}</code>
      </pre>
    </div>
  );
});

// Simple markdown renderer for links and basic formatting
const renderMarkdown = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  
  // Match markdown links: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  let key = 0;
  
  while ((match = linkRegex.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${key++}`}>
          {text.substring(lastIndex, match.index)}
        </span>
      );
    }
    
    // Add the link
    const linkText = match[1];
    const linkUrl = match[2];
    parts.push(
      <a
        key={`link-${key++}`}
        href={linkUrl}
        onClick={async (e) => {
          e.preventDefault();
          // Handle file path links - check for launch parameter
          if (linkUrl && !linkUrl.startsWith('http')) {
            // Parse launch parameter from path like "G:\path?launch=true"
            const launchMatch = linkUrl.match(/\?launch=true/);
            const shouldLaunch = launchMatch !== null;
            const projectPath = linkUrl.replace(/\?launch=true$/, '');
            
            if (shouldLaunch) {
              // Launch the project
              try {
                // @ts-ignore - window.agentAPI is injected by preload
                const result = await window.agentAPI.launchProject(projectPath);
                if (result && result.success) {
                  console.log('Project launched:', result.message);
                  if (result.url) {
                    // URL will be opened automatically by the backend
                  }
                } else {
                  alert(`Failed to launch project: ${result?.error || 'Unknown error'}`);
                }
              } catch (err: any) {
                console.error('Failed to launch project:', err);
                alert(`Failed to launch project: ${err.message || err}`);
              }
            } else {
              // Just open folder
              try {
                // @ts-ignore - window.agentAPI is injected by preload
                const result = await window.agentAPI.openFolder();
                if (result && result.success) {
                  console.log('Opened folder:', result.path);
                }
              } catch (err) {
                console.error('Failed to open folder:', err);
              }
            }
          } else {
            // Regular URL
            window.open(linkUrl, '_blank');
          }
        }}
        style={{
          color: 'var(--prime-blue)',
          textDecoration: 'underline',
          cursor: 'pointer'
        }}
      >
        {linkText}
      </a>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${key++}`}>
        {text.substring(lastIndex)}
      </span>
    );
  }
  
  // If no links found, return original text
  if (parts.length === 0) {
    return text;
  }
  
  return <>{parts}</>;
};

interface MessageBubbleProps {
  message: Message;
  onApplyCode?: (code: string, filePath?: string) => void;
}

const MessageBubble = memo(({ message, onApplyCode }: MessageBubbleProps) => {
  // Check if message contains completion marker
  const isCompletion = message.content.includes("Job's Done");
  const footerMetadata =
    message.role === 'assistant'
      ? [
          message.metadata?.assistantBehaviorProfile === 'vibecoder' ? 'VibeCoder' : null,
          message.metadata?.providerLabel || null,
          message.metadata?.modelLabel || null,
          message.metadata?.viaFallback ? 'Fallback' : null,
        ].filter(Boolean).join(' · ')
      : '';
  
  // Extract code blocks from assistant messages
  const { blocks, text } = message.role === 'assistant' 
    ? extractCodeBlocks(message.content)
    : { blocks: [], text: message.content };
  
  // Render text with code block placeholders replaced
  const renderContent = () => {
    if (blocks.length === 0) {
      return renderMarkdown(message.content);
    }
    
    const parts = text.split(/(\{\{CODE_BLOCK_\d+\}\})/g);
    
    return parts.map((part, i) => {
      const blockMatch = part.match(/\{\{CODE_BLOCK_(\d+)\}\}/);
      if (blockMatch) {
        const blockIndex = parseInt(blockMatch[1], 10);
        return (
          <CodeBlockRenderer 
            key={`code-${i}`} 
            block={blocks[blockIndex]}
            onApply={onApplyCode}
          />
        );
      }
      return <span key={`text-${i}`}>{renderMarkdown(part)}</span>;
    });
  };
  
  return (
    <div style={{
      marginBottom: '16px',
      display: 'flex',
      flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      gap: '10px'
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: message.role === 'user'
          ? `linear-gradient(135deg, var(--prime-accent) 0%, var(--accent-secondary) 100%)`
          : 'var(--prime-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        flexShrink: 0
      }}>
        {message.role === 'user' ? 'U' : 'A'}
      </div>
      <div style={{
        maxWidth: blocks.length > 0 ? '85%' : '70%',
        padding: isCompletion ? '20px 24px' : '14px 18px',
        borderRadius: '16px',
        background: isCompletion 
          ? 'var(--prime-accent-light)'
          : message.role === 'user'
            ? `linear-gradient(135deg, var(--prime-accent) 0%, var(--accent-secondary) 100%)`
            : 'var(--prime-surface)',
        color: message.role === 'user' ? 'white' : 'var(--prime-text)',
        whiteSpace: 'pre-wrap',
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        fontSize: '14px',
        lineHeight: '1.6',
        boxShadow: isCompletion
          ? 'var(--prime-shadow-md)'
          : message.role === 'user'
            ? 'var(--prime-shadow-md)'
            : 'var(--prime-shadow-sm)',
        border: isCompletion 
          ? `2px solid var(--prime-success)`
          : message.role === 'user' ? 'none' : '1px solid var(--prime-border)'
      }}>
        {renderContent()}
        {footerMetadata && (
          <div style={{
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '1px solid rgba(148, 163, 184, 0.18)',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.02em',
            color: 'var(--prime-text-muted)'
          }}>
            {footerMetadata}
          </div>
        )}
      </div>
    </div>
  );
});

const LoadingIndicator = memo(({ agentRunning }: { agentRunning: boolean }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 18px',
    color: 'var(--prime-text-secondary)',
    fontSize: '14px',
    fontWeight: '500',
    margin: '8px 0',
    background: 'var(--prime-surface)',
    borderRadius: '12px',
    border: '1px solid var(--prime-border)',
    maxWidth: '200px'
  }}>
    <div style={{
      width: '18px',
      height: '18px',
      border: '2px solid var(--prime-border)',
      borderTop: '2px solid var(--prime-accent)',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }} />
    <span>
      {agentRunning ? 'Working...' : 'Thinking...'}
    </span>
  </div>
));

const MessageListComponent: React.FC<MessageListProps> = ({
  messages,
  isLoading,
  agentRunning,
  onApplyCode
}) => {
  const computeKey = useCallback((index: number, item: Message) => {
    const t = item.timestamp instanceof Date ? item.timestamp.getTime() : 0;
    return `${t}-${index}-${item.role}`;
  }, []);

  const renderItem = useCallback((index: number, message: Message) => (
    <div style={{ padding: '0 20px' }}>
      <MessageBubble
        message={message}
        onApplyCode={onApplyCode}
      />
    </div>
  ), [onApplyCode]);

  const Footer = useCallback(() => (
    isLoading ? (
      <div style={{ padding: '0 20px 20px' }}>
        <LoadingIndicator agentRunning={agentRunning} />
      </div>
    ) : null
  ), [agentRunning, isLoading]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--prime-bg)'
      }}
    >
      <Virtuoso
        style={{ flex: 1 }}
        data={messages}
        computeItemKey={computeKey}
        initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
        followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
        increaseViewportBy={{ top: 400, bottom: 600 }}
        itemContent={renderItem}
        components={{
          Footer
        }}
      />

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export const MessageList = memo(MessageListComponent);

export default MessageList;

