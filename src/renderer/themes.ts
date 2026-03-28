/**
 * AgentPrime Theme System
 * 
 * Comprehensive theme support with:
 * - Light/Dark base themes
 * - Multiple color variants
 * - Custom theme support
 * - CSS variables for easy customization
 */

export type ThemeId = 
  | 'light'
  | 'dark' 
  | 'midnight'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'lavender'
  | 'nord'
  | 'dracula'
  | 'monokai'
  | 'matrix';

export interface Theme {
  id: ThemeId;
  name: string;
  type: 'light' | 'dark';
  description: string;
  colors: ThemeColors;
  monaco: string; // Monaco editor theme name
}

export interface ThemeColors {
  // Primary backgrounds
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgHover: string;
  bgActive: string;
  
  // Text colors
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  
  // Border colors
  borderColor: string;
  borderHover: string;
  borderSubtle: string;
  
  // Accent colors
  accentPrimary: string;
  accentSecondary: string;
  accentLight: string;
  accentGlow: string;
  
  // Secondary accent colors
  blue: string;
  green: string;
  purple: string;
  amber: string;
  
  // Status colors
  success: string;
  error: string;
  warning: string;
  info: string;
  
  // Sidebar & panels
  sidebarBg: string;
  panelBg: string;
  headerBg: string;
  
  // Editor
  editorBg: string;
  editorLineNumber: string;
  editorSelection: string;
  
  // Scrollbar
  scrollbarThumb: string;
  scrollbarTrack: string;
  
  // Surface colors (for prime-* variables)
  surface: string;
  surfaceElevated: string;
  surfaceHover: string;
  
  // Shadow opacity (varies by theme type)
  shadowOpacity: number;
}

// Light theme (default)
const lightTheme: Theme = {
  id: 'light',
  name: 'Light',
  type: 'light',
  description: 'Clean and bright light theme',
  monaco: 'vs',
  colors: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f8fafc',
    bgTertiary: '#f1f5f9',
    bgHover: '#e2e8f0',
    bgActive: '#3b82f6',
    textPrimary: '#1e293b',
    textSecondary: '#475569',
    textMuted: '#64748b',
    borderColor: '#e2e8f0',
    borderHover: '#3b82f6',
    borderSubtle: '#f1f5f9',
    accentPrimary: '#3b82f6',
    accentSecondary: '#8b5cf6',
    accentLight: '#eff6ff',
    accentGlow: 'rgba(59, 130, 246, 0.2)',
    blue: '#3b82f6',
    green: '#10b981',
    purple: '#8b5cf6',
    amber: '#f59e0b',
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
    sidebarBg: '#f8fafc',
    panelBg: '#ffffff',
    headerBg: '#ffffff',
    editorBg: '#ffffff',
    editorLineNumber: '#94a3b8',
    editorSelection: '#add6ff',
    scrollbarThumb: '#cbd5e1',
    scrollbarTrack: '#f1f5f9',
    surface: '#ffffff',
    surfaceElevated: '#ffffff',
    surfaceHover: '#f4f5f7',
    shadowOpacity: 0.08
  }
};

// Dark theme
const darkTheme: Theme = {
  id: 'dark',
  name: 'Dark',
  type: 'dark',
  description: 'Easy on the eyes dark theme',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#1e1e1e',
    bgSecondary: '#252526',
    bgTertiary: '#2d2d2d',
    bgHover: '#3c3c3c',
    bgActive: '#0078d4',
    textPrimary: '#d4d4d4',
    textSecondary: '#a0a0a0',
    textMuted: '#6b6b6b',
    borderColor: '#3c3c3c',
    borderHover: '#0078d4',
    borderSubtle: '#2d2d2d',
    accentPrimary: '#0078d4',
    accentSecondary: '#646cff',
    accentLight: 'rgba(0, 120, 212, 0.15)',
    accentGlow: 'rgba(0, 120, 212, 0.3)',
    blue: '#58a6ff',
    green: '#4ec9b0',
    purple: '#c586c0',
    amber: '#dcdcaa',
    success: '#4ec9b0',
    error: '#f48771',
    warning: '#dcdcaa',
    info: '#0078d4',
    sidebarBg: '#252526',
    panelBg: '#1e1e1e',
    headerBg: '#1e1e1e',
    editorBg: '#1e1e1e',
    editorLineNumber: '#858585',
    editorSelection: '#264f78',
    scrollbarThumb: '#4a4a4a',
    scrollbarTrack: '#2d2d2d',
    surface: '#252526',
    surfaceElevated: '#2d2d2d',
    surfaceHover: '#3c3c3c',
    shadowOpacity: 0.4
  }
};

// Midnight theme (deeper dark)
const midnightTheme: Theme = {
  id: 'midnight',
  name: 'Midnight',
  type: 'dark',
  description: 'Deep midnight blue theme',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#0f0f1a',
    bgSecondary: '#141424',
    bgTertiary: '#1a1a2e',
    bgHover: '#252545',
    bgActive: '#7c3aed',
    textPrimary: '#e2e8f0',
    textSecondary: '#a5b4c8',
    textMuted: '#64748b',
    borderColor: '#252545',
    borderHover: '#7c3aed',
    borderSubtle: '#1a1a2e',
    accentPrimary: '#7c3aed',
    accentSecondary: '#a78bfa',
    accentLight: 'rgba(124, 58, 237, 0.15)',
    accentGlow: 'rgba(124, 58, 237, 0.3)',
    blue: '#60a5fa',
    green: '#34d399',
    purple: '#a78bfa',
    amber: '#fbbf24',
    success: '#34d399',
    error: '#f87171',
    warning: '#fbbf24',
    info: '#60a5fa',
    sidebarBg: '#141424',
    panelBg: '#0f0f1a',
    headerBg: '#141424',
    editorBg: '#0f0f1a',
    editorLineNumber: '#64748b',
    editorSelection: '#4c1d95',
    scrollbarThumb: '#3b3b5e',
    scrollbarTrack: '#1a1a2e',
    surface: '#141424',
    surfaceElevated: '#1a1a2e',
    surfaceHover: '#252545',
    shadowOpacity: 0.5
  }
};

// Ocean theme
const oceanTheme: Theme = {
  id: 'ocean',
  name: 'Ocean',
  type: 'dark',
  description: 'Deep ocean blue theme',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#0a192f',
    bgSecondary: '#112240',
    bgTertiary: '#1d3557',
    bgHover: '#233554',
    bgActive: '#64ffda',
    textPrimary: '#ccd6f6',
    textSecondary: '#8892b0',
    textMuted: '#495670',
    borderColor: '#233554',
    borderHover: '#64ffda',
    borderSubtle: '#1d3557',
    accentPrimary: '#64ffda',
    accentSecondary: '#7df9ff',
    accentLight: 'rgba(100, 255, 218, 0.1)',
    accentGlow: 'rgba(100, 255, 218, 0.25)',
    blue: '#7df9ff',
    green: '#64ffda',
    purple: '#c792ea',
    amber: '#ffc857',
    success: '#64ffda',
    error: '#ff6b6b',
    warning: '#ffc857',
    info: '#7df9ff',
    sidebarBg: '#112240',
    panelBg: '#0a192f',
    headerBg: '#112240',
    editorBg: '#0a192f',
    editorLineNumber: '#495670',
    editorSelection: '#1d4e89',
    scrollbarThumb: '#233554',
    scrollbarTrack: '#112240',
    surface: '#112240',
    surfaceElevated: '#1d3557',
    surfaceHover: '#233554',
    shadowOpacity: 0.5
  }
};

// Forest theme
const forestTheme: Theme = {
  id: 'forest',
  name: 'Forest',
  type: 'dark',
  description: 'Peaceful forest green theme',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#1a1f16',
    bgSecondary: '#232a1e',
    bgTertiary: '#2d3627',
    bgHover: '#3a4632',
    bgActive: '#4ade80',
    textPrimary: '#e2e8e0',
    textSecondary: '#a8b5a0',
    textMuted: '#6b7a60',
    borderColor: '#3a4632',
    borderHover: '#4ade80',
    borderSubtle: '#2d3627',
    accentPrimary: '#4ade80',
    accentSecondary: '#86efac',
    accentLight: 'rgba(74, 222, 128, 0.1)',
    accentGlow: 'rgba(74, 222, 128, 0.25)',
    blue: '#38bdf8',
    green: '#4ade80',
    purple: '#c084fc',
    amber: '#fbbf24',
    success: '#4ade80',
    error: '#f87171',
    warning: '#fbbf24',
    info: '#38bdf8',
    sidebarBg: '#232a1e',
    panelBg: '#1a1f16',
    headerBg: '#232a1e',
    editorBg: '#1a1f16',
    editorLineNumber: '#6b7a60',
    editorSelection: '#2d5a3a',
    scrollbarThumb: '#3a4632',
    scrollbarTrack: '#232a1e',
    surface: '#232a1e',
    surfaceElevated: '#2d3627',
    surfaceHover: '#3a4632',
    shadowOpacity: 0.45
  }
};

// Sunset theme
const sunsetTheme: Theme = {
  id: 'sunset',
  name: 'Sunset',
  type: 'dark',
  description: 'Warm sunset orange theme',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#1a1410',
    bgSecondary: '#241c16',
    bgTertiary: '#2e241c',
    bgHover: '#3d3228',
    bgActive: '#f97316',
    textPrimary: '#f5e6d3',
    textSecondary: '#c9b8a5',
    textMuted: '#8a7a68',
    borderColor: '#3d3228',
    borderHover: '#f97316',
    borderSubtle: '#2e241c',
    accentPrimary: '#f97316',
    accentSecondary: '#fb923c',
    accentLight: 'rgba(249, 115, 22, 0.1)',
    accentGlow: 'rgba(249, 115, 22, 0.25)',
    blue: '#38bdf8',
    green: '#4ade80',
    purple: '#c084fc',
    amber: '#fbbf24',
    success: '#4ade80',
    error: '#f87171',
    warning: '#fbbf24',
    info: '#38bdf8',
    sidebarBg: '#241c16',
    panelBg: '#1a1410',
    headerBg: '#241c16',
    editorBg: '#1a1410',
    editorLineNumber: '#8a7a68',
    editorSelection: '#5a3d20',
    scrollbarThumb: '#3d3228',
    scrollbarTrack: '#241c16',
    surface: '#241c16',
    surfaceElevated: '#2e241c',
    surfaceHover: '#3d3228',
    shadowOpacity: 0.45
  }
};

// Lavender theme (light)
const lavenderTheme: Theme = {
  id: 'lavender',
  name: 'Lavender',
  type: 'light',
  description: 'Soft lavender light theme',
  monaco: 'vs',
  colors: {
    bgPrimary: '#faf5ff',
    bgSecondary: '#f3e8ff',
    bgTertiary: '#e9d5ff',
    bgHover: '#ddd6fe',
    bgActive: '#8b5cf6',
    textPrimary: '#3b0764',
    textSecondary: '#581c87',
    textMuted: '#7e22ce',
    borderColor: '#ddd6fe',
    borderHover: '#8b5cf6',
    borderSubtle: '#e9d5ff',
    accentPrimary: '#8b5cf6',
    accentSecondary: '#a78bfa',
    accentLight: '#f3e8ff',
    accentGlow: 'rgba(139, 92, 246, 0.2)',
    blue: '#3b82f6',
    green: '#10b981',
    purple: '#8b5cf6',
    amber: '#f59e0b',
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#8b5cf6',
    sidebarBg: '#f3e8ff',
    panelBg: '#faf5ff',
    headerBg: '#faf5ff',
    editorBg: '#faf5ff',
    editorLineNumber: '#a78bfa',
    editorSelection: '#c4b5fd',
    scrollbarThumb: '#c4b5fd',
    scrollbarTrack: '#e9d5ff',
    surface: '#ffffff',
    surfaceElevated: '#faf5ff',
    surfaceHover: '#f3e8ff',
    shadowOpacity: 0.08
  }
};

// Nord theme
const nordTheme: Theme = {
  id: 'nord',
  name: 'Nord',
  type: 'dark',
  description: 'Arctic inspired Nord theme',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#2e3440',
    bgSecondary: '#3b4252',
    bgTertiary: '#434c5e',
    bgHover: '#4c566a',
    bgActive: '#88c0d0',
    textPrimary: '#eceff4',
    textSecondary: '#d8dee9',
    textMuted: '#4c566a',
    borderColor: '#4c566a',
    borderHover: '#88c0d0',
    borderSubtle: '#434c5e',
    accentPrimary: '#88c0d0',
    accentSecondary: '#81a1c1',
    accentLight: 'rgba(136, 192, 208, 0.1)',
    accentGlow: 'rgba(136, 192, 208, 0.25)',
    blue: '#81a1c1',
    green: '#a3be8c',
    purple: '#b48ead',
    amber: '#ebcb8b',
    success: '#a3be8c',
    error: '#bf616a',
    warning: '#ebcb8b',
    info: '#81a1c1',
    sidebarBg: '#3b4252',
    panelBg: '#2e3440',
    headerBg: '#3b4252',
    editorBg: '#2e3440',
    editorLineNumber: '#4c566a',
    editorSelection: '#434c5e',
    scrollbarThumb: '#4c566a',
    scrollbarTrack: '#3b4252',
    surface: '#3b4252',
    surfaceElevated: '#434c5e',
    surfaceHover: '#4c566a',
    shadowOpacity: 0.4
  }
};

// Dracula theme
const draculaTheme: Theme = {
  id: 'dracula',
  name: 'Dracula',
  type: 'dark',
  description: 'Popular Dracula theme',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#282a36',
    bgSecondary: '#21222c',
    bgTertiary: '#343746',
    bgHover: '#44475a',
    bgActive: '#bd93f9',
    textPrimary: '#f8f8f2',
    textSecondary: '#f8f8f2',
    textMuted: '#6272a4',
    borderColor: '#44475a',
    borderHover: '#bd93f9',
    borderSubtle: '#343746',
    accentPrimary: '#bd93f9',
    accentSecondary: '#ff79c6',
    accentLight: 'rgba(189, 147, 249, 0.1)',
    accentGlow: 'rgba(189, 147, 249, 0.25)',
    blue: '#8be9fd',
    green: '#50fa7b',
    purple: '#bd93f9',
    amber: '#f1fa8c',
    success: '#50fa7b',
    error: '#ff5555',
    warning: '#f1fa8c',
    info: '#8be9fd',
    sidebarBg: '#21222c',
    panelBg: '#282a36',
    headerBg: '#21222c',
    editorBg: '#282a36',
    editorLineNumber: '#6272a4',
    editorSelection: '#44475a',
    scrollbarThumb: '#44475a',
    scrollbarTrack: '#21222c',
    surface: '#21222c',
    surfaceElevated: '#343746',
    surfaceHover: '#44475a',
    shadowOpacity: 0.45
  }
};

// Monokai theme
const monokaiTheme: Theme = {
  id: 'monokai',
  name: 'Monokai',
  type: 'dark',
  description: 'Classic Monokai theme',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#272822',
    bgSecondary: '#1e1f1c',
    bgTertiary: '#3e3d32',
    bgHover: '#49483e',
    bgActive: '#a6e22e',
    textPrimary: '#f8f8f2',
    textSecondary: '#cfcfc2',
    textMuted: '#75715e',
    borderColor: '#49483e',
    borderHover: '#a6e22e',
    borderSubtle: '#3e3d32',
    accentPrimary: '#a6e22e',
    accentSecondary: '#66d9ef',
    accentLight: 'rgba(166, 226, 46, 0.1)',
    accentGlow: 'rgba(166, 226, 46, 0.25)',
    blue: '#66d9ef',
    green: '#a6e22e',
    purple: '#ae81ff',
    amber: '#e6db74',
    success: '#a6e22e',
    error: '#f92672',
    warning: '#e6db74',
    info: '#66d9ef',
    sidebarBg: '#1e1f1c',
    panelBg: '#272822',
    headerBg: '#1e1f1c',
    editorBg: '#272822',
    editorLineNumber: '#75715e',
    editorSelection: '#49483e',
    scrollbarThumb: '#49483e',
    scrollbarTrack: '#1e1f1c',
    surface: '#1e1f1c',
    surfaceElevated: '#3e3d32',
    surfaceHover: '#49483e',
    shadowOpacity: 0.45
  }
};

// Matrix theme - Authentic movie aesthetic
// "Welcome to the real world" - Morpheus
const matrixTheme: Theme = {
  id: 'matrix',
  name: 'Matrix',
  type: 'dark',
  description: 'The Matrix - Red pill aesthetic',
  monaco: 'vs-dark',
  colors: {
    // Pure black backgrounds like the movie
    bgPrimary: '#000000',
    bgSecondary: '#050505',
    bgTertiary: '#0a0a0a',
    bgHover: '#0d1a0d',
    bgActive: '#00ff41',
    // Matrix green text hierarchy
    textPrimary: '#00ff41',
    textSecondary: '#00cc33',
    textMuted: '#008f11',
    // Subtle green borders
    borderColor: '#003300',
    borderHover: '#00ff41',
    borderSubtle: '#001a00',
    // The iconic Matrix green
    accentPrimary: '#00ff41',
    accentSecondary: '#39ff14',
    accentLight: 'rgba(0, 255, 65, 0.08)',
    accentGlow: 'rgba(0, 255, 65, 0.4)',
    // All accent colors stay green for consistency
    blue: '#00ff41',
    green: '#00ff41',
    purple: '#39ff14',
    amber: '#7fff00',
    // Status colors - green variants
    success: '#00ff41',
    error: '#ff0040',
    warning: '#ccff00',
    info: '#00ff41',
    // All surfaces pitch black
    sidebarBg: '#000000',
    panelBg: '#000000',
    headerBg: '#000000',
    editorBg: '#000000',
    editorLineNumber: '#004400',
    editorSelection: '#003300',
    // Dark scrollbars
    scrollbarThumb: '#003300',
    scrollbarTrack: '#000000',
    surface: '#050505',
    surfaceElevated: '#0a0a0a',
    surfaceHover: '#0d1a0d',
    // High shadow opacity for that deep look
    shadowOpacity: 0.8
  }
};

// All available themes
export const themes: Theme[] = [
  lightTheme,
  darkTheme,
  midnightTheme,
  oceanTheme,
  forestTheme,
  sunsetTheme,
  lavenderTheme,
  nordTheme,
  draculaTheme,
  monokaiTheme,
  matrixTheme
];

// Get theme by ID
export function getTheme(id: ThemeId): Theme {
  return themes.find(t => t.id === id) || darkTheme;
}

// Apply theme to document
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const colors = theme.colors;
  const shadowOpacity = colors.shadowOpacity;
  
  // ===== Core CSS Variables (--bg-*, --text-*, etc.) =====
  root.style.setProperty('--bg-primary', colors.bgPrimary);
  root.style.setProperty('--bg-secondary', colors.bgSecondary);
  root.style.setProperty('--bg-tertiary', colors.bgTertiary);
  root.style.setProperty('--bg-hover', colors.bgHover);
  root.style.setProperty('--bg-active', colors.bgActive);
  
  root.style.setProperty('--text-primary', colors.textPrimary);
  root.style.setProperty('--text-secondary', colors.textSecondary);
  root.style.setProperty('--text-muted', colors.textMuted);
  
  root.style.setProperty('--border-color', colors.borderColor);
  root.style.setProperty('--border-hover', colors.borderHover);
  root.style.setProperty('--border-subtle', colors.borderSubtle);
  
  root.style.setProperty('--accent-primary', colors.accentPrimary);
  root.style.setProperty('--accent-secondary', colors.accentSecondary);
  
  root.style.setProperty('--success', colors.success);
  root.style.setProperty('--error', colors.error);
  root.style.setProperty('--warning', colors.warning);
  root.style.setProperty('--info', colors.info);
  
  root.style.setProperty('--sidebar-bg', colors.sidebarBg);
  root.style.setProperty('--panel-bg', colors.panelBg);
  root.style.setProperty('--header-bg', colors.headerBg);
  
  root.style.setProperty('--editor-bg', colors.editorBg);
  root.style.setProperty('--editor-line-number', colors.editorLineNumber);
  root.style.setProperty('--editor-selection', colors.editorSelection);
  
  root.style.setProperty('--scrollbar-thumb', colors.scrollbarThumb);
  root.style.setProperty('--scrollbar-track', colors.scrollbarTrack);
  
  // ===== Prime CSS Variables (--prime-*) for comprehensive theming =====
  // These ensure components using --prime-* variables also update with theme changes
  
  // Core surfaces
  root.style.setProperty('--prime-bg', colors.bgPrimary);
  root.style.setProperty('--prime-surface', colors.surface);
  root.style.setProperty('--prime-surface-elevated', colors.surfaceElevated);
  root.style.setProperty('--prime-surface-hover', colors.surfaceHover);
  
  // Text hierarchy
  root.style.setProperty('--prime-text', colors.textPrimary);
  root.style.setProperty('--prime-text-secondary', colors.textSecondary);
  root.style.setProperty('--prime-text-muted', colors.textMuted);
  
  // Accent colors - map theme accent to prime accent
  root.style.setProperty('--prime-accent', colors.accentPrimary);
  root.style.setProperty('--prime-accent-hover', colors.accentSecondary);
  root.style.setProperty('--prime-accent-light', colors.accentLight);
  root.style.setProperty('--prime-accent-glow', colors.accentGlow);
  
  // Secondary accents
  root.style.setProperty('--prime-blue', colors.blue);
  root.style.setProperty('--prime-green', colors.green);
  root.style.setProperty('--prime-purple', colors.purple);
  root.style.setProperty('--prime-amber', colors.amber);
  
  // Semantic colors
  root.style.setProperty('--prime-success', colors.success);
  root.style.setProperty('--prime-error', colors.error);
  root.style.setProperty('--prime-warning', colors.warning);
  
  // Borders
  root.style.setProperty('--prime-border', colors.borderColor);
  root.style.setProperty('--prime-border-light', colors.borderSubtle);
  
  // Dynamic shadows based on theme
  root.style.setProperty('--prime-shadow-sm', `0 1px 2px rgba(0, 0, 0, ${shadowOpacity * 0.5})`);
  root.style.setProperty('--prime-shadow-md', `0 4px 12px rgba(0, 0, 0, ${shadowOpacity})`);
  root.style.setProperty('--prime-shadow-lg', `0 12px 32px rgba(0, 0, 0, ${shadowOpacity * 1.25})`);
  root.style.setProperty('--prime-shadow-xl', `0 24px 48px rgba(0, 0, 0, ${shadowOpacity * 1.5})`);
  
  // Monaco editor theme
  root.style.setProperty('--monaco-theme', theme.monaco);
  
  // Set data attributes for CSS selectors
  root.setAttribute('data-theme', theme.id);
  root.setAttribute('data-theme-type', theme.type);
  
  // Dispatch custom event so components can react to theme changes
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agentprime-theme-applied', { 
      detail: { themeId: theme.id, themeType: theme.type, colors } 
    }));
  }
}

/** Windows/Linux caption buttons (titleBarOverlay) — match app chrome */
export function getTitleBarOverlay(theme: Theme): { color: string; symbolColor: string; height: number } {
  const height = 32;
  if (theme.type === 'light') {
    return {
      color: theme.colors.surface,
      symbolColor: theme.colors.textSecondary,
      height
    };
  }
  return {
    color: theme.colors.bgSecondary,
    symbolColor: theme.colors.textMuted,
    height
  };
}

// Get grouped themes by type
export function getThemesByType(): { light: Theme[]; dark: Theme[] } {
  return {
    light: themes.filter(t => t.type === 'light'),
    dark: themes.filter(t => t.type === 'dark')
  };
}

export default themes;

