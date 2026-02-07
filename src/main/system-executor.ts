/**
 * System Executor - Voice-Activated Computer Control
 * Like Cursor/Lovable/Devin - actually controls your computer
 * Enhanced with Smart Controller for full PC automation
 * 
 * Now with SMART SYSTEM DISCOVERY - scans your system on startup
 * to know exactly what games and apps are installed
 */

import { exec, spawn } from 'child_process';
import { platform } from 'os';
import * as path from 'path';
import { shell } from 'electron';

// Import Smart Controller components (lazy loaded for performance)
import { 
  getSmartController, 
  getAutomationControllerInstance, 
  getScreenCaptureService, 
  getCredentialVaultInstance 
} from './smart-controller';

// Import System Discovery for smart game/app detection
import { systemDiscovery, InstalledGame } from './system-discovery';

// Import DirectControl for native API integrations (Calendar, Email, etc.)
import { DirectControl } from './modules/direct-control';

// ═══════════════════════════════════════════════════════════════════════════
// STEAM GAME ID DATABASE - Popular games for instant launching
// ═══════════════════════════════════════════════════════════════════════════
const STEAM_GAME_IDS: Record<string, number> = {
  // Valve Games
  'left 4 dead 2': 550,
  'l4d2': 550,
  'left 4 dead': 500,
  'l4d': 500,
  'counter-strike 2': 730,
  'cs2': 730,
  'csgo': 730,
  'counter-strike': 730,
  'dota 2': 570,
  'dota': 570,
  'team fortress 2': 440,
  'tf2': 440,
  'half-life 2': 220,
  'hl2': 220,
  'portal 2': 620,
  'portal': 400,
  'garrys mod': 4000,
  'gmod': 4000,
  
  // Popular Multiplayer
  'pubg': 578080,
  'playerunknowns battlegrounds': 578080,
  'rust': 252490,
  'ark survival evolved': 346110,
  'ark': 346110,
  'terraria': 105600,
  'dont starve together': 322330,
  'among us': 945360,
  'fall guys': 1097150,
  'rocket league': 252950,
  'dead by daylight': 381210,
  'phasmophobia': 739630,
  'valheim': 892970,
  'lethal company': 1966720,
  'content warning': 2881650,
  'raft': 648800,
  'the forest': 242760,
  'sons of the forest': 1326470,
  
  // RPGs & Action
  'elden ring': 1245620,
  'dark souls 3': 374320,
  'dark souls': 570940,
  'sekiro': 814380,
  'skyrim': 489830,
  'skyrim special edition': 489830,
  'fallout 4': 377160,
  'fallout new vegas': 22380,
  'witcher 3': 292030,
  'the witcher 3': 292030,
  'cyberpunk 2077': 1091500,
  'cyberpunk': 1091500,
  'baldurs gate 3': 1086940,
  'bg3': 1086940,
  'monster hunter world': 582010,
  'monster hunter rise': 1446780,
  'hogwarts legacy': 990080,
  'dragons dogma 2': 2054970,
  'pathfinder wrath of the righteous': 1184370,
  'divinity original sin 2': 435150,
  
  // Shooters
  'apex legends': 1172470,
  'apex': 1172470,
  'destiny 2': 1085660,
  'destiny': 1085660,
  'warframe': 230410,
  'rainbow six siege': 359550,
  'r6': 359550,
  'helldivers 2': 553850,
  'deep rock galactic': 548430,
  'payday 2': 218620,
  'payday 3': 1272080,
  'hunt showdown': 594650,
  'ready or not': 1144200,
  'squad': 393380,
  'arma 3': 107410,
  'insurgency sandstorm': 581320,
  
  // Strategy & Simulation
  'civilization 6': 289070,
  'civ 6': 289070,
  'cities skylines': 255710,
  'cities skylines 2': 949230,
  'europa universalis 4': 236850,
  'eu4': 236850,
  'crusader kings 3': 1158310,
  'ck3': 1158310,
  'hearts of iron 4': 394360,
  'hoi4': 394360,
  'stellaris': 281990,
  'total war warhammer 3': 1142710,
  'rimworld': 294100,
  'factorio': 427520,
  'satisfactory': 526870,
  'stardew valley': 413150,
  'planet zoo': 703080,
  'planet coaster': 493340,
  'two point hospital': 535930,
  
  // Horror & Survival
  'resident evil 4': 2050650,
  're4': 2050650,
  'resident evil village': 1196590,
  'resident evil 2': 883710,
  'alan wake 2': 2084880,
  'outlast': 238320,
  'amnesia': 57300,
  'subnautica': 264710,
  'subnautica below zero': 848450,
  'green hell': 815370,
  'the long dark': 305620,
  '7 days to die': 251570,
  'dayz': 221100,
  'project zomboid': 108600,
  
  // Racing & Sports
  'forza horizon 5': 1551360,
  'forza horizon 4': 1293830,
  'assetto corsa': 244210,
  'assetto corsa competizione': 805550,
  'f1 23': 2108330,
  'f1 24': 2488620,
  'gran turismo 7': 0, // Not on Steam, placeholder
  'dirt rally 2': 690790,
  'nba 2k24': 2338770,
  'fifa 24': 0, // EA Play
  'ea sports fc 24': 2195250,
  
  // Indie & Roguelikes
  'hades': 1145360,
  'hades 2': 1145350,
  'hollow knight': 367520,
  'silksong': 1030300,
  'celeste': 504230,
  'dead cells': 588650,
  'slay the spire': 646570,
  'cult of the lamb': 1313140,
  'enter the gungeon': 311690,
  'risk of rain 2': 632360,
  'binding of isaac': 250900,
  'isaac rebirth': 250900,
  'vampire survivors': 1794680,
  'undertale': 391540,
  'cuphead': 268910,
  'shovel knight': 250760,
  
  // Sandbox & Creative
  'minecraft': 0, // Not on Steam
  'no mans sky': 275850,
  'astroneer': 361420,
  'core keeper': 1621690,
  'grounded': 962130,
  'lego fortnite': 0, // Not on Steam
  'roblox': 0, // Not on Steam
  
  // VR
  'beat saber': 620980,
  'boneworks': 823500,
  'half-life alyx': 546560,
  'blade and sorcery': 629730,
  'pavlov vr': 555160,
  'gorilla tag': 1533390,
  'vr chat': 438100,
  'vrchat': 438100,
  
  // MMOs
  'final fantasy xiv': 39210,
  'ffxiv': 39210,
  'ff14': 39210,
  'guild wars 2': 1284210,
  'gw2': 1284210,
  'elder scrolls online': 306130,
  'eso': 306130,
  'lost ark': 1599340,
  'black desert online': 582660,
  'bdo': 582660,
  'new world': 1063730,
  'path of exile': 238960,
  'poe': 238960,
  'path of exile 2': 2694490,
  'poe2': 2694490,
  
  // Other Popular
  'grand theft auto v': 271590,
  'gta v': 271590,
  'gta 5': 271590,
  'red dead redemption 2': 1174180,
  'rdr2': 1174180,
  'sea of thieves': 1172620,
  'palworld': 1623730,
  'enshrouded': 1203620,
  'manor lords': 1363080,
  'dave the diver': 1868140,
  'lies of p': 1627720,
  'armored core 6': 1888160,
  'ac6': 1888160,
  'starfield': 1716740,
  'like a dragon infinite wealth': 2072220,
  'persona 5 royal': 1687950,
  'persona 3 reload': 2161700,
  'final fantasy 7 rebirth': 0, // PS exclusive for now
  'ff7 remake': 1462040,
  'street fighter 6': 1364780,
  'sf6': 1364780,
  'mortal kombat 1': 1971870,
  'mk1': 1971870,
  'tekken 8': 1778820,
};

// Protocol URIs for apps (more reliable than shell commands)
const PROTOCOL_APPS: Record<string, string> = {
  'steam': 'steam://',
  'discord': 'discord://',
  'spotify': 'spotify://',
  'slack': 'slack://',
  'teams': 'msteams://',
  'zoom': 'zoommtg://',
  'telegram': 'tg://',
  'whatsapp': 'whatsapp://',
  'signal': 'signal://',
  'skype': 'skype://',
  'epic': 'com.epicgames.launcher://',
  'epic games': 'com.epicgames.launcher://',
  'gog': 'goggalaxy://',
  'gog galaxy': 'goggalaxy://',
  'battlenet': 'battlenet://',
  'battle.net': 'battlenet://',
  'blizzard': 'battlenet://',
  'origin': 'origin://',
  'ea': 'origin://',
  'ubisoft': 'uplay://',
  'uplay': 'uplay://',
  'xbox': 'xbox://',
  'notion': 'notion://',
  'obsidian': 'obsidian://',
  'figma': 'figma://',
  'onenote': 'onenote://',
  'settings': 'ms-settings://',
  'ms-settings': 'ms-settings://',
};

export interface SystemAction {
  action: string;
  target?: string;
  url?: string;
  command?: string;
  app?: string;
  text?: string;
  volume?: number;
  path?: string;
  // Smart Controller actions
  x?: number;
  y?: number;
  button?: 'left' | 'right' | 'middle';
  double?: boolean;
  keys?: string[];
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  duration?: number;
  credentialId?: string;
  quality?: 'high' | 'medium' | 'low';
  // Add more action types as needed
}

export class SystemExecutor {
  private isWindows = platform() === 'win32';
  private isMac = platform() === 'darwin';
  private isLinux = platform() === 'linux';

  /**
   * Execute a system action
   */
  async execute(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    try {
      switch (action.action) {
        case 'open_app':
          return await this.openApp(action.app!);

        case 'launch_game':
          return await this.launchGame(action.target || action.app!);

        case 'open_url':
          return await this.openUrl(action.url!);

        case 'run_command':
          return await this.runSystemCommand(action.command!);

        case 'type_text':
          return await this.typeText(action.text!);

        case 'press_key':
          return await this.pressKey(action.target!);

        case 'set_volume':
          return await this.setVolume(action.volume!);

        case 'open_file':
          return await this.openFile(action.path!);

        case 'take_screenshot':
          return await this.takeScreenshot();

        case 'play_sound':
          return await this.playSound(action.path!);

        case 'get_weather':
          return await this.getWeather(action.target);

        case 'set_reminder':
          return await this.setReminder(action.text!);

        case 'shutdown':
          return await this.shutdown(action.target || 'shutdown');

        // ═══════════════════════════════════════════════════════════════
        // SMART CONTROLLER ACTIONS - Full PC Automation
        // ═══════════════════════════════════════════════════════════════

        case 'smart_click':
          return await this.smartClick(action);

        case 'smart_type':
          return await this.smartType(action);

        case 'smart_hotkey':
          return await this.smartHotkey(action);

        case 'smart_scroll':
          return await this.smartScroll(action);

        case 'smart_move_mouse':
          return await this.smartMoveMouse(action);

        case 'smart_drag':
          return await this.smartDrag(action);

        case 'smart_screenshot':
          return await this.smartScreenshot(action);

        case 'smart_focus_window':
          return await this.smartFocusWindow(action);

        case 'smart_get_windows':
          return await this.smartGetWindows();

        case 'smart_mouse_position':
          return await this.smartGetMousePosition();

        case 'smart_window_info':
          return await this.smartGetWindowInfo();

        case 'smart_emergency_stop':
          return this.smartEmergencyStop();

        case 'smart_resume':
          return this.smartResume();

        // Credential Vault Actions
        case 'vault_unlock':
          return await this.vaultUnlock(action);

        case 'vault_lock':
          return this.vaultLock();

        case 'vault_status':
          return this.vaultStatus();

        case 'vault_list':
          return this.vaultList();

        case 'vault_auto_fill':
          return await this.vaultAutoFill(action);

        // ═══════════════════════════════════════════════════════════════
        // DIRECT CONTROL ACTIONS - Native API Integrations
        // ═══════════════════════════════════════════════════════════════

        case 'calendar_add_event':
          return await this.calendarAddEvent(action);

        case 'calendar_read':
          return await this.calendarRead(action);

        case 'calendar_today':
          return await this.calendarToday();

        case 'email_send':
          return await this.emailSend(action);

        case 'email_read':
          return await this.emailRead(action);

        case 'email_unread_count':
          return await this.emailUnreadCount();

        case 'contacts_search':
          return await this.contactsSearch(action);

        case 'notification_show':
          return await this.notificationShow(action);

        case 'reminder_create':
          return await this.reminderCreate(action);

        case 'datetime_get':
          return this.datetimeGet();

        case 'system_lock':
          return await this.systemLock();

        case 'volume_set':
          return await this.volumeSet(action);

        case 'mute_toggle':
          return await this.muteToggle();

        // Desktop Control - Smart icon manipulation
        case 'desktop_list':
          return await this.desktopList();

        case 'desktop_move':
          return await this.desktopMove(action);

        case 'desktop_find':
          return await this.desktopFind(action);

        case 'desktop_arrange':
          return await this.desktopArrange(action);

        default:
          return {
            success: false,
            message: `Unknown action: ${action.action}`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Action failed: ${error.message}`
      };
    }
  }

  /**
   * Launch a game by name - SMART VERSION
   * 1. First checks system discovery for actually installed games
   * 2. Falls back to hardcoded database if not found
   * Uses steam://rungameid/ protocol for reliable game launching
   */
  private async launchGame(gameName: string): Promise<{ success: boolean; message: string }> {
    const normalizedName = gameName.toLowerCase().trim();
    
    // SMART: First check system discovery - these are ACTUALLY installed
    const discoveredGame = systemDiscovery.findGame(normalizedName);
    if (discoveredGame) {
      try {
        const steamUrl = `steam://rungameid/${discoveredGame.appId}`;
        await shell.openExternal(steamUrl);
        return {
          success: true,
          message: `Launching ${discoveredGame.name} (detected as installed)`
        };
      } catch (error: any) {
        console.warn(`Failed to launch discovered game: ${error.message}`);
      }
    }
    
    // Fallback: Check hardcoded database
    const steamGameId = STEAM_GAME_IDS[normalizedName];
    if (steamGameId && steamGameId > 0) {
      try {
        const steamUrl = `steam://rungameid/${steamGameId}`;
        await shell.openExternal(steamUrl);
        return {
          success: true,
          message: `Launching ${gameName} via Steam (App ID: ${steamGameId})`
        };
      } catch (error: any) {
        console.warn(`Failed to launch game via Steam URL: ${error.message}`);
      }
    }
    
    // Try to find a partial match in hardcoded database
    const partialMatch = Object.entries(STEAM_GAME_IDS).find(([key]) => 
      key.includes(normalizedName) || normalizedName.includes(key)
    );
    
    if (partialMatch && partialMatch[1] > 0) {
      try {
        const steamUrl = `steam://rungameid/${partialMatch[1]}`;
        await shell.openExternal(steamUrl);
        return {
          success: true,
          message: `Launching ${partialMatch[0]} via Steam (matched from "${gameName}")`
        };
      } catch (error: any) {
        console.warn(`Failed to launch game via partial match: ${error.message}`);
      }
    }
    
    // AGGRESSIVE: Try to launch via Steam store/install - Steam will handle it!
    // Even if we don't know the App ID, Steam can find and launch installed games
    console.log(`[SystemExecutor] Game "${gameName}" not in database, trying Steam search...`);
    
    // Try opening Steam's game library and let the user/Steam find it
    try {
      // First try: Open Steam and navigate to games library
      await shell.openExternal('steam://open/games');
      
      // Give Steam a moment to open, then try to use its search
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Type the game name into Steam's search (via automation if available)
      try {
        const automation = getAutomationControllerInstance();
        // Press Ctrl+F to open Steam search, then type the game name
        await automation.hotkey('ctrl', 'f');
        await new Promise(resolve => setTimeout(resolve, 300));
        await automation.typeText(gameName, { delay: 30 });
        await new Promise(resolve => setTimeout(resolve, 500));
        await automation.pressKey('Enter');
        
        return {
          success: true,
          message: `Searching for "${gameName}" in Steam library. Press Enter to launch when found!`
        };
      } catch (autoError) {
        // Automation failed, but Steam is open
        return {
          success: true,
          message: `Opened Steam games library. Search for "${gameName}" to launch it.`
        };
      }
    } catch {
      // List what IS installed to help the user
      const capabilities = systemDiscovery.getCapabilities();
      const installedGames = capabilities.installedGames.slice(0, 10).map(g => g.name).join(', ');
      
      return {
        success: false,
        message: `Could not find "${gameName}". Detected games: ${installedGames || 'None - check Steam library paths'}`
      };
    }
  }

  /**
   * Open an application using the most reliable method available
   * Priority: 1) Check if it's a game (redirect to launchGame), 2) Protocol URIs, 3) Direct commands
   */
  private async openApp(appName: string): Promise<{ success: boolean; message: string }> {
    const normalizedName = appName.toLowerCase().trim();
    
    // SMART: Check if this is actually a game - if so, use launchGame instead
    const discoveredGame = systemDiscovery.findGame(normalizedName);
    if (discoveredGame) {
      console.log(`[SystemExecutor] "${appName}" is a game, redirecting to launchGame`);
      return this.launchGame(appName);
    }
    
    // First, try protocol-based launching (most reliable for registered apps)
    const protocolUri = PROTOCOL_APPS[normalizedName];
    if (protocolUri) {
      try {
        await shell.openExternal(protocolUri);
        return {
          success: true,
          message: `Opened ${appName}`
        };
      } catch (error: any) {
        console.warn(`Protocol launch failed for ${appName}: ${error.message}, trying fallback...`);
        // Continue to fallback methods
      }
    }
    
    // Fallback: shell commands for apps without protocol handlers
    const appCommands: Record<string, string> = {
      // Browsers (use direct executables, more reliable)
      'chrome': this.isWindows ? 'start chrome' : this.isMac ? 'open -a "Google Chrome"' : 'google-chrome',
      'google chrome': this.isWindows ? 'start chrome' : this.isMac ? 'open -a "Google Chrome"' : 'google-chrome',
      'firefox': this.isWindows ? 'start firefox' : this.isMac ? 'open -a Firefox' : 'firefox',
      'safari': this.isMac ? 'open -a Safari' : 'Browser not available on this platform',
      'edge': this.isWindows ? 'start msedge' : 'Microsoft Edge not available on this platform',
      'microsoft edge': this.isWindows ? 'start msedge' : 'Microsoft Edge not available on this platform',
      'brave': this.isWindows ? 'start brave' : this.isMac ? 'open -a "Brave Browser"' : 'brave-browser',
      'opera': this.isWindows ? 'start opera' : this.isMac ? 'open -a Opera' : 'opera',
      
      // Development
      'vscode': this.isWindows ? 'code' : this.isMac ? 'open -a "Visual Studio Code"' : 'code',
      'visual studio code': this.isWindows ? 'code' : this.isMac ? 'open -a "Visual Studio Code"' : 'code',
      'cursor': this.isWindows ? 'start "" "C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\cursor\\Cursor.exe"' : this.isMac ? 'open -a Cursor' : 'cursor',
      'visual studio': this.isWindows ? 'start devenv' : 'Visual Studio not available',
      'sublime': this.isWindows ? 'start sublime_text' : this.isMac ? 'open -a "Sublime Text"' : 'subl',
      'sublime text': this.isWindows ? 'start sublime_text' : this.isMac ? 'open -a "Sublime Text"' : 'subl',
      'notepad': this.isWindows ? 'notepad' : this.isMac ? 'open -a TextEdit' : 'gedit',
      'notepad++': this.isWindows ? 'start notepad++' : 'Notepad++ not available on this platform',
      
      // Utilities
      'calculator': this.isWindows ? 'calc' : this.isMac ? 'open -a Calculator' : 'gnome-calculator',
      'calc': this.isWindows ? 'calc' : this.isMac ? 'open -a Calculator' : 'gnome-calculator',
      'terminal': this.isWindows ? 'start cmd' : this.isMac ? 'open -a Terminal' : 'gnome-terminal',
      'cmd': this.isWindows ? 'start cmd' : 'CMD not available on this platform',
      'command prompt': this.isWindows ? 'start cmd' : 'CMD not available on this platform',
      'powershell': this.isWindows ? 'start powershell' : 'PowerShell not available',
      'explorer': this.isWindows ? 'explorer' : this.isMac ? 'open .' : 'nautilus .',
      'file explorer': this.isWindows ? 'explorer' : this.isMac ? 'open .' : 'nautilus .',
      'finder': this.isMac ? 'open -a Finder' : 'Finder not available',
      'control panel': this.isWindows ? 'control' : 'Control Panel not available',
      'task manager': this.isWindows ? 'taskmgr' : this.isMac ? 'open -a "Activity Monitor"' : 'gnome-system-monitor',
      'activity monitor': this.isMac ? 'open -a "Activity Monitor"' : 'gnome-system-monitor',
      
      // Media
      'vlc': this.isWindows ? 'start vlc' : this.isMac ? 'open -a VLC' : 'vlc',
      'vlc media player': this.isWindows ? 'start vlc' : this.isMac ? 'open -a VLC' : 'vlc',
      'itunes': this.isWindows ? 'start itunes' : this.isMac ? 'open -a Music' : 'iTunes not available',
      'music': this.isMac ? 'open -a Music' : this.isWindows ? 'start mswindowsmusic:' : 'rhythmbox',
      'photos': this.isWindows ? 'start ms-photos:' : this.isMac ? 'open -a Photos' : 'eog',
      'obs': this.isWindows ? 'start obs64' : this.isMac ? 'open -a OBS' : 'obs',
      'obs studio': this.isWindows ? 'start obs64' : this.isMac ? 'open -a OBS' : 'obs',
      
      // Productivity
      'word': this.isWindows ? 'start winword' : this.isMac ? 'open -a "Microsoft Word"' : 'libreoffice --writer',
      'microsoft word': this.isWindows ? 'start winword' : this.isMac ? 'open -a "Microsoft Word"' : 'libreoffice --writer',
      'excel': this.isWindows ? 'start excel' : this.isMac ? 'open -a "Microsoft Excel"' : 'libreoffice --calc',
      'microsoft excel': this.isWindows ? 'start excel' : this.isMac ? 'open -a "Microsoft Excel"' : 'libreoffice --calc',
      'powerpoint': this.isWindows ? 'start powerpnt' : this.isMac ? 'open -a "Microsoft PowerPoint"' : 'libreoffice --impress',
      'outlook': this.isWindows ? 'start outlook' : this.isMac ? 'open -a "Microsoft Outlook"' : 'thunderbird',
      
      // Graphics/Design
      'photoshop': this.isWindows ? 'start photoshop' : this.isMac ? 'open -a "Adobe Photoshop"' : 'photoshop',
      'blender': this.isWindows ? 'start blender' : this.isMac ? 'open -a Blender' : 'blender',
      'gimp': this.isWindows ? 'start gimp' : this.isMac ? 'open -a GIMP' : 'gimp',
      
      // Misc Windows utilities
      'snipping tool': this.isWindows ? 'start snippingtool' : 'Snipping Tool not available',
      'snip': this.isWindows ? 'start ms-screenclip:' : 'Snipping not available',
      'paint': this.isWindows ? 'start mspaint' : 'Paint not available',
      'mail': this.isWindows ? 'start outlookmail:' : this.isMac ? 'open -a Mail' : 'thunderbird',
      'calendar': this.isWindows ? 'start outlookcal:' : this.isMac ? 'open -a Calendar' : 'gnome-calendar',
      'clock': this.isWindows ? 'start ms-clock:' : this.isMac ? 'open -a Clock' : 'gnome-clocks',
      'weather': this.isWindows ? 'start bingweather:' : 'Weather app not available',
      'maps': this.isWindows ? 'start bingmaps:' : this.isMac ? 'open -a Maps' : 'gnome-maps',
    };

    const command = appCommands[normalizedName];
    if (command) {
      try {
        await this.runCommand(command, { tolerateNonZero: true });
        return {
          success: true,
          message: `Opened ${appName}`
        };
      } catch (error: any) {
        // If command fails, try protocol as last resort
        if (protocolUri) {
          try {
            await shell.openExternal(protocolUri);
            return { success: true, message: `Opened ${appName}` };
          } catch { /* continue to error */ }
        }
        return {
          success: false,
          message: `Failed to open ${appName}: ${error.message}`
        };
      }
    }

    // Final fallback: try to launch the app directly by name
    try {
      const directCommand = this.isWindows 
        ? `start "" "${appName}"` 
        : this.isMac 
          ? `open -a "${appName}"` 
          : appName.toLowerCase();
      
      await this.runCommand(directCommand, { tolerateNonZero: true });
      return {
        success: true,
        message: `Opened ${appName}`
      };
    } catch {
      // List some available apps in the error
      const availableApps = [...Object.keys(PROTOCOL_APPS), ...Object.keys(appCommands)]
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 25);
      return {
        success: false,
        message: `Unknown app: ${appName}. Try: ${availableApps.join(', ')}...`
      };
    }
  }

  private async openUrl(url: string): Promise<{ success: boolean; message: string }> {
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    try {
      // Use Electron's shell.openExternal for reliable URL opening
      await shell.openExternal(url);
      return {
        success: true,
        message: `Opened ${url}`
      };
    } catch (error: any) {
      // Fallback to command-based approach
      const command = this.isWindows ? `start "" "${url}"` :
                     this.isMac ? `open "${url}"` :
                     `xdg-open "${url}"`;
      
      await this.runCommand(command, { tolerateNonZero: true });
      return {
        success: true,
        message: `Opened ${url}`
      };
    }
  }

  private async runSystemCommand(command: string): Promise<{ success: boolean; message: string; result?: any }> {
    // Detect protocol URLs (steam://, discord://, etc.) and handle them properly
    // This catches cases where the AI incorrectly uses run_command for protocol URLs
    const protocolMatch = command.match(/^([a-z]+):\/\//i) || command.match(/^([a-z]+):/i);
    if (protocolMatch) {
      const protocol = protocolMatch[1].toLowerCase();
      const knownProtocols = ['steam', 'discord', 'spotify', 'slack', 'teams', 'zoom', 'telegram', 'whatsapp', 'http', 'https', 'file'];
      
      if (knownProtocols.includes(protocol)) {
        try {
          await shell.openExternal(command);
          return {
            success: true,
            message: `Opened ${command}`,
            result: 'Launched via protocol handler'
          };
        } catch (error: any) {
          return {
            success: false,
            message: `Failed to open protocol URL: ${error.message}`
          };
        }
      }
    }
    
    try {
      const result = await this.runCommand(command);
      return {
        success: true,
        message: `Executed: ${command}`,
        result
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Command failed: ${error.message}`
      };
    }
  }

  private async typeText(text: string): Promise<{ success: boolean; message: string }> {
    // This would require additional libraries like robotjs or similar
    // For now, we'll simulate typing feedback
    console.log(`Would type: ${text}`);
    return {
      success: false,
      message: 'Text typing not implemented yet (requires robotjs)'
    };
  }

  private async pressKey(key: string): Promise<{ success: boolean; message: string }> {
    // This would also require robotjs or similar
    console.log(`Would press: ${key}`);
    return {
      success: false,
      message: 'Key press not implemented yet (requires robotjs)'
    };
  }

  private async setVolume(volume: number): Promise<{ success: boolean; message: string }> {
    // Volume control would be platform-specific
    console.log(`Would set volume to: ${volume}%`);
    return {
      success: false,
      message: 'Volume control not implemented yet'
    };
  }

  private async openFile(filePath: string): Promise<{ success: boolean; message: string }> {
    try {
      // Use Electron's shell for reliable file opening
      await shell.openPath(filePath);
      return {
        success: true,
        message: `Opened file: ${filePath}`
      };
    } catch (error: any) {
      // Fallback to command-based approach
      const command = this.isWindows ? `start "" "${filePath}"` :
                     this.isMac ? `open "${filePath}"` :
                     `xdg-open "${filePath}"`;

      await this.runCommand(command, { tolerateNonZero: true });
      return {
        success: true,
        message: `Opened file: ${filePath}`
      };
    }
  }

  private async takeScreenshot(): Promise<{ success: boolean; message: string; result?: string }> {
    // Screenshot would require additional libraries
    console.log('Would take screenshot');
    return {
      success: false,
      message: 'Screenshot not implemented yet'
    };
  }

  private async playSound(soundPath: string): Promise<{ success: boolean; message: string }> {
    console.log(`Would play sound: ${soundPath}`);
    return {
      success: false,
      message: 'Sound playback not implemented yet'
    };
  }

  private async getWeather(location?: string): Promise<{ success: boolean; message: string; result?: any }> {
    // Weather API call would be needed
    console.log(`Would get weather for: ${location || 'current location'}`);
    return {
      success: false,
      message: 'Weather lookup not implemented yet'
    };
  }

  private async setReminder(text: string): Promise<{ success: boolean; message: string }> {
    console.log(`Would set reminder: ${text}`);
    return {
      success: false,
      message: 'Reminders not implemented yet'
    };
  }

  private async shutdown(type: string): Promise<{ success: boolean; message: string }> {
    if (type === 'cancel') {
      const command = this.isWindows ? 'shutdown /a' :
                     this.isMac ? 'sudo pmset cancel' :
                     'shutdown -c';
      await this.runCommand(command);
      return {
        success: true,
        message: 'Shutdown cancelled'
      };
    } else {
      // Don't actually shutdown - too dangerous
      return {
        success: false,
        message: 'Shutdown blocked for safety'
      };
    }
  }

  /**
   * Execute a shell command with optional tolerant error handling
   * @param command The command to execute
   * @param options.tolerateNonZero If true, don't reject on non-zero exit codes (useful for protocol handlers)
   * @param options.timeout Timeout in milliseconds (default: 30000)
   * 
   * PERFORMANCE: Uses cmd.exe directly on Windows to avoid PowerShell module loading delays
   */
  private runCommand(command: string, options?: { tolerateNonZero?: boolean; timeout?: number }): Promise<string> {
    const { tolerateNonZero = false, timeout = 30000 } = options || {};
    
    return new Promise((resolve, reject) => {
      // PERFORMANCE: On Windows, use cmd.exe directly instead of shell: true
      // This avoids PowerShell module initialization which causes "Preparing modules for first use" delays
      let child;
      
      if (this.isWindows) {
        // Check if command explicitly needs PowerShell
        const needsPowerShell = command.toLowerCase().startsWith('powershell') || 
                                 command.includes('$') || 
                                 command.includes('Get-') ||
                                 command.includes('Set-') ||
                                 command.includes('|') && command.includes('Where-Object');
        
        if (needsPowerShell) {
          // Use PowerShell with -NoProfile for speed and suppress progress
          const psCommand = command.toLowerCase().startsWith('powershell') 
            ? command 
            : `powershell -NoProfile -NoLogo -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; ${command.replace(/"/g, '\\"')}"`;
          child = spawn('cmd.exe', ['/c', psCommand], {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
          });
        } else {
          // Use cmd.exe directly - MUCH faster
          child = spawn('cmd.exe', ['/c', command], {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
          });
        }
      } else {
        // Unix - use shell normally
        child = spawn(command, {
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      }

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Timeout handler for commands that hang
      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill();
        // For "start" commands on Windows, timing out is often success
        // because the command launches a detached process
        if (command.toLowerCase().includes('start ') && this.isWindows) {
          resolve(stdout);
        } else {
          reject(new Error(`Command timed out after ${timeout}ms`));
        }
      }, timeout);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        // Filter out PowerShell CLIXML progress messages
        const text = data.toString();
        if (!text.includes('CLIXML') && !text.includes('Preparing modules')) {
          stderr += text;
        }
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        if (timedOut) return;
        
        if (code === 0) {
          resolve(stdout);
        } else if (tolerateNonZero) {
          // For protocol handlers and "start" commands, non-zero codes don't mean failure
          // The Windows "start" command often returns 1 even when it successfully launches an app
          console.log(`Command "${command}" exited with code ${code}, but tolerating as success`);
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        if (timedOut) return;
        reject(error);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // SMART CONTROLLER METHODS - Full PC Automation
  // ═══════════════════════════════════════════════════════════════

  private async smartClick(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    const result = await getAutomationControllerInstance().click({
      x: action.x,
      y: action.y,
      button: action.button || 'left',
      double: action.double || false
    });
    return result;
  }

  private async smartType(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    if (!action.text) {
      return { success: false, message: 'No text provided for typing' };
    }
    return await getAutomationControllerInstance().typeText(action.text, { delay: action.duration });
  }

  private async smartHotkey(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    if (!action.keys || action.keys.length === 0) {
      return { success: false, message: 'No keys provided for hotkey' };
    }
    return await getAutomationControllerInstance().hotkey(...action.keys);
  }

  private async smartScroll(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    return await getAutomationControllerInstance().scroll({
      direction: action.direction || 'down',
      amount: action.amount || 3
    });
  }

  private async smartMoveMouse(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    if (action.x === undefined || action.y === undefined) {
      return { success: false, message: 'No coordinates provided for mouse move' };
    }
    return await getAutomationControllerInstance().moveMouse(action.x, action.y);
  }

  private async smartDrag(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    // Expects params: fromX, fromY, toX, toY (we'll use x, y as from and target as "toX,toY")
    if (action.x === undefined || action.y === undefined) {
      return { success: false, message: 'No coordinates provided for drag' };
    }
    const [toX, toY] = (action.target || '').split(',').map(Number);
    if (isNaN(toX) || isNaN(toY)) {
      return { success: false, message: 'Invalid target coordinates for drag (use "x,y" format)' };
    }
    return await getAutomationControllerInstance().drag(action.x, action.y, toX, toY, action.duration || 500);
  }

  private async smartScreenshot(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    try {
      const quality = action.quality || 'medium';
      let capture;
      
      if (action.target === 'window') {
        capture = await getScreenCaptureService().captureActiveWindow(quality);
      } else if (action.x !== undefined && action.y !== undefined && action.amount !== undefined) {
        // Capture region (x, y, width stored in amount for simplicity)
        capture = await getScreenCaptureService().captureRegion({
          x: action.x,
          y: action.y,
          width: action.amount,
          height: action.duration || action.amount
        }, quality);
      } else {
        capture = await getScreenCaptureService().captureScreen(quality);
      }
      
      return {
        success: true,
        message: `Screenshot captured (${capture.width}x${capture.height})`,
        result: {
          width: capture.width,
          height: capture.height,
          timestamp: capture.timestamp,
          base64: capture.base64.substring(0, 100) + '...' // Preview only
        }
      };
    } catch (error: any) {
      return { success: false, message: `Screenshot failed: ${error.message}` };
    }
  }

  private async smartFocusWindow(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    if (!action.target) {
      return { success: false, message: 'No window title provided' };
    }
    return await getAutomationControllerInstance().focusWindow(action.target);
  }

  private async smartGetWindows(): Promise<{ success: boolean; message: string; result?: any }> {
    const windows = await getAutomationControllerInstance().getOpenWindows();
    return {
      success: true,
      message: `Found ${windows.length} open windows`,
      result: windows
    };
  }

  private async smartGetMousePosition(): Promise<{ success: boolean; message: string; result?: any }> {
    const position = await getAutomationControllerInstance().getMousePosition();
    return {
      success: true,
      message: `Mouse at (${position.x}, ${position.y})`,
      result: position
    };
  }

  private async smartGetWindowInfo(): Promise<{ success: boolean; message: string; result?: any }> {
    const info = await getScreenCaptureService().getActiveWindowInfo();
    if (info) {
      return {
        success: true,
        message: `Active window: ${info.title}`,
        result: info
      };
    }
    return { success: false, message: 'Could not get window info' };
  }

  private smartEmergencyStop(): { success: boolean; message: string; result?: any } {
    getAutomationControllerInstance().emergencyStop();
    getSmartController().emergencyStop();
    return {
      success: true,
      message: '🛑 EMERGENCY STOP - All automation halted'
    };
  }

  private smartResume(): { success: boolean; message: string; result?: any } {
    getAutomationControllerInstance().resume();
    getSmartController().resume();
    return {
      success: true,
      message: '▶️ Automation resumed'
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // CREDENTIAL VAULT METHODS
  // ═══════════════════════════════════════════════════════════════

  private async vaultUnlock(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    if (!action.text) {
      return { success: false, message: 'Master password required' };
    }
    
    if (!getCredentialVaultInstance().vaultExists()) {
      return await getCredentialVaultInstance().createVault(action.text);
    }
    
    return await getCredentialVaultInstance().unlock(action.text);
  }

  private vaultLock(): { success: boolean; message: string; result?: any } {
    getCredentialVaultInstance().lock();
    return { success: true, message: 'Vault locked' };
  }

  private vaultStatus(): { success: boolean; message: string; result?: any } {
    return {
      success: true,
      message: getCredentialVaultInstance().isVaultUnlocked() ? 'Vault is unlocked' : 'Vault is locked',
      result: {
        exists: getCredentialVaultInstance().vaultExists(),
        unlocked: getCredentialVaultInstance().isVaultUnlocked(),
        config: getCredentialVaultInstance().isVaultUnlocked() ? getCredentialVaultInstance().getConfig() : null
      }
    };
  }

  private vaultList(): { success: boolean; message: string; result?: any } {
    if (!getCredentialVaultInstance().isVaultUnlocked()) {
      return { success: false, message: 'Vault is locked' };
    }
    
    const credentials = getCredentialVaultInstance().listCredentials();
    return {
      success: true,
      message: `${credentials.length} credentials in vault`,
      result: credentials
    };
  }

  private async vaultAutoFill(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    if (!action.url) {
      return { success: false, message: 'URL required for auto-fill' };
    }
    
    const result = await getCredentialVaultInstance().getCredentialForAutoFill(action.url);
    if (!result.success) {
      return result;
    }
    
    // Type username, tab, password
    if (result.username) {
      await getAutomationControllerInstance().typeText(result.username);
      await getAutomationControllerInstance().pressKey('Tab');
    }
    if (result.password) {
      await new Promise(r => setTimeout(r, 200));
      await getAutomationControllerInstance().typeText(result.password);
    }
    
    return {
      success: true,
      message: `Auto-filled credentials for ${action.url}`
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // DIRECT CONTROL METHODS - Native API Integrations
  // ═══════════════════════════════════════════════════════════════

  private async calendarAddEvent(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    if (!action.subject) {
      return { success: false, message: 'Event subject/title required' };
    }
    
    // Parse date/time - accept various formats
    let startDate = action.start ? new Date(action.start) : new Date();
    let endDate = action.end ? new Date(action.end) : new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour
    
    // If only date string like "February 7th" is provided, try to parse
    if (action.date) {
      const parsedDate = this.parseNaturalDate(action.date);
      if (parsedDate) {
        startDate = parsedDate;
        // Set reasonable default time (9 AM) if not specified
        if (!action.time) {
          startDate.setHours(9, 0, 0, 0);
        }
        endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      }
    }
    
    // Parse time if provided separately
    if (action.time) {
      const timeParts = action.time.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
      if (timeParts) {
        let hours = parseInt(timeParts[1]);
        const minutes = parseInt(timeParts[2] || '0');
        const ampm = timeParts[3]?.toLowerCase();
        
        if (ampm === 'pm' && hours !== 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        
        startDate.setHours(hours, minutes, 0, 0);
        endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      }
    }
    
    const result = await DirectControl.addCalendarEvent({
      subject: action.subject,
      start: startDate,
      end: endDate,
      location: action.location,
      body: action.body || action.text,
      isAllDay: action.allDay,
      reminder: action.reminder
    });
    
    if (result.success) {
      return {
        success: true,
        message: `📅 Added "${action.subject}" to calendar for ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        result: result.data
      };
    }
    return { success: false, message: result.error || 'Failed to add calendar event' };
  }

  private parseNaturalDate(dateStr: string): Date | null {
    const now = new Date();
    const str = dateStr.toLowerCase().trim();
    
    // Handle "today", "tomorrow"
    if (str === 'today') return now;
    if (str === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    
    // Handle "next monday", "next friday", etc.
    const nextDayMatch = str.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (nextDayMatch) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDay = days.indexOf(nextDayMatch[1].toLowerCase());
      const result = new Date(now);
      const currentDay = result.getDay();
      const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
      result.setDate(result.getDate() + daysUntil);
      return result;
    }
    
    // Handle "February 7th", "March 15", "Dec 25th", etc.
    const monthDayMatch = str.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?/i);
    if (monthDayMatch) {
      const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };
      const month = months[monthDayMatch[1].toLowerCase().substring(0, 3)];
      const day = parseInt(monthDayMatch[2]);
      const result = new Date(now.getFullYear(), month, day);
      // If the date has passed this year, assume next year
      if (result < now) {
        result.setFullYear(result.getFullYear() + 1);
      }
      return result;
    }
    
    // Try standard date parsing as fallback
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private async calendarRead(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    const query: any = {};
    
    if (action.start) query.startDate = new Date(action.start);
    if (action.end) query.endDate = new Date(action.end);
    if (action.subject) query.subject = action.subject;
    if (action.maxResults) query.maxResults = action.maxResults;
    
    const result = await DirectControl.readCalendar(query);
    
    if (result.success && result.data) {
      const events = result.data as any[];
      if (events.length === 0) {
        return { success: true, message: 'No events found in that time range', result: [] };
      }
      
      const summary = events.slice(0, 5).map((e: any) => 
        `• ${e.subject} (${new Date(e.start).toLocaleDateString()})`
      ).join('\n');
      
      return {
        success: true,
        message: `📅 Found ${events.length} event(s):\n${summary}`,
        result: events
      };
    }
    return { success: false, message: result.error || 'Failed to read calendar' };
  }

  private async calendarToday(): Promise<{ success: boolean; message: string; result?: any }> {
    const result = await DirectControl.getTodayEvents();
    
    if (result.success && result.data) {
      const events = result.data as any[];
      if (events.length === 0) {
        return { success: true, message: '📅 No events scheduled for today!', result: [] };
      }
      
      const summary = events.map((e: any) => {
        const time = new Date(e.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `• ${time}: ${e.subject}${e.location ? ` @ ${e.location}` : ''}`;
      }).join('\n');
      
      return {
        success: true,
        message: `📅 Today's schedule (${events.length} event${events.length > 1 ? 's' : ''}):\n${summary}`,
        result: events
      };
    }
    return { success: false, message: result.error || 'Failed to get today\'s events' };
  }

  private async emailSend(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    if (!action.to) {
      return { success: false, message: 'Recipient (to) required' };
    }
    if (!action.subject) {
      return { success: false, message: 'Email subject required' };
    }
    
    const recipients = Array.isArray(action.to) ? action.to : [action.to];
    
    const result = await DirectControl.sendEmail({
      to: recipients,
      cc: action.cc ? (Array.isArray(action.cc) ? action.cc : [action.cc]) : undefined,
      subject: action.subject,
      body: action.body || action.text || '',
      isHtml: action.isHtml,
      attachments: action.attachments,
      importance: action.importance
    });
    
    if (result.success) {
      return {
        success: true,
        message: `📧 Email sent to ${recipients.join(', ')}`
      };
    }
    return { success: false, message: result.error || 'Failed to send email' };
  }

  private async emailRead(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    const query: any = {};
    
    if (action.folder) query.folder = action.folder;
    if (action.unreadOnly) query.unreadOnly = action.unreadOnly;
    if (action.from) query.from = action.from;
    if (action.subject) query.subject = action.subject;
    if (action.maxResults) query.maxResults = action.maxResults;
    
    const result = await DirectControl.readEmails(query);
    
    if (result.success && result.data) {
      const emails = result.data as any[];
      if (emails.length === 0) {
        return { success: true, message: '📧 No emails found matching criteria', result: [] };
      }
      
      const summary = emails.slice(0, 5).map((e: any) => 
        `• ${e.isRead ? '📖' : '📬'} ${e.subject} (from: ${e.from})`
      ).join('\n');
      
      return {
        success: true,
        message: `📧 Found ${emails.length} email(s):\n${summary}`,
        result: emails
      };
    }
    return { success: false, message: result.error || 'Failed to read emails' };
  }

  private async emailUnreadCount(): Promise<{ success: boolean; message: string; result?: any }> {
    const result = await DirectControl.getUnreadCount();
    
    if (result.success) {
      const count = result.data?.count || 0;
      return {
        success: true,
        message: count > 0 ? `📬 You have ${count} unread email${count > 1 ? 's' : ''}` : '📧 Inbox is clear!',
        result: { count }
      };
    }
    return { success: false, message: result.error || 'Failed to get unread count' };
  }

  private async contactsSearch(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    if (!action.query && !action.text) {
      return { success: false, message: 'Search query required' };
    }
    
    const result = await DirectControl.searchContacts(action.query || action.text || '');
    
    if (result.success && result.data) {
      const contacts = result.data as any[];
      if (contacts.length === 0) {
        return { success: true, message: 'No contacts found', result: [] };
      }
      
      const summary = contacts.slice(0, 5).map((c: any) => 
        `• ${c.name}${c.email ? ` (${c.email})` : ''}`
      ).join('\n');
      
      return {
        success: true,
        message: `📇 Found ${contacts.length} contact(s):\n${summary}`,
        result: contacts
      };
    }
    return { success: false, message: result.error || 'Failed to search contacts' };
  }

  private async notificationShow(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    const title = action.title || action.subject || 'Notification';
    const message = action.message || action.body || action.text || '';
    
    const result = await DirectControl.showNotification(title, message);
    
    if (result.success) {
      return { success: true, message: `🔔 Notification shown: ${title}` };
    }
    return { success: false, message: result.error || 'Failed to show notification' };
  }

  private async reminderCreate(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    const title = action.title || action.subject || 'Reminder';
    const message = action.message || action.body || action.text || '';
    
    let reminderTime: Date;
    if (action.time) {
      reminderTime = new Date(action.time);
    } else if (action.delay) {
      // delay in minutes
      reminderTime = new Date(Date.now() + action.delay * 60 * 1000);
    } else {
      return { success: false, message: 'Reminder time or delay required' };
    }
    
    const result = DirectControl.createReminder(title, message, reminderTime, action.recurring);
    
    if (result.success) {
      return {
        success: true,
        message: `⏰ Reminder set for ${reminderTime.toLocaleString()}: ${title}`,
        result: { id: result.data?.id }
      };
    }
    return { success: false, message: 'Failed to create reminder' };
  }

  private datetimeGet(): { success: boolean; message: string; result?: any } {
    const result = DirectControl.getDateTime();
    const data = result.data;
    
    return {
      success: true,
      message: `🕐 ${data.dayOfWeek}, ${data.date} - ${data.time}`,
      result: data
    };
  }

  private async systemLock(): Promise<{ success: boolean; message: string; result?: any }> {
    const result = await DirectControl.lock();
    
    if (result.success) {
      return { success: true, message: '🔒 Workstation locked' };
    }
    return { success: false, message: result.error || 'Failed to lock workstation' };
  }

  private async volumeSet(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    if (action.volume === undefined && action.level === undefined) {
      return { success: false, message: 'Volume level required (0-100)' };
    }
    
    const level = action.volume ?? action.level ?? 50;
    const result = await DirectControl.setVolume(level);
    
    if (result.success) {
      return { success: true, message: `🔊 Volume set to ${level}%` };
    }
    return { success: false, message: result.error || 'Failed to set volume' };
  }

  private async muteToggle(): Promise<{ success: boolean; message: string; result?: any }> {
    const result = await DirectControl.toggleMute();
    
    if (result.success) {
      return { success: true, message: '🔇 Mute toggled' };
    }
    return { success: false, message: result.error || 'Failed to toggle mute' };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DESKTOP CONTROL - Smart icon manipulation (no coordinates needed!)
  // ═══════════════════════════════════════════════════════════════════════════════

  private async desktopList(): Promise<{ success: boolean; message: string; result?: any }> {
    const result = await DirectControl.listDesktopIcons();
    
    if (result.success && result.data?.icons) {
      const icons = result.data.icons as string[];
      return { 
        success: true, 
        message: `📁 Desktop has ${icons.length} items: ${icons.slice(0, 8).join(', ')}${icons.length > 8 ? '...' : ''}`,
        result: icons
      };
    }
    return { success: false, message: result.error || 'Failed to list desktop icons' };
  }

  private async desktopMove(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    const { icon, target, position } = action;
    
    if (!icon || !target) {
      return { success: false, message: 'Need both icon name and target name to move' };
    }
    
    const result = await DirectControl.moveDesktopIcon(
      icon as string, 
      target as string, 
      (position as 'left' | 'right' | 'above' | 'below') || 'right'
    );
    
    if (result.success) {
      return { 
        success: true, 
        message: `✅ Moved "${icon}" ${position || 'right of'} "${target}"`,
        result: result.data
      };
    }
    return { success: false, message: result.message || result.error || 'Failed to move icon' };
  }

  private async desktopFind(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    const { name } = action;
    
    if (!name) {
      return { success: false, message: 'Need icon name to find' };
    }
    
    const result = await DirectControl.findDesktopIcon(name as string);
    
    if (result.success && result.data) {
      return { 
        success: true, 
        message: result.message || `Found "${name}"`,
        result: result.data
      };
    }
    return { success: false, message: result.message || `"${name}" not found on desktop` };
  }

  private async desktopArrange(action: SystemAction): Promise<{ success: boolean; message: string; result?: any }> {
    const arrangement = (action.arrangement as 'by-name' | 'by-type' | 'auto') || 'auto';
    
    const result = await DirectControl.arrangeDesktop(arrangement);
    
    if (result.success) {
      return { success: true, message: result.message || '✅ Desktop arranged' };
    }
    return { success: false, message: result.message || 'Failed to arrange desktop' };
  }
}

// Export singleton
export const systemExecutor = new SystemExecutor();
