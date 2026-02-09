/**
 * AgentPrime - Electron Main Process
 * Native file access like Cursor!
 * 
 * NOTE: This is a TypeScript scaffold. The full migration from main.js
 * will require migrating all IPC handlers and dependencies.
 * For now, this provides the basic structure.
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import type { Settings } from '../types';

// ============================================================================
// GLOBAL ERROR HANDLERS - Prevent silent crashes
// ============================================================================
process.on('uncaughtException', (error: Error, origin: string) => {
  console.error('================== UNCAUGHT EXCEPTION ==================');
  console.error(`Origin: ${origin}`);
  console.error(`Error: ${error.name}: ${error.message}`);
  console.error(`Stack: ${error.stack}`);
  console.error('=========================================================');
  
  // Log to file for post-mortem analysis
  try {
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(process.cwd(), 'crash-log.txt');
    const logEntry = `[${new Date().toISOString()}] UNCAUGHT EXCEPTION\n` +
      `Origin: ${origin}\n` +
      `Error: ${error.name}: ${error.message}\n` +
      `Stack: ${error.stack}\n` +
      '---\n';
    fs.appendFileSync(logPath, logEntry);
  } catch (e) {
    // Ignore logging errors
  }
  
  // Don't exit immediately - give the app a chance to recover
  // For truly fatal errors, the app will exit anyway
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('================== UNHANDLED REJECTION ==================');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('=========================================================');
  
  // Log to file for post-mortem analysis
  try {
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(process.cwd(), 'crash-log.txt');
    const logEntry = `[${new Date().toISOString()}] UNHANDLED REJECTION\n` +
      `Reason: ${reason}\n` +
      `Stack: ${reason?.stack || 'N/A'}\n` +
      '---\n';
    fs.appendFileSync(logPath, logEntry);
  } catch (e) {
    // Ignore logging errors
  }
});

// Configure cache directories to prevent Windows permission errors
// These errors are non-critical and don't affect app functionality
if (process.platform === 'win32') {
  // Suppress Electron cache warnings (they're harmless)
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const message = args.join(' ');
    // Filter out cache-related errors that are non-critical
    if (message.includes('cache_util_win.cc') ||
        message.includes('Unable to move the cache') ||
        message.includes('Unable to create cache') ||
        message.includes('Gpu Cache Creation failed') ||
        message.includes('disk_cache.cc')) {
      // Silently ignore - these are Windows permission warnings, not actual errors
      return;
    }
    // Log other errors normally
    originalConsoleError.apply(console, args);
  };
}

// Import AI router (TypeScript)
import aiRouter from './ai-providers';

// Import IPC handlers (TypeScript)
import { registerAllHandlers } from './ipc-handlers';
import { register as registerChat } from './ipc-handlers/chat';

// Import CodebaseIndexer
import { CodebaseIndexer } from './search/indexer';

// Import Mirror Knowledge Ingester
import { MirrorKnowledgeIngester } from './mirror/mirror-knowledge-ingester';

// Import Mirror Singleton for global access
import { setMirrorMemory } from './mirror/mirror-singleton';

// Import Backend Manager
import { initializeBackendManager } from './core/backend-manager';

// Import Secure Key Storage
import { getSecureKeyStorage } from './security/secureKeyStorage';

// Import State Manager
import { stateManager } from './core/state-manager';

// Import Telemetry Service
import { initializeTelemetry, getTelemetryService } from './core/telemetry-service';

// Import Auto-Updater
import { initializeAutoUpdater, checkForUpdates, downloadUpdate, installUpdate, getAppVersion } from './core/auto-updater';

// Import Inference Server (shared AI for VibeHub projects)
import { startInferenceServer, stopInferenceServer, getInferenceEnvVars, getInferenceServer } from './inference-server';

// Import ActivatePrime Integration (Cursor-like AI assistance)
import { ActivatePrimeIntegration } from './modules/activateprime';

// ActivatePrime instance (initialized when workspace is set)
let activatePrime: ActivatePrimeIntegration | null = null;

// Lazy-loaded modules (will be migrated to TypeScript)
let TemplateEngine: any = null;
let codebaseIndexer: any = null;
let ActionExecutor: any = null;
let MirrorMemory: any = null;
let MirrorPatternExtractor: any = null;
let IntelligenceExpansion: any = null;

// Lazy loader for modules
function loadModules() {
  if (!TemplateEngine) {
    // Use app.getAppPath() to get the actual app root (works in both dev and production)
    // Fall back to __dirname calculation if app is not ready yet
    let rootPath: string;
    try {
      if (app && app.isReady()) {
        const appPath = app.getAppPath();
        console.log(`[Main] app.getAppPath(): ${appPath}`);
        console.log(`[Main] app.isPackaged: ${app.isPackaged}`);
        if (app.isPackaged) {
          rootPath = path.dirname(process.execPath);
        } else {
          // In development, app.getAppPath() returns dist/main, but we need project root
          // Use process.cwd() which should be the project root in development
          rootPath = process.cwd();
        }
      } else {
        // App not ready yet, use __dirname (will be dist/main in built version)
        // In development, __dirname is dist/main, so go up two levels to project root
        rootPath = path.join(__dirname, '../..');
      }
    } catch {
      // App not ready yet, use __dirname (will be dist/main in built version)
      // In development, __dirname is dist/main, so go up two levels to project root
      rootPath = path.join(__dirname, '../..');
    }

    // Normalize the path to handle any path issues
    rootPath = path.normalize(rootPath);
    console.log(`[Main] Loading modules from root: ${rootPath}`);
    console.log(`[Main] __dirname: ${__dirname}`);
    console.log(`[Main] process.cwd(): ${process.cwd()}`);

    try {
      // Import the TypeScript TemplateEngine
      const TemplateEngineModule = require('./legacy/template-engine');
      TemplateEngine = TemplateEngineModule.default || TemplateEngineModule;
      console.log(`[Main] ✅ TemplateEngine module loaded from TypeScript`);
    } catch (e: any) {
      console.error(`[Main] ❌ Failed to load TemplateEngine: ${e.message}`);
      console.error(`[Main] Error stack: ${e.stack}`);
      console.error(`[Main] Template engine not available: ${e.message}`);
      console.error(`   This will prevent project creation from templates.`);
      // Don't throw error - continue without template engine
    }
    
    // Initialize CodebaseIndexer (TypeScript)
    try {
      // CodebaseIndexer will be initialized when workspace is set
      console.log(`[Main] ✅ CodebaseIndexer class available`);
    } catch (e: any) {
      console.warn(`[Main] ⚠️  CodebaseIndexer not available: ${e.message}`);
    }

    // Load ActionExecutor (optional)
    try {
      ActionExecutor = require('./legacy/action-executor.js');
      console.log(`[Main] ✅ ActionExecutor module loaded from relative path`);
    } catch (e: any) {
      console.warn(`[Main] ⚠️  ActionExecutor not available: ${e.message}`);
    }

    // Load mirror system modules from TypeScript sources
    // Note: scripts/mirror/*.js is deprecated, using src/main/mirror/*.ts instead
    try {
      // Import TypeScript mirror modules directly
      const MirrorMemoryModule = require('./mirror/mirror-memory');
      const MirrorPatternExtractorModule = require('./mirror/mirror-pattern-extractor');
      const IntelligenceExpansionModule = require('./mirror/intelligence-expansion');
      
      // Assign classes (modules export default or class directly)
      MirrorMemory = MirrorMemoryModule.default || MirrorMemoryModule.MirrorMemory || MirrorMemoryModule;
      MirrorPatternExtractor = MirrorPatternExtractorModule.default || MirrorPatternExtractorModule.MirrorPatternExtractor || MirrorPatternExtractorModule;
      IntelligenceExpansion = IntelligenceExpansionModule.default || IntelligenceExpansionModule.IntelligenceExpansion || IntelligenceExpansionModule;
      
      console.log(`[Main] ✅ Mirror system modules loaded from TypeScript sources`);
      console.log(`[Main]    MirrorMemory: ${typeof MirrorMemory}`);
      console.log(`[Main]    MirrorPatternExtractor: ${typeof MirrorPatternExtractor}`);
      console.log(`[Main]    IntelligenceExpansion: ${typeof IntelligenceExpansion}`);
    } catch (error: any) {
      console.error(`[Main] ❌ Mirror system modules failed to load: ${error.message}`);
      console.error(`[Main]    Error stack: ${error.stack}`);
      console.error(`[Main]    This will prevent code ingestion from working.`);
    }
  }
  return { TemplateEngine, CodebaseIndexer, ActionExecutor, MirrorMemory, MirrorPatternExtractor, IntelligenceExpansion };
}

// Load environment variables from .env file if it exists
// Use app.getAppPath() when available, otherwise fall back to __dirname
const getAppRoot = () => {
  try {
    if (app && app.isReady()) {
      return app.isPackaged ? path.dirname(process.execPath) : app.getAppPath();
    }
  } catch {
    // App not ready yet
  }
  // Fall back to __dirname calculation (dist/main in built version -> ../.. = project root)
  // In development, __dirname is D:\AgentPrime\dist\main, so go up two levels to D:\AgentPrime
  // In production, __dirname would be the app directory
  const calculatedPath = path.join(__dirname, '../..');
  return calculatedPath;
};
const dotenvPath = path.join(getAppRoot(), '.env');
if (fs.existsSync(dotenvPath)) {
  const envContent = fs.readFileSync(dotenvPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  });
}

// Dual Ollama Configuration
// Cloud models can use various endpoints - check env vars or detect from model name
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3-coder:480b-cloud';
const OLLAMA_MODEL_FALLBACK = process.env.OLLAMA_MODEL_FALLBACK || 'deepseek-v3.1:671b-cloud';
// Hard-wired Ollama API Key
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';

// Other AI Provider API Keys (from environment)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// Auto-detect cloud vs local based on model name
// Cloud model naming: model:size-cloud (e.g., qwen3-coder:480b-cloud)
// Local models typically: model:size or model (e.g., llama3.2:7b)
const isCloudModel = (model: string) => model.includes('-cloud') || model.includes(':cloud');

// Get cloud URL from environment or use default
// For DeepSeek models, use https://ollama.deepseek.com
// For other cloud models, you must set OLLAMA_URL in your environment
const getCloudUrl = (model: string): string => {
  if (model.toLowerCase().includes('deepseek')) {
    return 'https://ollama.deepseek.com';
  }
  // Default cloud endpoint - user should configure OLLAMA_URL for their specific provider
  return 'https://api.ollama.com';
};

const OLLAMA_URL = process.env.OLLAMA_URL || (isCloudModel(OLLAMA_MODEL) ? getCloudUrl(OLLAMA_MODEL) : 'http://127.0.0.1:11434');
const OLLAMA_URL_SECONDARY = process.env.OLLAMA_URL_SECONDARY || (isCloudModel(OLLAMA_MODEL_FALLBACK) ? getCloudUrl(OLLAMA_MODEL_FALLBACK) : 'http://127.0.0.1:11435');

let mainWindow: BrowserWindow | null = null;
let workspacePath: string | null = null;
let focusedFolderPath: string | null = null;
let activeFilePath: string | null = null; // Track currently active file for completion context
let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

// Template Engine
let templateEngine: any = null;

// Settings with multi-provider support + Dual Ollama + Dual Model System!
let settings: Settings = {
  theme: 'vs-dark',
  fontSize: 14,
  tabSize: 2,
  wordWrap: 'on',
  minimap: true,
  lineNumbers: 'on',
  autoSave: true,
  inlineCompletions: true,
  dinoBuddyMode: false,
  confirmOnClose: true,  // Prevent accidental closes (can be disabled in settings)
  activeProvider: 'openai',  // OpenAI - MIT Hackathon optimized (OpenAI-sponsored!)
  activeModel: 'gpt-4o',  // GPT-4o - Best balance of quality and speed
  dualOllamaEnabled: false,
  
  // Dual Model System - OpenAI optimized for MIT hackathon
  dualModelEnabled: true,
  dualModelConfig: {
    fastModel: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      enabled: true
    },
    deepModel: {
      provider: 'openai',
      model: 'gpt-4o',
      enabled: true
    },
    autoRoute: true,
    complexityThreshold: 6,
    deepModelTriggers: ['analyze', 'debug', 'refactor', 'explain', 'architect', 'optimize', 'review'],
    fastModelTriggers: ['quick', 'simple', 'format', 'rename', 'fix typo', 'what is']
  },
  
  providers: {
    ollama: {
      baseUrl: OLLAMA_URL,
      apiKey: OLLAMA_API_KEY,
      model: OLLAMA_MODEL
    },
    ollamaSecondary: {
      baseUrl: OLLAMA_URL_SECONDARY,
      apiKey: OLLAMA_API_KEY,
      model: OLLAMA_MODEL_FALLBACK
    },
    anthropic: {
      apiKey: ANTHROPIC_API_KEY,  // Hard-wired
      model: 'claude-sonnet-4-20250514'
    },
    openai: {
      apiKey: OPENAI_API_KEY,  // Hard-wired
      model: 'gpt-4o'
    },
    openrouter: {
      apiKey: OPENROUTER_API_KEY,  // Hard-wired (or from env)
      model: 'anthropic/claude-sonnet-4'
    }
  }
};

// Initialize AI providers from settings
function initializeAIProviders(): void {
  // Back-compat: some UIs store `endpoint`, but providers expect `baseUrl`.
  const normalizeProviderConfig = (providerName: string, config: any) => {
    const normalized = { ...(config || {}) };
    if (normalized.endpoint && !normalized.baseUrl) {
      normalized.baseUrl = normalized.endpoint;
    }
    // Keep both fields in sync so older UIs keep displaying the correct value.
    if (normalized.baseUrl && !normalized.endpoint) {
      normalized.endpoint = normalized.baseUrl;
    }

    if (providerName === 'openai') {
      normalized.baseUrl = normalizeOpenAIBaseUrl(normalized.baseUrl);
      normalized.endpoint = normalizeOpenAIBaseUrl(normalized.endpoint);
    }

    return normalized;
  };

  if (settings.providers.ollama) {
    const ollamaConfig = normalizeProviderConfig('ollama', settings.providers.ollama);
    // Pass active model when user has Ollama selected so provider uses correct baseUrl (local vs cloud)
    if (settings.activeProvider === 'ollama' && settings.activeModel) {
      ollamaConfig.model = settings.activeModel;
    }
    aiRouter.configureProvider('ollama', ollamaConfig);
  }
  if (settings.providers.anthropic?.apiKey) {
    aiRouter.configureProvider('anthropic', normalizeProviderConfig('anthropic', settings.providers.anthropic));
  }
  if (settings.providers.openai?.apiKey) {
    aiRouter.configureProvider('openai', normalizeProviderConfig('openai', settings.providers.openai));
  }
  if (settings.providers.openrouter?.apiKey) {
    aiRouter.configureProvider('openrouter', normalizeProviderConfig('openrouter', settings.providers.openrouter));
  }
  
  aiRouter.setActiveProvider(settings.activeProvider, settings.activeModel);
  
  // Smart fallback: Use Ollama as fallback for rate limits
  if (settings.activeProvider === 'ollama') {
    // If Ollama is primary, no fallback needed
    aiRouter.setFallbackProvider(null);
  } else {
    // For OpenAI/Anthropic: Set Ollama as fallback for rate limits
    // Check Ollama health and set as fallback if available
    const ollamaProvider = aiRouter.getProvider('ollama');
    if (ollamaProvider && typeof (ollamaProvider as any).isHealthy === 'function') {
      (ollamaProvider as any).isHealthy().then((healthy: boolean) => {
        if (healthy) {
          aiRouter.setFallbackProvider('ollama');
          console.log('[AI] ✅ Ollama available - set as fallback for rate limits');
        } else {
          // Still set Ollama as fallback - it will check health when needed
          aiRouter.setFallbackProvider('ollama');
          console.log('[AI] ⚠️ Ollama not running now - set as fallback (will check on use)');
        }
      }).catch(() => {
        // Still set Ollama as fallback - it will check health when needed
        aiRouter.setFallbackProvider('ollama');
        console.log('[AI] ⚠️ Ollama check failed - set as fallback (will check on use)');
      });
    } else {
      // Set Ollama as fallback anyway - router will check health when needed
      aiRouter.setFallbackProvider('ollama');
      console.log('[AI] 🔄 Ollama set as fallback for rate limits');
    }
  }
  
  // Configure Dual Model System if enabled
  if (settings.dualModelEnabled && settings.dualModelConfig) {
    aiRouter.configureDualModel(settings.dualModelConfig);
    console.log(`🚀 Dual Model System enabled:`);
    console.log(`   ⚡ Fast: ${settings.dualModelConfig.fastModel.provider}/${settings.dualModelConfig.fastModel.model}`);
    console.log(`   🧠 Deep: ${settings.dualModelConfig.deepModel.provider}/${settings.dualModelConfig.deepModel.model}`);
    console.log(`   🔀 Auto-route: ${settings.dualModelConfig.autoRoute ? 'ON' : 'OFF'} (threshold: ${settings.dualModelConfig.complexityThreshold})`);
  }
  
  console.log(`✅ AI Provider initialized: ${settings.activeProvider} (${settings.activeModel})`);
}

// Settings cache to avoid repeated file reads
let settingsCache: Settings | null = null;
let settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 5000; // 5 seconds cache

// Load settings from file (API keys loaded separately from secure storage)
function loadSettings(): void {
  try {
    // Check cache first
    const now = Date.now();
    if (settingsCache && (now - settingsCacheTime) < SETTINGS_CACHE_TTL) {
      settings = { ...settings, ...settingsCache };
      return;
    }

    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      const loadedSettings = JSON.parse(data);
      settings = { ...settings, ...loadedSettings };
      
      // Update cache
      settingsCache = loadedSettings;
      settingsCacheTime = now;
    }
    
    // IMPORTANT: Fix IPv6 connection issues by ensuring 127.0.0.1 is used instead of localhost
    // This fixes "ECONNREFUSED ::1:11434" errors on systems that prefer IPv6
    const fixLocalhost = (url?: string) => url?.includes('localhost') ? url.replace('localhost', '127.0.0.1') : url;

    if (settings.providers?.ollama?.baseUrl?.includes('localhost')) {
      settings.providers.ollama.baseUrl = fixLocalhost(settings.providers.ollama.baseUrl);
      console.log('[Settings] 🔧 Fixed Ollama URL: localhost → 127.0.0.1 (IPv6 fix)');
    }
    if (settings.providers?.ollama?.endpoint?.includes('localhost')) {
      settings.providers.ollama.endpoint = fixLocalhost(settings.providers.ollama.endpoint);
      console.log('[Settings] 🔧 Fixed Ollama endpoint: localhost → 127.0.0.1 (IPv6 fix)');
    }
    if (settings.providers?.ollamaSecondary?.baseUrl?.includes('localhost')) {
      settings.providers.ollamaSecondary.baseUrl = fixLocalhost(settings.providers.ollamaSecondary.baseUrl);
      console.log('[Settings] 🔧 Fixed Ollama Secondary URL: localhost → 127.0.0.1 (IPv6 fix)');
    }
    if (settings.providers?.ollamaSecondary?.endpoint?.includes('localhost')) {
      settings.providers.ollamaSecondary.endpoint = fixLocalhost(settings.providers.ollamaSecondary.endpoint);
      console.log('[Settings] 🔧 Fixed Ollama Secondary endpoint: localhost → 127.0.0.1 (IPv6 fix)');
    }
  } catch (e) {
    console.log('Error loading settings:', e);
  }
}

function normalizeOpenAIBaseUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return undefined;
  if (/\/v1$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

// Load API keys from secure storage (async - call after loadSettings)
async function loadSecureApiKeys(): Promise<void> {
  try {
    const secureStorage = getSecureKeyStorage();
    console.log(`[Security] 🔐 Loading API keys from ${secureStorage.getBackendType()}`);
    
    // Hard-wired providers - these keys are embedded in code and should not be overridden
    const hardWiredProviders = ['ollama', 'ollamaSecondary', 'anthropic', 'openai'];
    
    // Map of .env variable names to provider names
    const envKeyMap: Record<string, string> = {
      'ollama': 'OLLAMA_API_KEY',
      'ollamaSecondary': 'OLLAMA_API_KEY', // Same key for secondary
      'anthropic': 'ANTHROPIC_API_KEY',
      'openai': 'OPENAI_API_KEY',
      'openrouter': 'OPENROUTER_API_KEY'
    };
    
    // Load API keys for each provider
    const providers = settings.providers as Record<string, any>;
    for (const provider of Object.keys(providers)) {
      try {
        // Skip hard-wired providers - use the hard-wired values from constants
        if (hardWiredProviders.includes(provider)) {
          // Ensure hard-wired values are set (they're already set in settings initialization)
          if (provider === 'ollama' || provider === 'ollamaSecondary') {
            providers[provider].apiKey = OLLAMA_API_KEY;
          } else if (provider === 'anthropic') {
            providers[provider].apiKey = ANTHROPIC_API_KEY;
          } else if (provider === 'openai') {
            providers[provider].apiKey = OPENAI_API_KEY;
          }
          console.log(`[Security] ✅ Using hard-wired API key for ${provider}`);
          continue;
        }
        
        // For non-hard-wired providers (e.g., openrouter), load from secure storage or env
        const storedKey = await secureStorage.getApiKey(provider);
        const envVarName = envKeyMap[provider];
        const envKey = envVarName ? process.env[envVarName] : undefined;
        
        // Prefer .env key if it exists and is different (allows updating via .env)
        if (envKey && envKey.length > 10 && envKey !== storedKey) {
          await secureStorage.setApiKey(provider, envKey);
          providers[provider].apiKey = envKey;
          console.log(`[Security] ✅ Updated API key for ${provider} from .env`);
        } else if (storedKey) {
          providers[provider].apiKey = storedKey;
          console.log(`[Security] ✅ Loaded API key for ${provider}`);
        } else if (envKey && envKey.length > 10) {
          // No stored key, but .env has one - store it
          await secureStorage.setApiKey(provider, envKey);
          providers[provider].apiKey = envKey;
          console.log(`[Security] ✅ Stored API key for ${provider} from .env`);
        }
      } catch (e) {
        // Key not found in secure storage, that's okay
      }
    }
    
    // Check if there are any keys in settings.json that need migration
    // (Legacy plain-text keys that should be moved to secure storage)
    let needsMigration = false;
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      try {
        const fileData = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (fileData.providers) {
          for (const [provider, config] of Object.entries(fileData.providers) as [string, any][]) {
            if (config.apiKey && config.apiKey.length > 0) {
              needsMigration = true;
              // Migrate to secure storage
              await secureStorage.setApiKey(provider, config.apiKey);
              console.log(`[Security] 🔄 Migrated API key for ${provider} to secure storage`);
            }
          }
        }
        
        // If we migrated, rewrite settings.json without API keys
        if (needsMigration) {
          console.log('[Security] 📝 Removing plain-text API keys from settings.json');
          saveSettings(); // This will save without API keys
        }
      } catch (e) {
        console.warn('[Security] Could not check for key migration:', e);
      }
    }
  } catch (e) {
    console.warn('[Security] Error loading secure API keys:', e);
  }
}

// Save settings to file (API keys saved separately to secure storage)
function saveSettings(): void {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    
    // Create a copy of settings without API keys for file storage
    const settingsToSave = JSON.parse(JSON.stringify(settings));
    
    // Remove API keys from providers (they're stored securely elsewhere)
    if (settingsToSave.providers) {
      for (const provider of Object.keys(settingsToSave.providers)) {
        if (settingsToSave.providers[provider].apiKey) {
          // Save to secure storage asynchronously
          const apiKey = settingsToSave.providers[provider].apiKey;
          if (apiKey && apiKey.length > 0) {
            getSecureKeyStorage().setApiKey(provider, apiKey).catch(e => {
              console.warn(`[Security] Failed to save API key for ${provider}:`, e);
            });
          }
          // Remove from settings file (will be a placeholder)
          delete settingsToSave.providers[provider].apiKey;
        }
      }
    }
    
    fs.writeFileSync(settingsPath, JSON.stringify(settingsToSave, null, 2));
    
    // Invalidate cache
    settingsCache = null;
    settingsCacheTime = 0;
  } catch (e) {
    console.log('Error saving settings:', e);
  }
}

// Create window
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d1117',
      symbolColor: '#e6edf3',
      height: 32
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Add Content Security Policy headers for security
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: https:; " +
          "font-src 'self' data:; " +
          "connect-src 'self' http://localhost:* http://127.0.0.1:* https://api.anthropic.com https://api.openai.com https://openrouter.ai https://*.ollama.com ws://localhost:* wss://localhost:*"
        ]
      }
    });
  });

  // Close confirmation to prevent accidental data loss
  // This is especially important when using keyboard shortcuts that might be accidentally triggered
  let isClosingConfirmed = false;
  
  mainWindow.on('close', (event) => {
    // Skip confirmation if already confirmed or if setting is disabled
    if (isClosingConfirmed || !settings.confirmOnClose) {
      return; // Allow close
    }
    
    // Prevent close and show confirmation
    event.preventDefault();
    
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Close', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Confirm Close',
      message: 'Are you sure you want to close AgentPrime?',
      detail: 'Any unsaved work may be lost.'
    }).then(({ response }) => {
      if (response === 0) { // 'Close' button
        isClosingConfirmed = true;
        mainWindow?.close();
      }
    });
  });

  // In production, load from dist/renderer; in dev, use original location
  const isDev = process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  
  // Open DevTools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  loadSettings();

  // Load API keys from secure storage (migrates from plain text if needed)
  await loadSecureApiKeys();

  // Initialize telemetry service
  await initializeTelemetry();
  // Sync telemetry enabled state from settings
  const telemetryService = getTelemetryService();
  if (settings.telemetryEnabled !== undefined) {
    telemetryService.setEnabled(settings.telemetryEnabled);
  }

  // Initialize state manager for persistence
  await stateManager.loadState();

  initializeAIProviders();
  
  // Initialize backend manager (auto-starts Python backend if needed)
  await initializeBackendManager();
  
  // Initialize template engine
  try {
    const { TemplateEngine: TE } = loadModules();
    if (TE) {
      // In development, we need to go up from dist/main to the project root
      // In production, templates are bundled with the app
      let templatesPath: string;
      if (app.isPackaged) {
        templatesPath = path.join(path.dirname(process.execPath), 'templates');
      } else {
        // Development: go up two levels from dist/main to project root
        templatesPath = path.join(__dirname, '../..', 'templates');
      }

      console.log(`[Main] Initializing template engine with path: ${templatesPath}`);
      console.log(`[Main] app.isPackaged: ${app.isPackaged}`);
      console.log(`[Main] __dirname: ${__dirname}`);
      console.log(`[Main] templates directory exists: ${fs.existsSync(templatesPath)}`);
      console.log(`[Main] registry file exists: ${fs.existsSync(path.join(templatesPath, 'registry.json'))}`);
      templateEngine = new TE(templatesPath);
    
    // Verify template engine is working
    try {
      const templates = templateEngine.getTemplates();
      const categories = templateEngine.getCategories();
      console.log(`✅ Template Engine initialized: ${templates.length} templates, ${categories.length} categories`);
      
      // Log template names for debugging
      if (templates.length > 0) {
        const templateNames = templates.map((t: any) => t.name || t.id).join(', ');
        console.log(`   Available templates: ${templateNames}`);
      }
    } catch (verifyError: any) {
      console.warn(`⚠️  Template engine initialized but verification failed: ${verifyError.message}`);
    }
    } else {
      console.error(`❌ Template engine not available: TemplateEngine module not loaded`);
      console.error(`   This will prevent project creation from templates.`);
    }
  } catch (e: any) {
    console.error(`❌ Template engine not available: ${e.message || e}`);
    console.error(`   This will prevent project creation from templates.`);
  }

  // Initialize mirror system (lazy loaded - only when needed)
  let mirrorMemory: any = null;
  let patternExtractor: any = null;
  let intelligenceExpansion: any = null;
  let knowledgeIngester: MirrorKnowledgeIngester | null = null;
  
  // Lazy load mirror system in background after startup
  const loadMirrorSystem = async () => {
    try {
      const { MirrorMemory: MM, MirrorPatternExtractor: MPE, IntelligenceExpansion: IE } = loadModules();
      console.log(`[Main] Mirror modules loaded: MM=${!!MM}, MPE=${!!MPE}, IE=${!!IE}`);
      
      if (MM && MPE && IE) {
        const dataPath = app.isPackaged
          ? path.join(path.dirname(process.execPath), 'data')
          : path.join(getAppRoot(), 'data');
        const opusExamplesPath = path.join(dataPath, 'opus-examples');

        console.log(`[Main] Initializing MirrorMemory with path: ${path.join(dataPath, 'mirror-memory.json')}`);
        mirrorMemory = new MM(path.join(dataPath, 'mirror-memory.json'));

        // Set up event listeners for pattern learning notifications
        mirrorMemory.on('patternLearned', (data: { pattern: { name?: string; description?: string }; category: string; intelligence: number }) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('mirror:pattern-learned', {
              pattern: data.pattern.name || data.pattern.description?.substring(0, 50) || 'New Pattern',
              category: data.category,
              intelligence: data.intelligence
            });
          }
        });

        // CRITICAL: Load existing patterns from disk!
        const loadResult = await mirrorMemory.load();
        if (loadResult.success) {
          const stats = mirrorMemory.getStats ? mirrorMemory.getStats() : { totalPatterns: 0 };
          console.log(`[MirrorMemory] Loaded ${stats.totalPatterns} patterns from disk`);
          
          // Clean up duplicate patterns on startup (if method exists)
          if (typeof mirrorMemory.deduplicatePatterns === 'function') {
            try {
              const dedupeResult = await mirrorMemory.deduplicatePatterns();
              if (dedupeResult && dedupeResult.removed > 0) {
                const newStats = mirrorMemory.getStats ? mirrorMemory.getStats() : { totalPatterns: 0 };
                console.log(`[MirrorMemory] After dedup: ${newStats.totalPatterns} patterns`);
              }
            } catch (dedupeError) {
              console.warn('[MirrorMemory] Deduplication not available (non-critical):', dedupeError);
            }
          }
        } else {
          console.warn('[MirrorMemory] Failed to load patterns:', loadResult.error);
        }
        
        console.log(`[Main] Initializing PatternExtractor with opusExamplesPath: ${opusExamplesPath}`);
        patternExtractor = new MPE(opusExamplesPath);
        
        console.log(`[Main] Initializing IntelligenceExpansion`);
        intelligenceExpansion = new IE(mirrorMemory);
        
        // Initialize knowledge ingester for pattern learning from external sources
        console.log(`[Main] Initializing MirrorKnowledgeIngester`);
        knowledgeIngester = new MirrorKnowledgeIngester(opusExamplesPath, mirrorMemory, patternExtractor);

        // Register with singleton for global access (used by agent loop)
        setMirrorMemory(mirrorMemory);

        console.log('✅ Mirror Intelligence System initialized');
        console.log(`[Main] Mirror getters: memory=${!!mirrorMemory}, extractor=${!!patternExtractor}, ingester=${!!knowledgeIngester}`);
      } else {
        console.error(`[Main] ❌ Mirror system modules failed to load!`);
        console.error(`[Main]   MirrorMemory: ${MM ? '✅' : '❌'}`);
        console.error(`[Main]   MirrorPatternExtractor: ${MPE ? '✅' : '❌'}`);
        console.error(`[Main]   IntelligenceExpansion: ${IE ? '✅' : '❌'}`);
        console.error(`[Main]   Check that scripts/mirror/ directory exists and contains the required .js files`);
      }
    } catch (e: any) {
      console.error('❌ Mirror system initialization failed:', e.message || e);
      console.error('Stack:', e.stack);
    }
  };
  
  // Load mirror system in background after a delay (non-blocking)
  setTimeout(() => {
    loadMirrorSystem();
  }, 1000); // Wait 1 second after startup

  // Register IPC handlers
  registerAllHandlers({
    ipcMain,
    dialog,
    mainWindow: () => mainWindow,
    getWorkspacePath: () => workspacePath,
    setWorkspacePath: (path: string) => {
      workspacePath = path;
      // Initialize codebase indexer when workspace is set
      if (workspacePath) {
        try {
          codebaseIndexer = new CodebaseIndexer(workspacePath);
          console.log(`[Main] ✅ CodebaseIndexer initialized for workspace: ${workspacePath}`);
          
          // Initialize ActivatePrime for Cursor-like AI assistance
          activatePrime = new ActivatePrimeIntegration(workspacePath);
          activatePrime.initializeContextVectorStore();
          activatePrime.initializeContextCompressionEngine();
          activatePrime.initializeContextAwarenessEngine();
          activatePrime.initializeEnhancedModelRouter();
          console.log(`[Main] ✅ ActivatePrime initialized for workspace: ${workspacePath}`);
          
          // Start background indexing after a short delay to not block startup
          setTimeout(() => {
            if (codebaseIndexer && workspacePath) {
              console.log(`[Main] 🚀 Starting background codebase indexing...`);
              codebaseIndexer.indexCodebase().then(() => {
                console.log(`[Main] ✅ Background indexing completed`);
                // Notify renderer that indexing is complete
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('codebase:indexing-complete');
                }
              }).catch((error: any) => {
                console.error(`[Main] ❌ Background indexing failed: ${error.message}`);
              });
            }
          }, 2000); // Wait 2 seconds after startup before indexing
        } catch (error: any) {
          console.error(`[Main] ❌ Failed to initialize CodebaseIndexer: ${error.message}`);
        }
      }
    },
    getFocusedFolder: () => focusedFolderPath,
    setFocusedFolder: (path: string | null) => { focusedFolderPath = path; },
    templateEngine,
    getMirrorMemory: () => mirrorMemory,
    getPatternExtractor: () => patternExtractor,
    getIntelligenceExpansion: () => intelligenceExpansion,
    getCodebaseIndexer: () => codebaseIndexer,
    getKnowledgeIngester: () => knowledgeIngester,
    getActivatePrime: () => activatePrime,
    getActiveFilePath: () => activeFilePath,
    setActiveFilePath: (filePath: string | null) => { activeFilePath = filePath; },
    // Settings access for telemetry handlers
    getSettings: () => settings,
    updateSettings: (newSettings: Partial<Settings>) => {
      settings = { ...settings, ...newSettings };
      saveSettings();
    }
  });
  
  // Register chat handler
  registerChat({
    ipcMain,
    getWorkspacePath: () => workspacePath,
    getCurrentFile: () => null, // TODO: Track current file
    getCurrentFolder: () => focusedFolderPath,
    getConversationHistory: () => conversationHistory,
    addToConversationHistory: (role: 'user' | 'assistant', content: string) => {
      conversationHistory.push({ role, content });
      // Keep last 20 messages
      if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20);
      }
    },
    getSettings: () => settings
  });
  
  createWindow();
  
  // Initialize auto-updater (only in production)
  initializeAutoUpdater(mainWindow);
  
  // Start the inference server for VibeHub shared AI
  // This allows any project launched from VibeHub to use AgentPrime's AI providers
  try {
    const inferencePort = await startInferenceServer();
    console.log(`[Main] 🧠 Inference server started on port ${inferencePort}`);
    console.log(`[Main] 🧠 Projects can use AI via OPENAI_API_BASE=http://127.0.0.1:${inferencePort}/v1`);
  } catch (error) {
    console.warn('[Main] ⚠️ Inference server failed to start:', error);
    // Non-fatal - app continues without shared inference
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MATRIX BUDDY DESKTOP BACKEND — Auto-initialize Matrix Mode
  // Browser, scheduler, automation, nodes — all start at boot.
  // This gives Matrix Buddy its own Chrome, its own cron, its own hands.
  // ═══════════════════════════════════════════════════════════════════════════
  setTimeout(async () => {
    try {
      const { initializeMatrixMode, getMatrixMode } = await import('./matrix-mode');
      const { validateAction } = await import('./core/guardian');
      
      console.log('[Main] 🦖 Starting Matrix Buddy Desktop Backend...');
      
      const matrixInstance = await initializeMatrixMode({
        memory: { enabled: true },
        scheduler: { enabled: true },
        agents: { enabled: true },
        gateway: { enabled: false }, // Don't auto-start gateway (user opts in)
        browser: { enabled: true, headless: true },
        voice: { enabled: false },   // Don't auto-start voice (user opts in)
        canvas: { enabled: true },
        integrations: { enabled: true },
        automation: { enabled: true },
        nodes: { enabled: true }
      });
      
      // ─── Wire the scheduler executor ───────────────────────────────
      // When a scheduled task fires, it needs to actually DO something.
      // Route task actions through the system executor + Guardian.
      if (matrixInstance.scheduler) {
        matrixInstance.scheduler.setTaskExecutor(async (task: any) => {
          const action = task.action;
          if (!action) return { executed: false, error: 'No action defined' };
          
          console.log(`[DesktopBackend] Executing scheduled task: ${task.name} (${action.type})`);
          
          if (action.type === 'command' && action.command) {
            // Validate through Guardian before executing
            const verdict = validateAction('run_command', { command: action.command });
            if (!verdict.allowed) {
              console.warn(`[DesktopBackend] Guardian blocked scheduled command: ${verdict.reason}`);
              return { executed: false, error: verdict.reason };
            }
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            const result = await execAsync(action.command, { timeout: 30000 });
            return { executed: true, stdout: result.stdout, stderr: result.stderr };
          }
          
          if (action.type === 'message' && action.message) {
            // Log the message (could be wired to channels later)
            console.log(`[DesktopBackend] Scheduled message: ${action.message}`);
            return { executed: true, message: action.message };
          }
          
          if (action.type === 'webhook' && action.url) {
            const verdict = validateAction('open_url', { url: action.url });
            if (!verdict.allowed) {
              return { executed: false, error: verdict.reason };
            }
            const http = await import('http');
            const https = await import('https');
            const client = action.url.startsWith('https') ? https : http;
            return new Promise((resolve) => {
              const req = client.request(action.url, { method: action.method || 'POST' }, (res: any) => {
                resolve({ executed: true, status: res.statusCode });
              });
              req.on('error', (e: any) => resolve({ executed: false, error: e.message }));
              if (action.body) req.write(JSON.stringify(action.body));
              req.end();
            });
          }
          
          if (action.type === 'workflow' && action.workflowId && matrixInstance.automation) {
            const execution = await matrixInstance.automation.executeWorkflow(action.workflowId);
            return { executed: true, workflowStatus: execution.status };
          }
          
          return { executed: true };
        });
        console.log('[Main] 🦖 Scheduler executor wired — background tasks can run');
      }
      
      // ─── Auto-start browser with dedicated profile ─────────────────
      if (matrixInstance.browser) {
        try {
          const browser = matrixInstance.browser as any;
          if (typeof browser.createProfile === 'function') {
            browser.createProfile('matrix-buddy');
          }
          console.log('[Main] 🦖 Browser controller ready (matrix-buddy profile)');
        } catch (browserErr) {
          // Non-fatal — browser starts on first use
          console.log('[Main] 🦖 Browser controller ready (default profile)');
        }
      }
      
      console.log('[Main] 🦖 Matrix Buddy Desktop Backend initialized');
      console.log('[Main] 🦖 Subsystems:', {
        memory: '✅',
        scheduler: matrixInstance.scheduler ? '✅' : '❌',
        browser: matrixInstance.browser ? '✅' : '❌',
        automation: matrixInstance.automation ? '✅' : '❌',
        nodes: matrixInstance.nodes ? '✅' : '❌',
        canvas: matrixInstance.canvas ? '✅' : '❌',
        integrations: matrixInstance.integrations ? '✅' : '❌'
      });
      
    } catch (error: any) {
      console.warn('[Main] ⚠️ Matrix Buddy Desktop Backend init failed:', error.message);
      console.warn('[Main] Matrix Agent will lazy-init on first use (fallback)');
      // Non-fatal — matrix-agent.ts still has its own lazy init
    }
  }, 3000); // Delay 3s after window creation so UI loads first
});

app.on('before-quit', async () => {
  // Shutdown Matrix Buddy Desktop Backend
  try {
    const { shutdownMatrixMode, isMatrixModeInitialized } = await import('./matrix-mode');
    if (isMatrixModeInitialized()) {
      await shutdownMatrixMode();
      console.log('[Main] 🦖 Matrix Buddy Desktop Backend shut down');
    }
  } catch (e) {
    console.warn('[Main] Error shutting down Matrix Mode:', e);
  }
  
  // Stop inference server
  try {
    await stopInferenceServer();
    console.log('[Main] Inference server stopped');
  } catch (e) {
    console.warn('[Main] Error stopping inference server:', e);
  }
  
  // Shutdown telemetry (flushes pending events)
  try {
    const telemetryService = getTelemetryService();
    await telemetryService.shutdown();
  } catch (e) {
    console.warn('[Main] Error shutting down telemetry:', e);
  }
  
  // Save state before quitting
  await stateManager.forceSave();
  stateManager.cleanup();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Basic IPC handlers (more will be added as modules are migrated)
ipcMain.handle('get-workspace', () => {
  return workspacePath;
});

ipcMain.handle('get-settings', () => {
  return settings;
});

ipcMain.handle('update-settings', (event, newSettings: Partial<Settings>) => {
  // Deep merge for nested objects
  if (newSettings.dualModelConfig && settings.dualModelConfig) {
    newSettings.dualModelConfig = {
      ...settings.dualModelConfig,
      ...newSettings.dualModelConfig,
      fastModel: {
        ...settings.dualModelConfig.fastModel,
        ...(newSettings.dualModelConfig.fastModel || {})
      },
      deepModel: {
        ...settings.dualModelConfig.deepModel,
        ...(newSettings.dualModelConfig.deepModel || {})
      }
    };
  }
  
  if (newSettings.providers && settings.providers) {
    newSettings.providers = {
      ...settings.providers,
      ...newSettings.providers
    };
  }
  
  settings = { ...settings, ...newSettings };
  saveSettings();

  if (newSettings.theme && mainWindow) {
    mainWindow.webContents.send('theme-changed', newSettings.theme);
  }

  // Reinitialize AI providers when provider settings OR dual model settings change
  if (newSettings.activeProvider || newSettings.activeModel || newSettings.providers ||
      newSettings.dualModelEnabled !== undefined || newSettings.dualModelConfig) {
    initializeAIProviders();
    console.log('[Settings] AI providers reinitialized due to settings change');
  }

  return settings;
});

// AI Provider Management IPC Handlers
ipcMain.handle('get-providers', async () => {
  try {
    const providerInfos = aiRouter.getProvidersInfo();
    return providerInfos.map((p: any) => ({
      name: p.id,
      displayName: p.displayName,
      isConfigured: p.isConfigured,
      isActive: p.id === settings.activeProvider
    }));
  } catch (error: any) {
    console.error('[IPC] get-providers error:', error);
    return [];
  }
});

ipcMain.handle('get-provider-models', async (event, providerName: string) => {
  try {
    const models = await aiRouter.getProviderModels(providerName);
    return models;
  } catch (error: any) {
    console.error('[IPC] get-provider-models error:', error);
    return [];
  }
});

ipcMain.handle('test-provider', async (event, providerName: string) => {
  try {
    const result = await aiRouter.testProvider(providerName);
    return result;
  } catch (error: any) {
    console.error('[IPC] test-provider error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-active-provider', async (event, providerName: string, model: string) => {
  try {
    settings.activeProvider = providerName;
    settings.activeModel = model;
    saveSettings();
    initializeAIProviders();
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] set-active-provider error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('configure-provider', async (event, providerName: string, config: any) => {
  try {
    if (!settings.providers) {
      settings.providers = {} as any;
    }
    const providerSettings = settings.providers as Record<string, any>;
    providerSettings[providerName] = {
      ...providerSettings[providerName],
      ...config
    };
    saveSettings();
    initializeAIProviders();
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] configure-provider error:', error);
    return { success: false, error: error.message };
  }
});

// Auto-Updater IPC Handlers
ipcMain.handle('check-for-updates', () => {
  checkForUpdates();
  return { success: true };
});

ipcMain.handle('download-update', () => {
  downloadUpdate();
  return { success: true };
});

ipcMain.handle('install-update', () => {
  installUpdate();
  return { success: true };
});

ipcMain.handle('get-app-version', () => {
  return getAppVersion();
});

// Open External URL/File Handler
ipcMain.handle('open-external', async (event, url: string) => {
  try {
    const { shell } = require('electron');
    await shell.openExternal(url);
    return { success: true };
  } catch (error: any) {
    console.error('[IPC] open-external error:', error);
    return { success: false, error: error.message };
  }
});

// Inference Server Status Handler (for VibeHub shared AI)
ipcMain.handle('inference:status', () => {
  try {
    const server = getInferenceServer();
    return {
      running: server.isRunning(),
      ...server.getStats(),
      envVars: getInferenceEnvVars()
    };
  } catch (error: any) {
    return {
      running: false,
      port: 11411,
      requestCount: 0,
      error: error.message
    };
  }
});

// ==========================
// Missing IPC Handlers - Production fixes
// ==========================

// Save File Dialog
ipcMain.handle('save-file-dialog', async (_event, defaultPath?: string, suggestedExtension?: string) => {
  try {
    const { dialog } = require('electron');
    const filters = suggestedExtension
      ? [{ name: `${suggestedExtension.toUpperCase()} Files`, extensions: [suggestedExtension.replace('.', '')] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'All Files', extensions: ['*'] }];
    
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultPath || undefined,
      filters
    });
    
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }
    return { success: true, filePath: result.filePath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Quick Action (AI actions on selected code)
ipcMain.handle('quick-action', async (_event, action: string, code: string, language?: string) => {
  try {
    const prompt = `Perform the following action on this ${language || 'code'}:\n\nAction: ${action}\n\nCode:\n\`\`\`${language || ''}\n${code}\n\`\`\`\n\nReturn ONLY the modified code, no explanations.`;
    const result = await aiRouter.chat([
      { role: 'system', content: 'You are a code assistant. Return only code, no markdown fences, no explanations.' },
      { role: 'user', content: prompt }
    ], { model: settings.activeModel });
    return { success: true, result: result.content || '' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// AI Status
ipcMain.handle('ai-status', async () => {
  try {
    const provider = aiRouter.getActiveProvider();
    return {
      success: true,
      provider: settings.activeProvider,
      model: settings.activeModel,
      connected: !!provider
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Clear Conversation History
ipcMain.handle('clear-history', async () => {
  try {
    conversationHistory.length = 0;
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Run Lint (ESLint integration)
ipcMain.handle('run-lint', async (_event, filePath: string, content: string) => {
  try {
    // Return empty results - ESLint requires complex setup per project
    // The inline-completion handler in analysis.ts handles real linting
    return { success: true, issues: [] };
  } catch (error: any) {
    return { success: false, error: error.message, issues: [] };
  }
});

// Create Workspace
ipcMain.handle('create-workspace', async (_event, projectName: string, baseDir: string) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const targetDir = path.join(baseDir, projectName);
    fs.mkdirSync(targetDir, { recursive: true });
    return { success: true, path: targetDir };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

console.log('🚀 AgentPrime Electron app starting...');
