/**
 * LoadingSkeleton - Beautiful loading states for better UX
 * Prevents layout shift and provides visual feedback
 */

import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1em',
  borderRadius = '4px',
  className = '',
  style = {}
}) => (
  <div
    className={`skeleton-shimmer ${className}`}
    style={{
      width,
      height,
      borderRadius,
      ...style
    }}
  />
);

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({
  lines = 3,
  className = ''
}) => (
  <div className={`skeleton-text ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        width={i === lines - 1 ? '60%' : '100%'}
        height="14px"
        style={{ marginBottom: i < lines - 1 ? '8px' : 0 }}
      />
    ))}
  </div>
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-card ${className}`}>
    <Skeleton height="120px" borderRadius="8px" style={{ marginBottom: '12px' }} />
    <Skeleton width="70%" height="16px" style={{ marginBottom: '8px' }} />
    <Skeleton width="90%" height="12px" />
  </div>
);

export const SkeletonList: React.FC<{ items?: number; className?: string }> = ({
  items = 5,
  className = ''
}) => (
  <div className={`skeleton-list ${className}`}>
    {Array.from({ length: items }).map((_, i) => (
      <div key={i} className="skeleton-list-item" style={{ animationDelay: `${i * 50}ms` }}>
        <Skeleton width="32px" height="32px" borderRadius="6px" />
        <div style={{ flex: 1 }}>
          <Skeleton width="40%" height="14px" style={{ marginBottom: '6px' }} />
          <Skeleton width="80%" height="12px" />
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
    className={className}
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
    className={className}
  />
);

// Loading overlay for components
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

// Pulse loader for inline loading
export const PulseLoader: React.FC<{ size?: 'small' | 'medium' | 'large' }> = ({
  size = 'medium'
}) => {
  const sizeMap = { small: 6, medium: 10, large: 14 };
  const dotSize = sizeMap[size];
  
  return (
    <div className="pulse-loader" style={{ gap: dotSize / 2 }}>
      {[0, 1, 2].map(i => (
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

export default {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonList,
  SkeletonAvatar,
  SkeletonButton,
  LoadingOverlay,
  PulseLoader
};

