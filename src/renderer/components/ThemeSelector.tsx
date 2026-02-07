/**
 * ThemeSelector - Visual theme picker for AgentPrime
 * 
 * Shows all available themes with previews
 */

import React from 'react';
import { ThemeId, Theme, getThemesByType } from '../themes';
import { IconCheck, IconSun, IconMoon } from './Icons';

interface ThemeSelectorProps {
  currentTheme: ThemeId;
  onThemeChange: (themeId: ThemeId) => void;
}

const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  currentTheme,
  onThemeChange
}) => {
  const { light: lightThemes, dark: darkThemes } = getThemesByType();

  const renderThemeCard = (theme: Theme) => {
    const isSelected = theme.id === currentTheme;
    
    return (
      <button
        key={theme.id}
        className={`theme-card ${isSelected ? 'selected' : ''}`}
        onClick={() => onThemeChange(theme.id)}
        title={theme.description}
      >
        {/* Theme preview */}
        <div 
          className="theme-preview"
          style={{
            backgroundColor: theme.colors.bgPrimary,
            borderColor: isSelected ? theme.colors.accentPrimary : theme.colors.borderColor
          }}
        >
          {/* Mini sidebar */}
          <div 
            className="preview-sidebar"
            style={{ backgroundColor: theme.colors.sidebarBg }}
          >
            <div className="preview-item" style={{ backgroundColor: theme.colors.bgHover }} />
            <div className="preview-item" style={{ backgroundColor: theme.colors.bgHover }} />
            <div className="preview-item active" style={{ backgroundColor: theme.colors.accentPrimary }} />
          </div>
          
          {/* Mini editor */}
          <div 
            className="preview-editor"
            style={{ backgroundColor: theme.colors.editorBg }}
          >
            <div className="preview-line" style={{ backgroundColor: theme.colors.textMuted, width: '60%' }} />
            <div className="preview-line" style={{ backgroundColor: theme.colors.accentPrimary, width: '45%' }} />
            <div className="preview-line" style={{ backgroundColor: theme.colors.textSecondary, width: '80%' }} />
            <div className="preview-line" style={{ backgroundColor: theme.colors.success, width: '35%' }} />
          </div>
          
          {/* Selected indicator */}
          {isSelected && (
            <div className="theme-selected-badge" style={{ backgroundColor: theme.colors.accentPrimary }}>
              <IconCheck size="xs" />
            </div>
          )}
        </div>
        
        {/* Theme name */}
        <span className="theme-name">{theme.name}</span>
      </button>
    );
  };

  return (
    <div className="theme-selector">
      {/* Light themes */}
      <div className="theme-section">
        <h4 className="theme-section-title">
          <IconSun size="sm" /> Light Themes
        </h4>
        <div className="theme-grid">
          {lightThemes.map(renderThemeCard)}
        </div>
      </div>
      
      {/* Dark themes */}
      <div className="theme-section">
        <h4 className="theme-section-title">
          <IconMoon size="sm" /> Dark Themes
        </h4>
        <div className="theme-grid">
          {darkThemes.map(renderThemeCard)}
        </div>
      </div>

      <style>{`
        .theme-selector {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-lg);
        }
        
        .theme-section-title {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          margin: 0 0 var(--spacing-md) 0;
          font-size: 0.9rem;
          font-weight: 600;
          color: #60a5fa;
        }
        
        .theme-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: var(--spacing-md);
        }
        
        .theme-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--spacing-xs);
          padding: var(--spacing-sm);
          background: rgba(255, 255, 255, 0.03);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: var(--border-radius);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        
        .theme-card:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
        }
        
        .theme-card.selected {
          border-color: #60a5fa;
          background: rgba(96, 165, 250, 0.1);
        }
        
        .theme-preview {
          position: relative;
          width: 80px;
          height: 56px;
          border-radius: 6px;
          border: 2px solid;
          overflow: hidden;
          display: flex;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .preview-sidebar {
          width: 20px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 4px 2px;
        }
        
        .preview-item {
          height: 5px;
          border-radius: 2px;
          opacity: 0.9;
        }
        
        .preview-item.active {
          opacity: 1;
        }
        
        .preview-editor {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 6px 4px;
        }
        
        .preview-line {
          height: 4px;
          border-radius: 2px;
          opacity: 1;
        }
        
        .theme-selected-badge {
          position: absolute;
          top: 2px;
          right: 2px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        
        .theme-name {
          font-size: 0.8rem;
          font-weight: 500;
          color: #e2e8f0;
          margin-top: 4px;
        }
        
        .theme-card.selected .theme-name {
          color: #60a5fa;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};

export default ThemeSelector;

