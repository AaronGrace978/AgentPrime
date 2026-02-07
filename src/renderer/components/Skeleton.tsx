/**
 * Skeleton - Loading placeholder components for AgentPrime
 * 
 * Provides consistent loading states throughout the app.
 */

import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  variant?: 'text' | 'title' | 'circle' | 'rect';
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  className = '',
  variant = 'text',
  count = 1
}) => {
  const variantClass = `skeleton-${variant}`;
  const style: React.CSSProperties = {
    width: width,
    height: height
  };

  if (count > 1) {
    return (
      <>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={`skeleton ${variantClass} ${className}`}
            style={style}
          />
        ))}
      </>
    );
  }

  return (
    <div
      className={`skeleton ${variantClass} ${className}`}
      style={style}
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

