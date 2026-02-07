/**
 * Button - Unified button component system for AgentPrime
 * 
 * Provides consistent styling, hover states, loading states, and icon support.
 */

import React from 'react';
import { IconSpinner } from './Icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  active?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  active = false,
  disabled,
  className = '',
  ...props
}) => {
  const baseClass = 'ap-btn';
  const variantClass = `ap-btn-${variant}`;
  const sizeClass = `ap-btn-${size}`;
  const activeClass = active ? 'ap-btn-active' : '';
  const fullWidthClass = fullWidth ? 'ap-btn-full' : '';
  const loadingClass = loading ? 'ap-btn-loading' : '';
  const iconOnlyClass = !children && icon ? 'ap-btn-icon-only' : '';

  const classes = [
    baseClass,
    variantClass,
    sizeClass,
    activeClass,
    fullWidthClass,
    loadingClass,
    iconOnlyClass,
    className
  ].filter(Boolean).join(' ');

  const renderIcon = () => {
    if (loading) {
      return <IconSpinner size={size === 'xs' || size === 'sm' ? 'xs' : 'sm'} />;
    }
    return icon;
  };

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {iconPosition === 'left' && renderIcon()}
      {children && <span className="ap-btn-text">{children}</span>}
      {iconPosition === 'right' && renderIcon()}
    </button>
  );
};

// Icon-only button variant
export const IconButton: React.FC<Omit<ButtonProps, 'children'> & { 
  'aria-label': string;
  tooltip?: string;
}> = ({ 
  icon, 
  tooltip,
  ...props 
}) => {
  return (
    <Button
      {...props}
      icon={icon}
      title={tooltip || props['aria-label']}
    />
  );
};

// Button Group for grouping related buttons
interface ButtonGroupProps {
  children: React.ReactNode;
  className?: string;
  attached?: boolean;
}

export const ButtonGroup: React.FC<ButtonGroupProps> = ({
  children,
  className = '',
  attached = false
}) => {
  const attachedClass = attached ? 'ap-btn-group-attached' : '';
  return (
    <div className={`ap-btn-group ${attachedClass} ${className}`}>
      {children}
    </div>
  );
};

export default Button;

// CSS for Button component (add to styles.css)
export const ButtonStyles = `
/* ========================================
   UNIFIED BUTTON SYSTEM
   ======================================== */

.ap-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: var(--border-radius-sm);
  font-family: var(--font-sans);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  user-select: none;
}

.ap-btn:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}

.ap-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Sizes */
.ap-btn-xs {
  padding: 2px 8px;
  font-size: 0.75rem;
  height: 24px;
}

.ap-btn-sm {
  padding: 4px 10px;
  font-size: 0.8125rem;
  height: 28px;
}

.ap-btn-md {
  padding: 6px 14px;
  font-size: 0.875rem;
  height: 32px;
}

.ap-btn-lg {
  padding: 8px 18px;
  font-size: 0.9375rem;
  height: 40px;
}

/* Variants */
.ap-btn-primary {
  background: var(--bg-active);
  border-color: var(--bg-active);
  color: white;
}

.ap-btn-primary:hover:not(:disabled) {
  background: #2563eb;
  border-color: #2563eb;
}

.ap-btn-primary:active:not(:disabled) {
  background: #1d4ed8;
}

.ap-btn-secondary {
  background: var(--bg-secondary);
  border-color: var(--border-color);
  color: var(--text-primary);
}

.ap-btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-hover);
}

.ap-btn-secondary:active:not(:disabled) {
  background: var(--bg-tertiary);
}

.ap-btn-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-secondary);
}

.ap-btn-ghost:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.ap-btn-danger {
  background: var(--error);
  border-color: var(--error);
  color: white;
}

.ap-btn-danger:hover:not(:disabled) {
  background: #dc2626;
  border-color: #dc2626;
}

.ap-btn-success {
  background: var(--success);
  border-color: var(--success);
  color: white;
}

.ap-btn-success:hover:not(:disabled) {
  background: #059669;
  border-color: #059669;
}

/* Active state */
.ap-btn-active {
  background: var(--bg-active) !important;
  border-color: var(--bg-active) !important;
  color: white !important;
}

/* Full width */
.ap-btn-full {
  width: 100%;
}

/* Loading state */
.ap-btn-loading {
  pointer-events: none;
}

/* Icon only */
.ap-btn-icon-only {
  padding: 0;
  width: 28px;
  height: 28px;
}

.ap-btn-icon-only.ap-btn-xs {
  width: 24px;
  height: 24px;
}

.ap-btn-icon-only.ap-btn-sm {
  width: 28px;
  height: 28px;
}

.ap-btn-icon-only.ap-btn-md {
  width: 32px;
  height: 32px;
}

.ap-btn-icon-only.ap-btn-lg {
  width: 40px;
  height: 40px;
}

/* Button Group */
.ap-btn-group {
  display: inline-flex;
  gap: 4px;
}

.ap-btn-group-attached {
  gap: 0;
}

.ap-btn-group-attached .ap-btn {
  border-radius: 0;
}

.ap-btn-group-attached .ap-btn:first-child {
  border-radius: var(--border-radius-sm) 0 0 var(--border-radius-sm);
}

.ap-btn-group-attached .ap-btn:last-child {
  border-radius: 0 var(--border-radius-sm) var(--border-radius-sm) 0;
}

.ap-btn-group-attached .ap-btn:not(:last-child) {
  border-right-width: 0;
}

.ap-btn-group-attached .ap-btn:hover:not(:disabled) {
  z-index: 1;
}
`;

