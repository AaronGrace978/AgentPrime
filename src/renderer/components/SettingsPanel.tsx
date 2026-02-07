/**
 * SettingsPanel - Comprehensive settings UI for AgentPrime
 * 
 * Features:
 * - Tabbed interface for different settings categories
 * - Editor settings (font, size, theme)
 * - AI configuration
 * - Keyboard shortcuts
 * - Appearance
 * - Extensions
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
  IconCheck,
  IconRefresh,
  IconChevronRight,
  IconMessage,
  IconBrain
} from './Icons';
import ThemeSelector from './ThemeSelector';
import KeyboardShortcuts from './KeyboardShortcuts';
import { ThemeId } from '../themes';
import type { Settings } from '../../types';

type SettingsTab = 'general' | 'editor' | 'appearance' | 'ai' | 'collaboration' | 'plugins' | 'system' | 'shortcuts' | 'advanced';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSettingsChange: (settings: Partial<Settings>) => void;
  currentTheme: ThemeId;
  onThemeChange: (themeId: ThemeId) => void;
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

  // Sync with props
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Update local settings
  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  // Save all settings and broadcast to other components (BrainSelector, etc.)
  const saveSettings = useCallback(() => {
    onSettingsChange(localSettings);
    setHasChanges(false);
    
    // Dispatch event so BrainSelector and other components sync instantly
    window.dispatchEvent(new CustomEvent('agentprime-settings-changed', { 
      detail: localSettings 
    }));
  }, [localSettings, onSettingsChange]);
  
  // Listen for settings changes from BrainSelector or other components
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

  // Discard changes
  const discardChanges = useCallback(() => {
    setLocalSettings(settings);
    setHasChanges(false);
  }, [settings]);

  if (!isOpen) return null;

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <IconSettings size="sm" /> },
    { id: 'editor', label: 'Editor', icon: <IconCode size="sm" /> },
    { id: 'appearance', label: 'Appearance', icon: <IconPalette size="sm" /> },
    { id: 'ai', label: 'AI Assistant', icon: <IconBot size="sm" /> },
    { id: 'collaboration', label: 'Collaboration', icon: <IconMessage size="sm" /> },
    { id: 'plugins', label: 'Plugins', icon: <IconCode size="sm" /> },
    { id: 'system', label: 'System', icon: <IconBrain size="sm" /> },
    { id: 'shortcuts', label: 'Shortcuts', icon: <IconKeyboard size="sm" /> },
    { id: 'advanced', label: 'Advanced', icon: <IconChevronRight size="sm" /> }
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <h2><IconSettings size="md" /> Settings</h2>
          <div className="settings-header-actions">
            {hasChanges && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={discardChanges}>
                  Discard
                </button>
                <button className="btn btn-primary btn-sm" onClick={saveSettings}>
                  <IconSave size="sm" /> Save
                </button>
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              <IconX size="sm" />
            </button>
          </div>
        </div>

        <div className="settings-body">
          {/* Sidebar tabs */}
          <div className="settings-tabs">
            {tabs.map(tab => (
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

          {/* Content */}
          <div className="settings-content">
            {/* General Settings */}
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
                    <span className="setting-name">Dino Buddy Mode 🦕</span>
                    <span className="setting-description">Friendly conversational AI persona</span>
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
                    <span className="setting-description">Use specialized AI agents for different tasks</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.useSpecializedAgents || false}
                    onChange={(e) => updateSetting('useSpecializedAgents', e.target.checked)}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Confirm on Close</span>
                    <span className="setting-description">Show confirmation dialog before closing to prevent accidental data loss</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.confirmOnClose ?? true}
                    onChange={(e) => updateSetting('confirmOnClose', e.target.checked)}
                    className="setting-checkbox"
                  />
                </div>
              </div>
            )}

            {/* Editor Settings */}
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
                      onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                      className="setting-range"
                    />
                    <span className="setting-value">{localSettings.fontSize}px</span>
                  </div>
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Inline Completions</span>
                    <span className="setting-description">Show AI-powered code completions as you type</span>
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
                    <span className="setting-description">Number of spaces per tab</span>
                  </label>
                  <select
                    value={localSettings.tabSize ?? 2}
                    onChange={(e) => updateSetting('tabSize', parseInt(e.target.value) as 2 | 4 | 8)}
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
                    <span className="setting-description">Wrap long lines in the editor</span>
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
                    <span className="setting-description">Show minimap on the right side</span>
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
                    <span className="setting-description">Show line numbers in the gutter</span>
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

            {/* Appearance Settings */}
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

            {/* AI Settings */}
            {activeTab === 'ai' && (
              <div className="settings-section">
                <h3>AI Assistant</h3>
                
                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Active Provider</span>
                    <span className="setting-description">Primary AI provider for chat and completions</span>
                  </label>
                  <select
                    value={localSettings.activeProvider}
                    onChange={(e) => updateSetting('activeProvider', e.target.value)}
                    className="setting-select"
                  >
                    <option value="ollama">Ollama (Local)</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Active Model</span>
                    <span className="setting-description">AI model to use for responses</span>
                  </label>
                  <select
                    value={`${localSettings.activeProvider}:${localSettings.activeModel}`}
                    onChange={(e) => {
                      const [provider, ...modelParts] = e.target.value.split(':');
                      const model = modelParts.join(':');
                      updateSetting('activeProvider', provider);
                      updateSetting('activeModel', model);
                    }}
                    className="setting-select"
                  >
                    <optgroup label="🧠 OpenAI">
                      <option value="openai:gpt-5.2-2025-12-11">🤖 GPT-5.2 (Latest)</option>
                      <option value="openai:gpt-5.2">🧠 GPT-5.2 (Flagship)</option>
                      <option value="openai:gpt-4o">🧠 GPT-4o</option>
                      <option value="openai:gpt-4o-mini">⚡ GPT-4o Mini</option>
                    </optgroup>
                    <optgroup label="🦙 Ollama">
                      <option value="ollama:deepseek-v3.2:cloud">🚀 DeepSeek v3.2</option>
                      <option value="ollama:glm-4.7:cloud">🌟 GLM-4.7</option>
                      <option value="ollama:kimi-k2.5:cloud">🖼️ Kimi K2.5 (256K, vision)</option>
                      <option value="ollama:devstral-small-2:24b-cloud">⚡ Devstral Small (24B)</option>
                      <option value="ollama:qwen3-coder:480b-cloud">🧠 Qwen 3 Coder (480B)</option>
                      <option value="ollama:deepseek-v3.1:671b-cloud">🔍 DeepSeek v3.1 (671B)</option>
                      <option value="ollama:qwen2.5-coder:7b">⚡ Qwen 2.5 Coder (7B)</option>
                      <option value="ollama:qwen2.5-coder:32b">🧠 Qwen 2.5 Coder (32B)</option>
                    </optgroup>
                    <optgroup label="🎭 Anthropic">
                      <option value="anthropic:claude-opus-4-6">🧠 Claude Opus 4.6 (Flagship)</option>
                      <option value="anthropic:claude-opus-4-5-20251101">🧠 Claude Opus 4.5 (Frontier)</option>
                      <option value="anthropic:claude-opus-4-20250514">🧠 Claude Opus 4</option>
                      <option value="anthropic:claude-sonnet-4-20250514">🎭 Claude Sonnet 4</option>
                      <option value="anthropic:claude-3-5-haiku-20241022">⚡ Claude 3.5 Haiku</option>
                    </optgroup>
                    <optgroup label="🌐 OpenRouter">
                      <option value="openrouter:anthropic/claude-sonnet-4-20250514">🎭 Claude Sonnet 4</option>
                      <option value="openrouter:openai/gpt-4o">🧠 GPT-4o</option>
                      <option value="openrouter:meta-llama/llama-3.3-70b-instruct">🦙 Llama 3.3 70B</option>
                    </optgroup>
                  </select>
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Dual Model Mode</span>
                    <span className="setting-description">Use fast model for quick tasks, deep model for complex reasoning</span>
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
                        <span className="setting-description">Quick responses and simple tasks</span>
                      </label>
                      <select
                        value={`${localSettings.dualModelConfig?.fastModel?.provider || 'openai'}:${localSettings.dualModelConfig?.fastModel?.model || ''}`}
                        onChange={(e) => {
                          const [provider, ...modelParts] = e.target.value.split(':');
                          const model = modelParts.join(':');
                          const config = { ...localSettings.dualModelConfig };
                          config.fastModel = { ...config.fastModel, provider, model };
                          updateSetting('dualModelConfig', config);
                        }}
                        className="setting-select"
                      >
                        <optgroup label="🧠 OpenAI">
                          <option value="openai:gpt-5.2-2025-12-11">🤖 GPT-5.2 (Latest)</option>
                          <option value="openai:gpt-5.2">🧠 GPT-5.2 (Flagship)</option>
                          <option value="openai:gpt-4o">🧠 GPT-4o</option>
                          <option value="openai:gpt-4o-mini">⚡ GPT-4o Mini</option>
                        </optgroup>
                        <optgroup label="🦙 Ollama">
                          <option value="ollama:deepseek-v3.2:cloud">🚀 DeepSeek v3.2</option>
                          <option value="ollama:glm-4.7:cloud">🌟 GLM-4.7</option>
                          <option value="ollama:kimi-k2.5:cloud">🖼️ Kimi K2.5 (256K, vision)</option>
                          <option value="ollama:devstral-small-2:24b-cloud">⚡ Devstral Small (24B)</option>
                          <option value="ollama:qwen3-coder:480b-cloud">🧠 Qwen 3 Coder (480B)</option>
                          <option value="ollama:deepseek-v3.1:671b-cloud">🔍 DeepSeek v3.1 (671B)</option>
                          <option value="ollama:qwen2.5-coder:7b">⚡ Qwen 2.5 Coder (7B)</option>
                        </optgroup>
                        <optgroup label="🎭 Anthropic">
                          <option value="anthropic:claude-opus-4-6">🧠 Claude Opus 4.6</option>
                          <option value="anthropic:claude-opus-4-5-20251101">🧠 Claude Opus 4.5</option>
                          <option value="anthropic:claude-sonnet-4-20250514">🎭 Claude Sonnet 4</option>
                          <option value="anthropic:claude-3-5-haiku-20241022">⚡ Claude 3.5 Haiku</option>
                        </optgroup>
                      </select>
                    </div>

                    <div className="setting-group">
                      <label className="setting-label">
                        <span className="setting-name">Deep Model</span>
                        <span className="setting-description">Complex reasoning and analysis</span>
                      </label>
                      <select
                        value={`${localSettings.dualModelConfig?.deepModel?.provider || 'openai'}:${localSettings.dualModelConfig?.deepModel?.model || ''}`}
                        onChange={(e) => {
                          const [provider, ...modelParts] = e.target.value.split(':');
                          const model = modelParts.join(':');
                          const config = { ...localSettings.dualModelConfig };
                          config.deepModel = { ...config.deepModel, provider, model };
                          updateSetting('dualModelConfig', config);
                        }}
                        className="setting-select"
                      >
                        <optgroup label="🧠 OpenAI">
                          <option value="openai:gpt-5.2-2025-12-11">🤖 GPT-5.2 (Latest)</option>
                          <option value="openai:gpt-5.2">🧠 GPT-5.2 (Flagship)</option>
                          <option value="openai:gpt-4o">🧠 GPT-4o</option>
                          <option value="openai:gpt-4o-mini">⚡ GPT-4o Mini</option>
                        </optgroup>
                        <optgroup label="🦙 Ollama">
                          <option value="ollama:deepseek-v3.2:cloud">🚀 DeepSeek v3.2</option>
                          <option value="ollama:glm-4.7:cloud">🌟 GLM-4.7</option>
                          <option value="ollama:kimi-k2.5:cloud">🖼️ Kimi K2.5 (256K, vision)</option>
                          <option value="ollama:devstral-small-2:24b-cloud">⚡ Devstral Small (24B)</option>
                          <option value="ollama:qwen3-coder:480b-cloud">🧠 Qwen 3 Coder (480B)</option>
                          <option value="ollama:deepseek-v3.1:671b-cloud">🔍 DeepSeek v3.1 (671B)</option>
                          <option value="ollama:qwen2.5-coder:32b">🧠 Qwen 2.5 Coder (32B)</option>
                        </optgroup>
                        <optgroup label="🎭 Anthropic">
                          <option value="anthropic:claude-opus-4-6">🧠 Claude Opus 4.6 (Flagship)</option>
                          <option value="anthropic:claude-opus-4-5-20251101">🧠 Claude Opus 4.5 (Frontier)</option>
                          <option value="anthropic:claude-opus-4-20250514">🧠 Claude Opus 4</option>
                          <option value="anthropic:claude-sonnet-4-20250514">🎭 Claude Sonnet 4</option>
                        </optgroup>
                      </select>
                    </div>

                    <div className="setting-group">
                      <label className="setting-label">
                        <span className="setting-name">Auto-Route</span>
                        <span className="setting-description">Automatically choose model based on task complexity</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={localSettings.dualModelConfig?.autoRoute || false}
                        onChange={(e) => {
                          const config = { ...localSettings.dualModelConfig };
                          config.autoRoute = e.target.checked;
                          updateSetting('dualModelConfig', config);
                        }}
                        className="setting-checkbox"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Collaboration Settings */}
            {activeTab === 'collaboration' && (
              <div className="settings-section">
                <h3>Collaboration</h3>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Real-time Sync</span>
                    <span className="setting-description">Enable live collaboration features</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.collaboration?.realTimeSync ?? true}
                    onChange={(e) => {
                      const defaultCollab = { enabled: true, autoJoin: false, showPresence: true, realTimeCursors: true };
                      const collab = { ...defaultCollab, ...localSettings.collaboration, realTimeSync: e.target.checked };
                      updateSetting('collaboration', collab);
                    }}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Auto-save Interval</span>
                    <span className="setting-description">How often to auto-save collaborative changes (seconds)</span>
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="300"
                    value={localSettings.collaboration?.autoSaveInterval ?? 30}
                    onChange={(e) => {
                      const defaultCollab = { enabled: true, autoJoin: false, showPresence: true, realTimeCursors: true };
                      const collab = { ...defaultCollab, ...localSettings.collaboration, autoSaveInterval: parseInt(e.target.value) };
                      updateSetting('collaboration', collab);
                    }}
                    className="setting-input"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Conflict Resolution</span>
                    <span className="setting-description">How to handle conflicting changes</span>
                  </label>
                  <select
                    value={localSettings.collaboration?.conflictResolution ?? 'manual'}
                    onChange={(e) => {
                      const defaultCollab = { enabled: true, autoJoin: false, showPresence: true, realTimeCursors: true };
                      const collab = { ...defaultCollab, ...localSettings.collaboration, conflictResolution: e.target.value as 'manual' | 'automatic' | 'last-writer-wins' };
                      updateSetting('collaboration', collab);
                    }}
                    className="setting-select"
                  >
                    <option value="manual">Manual (ask user)</option>
                    <option value="automatic">Automatic (smart merge)</option>
                    <option value="last-writer-wins">Last Writer Wins</option>
                  </select>
                </div>
              </div>
            )}

            {/* Plugin Settings */}
            {activeTab === 'plugins' && (
              <div className="settings-section">
                <h3>Plugin System</h3>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Auto-update Plugins</span>
                    <span className="setting-description">Automatically update plugins to latest versions</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.plugins?.autoUpdate ?? true}
                    onChange={(e) => {
                      const defaultPlugins = { enabled: true, autoUpdate: true, trustedSources: [] };
                      const plugins = { ...defaultPlugins, ...localSettings.plugins, autoUpdate: e.target.checked };
                      updateSetting('plugins', plugins);
                    }}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Allow Pre-release</span>
                    <span className="setting-description">Install beta versions of plugins</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.plugins?.allowPreRelease ?? false}
                    onChange={(e) => {
                      const defaultPlugins = { enabled: true, autoUpdate: true, trustedSources: [] };
                      const plugins = { ...defaultPlugins, ...localSettings.plugins, allowPreRelease: e.target.checked };
                      updateSetting('plugins', plugins);
                    }}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Trusted Publishers</span>
                    <span className="setting-description">Only install plugins from verified publishers</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.plugins?.trustedOnly ?? true}
                    onChange={(e) => {
                      const defaultPlugins = { enabled: true, autoUpdate: true, trustedSources: [] };
                      const plugins = { ...defaultPlugins, ...localSettings.plugins, trustedOnly: e.target.checked };
                      updateSetting('plugins', plugins);
                    }}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      // Open plugin marketplace
                      window.agentAPI.openExternal?.('agentprime://plugins/marketplace');
                    }}
                  >
                    Open Plugin Marketplace
                  </button>
                </div>
              </div>
            )}

            {/* System Settings */}
            {activeTab === 'system' && (
              <div className="settings-section">
                <h3>System & Performance</h3>

                <h4>Security</h4>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Auto-Lock Screen</span>
                    <span className="setting-description">Lock screen after inactivity (Matrix mode)</span>
                  </label>
                  <select
                    value={localSettings.autoLockMinutes ?? 0}
                    onChange={(e) => updateSetting('autoLockMinutes', parseInt(e.target.value))}
                    className="setting-select"
                  >
                    <option value="0">Disabled</option>
                    <option value="1">1 minute</option>
                    <option value="5">5 minutes</option>
                    <option value="10">10 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                  </select>
                </div>

                <h4>Performance</h4>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Edge AI Enabled</span>
                    <span className="setting-description">Use local AI models for better privacy and performance</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.system?.edgeAIEnabled ?? true}
                    onChange={(e) => {
                      const defaultSystem = { distributedMode: false, scalingEnabled: false, memoryOptimization: true, performanceMonitoring: true };
                      const system = { ...defaultSystem, ...localSettings.system, edgeAIEnabled: e.target.checked };
                      updateSetting('system', system);
                    }}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Memory Optimization</span>
                    <span className="setting-description">Enable intelligent caching and memory management</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.system?.memoryOptimization ?? true}
                    onChange={(e) => {
                      const defaultSystem = { distributedMode: false, scalingEnabled: false, memoryOptimization: true, performanceMonitoring: true };
                      const system = { ...defaultSystem, ...localSettings.system, memoryOptimization: e.target.checked };
                      updateSetting('system', system);
                    }}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Auto-scaling</span>
                    <span className="setting-description">Automatically scale resources based on usage</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.system?.autoScaling ?? false}
                    onChange={(e) => {
                      const defaultSystem = { distributedMode: false, scalingEnabled: false, memoryOptimization: true, performanceMonitoring: true };
                      const system = { ...defaultSystem, ...localSettings.system, autoScaling: e.target.checked };
                      updateSetting('system', system);
                    }}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Cloud Sync</span>
                    <span className="setting-description">Synchronize across devices</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.system?.cloudSync ?? false}
                    onChange={(e) => {
                      const defaultSystem = { distributedMode: false, scalingEnabled: false, memoryOptimization: true, performanceMonitoring: true };
                      const system = { ...defaultSystem, ...localSettings.system, cloudSync: e.target.checked };
                      updateSetting('system', system);
                    }}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      // Open system monitor
                      window.agentAPI.openExternal?.('agentprime://system/monitor');
                    }}
                  >
                    View System Monitor
                  </button>
                </div>
              </div>
            )}

            {/* Keyboard Shortcuts */}
            {activeTab === 'shortcuts' && (
              <div className="settings-section shortcuts-section">
                <KeyboardShortcuts embedded={true} />
              </div>
            )}

            {/* Advanced Settings */}
            {activeTab === 'advanced' && (
              <div className="settings-section">
                <h3>Advanced Settings</h3>
                
                <div className="setting-group">
                  <label className="setting-label">
                    <span className="setting-name">Dual Ollama</span>
                    <span className="setting-description">Use two Ollama instances for parallel processing</span>
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
                    <span className="setting-name">Developer Mode</span>
                    <span className="setting-description">Show additional debugging information</span>
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
                    <span className="setting-description">Send anonymous usage data to help improve AgentPrime</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={localSettings.telemetryEnabled || false}
                    onChange={async (e) => {
                      const enabled = e.target.checked;
                      updateSetting('telemetryEnabled', enabled);
                      // Also update telemetry service immediately
                      try {
                        await window.agentAPI.telemetry.setEnabled(enabled);
                      } catch (err) {
                        console.error('Failed to update telemetry setting:', err);
                      }
                    }}
                    className="setting-checkbox"
                  />
                </div>

                <div className="setting-group">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      const defaults: Partial<Settings> = {
                        fontSize: 14,
                        tabSize: 2,
                        wordWrap: 'on',
                        minimap: true,
                        lineNumbers: 'on',
                        autoSave: true,
                        inlineCompletions: true,
                        dinoBuddyMode: false,
                        activeProvider: 'openai',
                        activeModel: 'gpt-4o',
                        dualOllamaEnabled: false,
                        dualModelEnabled: false,
                        useSpecializedAgents: false,
                        telemetryEnabled: false,
                        developerMode: false,
                        confirmOnClose: true,
                        autoLockMinutes: 0,
                      };
                      setLocalSettings(prev => ({ ...prev, ...defaults }));
                      setHasChanges(true);
                    }}
                  >
                    <IconRefresh size="sm" /> Reset All Settings
                  </button>
                </div>

                <div className="setting-group">
                  <h4>About AgentPrime</h4>
                  <div className="about-info">
                    <p><strong>Version:</strong> 1.0.0</p>
                    <p><strong>Electron:</strong> 28.0.0</p>
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
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          
          .settings-panel {
            width: 90%;
            max-width: 900px;
            height: 80%;
            max-height: 700px;
            background: #0f172a;
            border-radius: var(--border-radius-lg);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            border: 1px solid #1e293b;
          }
          
          .settings-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--spacing-md) var(--spacing-lg);
            border-bottom: 1px solid #1e293b;
            background: #1e293b;
          }
          
          .settings-header h2 {
            display: flex;
            align-items: center;
            gap: var(--spacing-sm);
            margin: 0;
            font-size: 1.1rem;
            color: #f8fafc;
          }
          
          .settings-header-actions {
            display: flex;
            gap: var(--spacing-sm);
          }
          
          .settings-body {
            flex: 1;
            display: flex;
            overflow: hidden;
          }
          
          .settings-tabs {
            width: 200px;
            padding: var(--spacing-md);
            background: #0f172a;
            border-right: 1px solid #1e293b;
            display: flex;
            flex-direction: column;
            gap: var(--spacing-xs);
          }
          
          .settings-tab {
            display: flex;
            align-items: center;
            gap: var(--spacing-sm);
            padding: var(--spacing-sm) var(--spacing-md);
            background: none;
            border: none;
            border-radius: var(--border-radius);
            color: #94a3b8;
            font-size: 0.85rem;
            text-align: left;
            cursor: pointer;
            transition: all 0.15s;
          }
          
          .settings-tab:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #e2e8f0;
          }
          
          .settings-tab.active {
            background: #3b82f6;
            color: white;
          }
          
          .settings-content {
            flex: 1;
            padding: var(--spacing-lg);
            overflow-y: auto;
            background: #0f172a;
          }
          
          .settings-section {
            max-width: 600px;
          }
          
          .settings-section h3 {
            margin: 0 0 var(--spacing-lg) 0;
            padding-bottom: var(--spacing-sm);
            border-bottom: 1px solid #334155;
            font-size: 1rem;
            color: #f1f5f9;
          }
          
          .settings-section h4 {
            margin: var(--spacing-lg) 0 var(--spacing-md) 0;
            font-size: 0.85rem;
            color: #94a3b8;
          }
          
          .setting-group {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: var(--spacing-md);
            padding: var(--spacing-md) 0;
            border-bottom: 1px solid #1e293b;
          }
          
          .setting-group.full-width {
            flex-direction: column;
          }
          
          .setting-label {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          
          .setting-name {
            font-weight: 500;
            color: #e2e8f0;
          }
          
          .setting-description {
            font-size: 0.75rem;
            color: #94a3b8;
          }
          
          .setting-checkbox {
            width: 18px;
            height: 18px;
            accent-color: #3b82f6;
            cursor: pointer;
          }
          
          .setting-select {
            padding: var(--spacing-xs) var(--spacing-sm);
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: var(--border-radius-sm);
            color: #e2e8f0;
            font-size: 0.85rem;
            min-width: 150px;
          }
          
          .setting-select:focus {
            border-color: #3b82f6;
            outline: none;
          }
          
          .setting-input {
            padding: var(--spacing-xs) var(--spacing-sm);
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: var(--border-radius-sm);
            color: #e2e8f0;
            font-size: 0.85rem;
            min-width: 200px;
          }
          
          .setting-input:focus {
            border-color: #3b82f6;
            outline: none;
          }
          
          .setting-input-group {
            display: flex;
            align-items: center;
            gap: var(--spacing-sm);
          }
          
          .setting-range {
            width: 150px;
            accent-color: #3b82f6;
          }
          
          .setting-value {
            min-width: 50px;
            text-align: right;
            font-family: var(--font-mono);
            font-size: 0.8rem;
            color: #60a5fa;
          }
          
          .setting-subsection {
            margin-top: var(--spacing-md);
            padding: var(--spacing-md);
            background: #1e293b;
            border-radius: var(--border-radius);
            border: 1px solid #334155;
          }
          
          .setting-subsection h4 {
            margin: 0 0 var(--spacing-md) 0;
            color: #60a5fa;
          }
          
          .shortcuts-section {
            max-width: none;
            height: 100%;
          }
          
          .about-info {
            padding: var(--spacing-md);
            background: #1e293b;
            border-radius: var(--border-radius);
            border: 1px solid #334155;
          }
          
          .about-info p {
            margin: var(--spacing-xs) 0;
            font-size: 0.8rem;
            color: #cbd5e1;
          }
          
          .btn {
            display: inline-flex;
            align-items: center;
            gap: var(--spacing-xs);
            padding: var(--spacing-sm) var(--spacing-md);
            border: none;
            border-radius: var(--border-radius);
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.15s;
          }
          
          .btn-primary {
            background: #3b82f6;
            color: white;
          }
          
          .btn-primary:hover {
            background: #2563eb;
          }
          
          .btn-secondary {
            background: #334155;
            color: #e2e8f0;
            border: 1px solid #475569;
          }
          
          .btn-secondary:hover {
            background: #475569;
          }
          
          .btn-ghost {
            background: transparent;
            color: #94a3b8;
          }
          
          .btn-ghost:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #e2e8f0;
          }
          
          .btn-sm {
            padding: var(--spacing-xs) var(--spacing-sm);
            font-size: 0.8rem;
          }
        `}</style>
      </div>
    </div>
  );
};

export default SettingsPanel;

