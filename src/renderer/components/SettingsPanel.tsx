/**
 * SettingsPanel - Lean core settings UI
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  IconSettings,
  IconKeyboard,
  IconPalette,
  IconBot,
  IconCode,
  IconSave,
  IconX,
  IconRefresh,
  IconChevronRight
} from './Icons';
import ThemeSelector from './ThemeSelector';
import KeyboardShortcuts from './KeyboardShortcuts';
import {
  PROVIDER_OPTIONS,
  getModelLabel,
  getModelOptionsForProvider,
  getProviderLabel
} from './AIChat/constants';
import {
  DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS,
  OLLAMA_CLOUD_MAX_TOKENS_CAP
} from '../../main/core/model-output-limits';
import { ThemeId } from '../themes';
import type { Settings } from '../../types';
import type { ProviderApiKeyStatus } from '../../types/ipc';
import type { StartupPreflightReport } from '../../types/system-health';

type SettingsTab = 'general' | 'editor' | 'appearance' | 'ai' | 'shortcuts' | 'advanced';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSettingsChange: (settings: Partial<Settings>) => void;
  currentTheme: ThemeId;
  onThemeChange: (themeId: ThemeId) => void;
}

const DEFAULT_DUAL_MODEL_CONFIG: Settings['dualModelConfig'] = {
  fastModel: {
    provider: 'ollama',
    model: 'devstral-small-2:24b-cloud',
    enabled: true
  },
  deepModel: {
    provider: 'ollama',
    model: 'qwen3-coder-next:cloud',
    enabled: true
  },
  autoRoute: true,
  complexityThreshold: 6,
  deepModelTriggers: ['analyze', 'debug', 'refactor', 'explain'],
  fastModelTriggers: ['quick', 'simple', 'format', 'rename']
};

const AUTONOMY_LABELS: Record<number, { label: string; description: string }> = {
  1: {
    label: 'Guided',
    description: 'Small, review-first edits. Commands are disabled.',
  },
  2: {
    label: 'Cautious',
    description: 'Constrained edits with a small command budget.',
  },
  3: {
    label: 'Balanced',
    description: 'Default autonomy for normal multi-file implementation work.',
  },
  4: {
    label: 'Extended',
    description: 'Broader execution with higher tool and command budgets.',
  },
  5: {
    label: 'Hands-off',
    description: 'Maximum autonomy for end-to-end feature loops.',
  },
};

const PROVIDER_CREDENTIAL_COPY: Record<string, string> = {
  openai: 'Paste a direct OpenAI API key for GPT models.',
  anthropic: 'Paste a direct Anthropic API key for Claude models.',
  ollama: 'Only needed for Ollama Cloud or authenticated hosted Ollama endpoints.',
  openrouter: 'Paste your OpenRouter key for multi-provider routing.',
};

function clampAgentAutonomyLevel(value: unknown): 1 | 2 | 3 | 4 | 5 {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 3;
  }
  const rounded = Math.round(value);
  if (rounded <= 1) return 1;
  if (rounded >= 5) return 5;
  return rounded as 1 | 2 | 3 | 4 | 5;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  currentTheme,
  onThemeChange
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [localSettings, setLocalSettings] = useState<Settings>(settings);
  const [hasChanges, setHasChanges] = useState(false);
  const [startupDiagnostics, setStartupDiagnostics] = useState<StartupPreflightReport | null>(null);
  const [startupDiagnosticsLoading, setStartupDiagnosticsLoading] = useState(false);
  const [startupDiagnosticsError, setStartupDiagnosticsError] = useState<string | null>(null);
  const [providerApiKeyStatuses, setProviderApiKeyStatuses] = useState<Record<string, ProviderApiKeyStatus>>({});
  const [providerApiKeyDrafts, setProviderApiKeyDrafts] = useState<Record<string, string>>({});
  const [providerApiKeyVisibility, setProviderApiKeyVisibility] = useState<Record<string, boolean>>({});
  const [providerApiKeyPending, setProviderApiKeyPending] = useState<Record<string, 'saving' | 'clearing' | undefined>>({});
  const [providerApiKeyMessages, setProviderApiKeyMessages] = useState<
    Record<string, { type: 'success' | 'error' | 'info'; text: string } | undefined>
  >({});

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  const getDualModelConfig = useCallback((): Settings['dualModelConfig'] => {
    return localSettings.dualModelConfig || DEFAULT_DUAL_MODEL_CONFIG;
  }, [localSettings.dualModelConfig]);

  const getOllamaCloudLimits = useCallback((): NonNullable<Settings['ollamaCloudOutputLimits']> => {
    return localSettings.ollamaCloudOutputLimits || DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS;
  }, [localSettings.ollamaCloudOutputLimits]);

  const saveSettings = useCallback(() => {
    onSettingsChange(localSettings);
    setHasChanges(false);
    window.dispatchEvent(new CustomEvent('agentprime-settings-changed', {
      detail: localSettings
    }));
  }, [localSettings, onSettingsChange]);

  useEffect(() => {
    const handleExternalSettingsChange = (event: CustomEvent<Settings>) => {
      if (event.detail) {
        setLocalSettings(event.detail);
      }
    };

    window.addEventListener('agentprime-settings-changed', handleExternalSettingsChange as EventListener);
    return () => {
      window.removeEventListener('agentprime-settings-changed', handleExternalSettingsChange as EventListener);
    };
  }, []);

  const discardChanges = useCallback(() => {
    setLocalSettings(settings);
    setHasChanges(false);
  }, [settings]);

  const loadStartupDiagnostics = useCallback(async () => {
    setStartupDiagnosticsLoading(true);
    setStartupDiagnosticsError(null);
    try {
      const report = await window.agentAPI.getStartupPreflightReport();
      setStartupDiagnostics(report);
    } catch (error: any) {
      setStartupDiagnosticsError(error?.message || 'Failed to load startup diagnostics.');
    } finally {
      setStartupDiagnosticsLoading(false);
    }
  }, []);

  const loadProviderApiKeyStatuses = useCallback(async () => {
    try {
      const statuses = await window.agentAPI.getProviderApiKeyStatuses();
      setProviderApiKeyStatuses(statuses || {});
    } catch (error) {
      console.error('Failed to load provider API key statuses:', error);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'advanced') {
      void loadStartupDiagnostics();
    }
  }, [activeTab, isOpen, loadStartupDiagnostics]);

  useEffect(() => {
    if (isOpen && activeTab === 'ai') {
      void loadProviderApiKeyStatuses();
    }
  }, [activeTab, isOpen, loadProviderApiKeyStatuses]);

  const resetAllSettings = useCallback(() => {
    const defaults: Partial<Settings> = {
      fontSize: 14,
      tabSize: 2,
      wordWrap: 'on',
      minimap: true,
      lineNumbers: 'on',
      autoSave: true,
      inlineCompletions: true,
      dinoBuddyMode: false,
      useSpecializedAgents: false,
      activeProvider: 'ollama',
      activeModel: 'qwen3-coder:480b-cloud',
      dualOllamaEnabled: false,
      agentAutonomyLevel: 3,
      pythonBrainEnabled: false,
      dualModelEnabled: true,
      dualModelConfig: DEFAULT_DUAL_MODEL_CONFIG,
      ollamaCloudOutputLimits: DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS,
      telemetryEnabled: false,
      developerMode: false,
      confirmOnClose: true,
      autoLockMinutes: 0,
      agentMonolithicApplyImmediately: false
    };
    setLocalSettings((prev) => ({ ...prev, ...defaults }));
    setHasChanges(true);
  }, []);

  const getDefaultModelForProvider = useCallback((provider: string, fallback: string) => {
    if (provider === 'ollama') {
      return 'qwen3-coder:480b-cloud';
    }
    return getModelOptionsForProvider(provider)[0]?.value || fallback;
  }, []);

  const handleActiveProviderChange = useCallback((provider: string) => {
    const options = getModelOptionsForProvider(provider);
    const nextModel = options.some((option) => option.value === localSettings.activeModel)
      ? localSettings.activeModel
      : getDefaultModelForProvider(provider, localSettings.activeModel);

    setLocalSettings((prev) => ({
      ...prev,
      activeProvider: provider,
      activeModel: nextModel
    }));
    setHasChanges(true);
  }, [getDefaultModelForProvider, localSettings.activeModel]);

  const handleActiveModelChange = useCallback((model: string) => {
    updateSetting('activeModel', model);
  }, [updateSetting]);

  const handleDualModelProviderChange = useCallback((key: 'fastModel' | 'deepModel', provider: string) => {
    const config = getDualModelConfig();
    const currentModel = config[key].model;
    const options = getModelOptionsForProvider(provider);
    const nextModel = options.some((option) => option.value === currentModel)
      ? currentModel
      : getDefaultModelForProvider(provider, currentModel);

    updateSetting('dualModelConfig', {
      ...config,
      [key]: {
        ...config[key],
        provider,
        model: nextModel
      }
    });
  }, [getDefaultModelForProvider, getDualModelConfig, updateSetting]);

  const handleDualModelChange = useCallback((key: 'fastModel' | 'deepModel', model: string) => {
    const config = getDualModelConfig();
    updateSetting('dualModelConfig', {
      ...config,
      [key]: {
        ...config[key],
        model
      }
    });
  }, [getDualModelConfig, updateSetting]);

  const handleOllamaCloudLimitChange = useCallback((
    key: keyof NonNullable<Settings['ollamaCloudOutputLimits']>,
    value: number
  ) => {
    const safeValue = Math.max(4096, Math.min(OLLAMA_CLOUD_MAX_TOKENS_CAP, Math.round((Number.isFinite(value) ? value : 4096) / 1024) * 1024));
    updateSetting('ollamaCloudOutputLimits', {
      ...getOllamaCloudLimits(),
      [key]: safeValue
    });
  }, [getOllamaCloudLimits, updateSetting]);

  const updateProviderApiKeyDraft = useCallback((provider: string, value: string) => {
    setProviderApiKeyDrafts((prev) => ({ ...prev, [provider]: value }));
    setProviderApiKeyMessages((prev) => ({ ...prev, [provider]: undefined }));
  }, []);

  const toggleProviderApiKeyVisibility = useCallback((provider: string) => {
    setProviderApiKeyVisibility((prev) => ({ ...prev, [provider]: !prev[provider] }));
  }, []);

  const describeProviderApiKeyStatus = useCallback((status?: ProviderApiKeyStatus) => {
    if (!status) {
      return 'Checking secure storage status...';
    }
    if (status.activeSource === 'secure-storage') {
      return `Stored in ${status.storageBackend === 'keychain' ? 'your OS keychain' : 'encrypted local storage'}.`;
    }
    if (status.activeSource === 'environment') {
      return `Using ${status.environmentVariable || 'an environment variable'} right now. Saving here will override it.`;
    }
    return 'No API key stored yet.';
  }, []);

  const getProviderApiKeyPlaceholder = useCallback((status?: ProviderApiKeyStatus) => {
    if (status?.activeSource === 'secure-storage') {
      return 'Paste a new key to replace the stored one';
    }
    if (status?.activeSource === 'environment') {
      return 'Paste a key to override the environment value';
    }
    return 'Paste API key';
  }, []);

  const handleSaveProviderApiKey = useCallback(async (provider: string) => {
    const apiKey = providerApiKeyDrafts[provider]?.trim();
    if (!apiKey) {
      setProviderApiKeyMessages((prev) => ({
        ...prev,
        [provider]: { type: 'error', text: 'Paste an API key before saving.' }
      }));
      return;
    }

    setProviderApiKeyPending((prev) => ({ ...prev, [provider]: 'saving' }));
    setProviderApiKeyMessages((prev) => ({ ...prev, [provider]: undefined }));

    try {
      const status = await window.agentAPI.setProviderApiKey(provider, apiKey);
      setProviderApiKeyStatuses((prev) => ({ ...prev, [provider]: status }));
      setProviderApiKeyDrafts((prev) => ({ ...prev, [provider]: '' }));
      setProviderApiKeyMessages((prev) => ({
        ...prev,
        [provider]: {
          type: 'success',
          text: `Saved to ${status.storageBackend === 'keychain' ? 'your OS keychain' : 'encrypted local storage'}.`
        }
      }));
    } catch (error: any) {
      setProviderApiKeyMessages((prev) => ({
        ...prev,
        [provider]: { type: 'error', text: error?.message || 'Failed to save API key.' }
      }));
    } finally {
      setProviderApiKeyPending((prev) => ({ ...prev, [provider]: undefined }));
    }
  }, [providerApiKeyDrafts]);

  const handleClearProviderApiKey = useCallback(async (provider: string) => {
    setProviderApiKeyPending((prev) => ({ ...prev, [provider]: 'clearing' }));
    setProviderApiKeyMessages((prev) => ({ ...prev, [provider]: undefined }));

    try {
      const status = await window.agentAPI.clearProviderApiKey(provider);
      setProviderApiKeyStatuses((prev) => ({ ...prev, [provider]: status }));
      setProviderApiKeyDrafts((prev) => ({ ...prev, [provider]: '' }));
      setProviderApiKeyMessages((prev) => ({
        ...prev,
        [provider]: {
          type: 'info',
          text: status.activeSource === 'environment'
            ? `Stored key removed. Falling back to ${status.environmentVariable || 'the environment value'}.`
            : 'Stored key removed.'
        }
      }));
    } catch (error: any) {
      setProviderApiKeyMessages((prev) => ({
        ...prev,
        [provider]: { type: 'error', text: error?.message || 'Failed to clear API key.' }
      }));
    } finally {
      setProviderApiKeyPending((prev) => ({ ...prev, [provider]: undefined }));
    }
  }, []);

  const renderModelSelectorControls = (
    provider: string,
    model: string,
    onProviderChange: (provider: string) => void,
    onModelChange: (model: string) => void
  ) => {
    const providerMeta = PROVIDER_OPTIONS.find((option) => option.value === provider);
    const modelOptions = getModelOptionsForProvider(provider);

    return (
      <div className="setting-model-stack">
        <div className="setting-model-row">
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value)}
            className="setting-select setting-select--wide"
          >
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="setting-select setting-select--wide"
          >
            {modelOptions.map((option) => (
              <option key={`${provider}:${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-model-meta">
          <span className="setting-model-badge">{getProviderLabel(provider)}</span>
          <span>{providerMeta?.description || 'Curated model list'}</span>
          <span className="setting-model-current">{getModelLabel(provider, model)}</span>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <IconSettings size="sm" /> },
    { id: 'editor', label: 'Editor', icon: <IconCode size="sm" /> },
    { id: 'appearance', label: 'Appearance', icon: <IconPalette size="sm" /> },
    { id: 'ai', label: 'AI Assistant', icon: <IconBot size="sm" /> },
    { id: 'shortcuts', label: 'Shortcuts', icon: <IconKeyboard size="sm" /> },
    { id: 'advanced', label: 'Advanced', icon: <IconChevronRight size="sm" /> }
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="settings-close-fab"
          onClick={onClose}
          aria-label="Close settings"
        >
          <IconX size="md" />
        </button>
        <div className="settings-header">
          <h2><IconSettings size="md" /> Settings</h2>
          <div className="settings-header-actions">
            {hasChanges && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={discardChanges}>
                  Discard
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={saveSettings}>
                  <IconSave size="sm" /> Save
                </button>
              </>
            )}
          </div>
        </div>

        <div className="settings-body">
          <div className="settings-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className={`settings-content${activeTab === 'shortcuts' ? ' settings-content--shortcuts' : ''}`}>
            {activeTab === 'general' && (
              <div className="settings-section">
                <h3>General Settings</h3>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Auto Save</span>
                    <span className="setting-description">Automatically save files after editing</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.autoSave}
                    onChange={(e) => updateSetting('autoSave', e.target.checked)}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Confirm on Close</span>
                    <span className="setting-description">Show a confirmation prompt before closing the app</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.confirmOnClose ?? true}
                    onChange={(e) => updateSetting('confirmOnClose', e.target.checked)}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Dino Buddy Mode</span>
                    <span className="setting-description">Warm, calm Dino companion in chat (AgentPrime voice — softer than ActivatePrime&apos;s high-energy mode)</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.dinoBuddyMode}
                    onChange={(e) => updateSetting('dinoBuddyMode', e.target.checked)}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Specialized Agents</span>
                    <span className="setting-description">Route complex tasks through specialized agent workflows</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.useSpecializedAgents || false}
                    onChange={(e) => updateSetting('useSpecializedAgents', e.target.checked)}
                    className="setting-checkbox"
                  />
                </div>
              </div>
            )}

            {activeTab === 'editor' && (
              <div className="settings-section">
                <h3>Editor Settings</h3>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Font Size</span>
                    <span className="setting-description">Editor font size in pixels</span>
                  </label>
                  <div className="setting-input-group">
                    <input
                      type="range"
                      min="10"
                      max="24"
                      value={localSettings.fontSize}
                      onChange={(e) => updateSetting('fontSize', parseInt(e.target.value, 10))}
                      className="setting-range"
                    />
                    <span className="setting-value">{localSettings.fontSize}px</span>
                  </div>
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Inline Completions</span>
                    <span className="setting-description">Show AI-powered code suggestions while typing</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.inlineCompletions}
                    onChange={(e) => updateSetting('inlineCompletions', e.target.checked)}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Tab Size</span>
                    <span className="setting-description">Number of spaces per indentation level</span>
                  </label>
                  <select
                    value={localSettings.tabSize ?? 2}
                    onChange={(e) => updateSetting('tabSize', parseInt(e.target.value, 10) as 2 | 4 | 8)}
                    className="setting-select"
                  >
                    <option value="2">2 spaces</option>
                    <option value="4">4 spaces</option>
                    <option value="8">8 spaces</option>
                  </select>
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Word Wrap</span>
                    <span className="setting-description">Wrap long lines in the editor view</span>
                  </label>
                  <select
                    value={localSettings.wordWrap ?? 'on'}
                    onChange={(e) => updateSetting('wordWrap', e.target.value as 'on' | 'off' | 'wordWrapColumn')}
                    className="setting-select"
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                    <option value="wordWrapColumn">At Column</option>
                  </select>
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Minimap</span>
                    <span className="setting-description">Show code minimap on the right side</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.minimap ?? true}
                    onChange={(e) => updateSetting('minimap', e.target.checked)}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Line Numbers</span>
                    <span className="setting-description">Display line numbers in the gutter</span>
                  </label>
                  <select
                    value={localSettings.lineNumbers ?? 'on'}
                    onChange={(e) => updateSetting('lineNumbers', e.target.value as 'on' | 'off' | 'relative')}
                    className="setting-select"
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                    <option value="relative">Relative</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="settings-section">
                <h3>Appearance</h3>

                <div className="setting-group full-width">
                  <label className="setting-label">
                    <span className="setting-name">Theme</span>
                    <span className="setting-description">Choose your preferred color theme</span>
                  </label>
                  <ThemeSelector
                    currentTheme={currentTheme}
                    onThemeChange={onThemeChange}
                  />
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="settings-section">
                <h3>AI Assistant</h3>

                <div className="setting-group full-width">
                  <label className="setting-label">
                    <span className="setting-name">Active Model</span>
                    <span className="setting-description">Choose a provider first, then pick from a cleaner curated model list</span>
                  </label>
                  {renderModelSelectorControls(
                    localSettings.activeProvider,
                    localSettings.activeModel,
                    handleActiveProviderChange,
                    handleActiveModelChange
                  )}
                </div>

                <div className="setting-subsection">
                  <h4>Provider Credentials</h4>
                  <p className="setting-subsection-copy">
                    Paste provider API keys here. AgentPrime keeps them out of `settings.json` and stores them in your OS keychain when available, otherwise in encrypted local storage.
                  </p>

                  {PROVIDER_OPTIONS.map((option) => {
                    const status = providerApiKeyStatuses[option.value];
                    const message = providerApiKeyMessages[option.value];
                    const pendingState = providerApiKeyPending[option.value];
                    const draftValue = providerApiKeyDrafts[option.value] || '';
                    const isVisible = providerApiKeyVisibility[option.value] === true;
                    const statusLabel = status?.activeSource === 'secure-storage'
                      ? 'Stored'
                      : status?.activeSource === 'environment'
                        ? 'Environment'
                        : 'Missing';

                    return (
                      <div className="provider-credential-card" key={option.value}>
                        <div className="provider-credential-head">
                          <div className="provider-credential-title-row">
                            <span className="setting-model-badge">{option.label}</span>
                            <span className={`provider-credential-pill provider-credential-pill--${status?.activeSource || 'none'}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="provider-credential-copy">
                            {PROVIDER_CREDENTIAL_COPY[option.value] || option.description}
                          </div>
                          <div className="provider-credential-meta">
                            {describeProviderApiKeyStatus(status)}
                          </div>
                        </div>

                        <div className="provider-credential-controls">
                          <input
                            type={isVisible ? 'text' : 'password'}
                            value={draftValue}
                            onChange={(e) => updateProviderApiKeyDraft(option.value, e.target.value)}
                            className="setting-text-input provider-credential-input"
                            placeholder={getProviderApiKeyPlaceholder(status)}
                            autoComplete="off"
                            spellCheck={false}
                          />

                          <div className="provider-credential-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleProviderApiKeyVisibility(option.value)}
                            >
                              {isVisible ? 'Hide' : 'Show'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => void handleClearProviderApiKey(option.value)}
                              disabled={!status?.hasStoredKey || Boolean(pendingState)}
                            >
                              {pendingState === 'clearing' ? 'Clearing...' : 'Clear'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => void handleSaveProviderApiKey(option.value)}
                              disabled={!draftValue.trim() || Boolean(pendingState)}
                            >
                              {pendingState === 'saving' ? 'Saving...' : status?.hasStoredKey ? 'Update Key' : 'Save Key'}
                            </button>
                          </div>
                        </div>

                        {message && (
                          <div className={`provider-credential-message provider-credential-message--${message.type}`}>
                            {message.text}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Agent Autonomy</span>
                    <span className="setting-description">
                      Choose how hands-off Agent Mode should be across multi-file edits and command execution
                    </span>
                  </label>
                  <div className="setting-input-group setting-input-group--wide" style={{ alignItems: 'center' }}>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={clampAgentAutonomyLevel(localSettings.agentAutonomyLevel)}
                      onChange={(e) => updateSetting('agentAutonomyLevel', clampAgentAutonomyLevel(parseInt(e.target.value, 10)))}
                      className="setting-range"
                    />
                    <span className="setting-value">{clampAgentAutonomyLevel(localSettings.agentAutonomyLevel)}</span>
                    <span className="setting-model-badge">
                      {AUTONOMY_LABELS[clampAgentAutonomyLevel(localSettings.agentAutonomyLevel)].label}
                    </span>
                  </div>
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Autonomy Profile</span>
                    <span className="setting-description">
                      {AUTONOMY_LABELS[clampAgentAutonomyLevel(localSettings.agentAutonomyLevel)].description}
                    </span>
                  </label>
                  <div className="setting-model-meta" style={{ justifyContent: 'flex-end' }}>
                    <span className="setting-model-current">
                      Level {clampAgentAutonomyLevel(localSettings.agentAutonomyLevel)} - {AUTONOMY_LABELS[clampAgentAutonomyLevel(localSettings.agentAutonomyLevel)].label}
                    </span>
                  </div>
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Apply monolithic agent writes immediately</span>
                    <span className="setting-description">
                      When Specialized Agents is off, keep this off to stage edits in the review panel until you apply them.
                      Turn on to write files to the workspace as soon as the agent finishes (no review checkpoint).
                    </span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.agentMonolithicApplyImmediately === true}
                    onChange={(e) => updateSetting('agentMonolithicApplyImmediately', e.target.checked)}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Dual Model Mode</span>
                    <span className="setting-description">Use separate fast and deep models with auto-routing</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.dualModelEnabled}
                    onChange={(e) => updateSetting('dualModelEnabled', e.target.checked)}
                    className="setting-checkbox"
                  />
                </div>

                {localSettings.dualModelEnabled && (
                  <div className="setting-subsection">
                    <h4>Dual Model Configuration</h4>

                    <div className="setting-group">
                      <label className="setting-label">
                        <span className="setting-name">Fast Model</span>
                        <span className="setting-description">Used for quick edits and lightweight requests</span>
                      </label>
                      {renderModelSelectorControls(
                        getDualModelConfig().fastModel.provider,
                        getDualModelConfig().fastModel.model,
                        (provider) => handleDualModelProviderChange('fastModel', provider),
                        (model) => handleDualModelChange('fastModel', model)
                      )}
                    </div>

                    <div className="setting-group">
                      <label className="setting-label">
                        <span className="setting-name">Deep Model</span>
                        <span className="setting-description">Used for complex reasoning and larger tasks</span>
                      </label>
                      {renderModelSelectorControls(
                        getDualModelConfig().deepModel.provider,
                        getDualModelConfig().deepModel.model,
                        (provider) => handleDualModelProviderChange('deepModel', provider),
                        (model) => handleDualModelChange('deepModel', model)
                      )}
                    </div>

                    <div className="setting-group">
                      <label className="setting-label">
                        <span className="setting-name">Auto Route</span>
                        <span className="setting-description">Automatically pick fast vs deep model based on task complexity</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={getDualModelConfig().autoRoute}
                        onChange={(e) => {
                          updateSetting('dualModelConfig', {
                            ...getDualModelConfig(),
                            autoRoute: e.target.checked
                          });
                        }}
                        className="setting-checkbox"
                      />
                    </div>
                  </div>
                )}

                <div className="setting-subsection">
                  <h4>Ollama Cloud Output Budgets</h4>
                  <p className="setting-subsection-copy">
                    Tune how much output AgentPrime requests from Ollama Cloud for each workflow. Higher budgets help bigger generations complete, but they also increase latency and can hit provider-side ceilings.
                  </p>

                  {[
                    ['chatMaxTokens', 'Standard Chat', 'Normal coding chat and interactive responses'],
                    ['justChatMaxTokens', 'Just Chat', 'Non-agent conversation mode'],
                    ['wordsToCodeMaxTokens', 'Words to Code', 'Project generation and larger app builds'],
                    ['agentMaxTokens', 'Agent Loop', 'Monolithic agent planning and execution'],
                    ['specialistMaxTokens', 'Specialists', 'Specialized coding agents like JS and Python'],
                    ['analysisMaxTokens', 'Analysis', 'Review-heavy and integration passes'],
                    ['pipelineMaxTokens', 'Pipeline', 'Build, packaging, and deployment workflows'],
                    ['providerDefaultMaxTokens', 'Provider Default', 'Fallback when a caller does not specify a budget']
                  ].map(([key, label, description]) => (
                    <div className="setting-group" key={key}>
                      <label className="setting-label">
                        <span className="setting-name">{label}</span>
                        <span className="setting-description">{description}</span>
                      </label>
                      <div className="setting-input-group setting-input-group--wide">
                        <input
                          type="range"
                          min="4096"
                          max={String(OLLAMA_CLOUD_MAX_TOKENS_CAP)}
                          step="1024"
                          value={getOllamaCloudLimits()[key as keyof NonNullable<Settings['ollamaCloudOutputLimits']>]}
                          onChange={(e) => handleOllamaCloudLimitChange(
                            key as keyof NonNullable<Settings['ollamaCloudOutputLimits']>,
                            parseInt(e.target.value, 10)
                          )}
                          className="setting-range"
                        />
                        <input
                          type="number"
                          min="4096"
                          max={String(OLLAMA_CLOUD_MAX_TOKENS_CAP)}
                          step="1024"
                          value={getOllamaCloudLimits()[key as keyof NonNullable<Settings['ollamaCloudOutputLimits']>]}
                          onChange={(e) => handleOllamaCloudLimitChange(
                            key as keyof NonNullable<Settings['ollamaCloudOutputLimits']>,
                            parseInt(e.target.value || '0', 10)
                          )}
                          className="setting-number-input"
                        />
                        <span className="setting-value">
                          {getOllamaCloudLimits()[key as keyof NonNullable<Settings['ollamaCloudOutputLimits']>].toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}

                  <div className="setting-group">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => updateSetting('ollamaCloudOutputLimits', DEFAULT_OLLAMA_CLOUD_OUTPUT_LIMITS)}
                    >
                      <IconRefresh size="sm" /> Reset Ollama Cloud Budgets
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="settings-section shortcuts-section">
                <KeyboardShortcuts embedded={true} />
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="settings-section">
                <h3>Advanced Settings</h3>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Dual Ollama</span>
                    <span className="setting-description">Enable secondary Ollama endpoint support</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.dualOllamaEnabled}
                    onChange={(e) => updateSetting('dualOllamaEnabled', e.target.checked)}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Enable Python Brain</span>
                    <span className="setting-description">
                      Turn on the optional Python backend for memory and orchestration features. Restart AgentPrime after changing this setting.
                    </span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.pythonBrainEnabled === true}
                    onChange={(e) => updateSetting('pythonBrainEnabled', e.target.checked)}
                    className="setting-checkbox"
                  />
                </div>

                {localSettings.pythonBrainEnabled !== settings.pythonBrainEnabled && (
                  <div className="setting-group full-width">
                    <div className="startup-diagnostics-card" style={{ borderColor: 'rgba(88, 166, 255, 0.25)' }}>
                      <div className="startup-diagnostics-empty" style={{ color: 'var(--prime-text-secondary)' }}>
                        Restart required: Python Brain will be {localSettings.pythonBrainEnabled ? 'enabled' : 'disabled'} the next time AgentPrime starts.
                      </div>
                    </div>
                  </div>
                )}

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Developer Mode</span>
                    <span className="setting-description">Show additional diagnostics and debug output</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.developerMode || false}
                    onChange={(e) => updateSetting('developerMode', e.target.checked)}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Telemetry</span>
                    <span className="setting-description">Share anonymous usage metrics to improve AgentPrime</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.telemetryEnabled || false}
                    onChange={async (e) => {
                      const enabled = e.target.checked;
                      updateSetting('telemetryEnabled', enabled);
                      try {
                        await window.agentAPI.telemetry?.setEnabled?.(enabled);
                      } catch (err) {
                        console.error('Failed to update telemetry setting:', err);
                      }
                    }}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group full-width">
                  <label className="setting-label">
                    <span className="setting-name">Startup Diagnostics</span>
                    <span className="setting-description">
                      Runtime preflight warnings captured during startup and settings updates
                    </span>
                  </label>
                  <div className="startup-diagnostics-card">
                    <div className="startup-diagnostics-header">
                      <div className="startup-diagnostics-summary">
                        <span className="startup-diagnostics-pill startup-diagnostics-pill--warn">
                          {startupDiagnostics?.warningCount ?? 0} warning(s)
                        </span>
                        <span className="startup-diagnostics-pill startup-diagnostics-pill--info">
                          {startupDiagnostics?.infoCount ?? 0} info
                        </span>
                        <span className="startup-diagnostics-generated">
                          {startupDiagnostics?.generatedAt
                            ? `Last updated ${new Date(startupDiagnostics.generatedAt).toLocaleString()}`
                            : 'No diagnostic snapshot loaded yet'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void loadStartupDiagnostics()}
                        disabled={startupDiagnosticsLoading}
                      >
                        <IconRefresh size="sm" /> {startupDiagnosticsLoading ? 'Refreshing...' : 'Refresh'}
                      </button>
                    </div>

                    {startupDiagnosticsError && (
                      <div className="startup-diagnostics-error">{startupDiagnosticsError}</div>
                    )}

                    {!startupDiagnosticsError && startupDiagnostics && startupDiagnostics.issues.length === 0 && (
                      <div className="startup-diagnostics-empty">No startup warnings detected.</div>
                    )}

                    {!startupDiagnosticsError && startupDiagnostics && startupDiagnostics.issues.length > 0 && (
                      <ul className="startup-diagnostics-list">
                        {startupDiagnostics.issues.map((issue, index) => (
                          <li
                            key={`${issue.code}-${index}`}
                            className={`startup-diagnostics-item startup-diagnostics-item--${issue.severity}`}
                          >
                            <div className="startup-diagnostics-item-head">
                              <span className="startup-diagnostics-item-severity">
                                {issue.severity === 'warn' ? 'Warning' : 'Info'}
                              </span>
                              <span className="startup-diagnostics-item-code">{issue.code}</span>
                            </div>
                            <div className="startup-diagnostics-item-message">{issue.message}</div>
                            {issue.action && (
                              <div className="startup-diagnostics-item-action">Action: {issue.action}</div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="setting-group">
                  <button className="btn btn-secondary" onClick={resetAllSettings}>
                    <IconRefresh size="sm" /> Reset All Settings
                  </button>
                </div>

                <div className="setting-group">
                  <h4>About AgentPrime</h4>
                  <div className="about-info">
                    <p><strong>Profile:</strong> Lean Core IDE</p>
                    <p><strong>Version:</strong> 1.0.0</p>
                    <p><strong>Node:</strong> {typeof process !== 'undefined' ? process.version : 'N/A'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <style>{`
          .settings-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1500;
            animation: settingsFadeIn 0.15s ease;
          }

          @keyframes settingsFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes settingsSlideIn {
            from { opacity: 0; transform: translateY(8px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }

          .settings-panel {
            position: relative;
            width: 92%;
            max-width: 860px;
            height: 80%;
            max-height: 680px;
            background: var(--prime-bg);
            border-radius: 14px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.3);
            border: 1px solid var(--prime-border);
            animation: settingsSlideIn 0.2s ease;
            color-scheme: light dark;
          }

          .settings-close-fab {
            position: absolute;
            top: 12px;
            right: 12px;
            z-index: 2;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 0;
            border: none;
            border-radius: 10px;
            background: var(--prime-surface-hover);
            color: var(--prime-text-secondary);
            cursor: pointer;
            transition: background 0.12s ease, color 0.12s ease;
          }

          .settings-close-fab:hover {
            background: var(--prime-border);
            color: var(--prime-text);
          }

          .settings-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 18px 56px 16px 24px;
            border-bottom: 1px solid var(--prime-border);
            background: var(--prime-surface);
          }

          .settings-header h2 {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 0;
            font-size: 15px;
            font-weight: 700;
            color: var(--prime-text);
            letter-spacing: -0.01em;
          }

          .settings-header-actions {
            display: flex;
            gap: 6px;
          }

          .settings-body {
            flex: 1;
            display: flex;
            overflow: hidden;
          }

          .settings-tabs {
            width: 190px;
            padding: 12px;
            background: var(--prime-surface);
            border-right: 1px solid var(--prime-border);
            display: flex;
            flex-direction: column;
            gap: 2px;
            flex-shrink: 0;
          }

          .settings-tab {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 9px 14px;
            background: transparent;
            border: none;
            border-radius: 8px;
            color: var(--prime-text-secondary);
            font-size: 13px;
            font-weight: 500;
            text-align: left;
            cursor: pointer;
            transition: all 0.12s ease;
          }

          .settings-tab:hover {
            background: var(--prime-surface-hover);
            color: var(--prime-text);
          }

          .settings-tab.active {
            background: var(--prime-accent);
            color: #ffffff;
            font-weight: 600;
          }

          .settings-content {
            flex: 1;
            min-height: 0;
            padding: 28px 32px;
            overflow-y: auto;
            background: var(--prime-bg);
          }

          .settings-content--shortcuts {
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }

          .settings-section {
            max-width: 560px;
            background: transparent;
            padding: 0;
            border: none;
          }

          .settings-section * {
            cursor: auto;
          }

          .settings-panel button,
          .settings-panel .settings-tab,
          .settings-panel .setting-checkbox,
          .settings-panel .setting-select,
          .settings-panel .setting-text-input,
          .settings-panel label.setting-label {
            cursor: pointer;
          }

          .settings-section h3 {
            margin: 0 0 20px 0;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--prime-border);
            font-size: 14px;
            font-weight: 700;
            color: var(--prime-text);
            letter-spacing: -0.01em;
          }

          .settings-section h4 {
            margin: 20px 0 14px 0;
            font-size: 12px;
            font-weight: 600;
            color: var(--prime-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .setting-group {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            padding: 14px 0;
            border-bottom: 1px solid var(--prime-border-light, var(--prime-border));
          }

          .setting-group:last-child {
            border-bottom: none;
          }

          .setting-group.full-width {
            flex-direction: column;
          }

          .setting-label {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 3px;
          }

          .setting-name {
            font-size: 13px;
            font-weight: 600;
            color: var(--prime-text);
          }

          .setting-description {
            font-size: 12px;
            color: var(--prime-text-muted);
            line-height: 1.4;
          }

          .setting-checkbox {
            width: 16px;
            height: 16px;
            accent-color: var(--prime-accent);
            cursor: pointer;
            margin-top: 2px;
          }

          .setting-select {
            padding: 7px 12px;
            background: var(--prime-surface);
            border: 1px solid var(--prime-border);
            border-radius: 8px;
            color: var(--prime-text);
            font-size: 13px;
            font-family: inherit;
            min-width: 180px;
            cursor: pointer;
            transition: border-color 0.12s ease;
          }

          .setting-select--wide {
            min-width: 0;
            width: 100%;
          }

          .setting-select:focus {
            border-color: var(--prime-accent);
            outline: none;
            box-shadow: 0 0 0 2px var(--prime-accent-glow);
          }

          .setting-select option {
            background: var(--prime-surface);
            color: var(--prime-text);
          }

          .setting-text-input {
            width: 100%;
            padding: 9px 12px;
            background: var(--prime-surface);
            border: 1px solid var(--prime-border);
            border-radius: 8px;
            color: var(--prime-text);
            font-size: 13px;
            font-family: inherit;
            cursor: text !important;
            transition: border-color 0.12s ease, box-shadow 0.12s ease;
          }

          .setting-text-input:focus {
            border-color: var(--prime-accent);
            outline: none;
            box-shadow: 0 0 0 2px var(--prime-accent-glow);
          }

          .setting-model-stack {
            min-width: 280px;
            width: min(100%, 360px);
            display: grid;
            gap: 8px;
          }

          .setting-model-row {
            display: grid;
            gap: 8px;
          }

          .setting-model-meta {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: var(--prime-text-muted);
            line-height: 1.4;
          }

          .setting-model-badge {
            padding: 2px 8px;
            border-radius: 999px;
            background: var(--prime-accent-light);
            color: var(--prime-accent);
            font-weight: 700;
          }

          .setting-model-current {
            color: var(--prime-text);
            font-weight: 600;
          }

          .setting-input-group {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .setting-input-group--wide {
            width: min(100%, 360px);
          }

          .setting-range {
            width: 140px;
            accent-color: var(--prime-accent);
          }

          .setting-number-input {
            width: 108px;
            padding: 7px 10px;
            background: var(--prime-surface);
            border: 1px solid var(--prime-border);
            border-radius: 8px;
            color: var(--prime-text);
            font-size: 12px;
            font-family: inherit;
          }

          .setting-value {
            min-width: 44px;
            text-align: right;
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            font-weight: 600;
            color: var(--prime-accent);
          }

          .setting-subsection {
            margin-top: 14px;
            padding: 16px;
            background: var(--prime-surface);
            border-radius: 10px;
            border: 1px solid var(--prime-border);
          }

          .setting-subsection h4 {
            margin: 0 0 14px 0;
            color: var(--prime-accent);
            text-transform: none;
            letter-spacing: normal;
            font-size: 13px;
            font-weight: 600;
          }

          .setting-subsection-copy {
            margin: 0 0 8px 0;
            font-size: 12px;
            line-height: 1.5;
            color: var(--prime-text-muted);
          }

          .provider-credential-card {
            display: grid;
            gap: 10px;
            padding: 14px 0;
            border-top: 1px solid var(--prime-border-light, var(--prime-border));
          }

          .provider-credential-card:first-of-type {
            border-top: none;
            padding-top: 0;
          }

          .provider-credential-head {
            display: grid;
            gap: 6px;
          }

          .provider-credential-title-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
          }

          .provider-credential-copy {
            font-size: 12px;
            color: var(--prime-text-secondary);
            line-height: 1.4;
          }

          .provider-credential-meta {
            font-size: 11px;
            color: var(--prime-text-muted);
            line-height: 1.4;
          }

          .provider-credential-controls {
            display: grid;
            gap: 10px;
          }

          .provider-credential-input {
            min-width: 0;
          }

          .provider-credential-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-end;
          }

          .provider-credential-pill {
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.03em;
            text-transform: uppercase;
          }

          .provider-credential-pill--secure-storage {
            background: rgba(63, 185, 80, 0.16);
            color: #3fb950;
          }

          .provider-credential-pill--environment {
            background: rgba(88, 166, 255, 0.16);
            color: #58a6ff;
          }

          .provider-credential-pill--none {
            background: rgba(240, 246, 252, 0.08);
            color: var(--prime-text-muted);
          }

          .provider-credential-message {
            font-size: 12px;
            line-height: 1.4;
            padding: 8px 10px;
            border-radius: 8px;
          }

          .provider-credential-message--success {
            color: #3fb950;
            background: rgba(63, 185, 80, 0.12);
            border: 1px solid rgba(63, 185, 80, 0.24);
          }

          .provider-credential-message--info {
            color: #58a6ff;
            background: rgba(88, 166, 255, 0.12);
            border: 1px solid rgba(88, 166, 255, 0.24);
          }

          .provider-credential-message--error {
            color: #ff7b72;
            background: rgba(255, 123, 114, 0.12);
            border: 1px solid rgba(255, 123, 114, 0.24);
          }

          .startup-diagnostics-card {
            width: 100%;
            border: 1px solid var(--prime-border);
            border-radius: 10px;
            background: var(--prime-surface);
            padding: 12px;
            display: grid;
            gap: 10px;
          }

          .startup-diagnostics-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
          }

          .startup-diagnostics-summary {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
          }

          .startup-diagnostics-pill {
            padding: 3px 8px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 700;
          }

          .startup-diagnostics-pill--warn {
            background: rgba(255, 166, 0, 0.16);
            color: #d29922;
          }

          .startup-diagnostics-pill--info {
            background: rgba(88, 166, 255, 0.16);
            color: #58a6ff;
          }

          .startup-diagnostics-generated {
            font-size: 11px;
            color: var(--prime-text-muted);
          }

          .startup-diagnostics-error {
            font-size: 12px;
            color: #ff7b72;
            background: rgba(255, 123, 114, 0.12);
            border: 1px solid rgba(255, 123, 114, 0.35);
            padding: 8px 10px;
            border-radius: 8px;
          }

          .startup-diagnostics-empty {
            font-size: 12px;
            color: var(--prime-text-secondary);
            padding: 8px 10px;
            border-radius: 8px;
            background: var(--prime-bg);
            border: 1px dashed var(--prime-border);
          }

          .startup-diagnostics-list {
            list-style: none;
            padding: 0;
            margin: 0;
            display: grid;
            gap: 8px;
          }

          .startup-diagnostics-item {
            border: 1px solid var(--prime-border);
            border-radius: 8px;
            padding: 9px 10px;
            display: grid;
            gap: 6px;
            background: var(--prime-bg);
          }

          .startup-diagnostics-item--warn {
            border-color: rgba(210, 153, 34, 0.4);
          }

          .startup-diagnostics-item--info {
            border-color: rgba(88, 166, 255, 0.35);
          }

          .startup-diagnostics-item-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
          }

          .startup-diagnostics-item-severity {
            font-size: 11px;
            font-weight: 700;
            color: var(--prime-text);
          }

          .startup-diagnostics-item-code {
            font-size: 10px;
            font-family: 'JetBrains Mono', monospace;
            color: var(--prime-text-muted);
          }

          .startup-diagnostics-item-message {
            font-size: 12px;
            color: var(--prime-text-secondary);
            line-height: 1.4;
          }

          .startup-diagnostics-item-action {
            font-size: 12px;
            color: var(--prime-text);
            line-height: 1.4;
          }

          .shortcuts-section {
            max-width: none;
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
          }

          .about-info {
            padding: 14px;
            background: var(--prime-surface);
            border-radius: 10px;
            border: 1px solid var(--prime-border);
          }

          .about-info p {
            margin: 4px 0;
            font-size: 12px;
            color: var(--prime-text-secondary);
          }

          .about-info strong {
            color: var(--prime-text);
          }

          .btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            border: none;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            transition: all 0.12s ease;
          }

          .btn-primary {
            background: var(--prime-accent);
            color: #ffffff;
          }

          .btn-primary:hover {
            background: var(--prime-accent-hover);
          }

          .btn-secondary {
            background: var(--prime-surface-hover);
            color: var(--prime-text);
            border: 1px solid var(--prime-border);
          }

          .btn-secondary:hover {
            border-color: var(--prime-text-muted);
          }

          .btn-ghost {
            background: transparent;
            color: var(--prime-text-secondary);
          }

          .btn-ghost:hover {
            background: var(--prime-surface-hover);
            color: var(--prime-text);
          }

          .btn-sm {
            padding: 6px 10px;
            font-size: 12px;
          }
        `}</style>
      </div>
    </div>
  );
};

export default SettingsPanel;

