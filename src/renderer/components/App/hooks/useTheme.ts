/**
 * useTheme - Hook for managing app theme
 * 
 * Supports multiple themes: light, dark, midnight, ocean, forest, sunset, lavender, nord, dracula, monokai
 */

import { useState, useEffect, useCallback } from 'react';
import { ThemeId, Theme, getTheme, applyTheme, themes, getTitleBarOverlay } from '../../../themes';

function syncNativeTitleBar(theme: Theme): void {
  if (typeof window.agentAPI?.setTitleBarOverlay === 'function') {
    void window.agentAPI.setTitleBarOverlay(getTitleBarOverlay(theme));
  }
}

interface UseThemeReturn {
  currentTheme: ThemeId;
  themeType: 'light' | 'dark';
  allThemes: Theme[];
  toggleTheme: () => Promise<void>;
  setTheme: (themeId: ThemeId) => Promise<void>;
  getMonacoTheme: () => string;
}

export function useTheme(): UseThemeReturn {
  const [currentTheme, setCurrentTheme] = useState<ThemeId>('dark');

  // Load and apply theme from settings
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const settings = await window.agentAPI.getSettings();
        let themeId: ThemeId = 'dark';
        
        // Support old theme names (vs, vs-dark) and new theme IDs
        if (settings?.themeId) {
          themeId = settings.themeId as ThemeId;
        } else if (settings?.theme) {
          // Legacy support
          if (settings.theme === 'vs' || settings.theme === 'light') {
            themeId = 'light';
          } else if (settings.theme === 'vs-dark' || settings.theme === 'dark') {
            themeId = 'dark';
          }
        }
        
        const theme = getTheme(themeId);
        setCurrentTheme(themeId);
        applyTheme(theme);
        syncNativeTitleBar(theme);
      } catch (error) {
        console.error('Failed to load theme:', error);
        const fallback = getTheme('dark');
        applyTheme(fallback);
        syncNativeTitleBar(fallback);
      }
    };
    loadTheme();
    
    // Listen for theme changes
    if (window.agentAPI && window.agentAPI.on) {
      window.agentAPI.on('theme-changed', (_event: unknown, newThemeId: string) => {
        const theme = getTheme(newThemeId as ThemeId);
        setCurrentTheme(newThemeId as ThemeId);
        applyTheme(theme);
        syncNativeTitleBar(theme);
      });
    }
    
    return () => {
      if (window.agentAPI && window.agentAPI.removeListener) {
        window.agentAPI.removeListener('theme-changed');
      }
    };
  }, []);

  // Toggle between light and dark (cycles through themes of opposite type)
  const toggleTheme = useCallback(async () => {
    const currentThemeObj = getTheme(currentTheme);
    const oppositeType = currentThemeObj.type === 'dark' ? 'light' : 'dark';
    const themesOfOppositeType = themes.filter(t => t.type === oppositeType);
    const newTheme = themesOfOppositeType[0] || getTheme('dark');
    
    await window.agentAPI.updateSettings({ 
      themeId: newTheme.id,
      theme: newTheme.monaco  // Keep legacy support
    });
    setCurrentTheme(newTheme.id);
    applyTheme(newTheme);
    syncNativeTitleBar(newTheme);
  }, [currentTheme]);

  // Set specific theme by ID
  const setTheme = useCallback(async (themeId: ThemeId) => {
    const theme = getTheme(themeId);
    await window.agentAPI.updateSettings({ 
      themeId: themeId,
      theme: theme.monaco  // Keep legacy support
    });
    setCurrentTheme(themeId);
    applyTheme(theme);
    syncNativeTitleBar(theme);
  }, []);

  // Get Monaco editor theme name
  const getMonacoTheme = useCallback(() => {
    return getTheme(currentTheme).monaco;
  }, [currentTheme]);

  return {
    currentTheme,
    themeType: getTheme(currentTheme).type,
    allThemes: themes,
    toggleTheme,
    setTheme,
    getMonacoTheme
  };
}

export default useTheme;

