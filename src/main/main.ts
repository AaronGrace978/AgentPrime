/**
 * AgentPrime - Electron Main Process
 * 
 * Core entry point: window lifecycle, IPC registration, AI provider
 * initialization, secure key storage, telemetry, and auto-updates.
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import type { Settings } from '../types';
import type { SystemDoctorReport, SystemStatusSummary } from '../types/system-health';
import { getTheme, getTitleBarOverlay, type ThemeId } from '../renderer/themes';
import { createLogger } from './core/logger';
import { initAppLogging, initOptionalSentry, logCrash } from './core/app-logger';
import {
  allowMultipleInstances,
  configureWindowsSessionDataPath,
  setupSingleInstanceGuard,
} from './core/electron-runtime-guard';
import {
  DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS,
  normalizeOllamaCloudOutputLimits,
  setOllamaCloudOutputLimits
} from './core/model-output-limits';

const log = createLogger('Main');

// ============================================================================
// GLOBAL ERROR HANDLERS — structured logs + crashes.jsonl (+ optional Sentry)
// ============================================================================
process.on('uncaughtException', (error: Error, origin: string) => {
  log.error('================== UNCAUGHT EXCEPTION ==================');
  log.error(`Origin: ${origin}`);
  log.error(`Error: ${error.name}: ${error.message}`);
  log.error(`Stack: ${error.stack}`);
  log.error('=========================================================');
  logCrash('uncaughtException', error, origin);
});

process.on('unhandledRejection', (reason: unknown) => {
  log.error('================== UNHANDLED REJECTION ==================');
  log.error('Reason:', reason);
  log.error('=========================================================');
  logCrash('unhandledRejection', reason);
});

const configuredSessionDataPath = configureWindowsSessionDataPath(app);
if (configuredSessionDataPath) {
  log.info(`[Main] Using Windows sessionData path: ${configuredSessionDataPath}`);
}

// Import AI router (TypeScript)
import aiRouter from './ai-providers';

// Import IPC handlers (TypeScript)
import { registerAllHandlers } from './ipc-handlers';
import { register as registerChat } from './ipc-handlers/chat';

// Import CodebaseIndexer
import { CodebaseIndexer } from './search/indexer';
import {
  WorkspaceSymbolIndex,
  setWorkspaceSymbolIndexForAgents
} from './search/symbol-index';

// Import Mirror Knowledge Ingester
import { MirrorKnowledgeIngester } from './mirror/mirror-knowledge-ingester';

// Import Mirror Singleton for global access
import { isMirrorReady, setMirrorMemory } from './mirror/mirror-singleton';

// Import Backend Manager
import { initializeBackendManager } from './core/backend-manager';

// Import Secure Key Storage
import { getSecureKeyStorage } from './security/secureKeyStorage';
import {
  SUPPORTED_PROVIDER_API_KEYS,
  buildProviderApiKeyStatusSnapshot,
  normalizeSecretInput,
  resolveProviderApiKeySource,
  resolveProviderEnvironmentApiKey,
  sanitizeSettingsForRenderer,
  type ProviderApiKeyPreference,
  type SupportedProviderApiKey,
} from './security/providerApiKeys';

// Import State Manager
import { stateManager } from './core/state-manager';

// Import Feature Flags
import { buildFeatureFlags, getFeatureFlags, type FeatureFlags, resolveFeatureFlags } from './core/feature-flags';
import { runStartupConfigPreflight, type StartupConfigPreflightReport } from './core/startup-config-preflight';

// Import Telemetry Service
import { initializeTelemetry, getTelemetryService } from './core/telemetry-service';
import { resolveEffectiveAIRuntime } from './core/ai-runtime-state';
import { collectSystemDoctorReport } from './core/system-health';
import { isBrainAvailable } from './ipc-handlers/brain-handler';

// Import Auto-Updater
import { initializeAutoUpdater, checkForUpdates, downloadUpdate, installUpdate, getAppVersion } from './core/auto-updater';
import { PluginManager } from './core/plugin-api';
import { SecurePluginSandbox } from './core/plugin-sandbox';
import { setPluginManager as setPluginManagerSingleton } from './core/plugin-singleton';
import { SelfTestingLoop } from './agent/self-testing-loop';
import { clampAgentAutonomyLevel } from './agent/autonomy-policy';

// Import Inference Server (shared AI for VibeHub projects)
import { getInferenceEnvVars, getInferenceServer } from './inference-server';

// Import ActivatePrime Integration (Cursor-like AI assistance)
import { ActivatePrimeIntegration } from './modules/activateprime';

// ActivatePrime instance (initialized when workspace is set)
let activatePrime: ActivatePrimeIntegration | null = null;
let workspaceSymbolIndex: WorkspaceSymbolIndex | null = null;

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
        log.info(`[Main] app.getAppPath(): ${appPath}`);
        log.info(`[Main] app.isPackaged: ${app.isPackaged}`);
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
    log.info(`[Main] Loading modules from root: ${rootPath}`);
    log.info(`[Main] __dirname: ${__dirname}`);
    log.info(`[Main] process.cwd(): ${process.cwd()}`);

    try {
      // Import the TypeScript TemplateEngine
      const TemplateEngineModule = require('./legacy/template-engine');
      TemplateEngine = TemplateEngineModule.default || TemplateEngineModule;
      log.info(`[Main] ✅ TemplateEngine module loaded from TypeScript`);
    } catch (e: any) {
      log.error(`[Main] ❌ Failed to load TemplateEngine: ${e.message}`);
      log.error(`[Main] Error stack: ${e.stack}`);
      log.error(`[Main] Template engine not available: ${e.message}`);
      log.error(`   This will prevent project creation from templates.`);
      // Don't throw error - continue without template engine
    }
    
    // Initialize CodebaseIndexer (TypeScript)
    try {
      // CodebaseIndexer will be initialized when workspace is set
      log.info(`[Main] ✅ CodebaseIndexer class available`);
    } catch (e: any) {
      log.warn(`[Main] ⚠️  CodebaseIndexer not available: ${e.message}`);
    }

    // Load ActionExecutor (optional)
    try {
      ActionExecutor = require('./legacy/action-executor.js');
      log.info(`[Main] ✅ ActionExecutor module loaded from relative path`);
    } catch (e: any) {
      log.warn(`[Main] ⚠️  ActionExecutor not available: ${e.message}`);
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
      
      log.info(`[Main] ✅ Mirror system modules loaded from TypeScript sources`);
      log.info(`[Main]    MirrorMemory: ${typeof MirrorMemory}`);
      log.info(`[Main]    MirrorPatternExtractor: ${typeof MirrorPatternExtractor}`);
      log.info(`[Main]    IntelligenceExpansion: ${typeof IntelligenceExpansion}`);
    } catch (error: any) {
      log.error(`[Main] ❌ Mirror system modules failed to load: ${error.message}`);
      log.error(`[Main]    Error stack: ${error.stack}`);
      log.error(`[Main]    This will prevent code ingestion from working.`);
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

// Ollama defaults
// Single-model mode should default to a strong cloud model rather than the local 7B.
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3-coder:480b-cloud';
const OLLAMA_FAST_MODEL = process.env.OLLAMA_FAST_MODEL || 'devstral-small-2:24b-cloud';
const OLLAMA_MODEL_FALLBACK = process.env.OLLAMA_MODEL_FALLBACK || 'qwen3-coder-next:cloud';
// Ollama API keys from environment (primary + desktop fallback)
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';
const OLLAMA_API_KEY_DESKTOP = process.env.OLLAMA_API_KEY_DESKTOP || '';

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
// For other cloud models, default to the official Ollama Cloud endpoint.
const getCloudUrl = (model: string): string => {
  if (model.toLowerCase().includes('deepseek')) {
    return 'https://ollama.deepseek.com';
  }
  return 'https://ollama.com';
};

const OLLAMA_URL = process.env.OLLAMA_URL || (isCloudModel(OLLAMA_MODEL) ? getCloudUrl(OLLAMA_MODEL) : 'http://127.0.0.1:11434');
const OLLAMA_URL_SECONDARY = process.env.OLLAMA_URL_SECONDARY || (isCloudModel(OLLAMA_MODEL_FALLBACK) ? getCloudUrl(OLLAMA_MODEL_FALLBACK) : 'http://127.0.0.1:11435');

let mainWindow: BrowserWindow | null = null;
let workspacePath: string | null = null;
let focusedFolderPath: string | null = null;
let activeFilePath: string | null = null; // Track currently active file for completion context
type ConversationMode = 'agent' | 'chat' | 'dino';
type ConversationMessage = { role: 'user' | 'assistant'; content: string };
let conversationHistory: Record<ConversationMode, ConversationMessage[]> = {
  agent: [],
  chat: [],
  dino: [],
};
const multiInstanceAllowed = allowMultipleInstances(process.env);
const hasSingleInstanceLock = setupSingleInstanceGuard(
  app,
  () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  },
  !multiInstanceAllowed
);

if (!hasSingleInstanceLock) {
  log.warn('[Main] Another AgentPrime instance is already running. Exiting duplicate instance.');
}

// Template Engine
let templateEngine: any = null;
let pluginManager: PluginManager | null = null;

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
  activeProvider: 'ollama',
  activeModel: OLLAMA_MODEL,
  dualOllamaEnabled: false,
  agentAutonomyLevel: 3,
  agentMonolithicApplyImmediately: false,
  pythonBrainEnabled: false,
  plugins: {
    enabled: true,
    autoUpdate: false,
    trustedSources: ['built-in'],
    trustedOnly: true,
    allowPreRelease: false,
  },
  
  // Dual Model System - default to the same Ollama-first stack used by the agent runtime
  dualModelEnabled: true,
  dualModelConfig: {
    fastModel: {
      provider: 'ollama',
      model: OLLAMA_FAST_MODEL,
      enabled: true
    },
    deepModel: {
      provider: 'ollama',
      model: OLLAMA_MODEL_FALLBACK,
      enabled: true
    },
    autoRoute: true,
    complexityThreshold: 6,
    deepModelTriggers: ['analyze', 'debug', 'refactor', 'explain', 'architect', 'optimize', 'review'],
    fastModelTriggers: ['quick', 'simple', 'format', 'rename', 'fix typo', 'what is']
  },
  ollamaCloudOutputLimits: { ...DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS },
  
  providers: {
    ollama: {
      baseUrl: OLLAMA_URL,
      apiKey: OLLAMA_API_KEY,
      model: OLLAMA_MODEL
    },
    ollamaSecondary: {
      baseUrl: OLLAMA_URL_SECONDARY,
      apiKey: OLLAMA_API_KEY_DESKTOP || OLLAMA_API_KEY,
      model: OLLAMA_MODEL_FALLBACK
    },
    anthropic: {
      apiKey: ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-6'
    },
    openai: {
      apiKey: OPENAI_API_KEY,
      model: 'gpt-5.4'
    },
    openrouter: {
      apiKey: OPENROUTER_API_KEY,
      model: 'anthropic/claude-sonnet-4'
    }
  }
};

let startupPreflightReport: StartupConfigPreflightReport | null = null;
let runtimeFeatureFlags: FeatureFlags | null = null;

function getFeatureFlagSettingsOverrides(source: Settings): Partial<FeatureFlags> {
  return {
    pythonBrain: source.pythonBrainEnabled === true,
  };
}

function refreshStartupPreflightReport(log: boolean = false): StartupConfigPreflightReport {
  const featureFlags = buildFeatureFlags(getFeatureFlagSettingsOverrides(settings));
  startupPreflightReport = runStartupConfigPreflight(settings, featureFlags, { log });
  return startupPreflightReport;
}

function getAppRootForDiagnostics(): string {
  return app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '../..');
}

async function buildSystemStatusSummary(): Promise<SystemStatusSummary> {
  const runtime = resolveEffectiveAIRuntime(settings, settings.activeModel, settings.activeProvider);
  const providerStatus = await aiRouter.testProvider(runtime.effectiveProvider).catch((error: any) => ({
    success: false,
    error: error?.message || String(error),
  }));
  const featureFlags = runtimeFeatureFlags || getFeatureFlags();
  const brainConnected = featureFlags.pythonBrain ? await isBrainAvailable().catch(() => false) : false;

  return {
    ai: {
      provider: runtime.displayProvider,
      model: runtime.displayModel,
      connected: providerStatus?.success || false,
      reason: runtime.reason,
    },
    brain: {
      enabled: featureFlags.pythonBrain,
      connected: brainConnected,
      modeLabel: featureFlags.pythonBrain ? 'brain-enabled' : 'desktop-only',
    },
    startup: startupPreflightReport || refreshStartupPreflightReport(false),
    timestamp: new Date().toISOString(),
  };
}

async function buildSystemDoctorReport(): Promise<SystemDoctorReport> {
  const summary = await buildSystemStatusSummary();
  return collectSystemDoctorReport({
    settings,
    appRoot: getAppRootForDiagnostics(),
    startupPreflightReport: summary.startup,
    aiConnected: summary.ai.connected,
    brainEnabled: summary.brain.enabled,
    brainConnected: summary.brain.connected,
  });
}

function isSupportedProviderApiKey(providerName: string): providerName is SupportedProviderApiKey {
  return SUPPORTED_PROVIDER_API_KEYS.includes(providerName as SupportedProviderApiKey);
}

function ensureProviderSettingsEntry(providerName: string): Record<string, any> {
  if (!settings.providers) {
    settings.providers = {} as any;
  }
  const providerSettings = settings.providers as Record<string, any>;
  providerSettings[providerName] = providerSettings[providerName] || {};
  return providerSettings[providerName];
}

function getProviderApiKeyPreference(providerName: SupportedProviderApiKey): ProviderApiKeyPreference | undefined {
  const providerConfig = (settings.providers as Record<string, any> | undefined)?.[providerName];
  const source = providerConfig?.apiKeySource;
  return source === 'secure-storage' || source === 'environment' ? source : undefined;
}

function setProviderApiKeyPreference(providerName: SupportedProviderApiKey, source?: ProviderApiKeyPreference): void {
  const providerConfig = ensureProviderSettingsEntry(providerName);
  if (source) {
    providerConfig.apiKeySource = source;
  } else {
    delete providerConfig.apiKeySource;
  }
}

function setProviderRuntimeApiKey(providerName: SupportedProviderApiKey, apiKey: string | null): void {
  const providerConfig = ensureProviderSettingsEntry(providerName);
  if (apiKey) {
    providerConfig.apiKey = apiKey;
  } else {
    delete providerConfig.apiKey;
  }
}

async function setProviderApiKeyValue(
  providerName: SupportedProviderApiKey,
  apiKey: string | null
): Promise<void> {
  const secureStorage = getSecureKeyStorage();
  const normalizedApiKey = normalizeSecretInput(apiKey);

  if (normalizedApiKey) {
    await secureStorage.setApiKey(providerName, normalizedApiKey);
    setProviderRuntimeApiKey(providerName, normalizedApiKey);
    setProviderApiKeyPreference(providerName, 'secure-storage');
    return;
  }

  await secureStorage.deleteApiKey(providerName);
  const environmentKey = resolveProviderEnvironmentApiKey(providerName);
  setProviderRuntimeApiKey(providerName, environmentKey.value);
  setProviderApiKeyPreference(providerName, environmentKey.value ? 'environment' : undefined);
}

async function getProviderApiKeyStatus(providerName: SupportedProviderApiKey) {
  const secureStorage = getSecureKeyStorage();
  const storedKey = await secureStorage.getApiKey(providerName);
  const environmentKey = resolveProviderEnvironmentApiKey(providerName);

  return buildProviderApiKeyStatusSnapshot({
    provider: providerName,
    storedKey,
    environmentKey: environmentKey.value,
    environmentVariable: environmentKey.environmentVariable,
    preferredSource: getProviderApiKeyPreference(providerName),
    storageBackend: secureStorage.getBackendType(),
  });
}

async function getProviderApiKeyStatuses() {
  const statuses = await Promise.all(
    SUPPORTED_PROVIDER_API_KEYS.map(async (providerName) => [providerName, await getProviderApiKeyStatus(providerName)] as const)
  );

  return Object.fromEntries(statuses);
}

function extractProviderApiKeyUpdates(providerConfigs?: Record<string, any>): Partial<Record<SupportedProviderApiKey, string | null>> {
  const updates: Partial<Record<SupportedProviderApiKey, string | null>> = {};
  if (!providerConfigs) {
    return updates;
  }

  for (const [providerName, providerConfig] of Object.entries(providerConfigs)) {
    if (!providerConfig || typeof providerConfig !== 'object') {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(providerConfig, 'apiKey')) {
      continue;
    }

    const apiKey = normalizeSecretInput(providerConfig.apiKey);
    delete providerConfig.apiKey;

    if (isSupportedProviderApiKey(providerName)) {
      updates[providerName] = apiKey;
    }
  }

  return updates;
}

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

  const normalizeProviderFromModel = (model: string | undefined, fallback: string) =>
    aiRouter.inferProviderForModel(model, fallback) || fallback;

  const normalizeActiveSelection = () => {
    const previousProvider = settings.activeProvider;
    const previousModel = settings.activeModel;
    const runtime = resolveEffectiveAIRuntime(settings, settings.activeModel, settings.activeProvider);

    settings.activeProvider = runtime.effectiveProvider;
    settings.activeModel = runtime.effectiveModel;

    return previousProvider !== settings.activeProvider || previousModel !== settings.activeModel;
  };

  settings.ollamaCloudOutputLimits = normalizeOllamaCloudOutputLimits(settings.ollamaCloudOutputLimits);
  setOllamaCloudOutputLimits(settings.ollamaCloudOutputLimits);

  const activeSelectionChanged = normalizeActiveSelection();
  if (settings.dualModelConfig) {
    settings.dualModelConfig.fastModel.provider = normalizeProviderFromModel(
      settings.dualModelConfig.fastModel.model,
      settings.dualModelConfig.fastModel.provider || 'ollama'
    );
    settings.dualModelConfig.deepModel.provider = normalizeProviderFromModel(
      settings.dualModelConfig.deepModel.model,
      settings.dualModelConfig.deepModel.provider || 'ollama'
    );
  }

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
          log.info('[AI] ✅ Ollama available - set as fallback for rate limits');
        } else {
          // Still set Ollama as fallback - it will check health when needed
          aiRouter.setFallbackProvider('ollama');
          log.info('[AI] ⚠️ Ollama not running now - set as fallback (will check on use)');
        }
      }).catch(() => {
        // Still set Ollama as fallback - it will check health when needed
        aiRouter.setFallbackProvider('ollama');
        log.info('[AI] ⚠️ Ollama check failed - set as fallback (will check on use)');
      });
    } else {
      // Set Ollama as fallback anyway - router will check health when needed
      aiRouter.setFallbackProvider('ollama');
      log.info('[AI] 🔄 Ollama set as fallback for rate limits');
    }
  }
  
  // Configure Dual Model System if enabled
  if (settings.dualModelEnabled && settings.dualModelConfig) {
    aiRouter.configureDualModel(settings.dualModelConfig);
    log.info(`🚀 Dual Model System enabled:`);
    log.info(`   ⚡ Fast: ${settings.dualModelConfig.fastModel.provider}/${settings.dualModelConfig.fastModel.model}`);
    log.info(`   🧠 Deep: ${settings.dualModelConfig.deepModel.provider}/${settings.dualModelConfig.deepModel.model}`);
    log.info(`   🔀 Auto-route: ${settings.dualModelConfig.autoRoute ? 'ON' : 'OFF'} (threshold: ${settings.dualModelConfig.complexityThreshold})`);
  }

  if (activeSelectionChanged) {
    log.info(`[Settings] Normalized active AI provider to ${settings.activeProvider}/${settings.activeModel}`);
    saveSettings();
  }
  
  log.info(`✅ AI Provider initialized: ${settings.activeProvider} (${settings.activeModel})`);
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
      log.info('[Settings] 🔧 Fixed Ollama URL: localhost → 127.0.0.1 (IPv6 fix)');
    }
    if (settings.providers?.ollama?.endpoint?.includes('localhost')) {
      settings.providers.ollama.endpoint = fixLocalhost(settings.providers.ollama.endpoint);
      log.info('[Settings] 🔧 Fixed Ollama endpoint: localhost → 127.0.0.1 (IPv6 fix)');
    }
    if (settings.providers?.ollamaSecondary?.baseUrl?.includes('localhost')) {
      settings.providers.ollamaSecondary.baseUrl = fixLocalhost(settings.providers.ollamaSecondary.baseUrl);
      log.info('[Settings] 🔧 Fixed Ollama Secondary URL: localhost → 127.0.0.1 (IPv6 fix)');
    }
    if (settings.providers?.ollamaSecondary?.endpoint?.includes('localhost')) {
      settings.providers.ollamaSecondary.endpoint = fixLocalhost(settings.providers.ollamaSecondary.endpoint);
      log.info('[Settings] 🔧 Fixed Ollama Secondary endpoint: localhost → 127.0.0.1 (IPv6 fix)');
    }

    settings.agentAutonomyLevel = clampAgentAutonomyLevel(settings.agentAutonomyLevel);
  } catch (e) {
    log.info('Error loading settings:', e);
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
    log.info(`[Security] 🔐 Loading API keys from ${secureStorage.getBackendType()}`);

    // Load API keys for each provider
    const providers = settings.providers as Record<string, any>;
    for (const provider of Object.keys(providers)) {
      if (!isSupportedProviderApiKey(provider)) {
        continue;
      }

      try {
        const storedKey = await secureStorage.getApiKey(provider);
        const environmentKey = resolveProviderEnvironmentApiKey(provider);
        const activeSource = resolveProviderApiKeySource(
          storedKey,
          environmentKey.value,
          getProviderApiKeyPreference(provider)
        );

        if (activeSource === 'secure-storage') {
          setProviderRuntimeApiKey(provider, normalizeSecretInput(storedKey));
          log.info(`[Security] ✅ Loaded API key for ${provider} from secure storage`);
        } else if (activeSource === 'environment') {
          setProviderRuntimeApiKey(provider, environmentKey.value);
          log.info(
            `[Security] ✅ Using ${environmentKey.environmentVariable || 'environment'} API key for ${provider}`
          );
        } else {
          setProviderRuntimeApiKey(provider, null);
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
              if (isSupportedProviderApiKey(provider)) {
                setProviderRuntimeApiKey(provider, normalizeSecretInput(config.apiKey));
                setProviderApiKeyPreference(provider, 'secure-storage');
              }
              log.info(`[Security] 🔄 Migrated API key for ${provider} to secure storage`);
            }
          }
        }
        
        // If we migrated, rewrite settings.json without API keys
        if (needsMigration) {
          log.info('[Security] 📝 Removing plain-text API keys from settings.json');
          saveSettings(); // This will save without API keys
        }
      } catch (e) {
        log.warn('[Security] Could not check for key migration:', e);
      }
    }
  } catch (e) {
    log.warn('[Security] Error loading secure API keys:', e);
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
              log.warn(`[Security] Failed to save API key for ${provider}:`, e);
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
    log.info('Error saving settings:', e);
  }
}

function resolveThemeIdFromSettings(): ThemeId {
  if (settings.themeId) {
    return settings.themeId as ThemeId;
  }
  if (settings.theme === 'vs' || settings.theme === 'light') {
    return 'light';
  }
  return 'dark';
}

function syncMainWindowTitleBar(): void {
  if (!mainWindow || process.platform === 'darwin') return;
  try {
    const overlay = getTitleBarOverlay(getTheme(resolveThemeIdFromSettings()));
    mainWindow.setTitleBarOverlay(overlay);
    mainWindow.setBackgroundColor(overlay.color);
  } catch (e) {
    log.warn('[Main] Title bar sync failed:', e);
  }
}

// Create window
function createWindow(): void {
  const initialTitleBar = getTitleBarOverlay(getTheme(resolveThemeIdFromSettings()));
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    backgroundColor: initialTitleBar.color,
    titleBarStyle: 'hidden',
    titleBarOverlay: initialTitleBar,
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
        'Content-Security-Policy':
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: https:; " +
          "font-src 'self' data:; " +
          "connect-src 'self' http://localhost:* http://127.0.0.1:* https://api.anthropic.com https://api.openai.com https://openrouter.ai https://*.ollama.com ws://localhost:* wss://localhost:*"
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
    
    if (!mainWindow) {
      return;
    }
    const response = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Close', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Confirm Close',
      message: 'Are you sure you want to close AgentPrime?',
      detail: 'Any unsaved work may be lost.'
    });
    if (response === 0) { // 'Close' button
      isClosingConfirmed = true;
      mainWindow?.close();
    }
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

if (hasSingleInstanceLock) {
app.whenReady().then(async () => {
  initAppLogging();
  initOptionalSentry();

  loadSettings();
  const featureFlags = resolveFeatureFlags(getFeatureFlagSettingsOverrides(settings));
  runtimeFeatureFlags = featureFlags;

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

  // Validate runtime configuration early with actionable diagnostics.
  startupPreflightReport = runStartupConfigPreflight(settings, featureFlags, { log: true });

  initializeAIProviders();
  
  // Initialize backend manager (auto-starts Python backend if needed)
  if (featureFlags.pythonBrain) {
    await initializeBackendManager();
  } else {
    log.info('[Main] Python Brain disabled (set AGENTPRIME_ENABLE_BRAIN=true to enable)');
  }
  
  // Initialize template engine
  try {
    const { TemplateEngine: TE } = loadModules();
    if (TE) {
      // In development, we need to go up from dist/main to the project root
      // In production, templates are bundled with the app
      let templatesPath: string;
      if (app.isPackaged) {
        const resourcesTemplatesPath = path.join(process.resourcesPath, 'templates');
        const executableTemplatesPath = path.join(path.dirname(process.execPath), 'templates');
        templatesPath = fs.existsSync(resourcesTemplatesPath)
          ? resourcesTemplatesPath
          : executableTemplatesPath;
      } else {
        // Development: go up two levels from dist/main to project root
        templatesPath = path.join(__dirname, '../..', 'templates');
      }

      log.info(`[Main] Initializing template engine with path: ${templatesPath}`);
      log.info(`[Main] app.isPackaged: ${app.isPackaged}`);
      log.info(`[Main] __dirname: ${__dirname}`);
      log.info(`[Main] templates directory exists: ${fs.existsSync(templatesPath)}`);
      log.info(`[Main] registry file exists: ${fs.existsSync(path.join(templatesPath, 'registry.json'))}`);
      templateEngine = new TE(templatesPath);
    
    // Verify template engine is working
    try {
      const templates = templateEngine.getTemplates();
      const categories = templateEngine.getCategories();
      log.info(`✅ Template Engine initialized: ${templates.length} templates, ${categories.length} categories`);
      
      // Log template names for debugging
      if (templates.length > 0) {
        const templateNames = templates.map((t: any) => t.name || t.id).join(', ');
        log.info(`   Available templates: ${templateNames}`);
      }
    } catch (verifyError: any) {
      log.warn(`⚠️  Template engine initialized but verification failed: ${verifyError.message}`);
    }
    } else {
      log.error(`❌ Template engine not available: TemplateEngine module not loaded`);
      log.error(`   This will prevent project creation from templates.`);
    }
  } catch (e: any) {
    log.error(`❌ Template engine not available: ${e.message || e}`);
    log.error(`   This will prevent project creation from templates.`);
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
      log.info(`[Main] Mirror modules loaded: MM=${!!MM}, MPE=${!!MPE}, IE=${!!IE}`);
      
      if (MM && MPE && IE) {
        const dataPath = app.isPackaged
          ? path.join(path.dirname(process.execPath), 'data')
          : path.join(getAppRoot(), 'data');
        const opusExamplesPath = path.join(dataPath, 'opus-examples');

        log.info(`[Main] Initializing MirrorMemory with path: ${path.join(dataPath, 'mirror-memory.json')}`);
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
          log.info(`[MirrorMemory] Loaded ${stats.totalPatterns} patterns from disk`);
          
          // Clean up duplicate patterns on startup (if method exists)
          if (typeof mirrorMemory.deduplicatePatterns === 'function') {
            try {
              const dedupeResult = await mirrorMemory.deduplicatePatterns();
              if (dedupeResult && dedupeResult.removed > 0) {
                const newStats = mirrorMemory.getStats ? mirrorMemory.getStats() : { totalPatterns: 0 };
                log.info(`[MirrorMemory] After dedup: ${newStats.totalPatterns} patterns`);
              }
            } catch (dedupeError) {
              log.warn('[MirrorMemory] Deduplication not available (non-critical):', dedupeError);
            }
          }
        } else {
          log.warn('[MirrorMemory] Failed to load patterns:', loadResult.error);
        }
        
        log.info(`[Main] Initializing PatternExtractor with opusExamplesPath: ${opusExamplesPath}`);
        patternExtractor = new MPE(opusExamplesPath);
        
        log.info(`[Main] Initializing IntelligenceExpansion`);
        intelligenceExpansion = new IE(mirrorMemory);
        
        // Initialize knowledge ingester for pattern learning from external sources
        log.info(`[Main] Initializing MirrorKnowledgeIngester`);
        knowledgeIngester = new MirrorKnowledgeIngester(opusExamplesPath, mirrorMemory, patternExtractor);

        // Register with singleton for global access (used by agent loop)
        setMirrorMemory(mirrorMemory);

        log.info('✅ Mirror Intelligence System initialized');
        log.info(`[Main] Mirror getters: memory=${!!mirrorMemory}, extractor=${!!patternExtractor}, ingester=${!!knowledgeIngester}`);
      } else {
        log.error(`[Main] ❌ Mirror system modules failed to load!`);
        log.error(`[Main]   MirrorMemory: ${MM ? '✅' : '❌'}`);
        log.error(`[Main]   MirrorPatternExtractor: ${MPE ? '✅' : '❌'}`);
        log.error(`[Main]   IntelligenceExpansion: ${IE ? '✅' : '❌'}`);
        log.error(`[Main]   Check that scripts/mirror/ directory exists and contains the required .js files`);
      }
    } catch (e: any) {
      log.error('❌ Mirror system initialization failed:', e.message || e);
      log.error('Stack:', e.stack);
    }
  };
  
  const handlePluginHostInvoke = async (pluginId: string, method: string, payload?: any) => {
    const fullyQualifiedMethod = method.includes('.') ? method : `${pluginId}.${method}`;

    if (fullyQualifiedMethod === 'mirror-learning.recordVerifiedRun') {
      if (!featureFlags.mirror) {
        return { success: false, skipped: true, reason: 'mirror_disabled' };
      }
      if (!isMirrorReady()) {
        return { success: false, skipped: true, reason: 'mirror_not_ready' };
      }
      if (!payload?.workspacePath || !payload?.task) {
        throw new Error('mirror-learning.recordVerifiedRun requires workspacePath and task');
      }

      const learning = new SelfTestingLoop(payload.workspacePath, payload.task, false);
      await learning.recordLearningAfterSuccessfulVerification();
      return { success: true };
    }

    throw new Error(`Unknown plugin host method: ${fullyQualifiedMethod}`);
  };

  const initializePluginSystem = async () => {
    if (settings.plugins?.enabled === false) {
      log.info('[Plugins] Plugin system disabled in settings');
      return;
    }

    try {
      const sandbox = new SecurePluginSandbox();
      sandbox.on('plugin_log', ({ level, message }) => {
        log.info(`[Plugin:${level}] ${message}`);
      });
      sandbox.on('plugin_error', ({ error }) => {
        log.warn(`[Plugin] Sandbox error: ${error}`);
      });

      pluginManager = new PluginManager(sandbox, {
        getWorkspacePath: () => workspacePath,
        invokeHostMethod: handlePluginHostInvoke,
      });
      setPluginManagerSingleton(pluginManager);

      const pluginsRoot = app.isPackaged
        ? path.join(path.dirname(process.execPath), 'plugins')
        : path.join(getAppRoot(), 'plugins');

      const loadedPlugins = await pluginManager.loadPluginsFromDirectory(pluginsRoot);
      log.info(`[Plugins] Loaded ${loadedPlugins.length} plugin(s) from ${pluginsRoot}`);
    } catch (error: any) {
      log.error(`[Plugins] Failed to initialize plugin system: ${error.message}`);
    }
  };

  // Load mirror system when feature flag is enabled
  if (featureFlags.mirror) {
    setTimeout(() => {
      loadMirrorSystem();
    }, 1000);
  } else {
    log.info('[Main] Mirror system disabled (set AGENTPRIME_ENABLE_MIRROR=true to enable)');
  }

  await initializePluginSystem();

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
          workspaceSymbolIndex = new WorkspaceSymbolIndex(workspacePath);
          setWorkspaceSymbolIndexForAgents(workspaceSymbolIndex);
          workspaceSymbolIndex.ensureRebuilding();
          workspaceSymbolIndex.whenReady().catch(() => {});

          codebaseIndexer = new CodebaseIndexer(workspacePath);
          log.info(`[Main] ✅ CodebaseIndexer initialized for workspace: ${workspacePath}`);
          
          // Initialize ActivatePrime for Cursor-like AI assistance
          activatePrime = new ActivatePrimeIntegration(workspacePath);
          activatePrime.initializeContextVectorStore();
          activatePrime.initializeContextCompressionEngine();
          activatePrime.initializeContextAwarenessEngine();
          activatePrime.initializeEnhancedModelRouter();
          log.info(`[Main] ✅ ActivatePrime initialized for workspace: ${workspacePath}`);
          
          // Start background indexing after a short delay to not block startup
          setTimeout(() => {
            if (codebaseIndexer && workspacePath) {
              log.info(`[Main] 🚀 Starting background codebase indexing...`);
              codebaseIndexer.indexCodebase().then(() => {
                log.info(`[Main] ✅ Background indexing completed`);
                // Notify renderer that indexing is complete
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('codebase:indexing-complete');
                }
              }).catch((error: any) => {
                log.error(`[Main] ❌ Background indexing failed: ${error.message}`);
              });
            }
          }, 2000); // Wait 2 seconds after startup before indexing
        } catch (error: any) {
          log.error(`[Main] ❌ Failed to initialize CodebaseIndexer: ${error.message}`);
        }
      } else {
        workspaceSymbolIndex = null;
        setWorkspaceSymbolIndexForAgents(null);
        codebaseIndexer = null;
        activatePrime = null;
      }
    },
    getFocusedFolder: () => focusedFolderPath,
    setFocusedFolder: (path: string | null) => { focusedFolderPath = path; },
    templateEngine,
    getMirrorMemory: () => mirrorMemory,
    getPatternExtractor: () => patternExtractor,
    getIntelligenceExpansion: () => intelligenceExpansion,
    getCodebaseIndexer: () => codebaseIndexer,
    getSymbolIndex: () => workspaceSymbolIndex,
    getKnowledgeIngester: () => knowledgeIngester,
    getActivatePrime: () => activatePrime,
    getActiveFilePath: () => activeFilePath,
    setActiveFilePath: (filePath: string | null) => { activeFilePath = filePath; },
    // Settings access for telemetry handlers
    getSettings: () => settings,
    updateSettings: (newSettings: Partial<Settings>) => {
      settings = { ...settings, ...newSettings };
      saveSettings();
    },
    getPluginManager: () => pluginManager,
  });
  
  // Register chat handler
  registerChat({
    ipcMain,
    getWorkspacePath: () => workspacePath,
    getCurrentFile: () => activeFilePath,
    getCurrentFolder: () => focusedFolderPath,
    getConversationHistory: (mode: ConversationMode = 'agent') => conversationHistory[mode] || [],
    addToConversationHistory: (mode: ConversationMode, role: 'user' | 'assistant', content: string) => {
      const history = conversationHistory[mode] || [];
      history.push({ role, content });
      // Keep last 20 messages
      if (history.length > 20) {
        conversationHistory[mode] = history.slice(-20);
      } else {
        conversationHistory[mode] = history;
      }
    },
    getSettings: () => settings
  });
  
  createWindow();
  
  // Initialize auto-updater (only in production)
  initializeAutoUpdater(mainWindow);
  
  // Lean profile: non-core background services remain opt-in and are not auto-started.
});
}

app.on('before-quit', async () => {
  // Shutdown telemetry (flushes pending events)
  try {
    const telemetryService = getTelemetryService();
    await telemetryService.shutdown();
  } catch (e) {
    log.warn('[Main] Error shutting down telemetry:', e);
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
  return sanitizeSettingsForRenderer(settings);
});

ipcMain.handle('startup-preflight:get-report', () => {
  if (!startupPreflightReport) {
    return refreshStartupPreflightReport(false);
  }
  return startupPreflightReport;
});

ipcMain.handle('system:get-status-summary', async () => {
  try {
    const status = await buildSystemStatusSummary();
    return { success: true, status };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to load system status summary.' };
  }
});

ipcMain.handle('system:get-doctor-report', async () => {
  try {
    const report = await buildSystemDoctorReport();
    return { success: true, report };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to run system diagnostics.' };
  }
});

ipcMain.handle(
  'set-title-bar-overlay',
  (_event, options: { color: string; symbolColor: string; height?: number }) => {
    if (!mainWindow || process.platform === 'darwin') return;
    try {
      const overlay = {
        color: options.color,
        symbolColor: options.symbolColor,
        height: options.height ?? 32
      };
      mainWindow.setTitleBarOverlay(overlay);
      mainWindow.setBackgroundColor(overlay.color);
    } catch (e) {
      log.warn('[Main] set-title-bar-overlay failed:', e);
    }
  }
);

ipcMain.handle('credentials:get-provider-api-key-statuses', async () => {
  return getProviderApiKeyStatuses();
});

ipcMain.handle('credentials:set-provider-api-key', async (_event, providerName: string, apiKey: string) => {
  if (!isSupportedProviderApiKey(providerName)) {
    throw new Error(`Unsupported provider: ${providerName}`);
  }

  await setProviderApiKeyValue(providerName, apiKey);
  saveSettings();
  initializeAIProviders();
  refreshStartupPreflightReport(false);
  return getProviderApiKeyStatus(providerName);
});

ipcMain.handle('credentials:clear-provider-api-key', async (_event, providerName: string) => {
  if (!isSupportedProviderApiKey(providerName)) {
    throw new Error(`Unsupported provider: ${providerName}`);
  }

  await setProviderApiKeyValue(providerName, null);
  saveSettings();
  initializeAIProviders();
  refreshStartupPreflightReport(false);
  return getProviderApiKeyStatus(providerName);
});

ipcMain.handle('update-settings', async (event, newSettings: Partial<Settings>) => {
  const providerApiKeyUpdates = extractProviderApiKeyUpdates(newSettings.providers as Record<string, any> | undefined);
  await Promise.all(
    Object.entries(providerApiKeyUpdates).map(([providerName, apiKey]) =>
      setProviderApiKeyValue(providerName as SupportedProviderApiKey, apiKey)
    )
  );

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
    const mergedProviders = {
      ...settings.providers
    } as Record<string, any>;

    for (const [providerName, providerConfig] of Object.entries(newSettings.providers)) {
      mergedProviders[providerName] = {
        ...(mergedProviders[providerName] || {}),
        ...(providerConfig || {})
      };
    }

    newSettings.providers = mergedProviders as Settings['providers'];
  }

  if (newSettings.ollamaCloudOutputLimits || settings.ollamaCloudOutputLimits) {
    newSettings.ollamaCloudOutputLimits = normalizeOllamaCloudOutputLimits({
      ...(settings.ollamaCloudOutputLimits || DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS),
      ...(newSettings.ollamaCloudOutputLimits || {})
    });
  }

  if (newSettings.agentAutonomyLevel !== undefined) {
    newSettings.agentAutonomyLevel = clampAgentAutonomyLevel(newSettings.agentAutonomyLevel);
  }
  
  settings = { ...settings, ...newSettings };
  saveSettings();

  if (mainWindow && (newSettings.themeId !== undefined || newSettings.theme !== undefined)) {
    mainWindow.webContents.send('theme-changed', resolveThemeIdFromSettings());
    syncMainWindowTitleBar();
  }

  // Reinitialize AI providers when provider settings OR dual model settings change
  if (newSettings.activeProvider || newSettings.activeModel || newSettings.providers ||
      newSettings.dualModelEnabled !== undefined || newSettings.dualModelConfig || newSettings.ollamaCloudOutputLimits) {
    initializeAIProviders();
    log.info('[Settings] AI providers reinitialized due to settings change');
  }

  // Keep startup diagnostics in sync with current settings.
  refreshStartupPreflightReport(false);

  return sanitizeSettingsForRenderer(settings);
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
    log.error('[IPC] get-providers error:', error);
    return [];
  }
});

ipcMain.handle('get-provider-models', async (event, providerName: string) => {
  try {
    const models = await aiRouter.getProviderModels(providerName);
    return models;
  } catch (error: any) {
    log.error('[IPC] get-provider-models error:', error);
    throw new Error(error?.message || 'Failed to load provider models');
  }
});

ipcMain.handle('test-provider', async (event, providerName: string) => {
  try {
    const result = await aiRouter.testProvider(providerName);
    return result;
  } catch (error: any) {
    log.error('[IPC] test-provider error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-active-provider', async (event, providerName: string, model: string) => {
  try {
    settings.activeProvider = providerName;
    settings.activeModel = model;
    saveSettings();
    initializeAIProviders();
    refreshStartupPreflightReport(false);
    return { success: true };
  } catch (error: any) {
    log.error('[IPC] set-active-provider error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('configure-provider', async (event, providerName: string, config: any) => {
  try {
    const hasApiKey = config && typeof config === 'object' && Object.prototype.hasOwnProperty.call(config, 'apiKey');
    const apiKey = hasApiKey ? config.apiKey : undefined;
    if (hasApiKey) {
      delete config.apiKey;
    }

    if (!settings.providers) {
      settings.providers = {} as any;
    }
    const providerSettings = settings.providers as Record<string, any>;
    providerSettings[providerName] = {
      ...providerSettings[providerName],
      ...config
    };

    if (hasApiKey && isSupportedProviderApiKey(providerName)) {
      await setProviderApiKeyValue(providerName, apiKey);
    }

    saveSettings();
    initializeAIProviders();
    refreshStartupPreflightReport(false);
    return { success: true };
  } catch (error: any) {
    log.error('[IPC] configure-provider error:', error);
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
    log.error('[IPC] open-external error:', error);
    return { success: false, error: error.message };
  }
});

/** Resolve bundled HTML user guide (dev + packaged). */
function getUserGuideHtmlPath(): string | null {
  const fileName = 'user-guide.html';
  const candidates: string[] = [];
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'docs', fileName));
    candidates.push(path.join(process.resourcesPath, fileName));
  }
  candidates.push(path.join(process.cwd(), 'docs', fileName));
  candidates.push(path.join(__dirname, '../../docs', fileName));
  for (const p of candidates) {
    const n = path.normalize(p);
    if (fs.existsSync(n)) {
      return n;
    }
  }
  return null;
}

ipcMain.handle('open-user-guide', async () => {
  try {
    const { shell } = require('electron');
    const guidePath = getUserGuideHtmlPath();
    if (!guidePath) {
      log.warn('[IPC] open-user-guide: user-guide.html not found');
      return { success: false, error: 'User guide file not found' };
    }
    const err = await shell.openPath(guidePath);
    if (err) {
      log.error('[IPC] open-user-guide shell.openPath:', err);
      return { success: false, error: err };
    }
    return { success: true, path: guidePath };
  } catch (error: any) {
    log.error('[IPC] open-user-guide error:', error);
    return { success: false, error: error.message };
  }
});

// Inference Server Status Handler (for VibeHub shared AI)
ipcMain.handle('inference:status', () => {
  try {
    const server = getInferenceServer();
    const stats = server.getStats();
    const { running: _running, ...restStats } = stats as Record<string, any>;
    return {
      running: server.isRunning(),
      ...restStats,
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
    const runtime = resolveEffectiveAIRuntime(settings, settings.activeModel, settings.activeProvider);
    const providerStatus = await aiRouter.testProvider(runtime.effectiveProvider).catch((error: any) => ({
      success: false,
      error: error?.message || String(error)
    }));
    return {
      success: true,
      provider: runtime.displayProvider,
      model: runtime.displayModel,
      connected: providerStatus?.success || false,
      dualModelEnabled: !!settings.dualModelEnabled,
      runtime
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Clear Conversation History
ipcMain.handle('clear-history', async (_event, mode?: ConversationMode) => {
  try {
    if (mode && conversationHistory[mode]) {
      conversationHistory[mode] = [];
    } else {
      conversationHistory = {
        agent: [],
        chat: [],
        dino: [],
      };
    }
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

log.info('🚀 AgentPrime Electron app starting...');
