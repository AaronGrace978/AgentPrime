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
  | 'matrix'
  | 'dino-buddy'
  | 'aurora'
  | 'blossom'
  | 'ember'
  | 'rose'
  | 'mint'
  | 'sand'
  | 'sky'
  | 'peach'
  | 'neon-tokyo'
  | 'synthwave'
  | 'obsidian'
  | 'horizon'
  | 'arctic'
  | 'molten';

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
    textPrimary: '#f1f5f9',
    textSecondary: '#b4c2d6',
    textMuted: '#8b9bb3',
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
    editorLineNumber: '#7c8ca3',
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
    textPrimary: '#dce7ff',
    textSecondary: '#a8b8db',
    textMuted: '#6f82ab',
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
    editorLineNumber: '#5c7094',
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
    textPrimary: '#eef4ea',
    textSecondary: '#b8c9b0',
    textMuted: '#8a9f80',
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
    editorLineNumber: '#7d9074',
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
    textPrimary: '#faf0e4',
    textSecondary: '#d4c4b3',
    textMuted: '#a89884',
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
    editorLineNumber: '#9e8f7c',
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
    textPrimary: '#4c2883',
    textSecondary: '#6b3d9e',
    textMuted: '#8b5cb8',
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
    textMuted: '#7b88a1',
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
    editorLineNumber: '#5e6a82',
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
    textPrimary: '#39ff14',
    textSecondary: '#22ee55',
    textMuted: '#00b82d',
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
    editorLineNumber: '#0d8030',
    editorSelection: '#0a4d22',
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

// Dino Buddy — friendly prehistoric jungle (moss, coral “belly”, sky blue)
const dinoBuddyTheme: Theme = {
  id: 'dino-buddy',
  name: 'Dino Buddy',
  type: 'dark',
  description: 'Friendly prehistoric jungle — moss greens, warm coral, and sky blue',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#1a221c',
    bgSecondary: '#232e26',
    bgTertiary: '#2d3d32',
    bgHover: '#3a4d40',
    bgActive: '#f4a261',
    textPrimary: '#f5f0e6',
    textSecondary: '#c9d4c4',
    textMuted: '#8a9f88',
    borderColor: '#3a4d40',
    borderHover: '#f4a261',
    borderSubtle: '#2d3d32',
    accentPrimary: '#f4a261',
    accentSecondary: '#e8a87c',
    accentLight: 'rgba(244, 162, 97, 0.12)',
    accentGlow: 'rgba(244, 162, 97, 0.3)',
    blue: '#7eb8da',
    green: '#7dce82',
    purple: '#c9a0dc',
    amber: '#f6d58e',
    success: '#7dce82',
    error: '#f87171',
    warning: '#f6d58e',
    info: '#7eb8da',
    sidebarBg: '#232e26',
    panelBg: '#1a221c',
    headerBg: '#232e26',
    editorBg: '#1a221c',
    editorLineNumber: '#8a9f88',
    editorSelection: '#3d5a45',
    scrollbarThumb: '#3a4d40',
    scrollbarTrack: '#232e26',
    surface: '#232e26',
    surfaceElevated: '#2d3d32',
    surfaceHover: '#3a4d40',
    shadowOpacity: 0.42
  }
};

const auroraTheme: Theme = {
  id: 'aurora',
  name: 'Aurora',
  type: 'dark',
  description: 'Northern lights — teal and violet on polar night',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#0c1220',
    bgSecondary: '#121a2e',
    bgTertiary: '#1a2744',
    bgHover: '#243554',
    bgActive: '#22d3ee',
    textPrimary: '#f0f8ff',
    textSecondary: '#a8bddc',
    textMuted: '#7c92b8',
    borderColor: '#243554',
    borderHover: '#22d3ee',
    borderSubtle: '#1a2744',
    accentPrimary: '#22d3ee',
    accentSecondary: '#e879f9',
    accentLight: 'rgba(34, 211, 238, 0.1)',
    accentGlow: 'rgba(232, 121, 249, 0.25)',
    blue: '#38bdf8',
    green: '#34d399',
    purple: '#e879f9',
    amber: '#fbbf24',
    success: '#34d399',
    error: '#fb7185',
    warning: '#fbbf24',
    info: '#22d3ee',
    sidebarBg: '#121a2e',
    panelBg: '#0c1220',
    headerBg: '#121a2e',
    editorBg: '#0c1220',
    editorLineNumber: '#7086ad',
    editorSelection: '#1e3a5f',
    scrollbarThumb: '#243554',
    scrollbarTrack: '#121a2e',
    surface: '#121a2e',
    surfaceElevated: '#1a2744',
    surfaceHover: '#243554',
    shadowOpacity: 0.5
  }
};

const blossomTheme: Theme = {
  id: 'blossom',
  name: 'Blossom',
  type: 'dark',
  description: 'Night sakura — plum tones and soft pink accents',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#1f1419',
    bgSecondary: '#2a1822',
    bgTertiary: '#36202d',
    bgHover: '#4a2d3d',
    bgActive: '#fda4af',
    textPrimary: '#fff1f7',
    textSecondary: '#e8c4d6',
    textMuted: '#b894a6',
    borderColor: '#4a2d3d',
    borderHover: '#fda4af',
    borderSubtle: '#36202d',
    accentPrimary: '#fda4af',
    accentSecondary: '#f472b6',
    accentLight: 'rgba(253, 164, 175, 0.12)',
    accentGlow: 'rgba(244, 114, 182, 0.3)',
    blue: '#93c5fd',
    green: '#86efac',
    purple: '#e879f9',
    amber: '#fcd34d',
    success: '#86efac',
    error: '#fb7185',
    warning: '#fcd34d',
    info: '#93c5fd',
    sidebarBg: '#2a1822',
    panelBg: '#1f1419',
    headerBg: '#2a1822',
    editorBg: '#1f1419',
    editorLineNumber: '#ad8a9c',
    editorSelection: '#5c2d3f',
    scrollbarThumb: '#4a2d3d',
    scrollbarTrack: '#2a1822',
    surface: '#2a1822',
    surfaceElevated: '#36202d',
    surfaceHover: '#4a2d3d',
    shadowOpacity: 0.48
  }
};

const emberTheme: Theme = {
  id: 'ember',
  name: 'Ember',
  type: 'dark',
  description: 'Warm embers — charcoal and copper glow',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#1a1210',
    bgSecondary: '#241a16',
    bgTertiary: '#30241e',
    bgHover: '#3c3228',
    bgActive: '#fb923c',
    textPrimary: '#faf3ee',
    textSecondary: '#d4c6b8',
    textMuted: '#a89888',
    borderColor: '#3c3228',
    borderHover: '#fb923c',
    borderSubtle: '#30241e',
    accentPrimary: '#fb923c',
    accentSecondary: '#f97316',
    accentLight: 'rgba(251, 146, 60, 0.12)',
    accentGlow: 'rgba(251, 146, 60, 0.28)',
    blue: '#7dd3fc',
    green: '#86efac',
    purple: '#d8b4fe',
    amber: '#fcd34d',
    success: '#86efac',
    error: '#f87171',
    warning: '#fcd34d',
    info: '#7dd3fc',
    sidebarBg: '#241a16',
    panelBg: '#1a1210',
    headerBg: '#241a16',
    editorBg: '#1a1210',
    editorLineNumber: '#9e9082',
    editorSelection: '#5a3d24',
    scrollbarThumb: '#3c3228',
    scrollbarTrack: '#241a16',
    surface: '#241a16',
    surfaceElevated: '#30241e',
    surfaceHover: '#3c3228',
    shadowOpacity: 0.46
  }
};

// Rose — warm blush pinks on cream
const roseTheme: Theme = {
  id: 'rose',
  name: 'Rose',
  type: 'light',
  description: 'Warm blush pinks on creamy white',
  monaco: 'vs',
  colors: {
    bgPrimary: '#fff5f5',
    bgSecondary: '#fff0f0',
    bgTertiary: '#ffe4e6',
    bgHover: '#fecdd3',
    bgActive: '#e11d48',
    textPrimary: '#6b2140',
    textSecondary: '#8f3658',
    textMuted: '#b44a6f',
    borderColor: '#fecdd3',
    borderHover: '#e11d48',
    borderSubtle: '#ffe4e6',
    accentPrimary: '#e11d48',
    accentSecondary: '#f43f5e',
    accentLight: '#fff1f2',
    accentGlow: 'rgba(225, 29, 72, 0.18)',
    blue: '#3b82f6',
    green: '#10b981',
    purple: '#a855f7',
    amber: '#f59e0b',
    success: '#10b981',
    error: '#dc2626',
    warning: '#f59e0b',
    info: '#e11d48',
    sidebarBg: '#fff0f0',
    panelBg: '#fff5f5',
    headerBg: '#fff5f5',
    editorBg: '#fff5f5',
    editorLineNumber: '#f9a8d4',
    editorSelection: '#fecdd3',
    scrollbarThumb: '#fda4af',
    scrollbarTrack: '#ffe4e6',
    surface: '#ffffff',
    surfaceElevated: '#fff5f5',
    surfaceHover: '#fff0f0',
    shadowOpacity: 0.07
  }
};

// Mint — fresh cool greens on white
const mintTheme: Theme = {
  id: 'mint',
  name: 'Mint',
  type: 'light',
  description: 'Fresh cool mint greens on clean white',
  monaco: 'vs',
  colors: {
    bgPrimary: '#f0fdf4',
    bgSecondary: '#ecfdf5',
    bgTertiary: '#d1fae5',
    bgHover: '#a7f3d0',
    bgActive: '#059669',
    textPrimary: '#134e40',
    textSecondary: '#1f6b56',
    textMuted: '#2d8a6e',
    borderColor: '#a7f3d0',
    borderHover: '#059669',
    borderSubtle: '#d1fae5',
    accentPrimary: '#059669',
    accentSecondary: '#10b981',
    accentLight: '#ecfdf5',
    accentGlow: 'rgba(5, 150, 105, 0.18)',
    blue: '#0284c7',
    green: '#059669',
    purple: '#7c3aed',
    amber: '#d97706',
    success: '#059669',
    error: '#dc2626',
    warning: '#d97706',
    info: '#0284c7',
    sidebarBg: '#ecfdf5',
    panelBg: '#f0fdf4',
    headerBg: '#f0fdf4',
    editorBg: '#f0fdf4',
    editorLineNumber: '#6ee7b7',
    editorSelection: '#a7f3d0',
    scrollbarThumb: '#6ee7b7',
    scrollbarTrack: '#d1fae5',
    surface: '#ffffff',
    surfaceElevated: '#f0fdf4',
    surfaceHover: '#ecfdf5',
    shadowOpacity: 0.06
  }
};

// Sand — warm earthy tones on parchment
const sandTheme: Theme = {
  id: 'sand',
  name: 'Sand',
  type: 'light',
  description: 'Warm earthy tones on parchment',
  monaco: 'vs',
  colors: {
    bgPrimary: '#fefcf3',
    bgSecondary: '#fdf8e8',
    bgTertiary: '#faf0d0',
    bgHover: '#f5e6b8',
    bgActive: '#b45309',
    textPrimary: '#5c3d1a',
    textSecondary: '#7a5224',
    textMuted: '#96632d',
    borderColor: '#f5e6b8',
    borderHover: '#b45309',
    borderSubtle: '#faf0d0',
    accentPrimary: '#b45309',
    accentSecondary: '#d97706',
    accentLight: '#fefce8',
    accentGlow: 'rgba(180, 83, 9, 0.16)',
    blue: '#2563eb',
    green: '#059669',
    purple: '#7c3aed',
    amber: '#b45309',
    success: '#059669',
    error: '#dc2626',
    warning: '#d97706',
    info: '#2563eb',
    sidebarBg: '#fdf8e8',
    panelBg: '#fefcf3',
    headerBg: '#fefcf3',
    editorBg: '#fefcf3',
    editorLineNumber: '#d4a96a',
    editorSelection: '#fde68a',
    scrollbarThumb: '#d4a96a',
    scrollbarTrack: '#faf0d0',
    surface: '#ffffff',
    surfaceElevated: '#fefcf3',
    surfaceHover: '#fdf8e8',
    shadowOpacity: 0.08
  }
};

// Sky — clear blue daylight
const skyTheme: Theme = {
  id: 'sky',
  name: 'Sky',
  type: 'light',
  description: 'Clear blue daylight — airy and calm',
  monaco: 'vs',
  colors: {
    bgPrimary: '#f0f9ff',
    bgSecondary: '#e0f2fe',
    bgTertiary: '#bae6fd',
    bgHover: '#7dd3fc',
    bgActive: '#0284c7',
    textPrimary: '#1a3a52',
    textSecondary: '#245a78',
    textMuted: '#2f7aad',
    borderColor: '#bae6fd',
    borderHover: '#0284c7',
    borderSubtle: '#e0f2fe',
    accentPrimary: '#0284c7',
    accentSecondary: '#0ea5e9',
    accentLight: '#e0f2fe',
    accentGlow: 'rgba(2, 132, 199, 0.18)',
    blue: '#0284c7',
    green: '#059669',
    purple: '#7c3aed',
    amber: '#d97706',
    success: '#059669',
    error: '#dc2626',
    warning: '#d97706',
    info: '#0284c7',
    sidebarBg: '#e0f2fe',
    panelBg: '#f0f9ff',
    headerBg: '#f0f9ff',
    editorBg: '#f0f9ff',
    editorLineNumber: '#7dd3fc',
    editorSelection: '#bae6fd',
    scrollbarThumb: '#7dd3fc',
    scrollbarTrack: '#e0f2fe',
    surface: '#ffffff',
    surfaceElevated: '#f0f9ff',
    surfaceHover: '#e0f2fe',
    shadowOpacity: 0.06
  }
};

// Peach — soft coral warmth
const peachTheme: Theme = {
  id: 'peach',
  name: 'Peach',
  type: 'light',
  description: 'Soft coral warmth on creamy white',
  monaco: 'vs',
  colors: {
    bgPrimary: '#fff7ed',
    bgSecondary: '#ffedd5',
    bgTertiary: '#fed7aa',
    bgHover: '#fdba74',
    bgActive: '#ea580c',
    textPrimary: '#5c2a12',
    textSecondary: '#7a3a1c',
    textMuted: '#a14a28',
    borderColor: '#fed7aa',
    borderHover: '#ea580c',
    borderSubtle: '#ffedd5',
    accentPrimary: '#ea580c',
    accentSecondary: '#f97316',
    accentLight: '#fff7ed',
    accentGlow: 'rgba(234, 88, 12, 0.18)',
    blue: '#2563eb',
    green: '#059669',
    purple: '#7c3aed',
    amber: '#d97706',
    success: '#059669',
    error: '#dc2626',
    warning: '#d97706',
    info: '#2563eb',
    sidebarBg: '#ffedd5',
    panelBg: '#fff7ed',
    headerBg: '#fff7ed',
    editorBg: '#fff7ed',
    editorLineNumber: '#fdba74',
    editorSelection: '#fed7aa',
    scrollbarThumb: '#fdba74',
    scrollbarTrack: '#ffedd5',
    surface: '#ffffff',
    surfaceElevated: '#fff7ed',
    surfaceHover: '#ffedd5',
    shadowOpacity: 0.07
  }
};

// Neon Tokyo — electric magenta and cyan on ink black
const neonTokyoTheme: Theme = {
  id: 'neon-tokyo',
  name: 'Neon Tokyo',
  type: 'dark',
  description: 'Electric magenta and cyan rain on midnight streets',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#0a0612',
    bgSecondary: '#120a1c',
    bgTertiary: '#1a0f2e',
    bgHover: '#2a1845',
    bgActive: '#ff2bd6',
    textPrimary: '#f8f4ff',
    textSecondary: '#d4c4f0',
    textMuted: '#9b8ab8',
    borderColor: '#2a1845',
    borderHover: '#ff2bd6',
    borderSubtle: '#1a0f2e',
    accentPrimary: '#ff2bd6',
    accentSecondary: '#00f5ff',
    accentLight: 'rgba(255, 43, 214, 0.12)',
    accentGlow: 'rgba(0, 245, 255, 0.35)',
    blue: '#00f5ff',
    green: '#39ffb5',
    purple: '#c77dff',
    amber: '#ffe066',
    success: '#39ffb5',
    error: '#ff6b9d',
    warning: '#ffe066',
    info: '#00f5ff',
    sidebarBg: '#120a1c',
    panelBg: '#0a0612',
    headerBg: '#120a1c',
    editorBg: '#0a0612',
    editorLineNumber: '#7a6a9a',
    editorSelection: '#3d1f55',
    scrollbarThumb: '#2a1845',
    scrollbarTrack: '#120a1c',
    surface: '#120a1c',
    surfaceElevated: '#1a0f2e',
    surfaceHover: '#2a1845',
    shadowOpacity: 0.55
  }
};

// Synthwave — sunset grid, hot pink and violet
const synthwaveTheme: Theme = {
  id: 'synthwave',
  name: 'Synthwave',
  type: 'dark',
  description: 'Retro sunset grid — chrome, magenta, and electric violet',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#1a0a2e',
    bgSecondary: '#241447',
    bgTertiary: '#2d1854',
    bgHover: '#3d2468',
    bgActive: '#ff6ec7',
    textPrimary: '#fff5fc',
    textSecondary: '#e8c4e8',
    textMuted: '#b894c8',
    borderColor: '#3d2468',
    borderHover: '#ff6ec7',
    borderSubtle: '#2d1854',
    accentPrimary: '#ff6ec7',
    accentSecondary: '#7b68ee',
    accentLight: 'rgba(255, 110, 199, 0.14)',
    accentGlow: 'rgba(123, 104, 238, 0.4)',
    blue: '#79d4ff',
    green: '#5cf9a2',
    purple: '#c77dff',
    amber: '#ffd93d',
    success: '#5cf9a2',
    error: '#ff6b9d',
    warning: '#ffd93d',
    info: '#79d4ff',
    sidebarBg: '#241447',
    panelBg: '#1a0a2e',
    headerBg: '#241447',
    editorBg: '#1a0a2e',
    editorLineNumber: '#a080c0',
    editorSelection: '#4a2068',
    scrollbarThumb: '#3d2468',
    scrollbarTrack: '#241447',
    surface: '#241447',
    surfaceElevated: '#2d1854',
    surfaceHover: '#3d2468',
    shadowOpacity: 0.52
  }
};

// Obsidian — near-black with crisp cool-white text (maximum readability)
const obsidianTheme: Theme = {
  id: 'obsidian',
  name: 'Obsidian',
  type: 'dark',
  description: 'Volcanic glass — near-black with high-contrast silver text',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#09090b',
    bgSecondary: '#121214',
    bgTertiary: '#1c1c1f',
    bgHover: '#2a2a2e',
    bgActive: '#a1a1aa',
    textPrimary: '#fafafa',
    textSecondary: '#d4d4d8',
    textMuted: '#a1a1aa',
    borderColor: '#2a2a2e',
    borderHover: '#e4e4e7',
    borderSubtle: '#1c1c1f',
    accentPrimary: '#e4e4e7',
    accentSecondary: '#a78bfa',
    accentLight: 'rgba(228, 228, 231, 0.08)',
    accentGlow: 'rgba(167, 139, 250, 0.25)',
    blue: '#7dd3fc',
    green: '#86efac',
    purple: '#c4b5fd',
    amber: '#fcd34d',
    success: '#86efac',
    error: '#fca5a5',
    warning: '#fcd34d',
    info: '#7dd3fc',
    sidebarBg: '#121214',
    panelBg: '#09090b',
    headerBg: '#121214',
    editorBg: '#09090b',
    editorLineNumber: '#71717a',
    editorSelection: '#3f3f46',
    scrollbarThumb: '#3f3f46',
    scrollbarTrack: '#121214',
    surface: '#121214',
    surfaceElevated: '#1c1c1f',
    surfaceHover: '#2a2a2e',
    shadowOpacity: 0.55
  }
};

// Horizon — twilight copper and deep teal
const horizonTheme: Theme = {
  id: 'horizon',
  name: 'Horizon',
  type: 'dark',
  description: 'Last light — copper embers over deep Pacific teal',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#0c1418',
    bgSecondary: '#122428',
    bgTertiary: '#1a3540',
    bgHover: '#244a58',
    bgActive: '#e8a87c',
    textPrimary: '#f0f7f8',
    textSecondary: '#b8d4dc',
    textMuted: '#7ca3b0',
    borderColor: '#244a58',
    borderHover: '#e8a87c',
    borderSubtle: '#1a3540',
    accentPrimary: '#e8a87c',
    accentSecondary: '#41b3a3',
    accentLight: 'rgba(232, 168, 124, 0.12)',
    accentGlow: 'rgba(65, 179, 163, 0.3)',
    blue: '#5dade2',
    green: '#52d4a4',
    purple: '#b794f6',
    amber: '#f6c978',
    success: '#52d4a4',
    error: '#f78b8b',
    warning: '#f6c978',
    info: '#5dade2',
    sidebarBg: '#122428',
    panelBg: '#0c1418',
    headerBg: '#122428',
    editorBg: '#0c1418',
    editorLineNumber: '#6a9aaa',
    editorSelection: '#1e4555',
    scrollbarThumb: '#244a58',
    scrollbarTrack: '#122428',
    surface: '#122428',
    surfaceElevated: '#1a3540',
    surfaceHover: '#244a58',
    shadowOpacity: 0.48
  }
};

// Arctic — frosted glass light theme
const arcticTheme: Theme = {
  id: 'arctic',
  name: 'Arctic',
  type: 'light',
  description: 'Frost and glacier blue on porcelain white',
  monaco: 'vs',
  colors: {
    bgPrimary: '#f8fcff',
    bgSecondary: '#eef6fb',
    bgTertiary: '#dceef7',
    bgHover: '#c5e3f2',
    bgActive: '#0ea5e9',
    textPrimary: '#1e3a4a',
    textSecondary: '#3d5a6e',
    textMuted: '#5c7d92',
    borderColor: '#c5e3f2',
    borderHover: '#0ea5e9',
    borderSubtle: '#dceef7',
    accentPrimary: '#0ea5e9',
    accentSecondary: '#38bdf8',
    accentLight: '#e0f2fe',
    accentGlow: 'rgba(14, 165, 233, 0.2)',
    blue: '#0284c7',
    green: '#0d9488',
    purple: '#7c3aed',
    amber: '#d97706',
    success: '#0d9488',
    error: '#dc2626',
    warning: '#d97706',
    info: '#0284c7',
    sidebarBg: '#eef6fb',
    panelBg: '#f8fcff',
    headerBg: '#f8fcff',
    editorBg: '#f8fcff',
    editorLineNumber: '#7dd3fc',
    editorSelection: '#bae6fd',
    scrollbarThumb: '#93c5fd',
    scrollbarTrack: '#dceef7',
    surface: '#ffffff',
    surfaceElevated: '#f8fcff',
    surfaceHover: '#eef6fb',
    shadowOpacity: 0.07
  }
};

// Molten — lava glow on volcanic rock
const moltenTheme: Theme = {
  id: 'molten',
  name: 'Molten',
  type: 'dark',
  description: 'Magma core — molten orange and ember red on basalt',
  monaco: 'vs-dark',
  colors: {
    bgPrimary: '#140808',
    bgSecondary: '#1c0c0a',
    bgTertiary: '#2a1210',
    bgHover: '#3d1c18',
    bgActive: '#ff6b35',
    textPrimary: '#fff5f0',
    textSecondary: '#f0c8b8',
    textMuted: '#c49a88',
    borderColor: '#3d1c18',
    borderHover: '#ff6b35',
    borderSubtle: '#2a1210',
    accentPrimary: '#ff6b35',
    accentSecondary: '#ff9f1c',
    accentLight: 'rgba(255, 107, 53, 0.12)',
    accentGlow: 'rgba(255, 159, 28, 0.35)',
    blue: '#7dd3fc',
    green: '#86efac',
    purple: '#e9a8ff',
    amber: '#fcd34d',
    success: '#86efac',
    error: '#ff6b6b',
    warning: '#fcd34d',
    info: '#7dd3fc',
    sidebarBg: '#1c0c0a',
    panelBg: '#140808',
    headerBg: '#1c0c0a',
    editorBg: '#140808',
    editorLineNumber: '#b07868',
    editorSelection: '#5c2018',
    scrollbarThumb: '#3d1c18',
    scrollbarTrack: '#1c0c0a',
    surface: '#1c0c0a',
    surfaceElevated: '#2a1210',
    surfaceHover: '#3d1c18',
    shadowOpacity: 0.55
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
  matrixTheme,
  dinoBuddyTheme,
  auroraTheme,
  blossomTheme,
  emberTheme,
  roseTheme,
  mintTheme,
  sandTheme,
  skyTheme,
  peachTheme,
  neonTokyoTheme,
  synthwaveTheme,
  obsidianTheme,
  horizonTheme,
  arcticTheme,
  moltenTheme
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

