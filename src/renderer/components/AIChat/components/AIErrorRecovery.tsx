/**
 * AIErrorRecovery - Beautiful error recovery UI for AI failures
 * Shows user-friendly error messages with retry options
 */

import React, { useState } from 'react';

export interface AIError {
  type:
    | 'network'
    | 'timeout'
    | 'rate_limit'
    | 'credits'
    | 'auth'
    | 'context_limit'
    | 'model'
    | 'unknown';
  message: string;
  originalMessage?: string;
  timestamp: Date;
}

export interface AIErrorRecoveryProps {
  error: AIError;
  onRetry: () => void;
  onDismiss?: () => void;
  onSwitchModel?: () => void;
  isRetrying?: boolean;
}

// Classify error from message
export function classifyAIError(errorMessage: string): AIError {
  const lowerMessage = errorMessage.toLowerCase();

  if (
    lowerMessage.includes('401') ||
    lowerMessage.includes('403') ||
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('authentication failed') ||
    lowerMessage.includes('invalid api key') ||
    lowerMessage.includes('invalid key') ||
    lowerMessage.includes('api key not configured') ||
    lowerMessage.includes('incorrect api key')
  ) {
    return {
      type: 'auth',
      message: 'API key or sign-in problem',
      originalMessage: errorMessage,
      timestamp: new Date()
    };
  }

  if (
    lowerMessage.includes('context length') ||
    lowerMessage.includes('maximum context') ||
    lowerMessage.includes('token limit') ||
    lowerMessage.includes('too many tokens') ||
    lowerMessage.includes('prompt is too long') ||
    lowerMessage.includes('context window') ||
    lowerMessage.includes('exceeds the context') ||
    lowerMessage.includes('input is too long')
  ) {
    return {
      type: 'context_limit',
      message: 'Conversation or prompt is too long for this model',
      originalMessage: errorMessage,
      timestamp: new Date()
    };
  }

  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('econnreset') ||
    lowerMessage.includes('enotfound') ||
    lowerMessage.includes('enetunreach') ||
    lowerMessage.includes('eai_again') ||
    lowerMessage.includes('socket hang up') ||
    lowerMessage.includes('getaddrinfo') ||
    lowerMessage.includes('offline') ||
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('network error')
  ) {
    return {
      type: 'network',
      message: 'Unable to connect to AI service',
      originalMessage: errorMessage,
      timestamp: new Date()
    };
  }
  
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return {
      type: 'timeout',
      message: 'Request timed out',
      originalMessage: errorMessage,
      timestamp: new Date()
    };
  }
  
  if (
    lowerMessage.includes('rate') ||
    lowerMessage.includes('429') ||
    lowerMessage.includes('too many requests')
  ) {
    return {
      type: 'rate_limit',
      message: 'Too many requests - please wait',
      originalMessage: errorMessage,
      timestamp: new Date()
    };
  }
  
  if (
    lowerMessage.includes('credit') ||
    lowerMessage.includes('billing') ||
    lowerMessage.includes('insufficient') ||
    lowerMessage.includes('quota')
  ) {
    return {
      type: 'credits',
      message: 'API credits exhausted',
      originalMessage: errorMessage,
      timestamp: new Date()
    };
  }
  
  if (
    lowerMessage.includes('model') ||
    lowerMessage.includes('not found') ||
    lowerMessage.includes('unavailable') ||
    lowerMessage.includes('503') ||
    lowerMessage.includes('502') ||
    lowerMessage.includes('overloaded') ||
    lowerMessage.includes('bad gateway')
  ) {
    return {
      type: 'model',
      message: 'AI model unavailable',
      originalMessage: errorMessage,
      timestamp: new Date()
    };
  }
  
  return {
    type: 'unknown',
    message: 'Something went wrong',
    originalMessage: errorMessage,
    timestamp: new Date()
  };
}

// Get error details based on type
function getErrorDetails(type: AIError['type']): { 
  icon: React.ReactNode; 
  title: string; 
  suggestion: string;
  color: string;
} {
  switch (type) {
    case 'network':
      return {
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
          </svg>
        ),
        title: 'Connection Lost',
        suggestion: 'Check your internet connection or Ollama server',
        color: 'var(--prime-warning)'
      };
    case 'timeout':
      return {
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12,6 12,12 16,14"/>
          </svg>
        ),
        title: 'Request Timed Out',
        suggestion: 'The AI is taking too long. Try a simpler request or retry',
        color: 'var(--prime-warning)'
      };
    case 'rate_limit':
      return {
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        ),
        title: 'Rate Limited',
        suggestion: 'Wait a moment before trying again',
        color: 'var(--prime-amber)'
      };
    case 'credits':
      return {
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
            <line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
        ),
        title: 'Credits Exhausted',
        suggestion: 'Add credits to your API account or use a local model',
        color: 'var(--prime-error)'
      };
    case 'auth':
      return {
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        ),
        title: 'Authentication',
        suggestion: 'Check API keys in Settings, or sign in again for cloud providers',
        color: 'var(--prime-error)'
      };
    case 'context_limit':
      return {
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="8" y1="13" x2="16" y2="13"/>
            <line x1="8" y1="17" x2="14" y2="17"/>
          </svg>
        ),
        title: 'Context Too Large',
        suggestion: 'Start a new chat, clear history, or attach less code',
        color: 'var(--prime-warning)'
      };
    case 'model':
      return {
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        ),
        title: 'Model Unavailable',
        suggestion: 'The selected AI model is not available. Try switching models',
        color: 'var(--prime-warning)'
      };
    default:
      return {
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        ),
        title: 'Something Went Wrong',
        suggestion: 'Try again or rephrase your request',
        color: 'var(--prime-error)'
      };
  }
}

const AIErrorRecovery: React.FC<AIErrorRecoveryProps> = ({
  error,
  onRetry,
  onDismiss,
  onSwitchModel,
  isRetrying = false
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const details = getErrorDetails(error.type);

  return (
    <div className="ai-error-recovery">
      <div className="ai-error-header" style={{ '--error-color': details.color } as React.CSSProperties}>
        <div className="ai-error-icon" style={{ color: details.color }}>
          {details.icon}
        </div>
        <div className="ai-error-content">
          <h4 className="ai-error-title">{details.title}</h4>
          <p className="ai-error-message">{error.message}</p>
        </div>
      </div>

      <p className="ai-error-suggestion">{details.suggestion}</p>

      <div className="ai-error-actions">
        <button 
          className="ai-error-btn primary"
          onClick={onRetry}
          disabled={isRetrying}
        >
          {isRetrying ? (
            <>
              <span className="ai-error-spinner">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="40" strokeDashoffset="10" />
                </svg>
              </span>
              Retrying...
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23,4 23,10 17,10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Try Again
            </>
          )}
        </button>

        {(error.type === 'model' || error.type === 'context_limit') && onSwitchModel && (
          <button className="ai-error-btn secondary" onClick={onSwitchModel}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16,3 21,3 21,8"/>
              <line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21,16 21,21 16,21"/>
              <line x1="15" y1="15" x2="21" y2="21"/>
              <line x1="4" y1="4" x2="9" y2="9"/>
            </svg>
            Switch Model
          </button>
        )}

        {onDismiss && (
          <button className="ai-error-btn ghost" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>

      {error.originalMessage && (
        <div className="ai-error-details-section">
          <button 
            className="ai-error-details-toggle"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? 'Hide' : 'Show'} technical details
            <svg 
              viewBox="0 0 24 24" 
              width="14" 
              height="14" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              className={showDetails ? 'open' : ''}
            >
              <polyline points="6,9 12,15 18,9"/>
            </svg>
          </button>
          {showDetails && (
            <pre className="ai-error-details">{error.originalMessage}</pre>
          )}
        </div>
      )}
    </div>
  );
};

export default AIErrorRecovery;

