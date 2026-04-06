/**
 * Skeleton - Loading placeholder components for AgentPrime
 * 
 * Provides consistent loading states throughout the app.
 */

import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  variant?: 'text' | 'title' | 'circle' | 'rect';
  count?: number;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  borderRadius,
  className = '',
  variant = 'text',
  count = 1,
  style: customStyle = {}
}) => {
  const variantClass = `skeleton-${variant}`;
  const skeletonStyle: React.CSSProperties = {
    width: width,
    height: height,
    borderRadius,
    ...customStyle
  };

  if (count > 1) {
    return (
      <>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={`skeleton ${variantClass} ${className}`}
            style={skeletonStyle}
          />
        ))}
      </>
    );
  }

  return (
    <div
      className={`skeleton ${variantClass} ${className}`}
      style={skeletonStyle}
    />
  );
};

// File tree loading skeleton
export const FileTreeSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="skeleton-file-tree">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-file-item" style={{ paddingLeft: `${(i % 3) * 16 + 8}px` }}>
          <div className="skeleton skeleton-circle skeleton-file-icon" />
          <div 
            className="skeleton skeleton-text skeleton-file-name" 
            style={{ width: `${60 + Math.random() * 30}%` }}
          />
        </div>
      ))}
    </div>
  );
};

// Chat message loading skeleton
export const MessageSkeleton: React.FC<{ isUser?: boolean }> = ({ isUser = false }) => {
  return (
    <div className={`skeleton-message ${isUser ? 'user' : 'ai'}`}>
      <div className="skeleton skeleton-circle skeleton-avatar" />
      <div className="skeleton-message-content">
        <div className="skeleton skeleton-text skeleton-message-line" />
        <div className="skeleton skeleton-text skeleton-message-line" />
        {!isUser && <div className="skeleton skeleton-text skeleton-message-line" />}
      </div>
    </div>
  );
};

// Tab bar loading skeleton
export const TabSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <div className="skeleton-tabs" style={{ display: 'flex', gap: '2px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-rect"
          style={{ width: `${80 + Math.random() * 40}px`, height: '32px' }}
        />
      ))}
    </div>
  );
};

// Panel loading skeleton
export const PanelSkeleton: React.FC<{ 
  title?: boolean; 
  lines?: number;
  padding?: boolean;
}> = ({ 
  title = true, 
  lines = 4,
  padding = true 
}) => {
  return (
    <div className="skeleton-panel" style={{ padding: padding ? 'var(--spacing-md)' : 0 }}>
      {title && <div className="skeleton skeleton-title" />}
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{ width: `${70 + Math.random() * 25}%` }}
        />
      ))}
    </div>
  );
};

// Card loading skeleton
export const CardSkeleton: React.FC = () => {
  return (
    <div className="skeleton-card" style={{
      padding: 'var(--spacing-md)',
      background: 'var(--bg-secondary)',
      borderRadius: 'var(--border-radius)',
      border: '1px solid var(--border-color)'
    }}>
      <div className="skeleton skeleton-title" style={{ marginBottom: 'var(--spacing-md)' }} />
      <div className="skeleton skeleton-text" style={{ width: '90%' }} />
      <div className="skeleton skeleton-text" style={{ width: '75%' }} />
      <div className="skeleton skeleton-text" style={{ width: '60%' }} />
    </div>
  );
};

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({
  lines = 3,
  className = ''
}) => (
  <div className={className}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        width={i === lines - 1 ? '60%' : '100%'}
        height="14px"
        className="skeleton-shimmer"
        style={{ marginBottom: i < lines - 1 ? '8px' : 0 }}
      />
    ))}
  </div>
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={className}>
    <CardSkeleton />
  </div>
);

export const SkeletonList: React.FC<{ items?: number; className?: string }> = ({
  items = 5,
  className = ''
}) => (
  <div className={`skeleton-list ${className}`}>
    {Array.from({ length: items }).map((_, i) => (
      <div key={i} className="skeleton-list-item" style={{ animationDelay: `${i * 50}ms` }}>
        <Skeleton width="32px" height="32px" borderRadius="6px" className="skeleton-shimmer" />
        <div style={{ flex: 1 }}>
          <Skeleton width="40%" height="14px" className="skeleton-shimmer" style={{ marginBottom: '6px' }} />
          <Skeleton width="80%" height="12px" className="skeleton-shimmer" />
        </div>
      </div>
    ))}
  </div>
);

export const SkeletonAvatar: React.FC<{ size?: number; className?: string }> = ({
  size = 40,
  className = ''
}) => (
  <Skeleton
    width={size}
    height={size}
    borderRadius="50%"
    className={`skeleton-shimmer ${className}`}
  />
);

export const SkeletonButton: React.FC<{ width?: string | number; className?: string }> = ({
  width = '100px',
  className = ''
}) => (
  <Skeleton
    width={width}
    height="36px"
    borderRadius="6px"
    className={`skeleton-shimmer ${className}`}
  />
);

export const LoadingOverlay: React.FC<{ message?: string }> = ({
  message = 'Loading...'
}) => (
  <div className="loading-overlay">
    <div className="loading-spinner">
      <svg viewBox="0 0 50 50" width="40" height="40">
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="100"
          strokeDashoffset="20"
        />
      </svg>
    </div>
    <span className="loading-message">{message}</span>
  </div>
);

export const PulseLoader: React.FC<{ size?: 'small' | 'medium' | 'large' }> = ({
  size = 'medium'
}) => {
  const sizeMap = { small: 6, medium: 10, large: 14 };
  const dotSize = sizeMap[size];

  return (
    <div className="pulse-loader" style={{ gap: dotSize / 2 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="pulse-dot"
          style={{
            width: dotSize,
            height: dotSize,
            animationDelay: `${i * 150}ms`
          }}
        />
      ))}
    </div>
  );
};

// Full page loading skeleton
export const PageSkeleton: React.FC = () => {
  return (
    <div className="skeleton-page" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--spacing-lg)',
      padding: 'var(--spacing-xl)'
    }}>
      <div className="skeleton skeleton-title" style={{ width: '40%' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--spacing-md)' }}>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <PanelSkeleton lines={6} />
    </div>
  );
};

export default Skeleton;

