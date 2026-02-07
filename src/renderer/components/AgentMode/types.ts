/**
 * AgentMode Types - Matrix Computer Control
 */

export interface AgentAction {
  id: string;
  action: 'open_app' | 'open_url' | 'run_command' | 'open_file' | 'type_text' | 'shutdown' | 'web_search' | 'web_fetch' |
    // Game launching
    'launch_game' |
    // Smart Controller actions
    'smart_click' | 'smart_type' | 'smart_hotkey' | 'smart_scroll' | 'smart_move_mouse' | 'smart_drag' |
    'smart_screenshot' | 'smart_focus_window' | 'smart_get_windows' | 'smart_mouse_position' | 'smart_window_info' |
    'smart_emergency_stop' | 'smart_resume' |
    // Vault actions
    'vault_unlock' | 'vault_lock' | 'vault_status' | 'vault_list' | 'vault_auto_fill' |
    // Login action
    'login';
  params: Record<string, any>;
  explanation: string;
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
  result?: string;
  error?: string;
  riskLevel: 'safe' | 'moderate' | 'risky';
  timestamp: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  actions?: AgentAction[];
  searchResults?: WebSearchResult[];
}

export type SafetyMode = 'confirm-all' | 'smart' | 'speed';

/**
 * Intelligence levels for Smart Mode
 * - basic: Literal execution - does exactly what you say
 * - smart: Intent understanding - understands context, fills gaps
 * - genius: Proactive enhancement - anticipates needs, adds improvements
 */
export type IntelligenceLevel = 'basic' | 'smart' | 'genius';

/**
 * Labels and styling for intelligence levels
 */
export const INTELLIGENCE_LEVEL_CONFIG: Record<IntelligenceLevel, { 
  name: string; 
  icon: string; 
  description: string;
  color: string;
}> = {
  basic: {
    name: 'BASIC',
    icon: '○',
    description: 'Literal execution',
    color: '#888888'
  },
  smart: {
    name: 'SMART',
    icon: '◐',
    description: 'Intent understanding',
    color: '#00ff00'
  },
  genius: {
    name: 'GENIUS',
    icon: '●',
    description: 'Proactive enhancement',
    color: '#ffcc00'
  }
};

export interface AgentModeState {
  isOpen: boolean;
  safetyMode: SafetyMode;
  webSearchEnabled: boolean;
  intelligenceLevel: IntelligenceLevel;
  messages: AgentMessage[];
  pendingActions: AgentAction[];
  isProcessing: boolean;
  currentAction: AgentAction | null;
}

// Actions that are considered safe and can auto-execute in Smart mode
export const SAFE_ACTIONS: Record<string, string[]> = {
  open_app: [
    // Browsers
    'chrome', 'firefox', 'edge', 'safari', 'brave', 'opera',
    // Development
    'vscode', 'cursor', 'sublime', 'notepad', 'notepad++', 'terminal', 'cmd', 'powershell',
    // Utilities
    'calculator', 'explorer', 'file explorer', 'finder', 'settings', 'task manager',
    // Communication
    'spotify', 'discord', 'slack', 'teams', 'zoom', 'telegram', 'whatsapp', 'signal', 'skype',
    // Gaming (launchers are safe to open)
    'steam', 'epic games', 'epic', 'gog galaxy', 'battle.net', 'blizzard', 'origin', 'ea', 'ubisoft', 'uplay', 'xbox',
    // Media
    'vlc', 'itunes', 'music', 'photos', 'obs',
    // Productivity
    'word', 'excel', 'powerpoint', 'outlook', 'onenote', 'notion', 'obsidian',
    // Graphics
    'figma', 'blender', 'gimp', 'paint',
    // Misc
    'snipping tool', 'snip', 'mail', 'calendar', 'clock', 'weather', 'maps'
  ],
  launch_game: [], // All game launches are safe - just opens a game
  open_url: [], // All URLs are safe
  web_search: [], // Web search is always safe (just reading)
  web_fetch: [], // Web fetch is safe (just reading)
  // Smart Controller safe actions
  smart_screenshot: [], // Read-only
  smart_mouse_position: [], // Read-only
  smart_window_info: [], // Read-only
  smart_get_windows: [], // Read-only
  vault_status: [], // Read-only
  smart_scroll: [], // Low risk
  smart_move_mouse: [], // Low risk
};

// Actions that always require confirmation (ONLY credential/security-related)
export const RISKY_ACTIONS = [
  'run_command', 
  'shutdown', 
  'open_file',
  // Only credential-related actions are risky
  'login', // Accesses credentials
  'vault_unlock', // Vault access
  'vault_auto_fill', // Auto-fills passwords
  'smart_emergency_stop', // Safety action - still confirm
];

// Safe automation actions (moved from risky for better performance)
export const SAFE_AUTOMATION_ACTIONS = [
  'smart_click',
  'smart_type',
  'smart_hotkey',
  'smart_focus_window',
  'smart_drag',
  'smart_scroll',
  'smart_move_mouse',
];

export function classifyActionRisk(action: AgentAction): 'safe' | 'moderate' | 'risky' {
  if (RISKY_ACTIONS.includes(action.action)) {
    return 'risky';
  }
  
  if (action.action === 'open_app') {
    const appName = (action.params.app || '').toLowerCase();
    if (SAFE_ACTIONS.open_app.includes(appName)) {
      return 'safe';
    }
    return 'moderate';
  }
  
  if (action.action === 'open_url') {
    return 'safe';
  }
  
  // Game launching is always safe - just opens a game
  if (action.action === 'launch_game') {
    return 'safe';
  }
  
  // Web search and fetch are safe - read-only operations
  if (action.action === 'web_search' || action.action === 'web_fetch') {
    return 'safe';
  }
  
  return 'moderate';
}
