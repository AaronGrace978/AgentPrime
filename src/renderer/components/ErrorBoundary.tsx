import React, { Component, ReactNode, useState, useEffect } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
  isRecovering: boolean;
}

// Animated error illustration component
const ErrorIllustration: React.FC = () => {
  return (
    <div className="error-illustration">
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Outer glow ring */}
        <circle cx="60" cy="60" r="55" className="error-glow-ring" />
        
        {/* Main circle background */}
        <circle cx="60" cy="60" r="48" className="error-circle-bg" />
        
        {/* Animated pulse ring */}
        <circle cx="60" cy="60" r="48" className="error-pulse-ring" />
        
        {/* Inner gradient circle */}
        <circle cx="60" cy="60" r="42" className="error-circle-inner" />
        
        {/* Warning icon */}
        <path 
          d="M60 35L85 78H35L60 35Z" 
          className="error-triangle"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Exclamation mark */}
        <line x1="60" y1="50" x2="60" y2="62" className="error-exclaim-line" strokeWidth="4" strokeLinecap="round" />
        <circle cx="60" cy="70" r="2.5" className="error-exclaim-dot" />
      </svg>
    </div>
  );
};

// Recovery animation component
const RecoverySpinner: React.FC = () => (
  <div className="recovery-spinner">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="40 20" className="spinner-track" />
    </svg>
  </div>
);

// Error type badge
const ErrorTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const getColor = () => {
    if (type.includes('Type')) return 'typescript';
    if (type.includes('Reference')) return 'reference';
    if (type.includes('Syntax')) return 'syntax';
    return 'generic';
  };
  
  return (
    <span className={`error-type-badge error-type-${getColor()}`}>
      {type}
    </span>
  );
};

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      isRecovering: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Log error (not to console in production)
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught:', error.name, '-', error.message);
    }

    // Call optional onError callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Store error log for debugging
    this.logError(error, errorInfo);
  }

  private logError = (error: Error, errorInfo: React.ErrorInfo) => {
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      componentStack: errorInfo.componentStack,
      url: window.location.href
    };

    try {
      const existingLogs = localStorage.getItem('errorBoundaryLogs');
      const logs = existingLogs ? JSON.parse(existingLogs) : [];
      logs.push(errorLog);
      
      // Keep only last 20 errors
      while (logs.length > 20) {
        logs.shift();
      }
      
      localStorage.setItem('errorBoundaryLogs', JSON.stringify(logs));
    } catch (e) {
      // Silently fail if localStorage is unavailable
    }
  };

  private handleReload = async () => {
    this.setState({ isRecovering: true });
    // Small delay for animation
    await new Promise(resolve => setTimeout(resolve, 400));
    window.location.reload();
  };

  private handleReset = async () => {
    this.setState({ isRecovering: true });
    await new Promise(resolve => setTimeout(resolve, 400));
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  private handleDismiss = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      isRecovering: false
    });
  };

  private toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  private getErrorSummary = (): { title: string; message: string; suggestion: string } => {
    const { error } = this.state;
    const errorName = error?.name || 'Error';
    const errorMessage = error?.message || 'An unexpected error occurred';

    // TypeScript errors
    if (errorName === 'TypeError' || errorMessage.includes('undefined') || errorMessage.includes('null')) {
      return {
        title: 'Something unexpected happened',
        message: 'A component tried to access something that doesn\'t exist.',
        suggestion: 'This usually fixes itself with a quick reload.'
      };
    }

    // Network errors
    if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')) {
      return {
        title: 'Connection hiccup',
        message: 'We had trouble connecting to a service.',
        suggestion: 'Check your internet connection and try again.'
      };
    }

    // Chunk loading errors (common in Webpack apps)
    if (errorMessage.includes('chunk') || errorMessage.includes('Loading chunk')) {
      return {
        title: 'App update detected',
        message: 'Some app files have been updated.',
        suggestion: 'A quick reload will get you the latest version.'
      };
    }

    // Syntax errors
    if (errorName === 'SyntaxError') {
      return {
        title: 'Code formatting issue',
        message: 'Something in the code isn\'t quite right.',
        suggestion: 'This is a bug we need to fix. Please report it!'
      };
    }

    // Default
    return {
      title: 'Oops! Something went wrong',
      message: 'An unexpected error occurred in the application.',
      suggestion: 'A reload usually fixes this. If it persists, try resetting.'
    };
  };

  private formatStack = (stack: string): string => {
    // Clean up the stack trace for better readability
    return stack
      .split('\n')
      .slice(0, 8) // Only show first 8 lines
      .map(line => line.trim())
      .join('\n');
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { title, message, suggestion } = this.getErrorSummary();
      const { error, errorInfo, showDetails, isRecovering } = this.state;

      return (
        <div className={`error-boundary ${isRecovering ? 'is-recovering' : ''}`}>
          <div className="error-boundary-backdrop" />
          
          <div className="error-boundary-content">
            <ErrorIllustration />
            
            <h2 className="error-boundary-title">{title}</h2>
            
            <p className="error-boundary-message">{message}</p>
            
            <p className="error-boundary-suggestion">
              💡 {suggestion}
            </p>

            <div className="error-boundary-actions">
              <button
                className="error-action-button primary"
                onClick={this.handleReload}
                disabled={isRecovering}
              >
                {isRecovering ? (
                  <>
                    <RecoverySpinner />
                    Reloading...
                  </>
                ) : (
                  <>
                    <span className="btn-icon">↻</span>
                    Reload App
                  </>
                )}
              </button>

              <button
                className="error-action-button secondary"
                onClick={this.handleDismiss}
                disabled={isRecovering}
              >
                <span className="btn-icon">←</span>
                Go Back
              </button>
            </div>

            <div className="error-boundary-footer">
              <button 
                className="error-details-toggle"
                onClick={this.toggleDetails}
                aria-expanded={showDetails}
              >
                <span className={`toggle-arrow ${showDetails ? 'open' : ''}`}>›</span>
                {showDetails ? 'Hide' : 'Show'} technical details
              </button>

              {showDetails && (
                <div className="error-details-panel">
                  <div className="error-details-header">
                    <ErrorTypeBadge type={error?.name || 'Error'} />
                    <span className="error-timestamp">
                      {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                  
                  <div className="error-details-content">
                    <div className="error-field">
                      <label>Message</label>
                      <code>{error?.message}</code>
                    </div>
                    
                    {error?.stack && (
                      <div className="error-field">
                        <label>Stack Trace</label>
                        <pre>{this.formatStack(error.stack)}</pre>
                      </div>
                    )}
                    
                    {errorInfo?.componentStack && (
                      <div className="error-field">
                        <label>Component Tree</label>
                        <pre>{errorInfo.componentStack.trim().slice(0, 500)}</pre>
                      </div>
                    )}
                  </div>

                  <div className="error-details-actions">
                    <button 
                      className="error-copy-button"
                      onClick={() => {
                        const text = `${error?.name}: ${error?.message}\n\n${error?.stack || ''}`;
                        navigator.clipboard.writeText(text);
                      }}
                    >
                      📋 Copy Error
                    </button>
                    
                    <button 
                      className="error-reset-button"
                      onClick={this.handleReset}
                    >
                      🔄 Reset & Reload
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Inline Error Display Component for non-critical errors
interface InlineErrorProps {
  error: Error | string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const InlineError: React.FC<InlineErrorProps> = ({ error, onRetry, onDismiss }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  
  const errorMessage = typeof error === 'string' ? error : error.message;
  
  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss?.();
    }, 200);
  };
  
  if (!isVisible) return null;
  
  return (
    <div className={`inline-error ${isExiting ? 'exiting' : ''}`}>
      <div className="inline-error-icon">⚠️</div>
      <div className="inline-error-content">
        <span className="inline-error-message">{errorMessage}</span>
      </div>
      <div className="inline-error-actions">
        {onRetry && (
          <button className="inline-error-retry" onClick={onRetry}>
            Retry
          </button>
        )}
        <button className="inline-error-dismiss" onClick={handleDismiss}>
          ×
        </button>
      </div>
    </div>
  );
};

// Hook for error handling in functional components
export const useErrorHandler = () => {
  const [error, setError] = useState<Error | null>(null);
  
  const handleError = (err: Error | string) => {
    const errorObj = typeof err === 'string' ? new Error(err) : err;
    setError(errorObj);
  };
  
  const clearError = () => setError(null);
  
  const withErrorHandling = async <T,>(
    fn: () => Promise<T>,
    fallback?: T
  ): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (err) {
      handleError(err as Error);
      return fallback;
    }
  };
  
  return { error, handleError, clearError, withErrorHandling };
};

// Auto-recovery hook for components that can self-heal
export const useAutoRecovery = (
  retryLimit: number = 3,
  retryDelay: number = 1000
) => {
  const [retryCount, setRetryCount] = useState(0);
  const [isRecovering, setIsRecovering] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  const attemptRecovery = useCallback(async (
    operation: () => Promise<void>,
    onSuccess?: () => void,
    onFailure?: (error: Error) => void
  ) => {
    if (retryCount >= retryLimit) {
      console.error('[AutoRecovery] Max retries exceeded');
      return false;
    }

    setIsRecovering(true);
    
    try {
      await operation();
      setRetryCount(0);
      setLastError(null);
      setIsRecovering(false);
      onSuccess?.();
      return true;
    } catch (err) {
      const error = err as Error;
      setLastError(error);
      setRetryCount(prev => prev + 1);
      
      console.warn(`[AutoRecovery] Attempt ${retryCount + 1}/${retryLimit} failed:`, error.message);
      
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
      setIsRecovering(false);
      
      if (retryCount + 1 >= retryLimit) {
        onFailure?.(error);
      }
      
      return false;
    }
  }, [retryCount, retryLimit, retryDelay]);

  const reset = useCallback(() => {
    setRetryCount(0);
    setLastError(null);
    setIsRecovering(false);
  }, []);

  return {
    retryCount,
    isRecovering,
    lastError,
    attemptRecovery,
    reset,
    canRetry: retryCount < retryLimit
  };
};

// Callback needs to be imported
const { useCallback } = React;

// Global error reporter for crash analytics
export const crashReporter = {
  errors: [] as Array<{
    timestamp: string;
    error: { name: string; message: string; stack?: string };
    context?: Record<string, any>;
  }>,

  report(error: Error, context?: Record<string, any>) {
    const entry = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context
    };

    this.errors.push(entry);
    
    // Keep only last 50 errors
    if (this.errors.length > 50) {
      this.errors.shift();
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[CrashReporter]', error.name, error.message, context);
    }

    // Persist to localStorage
    try {
      localStorage.setItem('agentprime-crash-log', JSON.stringify(this.errors));
    } catch (e) {
      // Storage full or unavailable
    }

    // Could send to analytics service in production
    // this.sendToAnalytics(entry);
  },

  getErrors() {
    return [...this.errors];
  },

  clearErrors() {
    this.errors = [];
    try {
      localStorage.removeItem('agentprime-crash-log');
    } catch (e) {
      // Ignore
    }
  },

  loadFromStorage() {
    try {
      const stored = localStorage.getItem('agentprime-crash-log');
      if (stored) {
        this.errors = JSON.parse(stored);
      }
    } catch (e) {
      // Ignore
    }
  }
};

// Initialize crash reporter
crashReporter.loadFromStorage();

// Global unhandled error listener
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    crashReporter.report(event.error || new Error(event.message), {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));
    crashReporter.report(error, { type: 'unhandledrejection' });
  });
}

export default ErrorBoundary;
