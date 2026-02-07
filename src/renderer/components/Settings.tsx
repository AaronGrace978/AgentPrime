import React, { useState, useEffect } from 'react';
import { Settings as SettingsType } from '../../types';
import { ProviderConfig } from '../../types/ai-providers';
import AssetManager from './AssetManager';

interface SettingsProps {
  onSettingsChange?: (settings: Partial<SettingsType>) => void;
}

// Model options by provider - commonly used models
const MODEL_OPTIONS: Record<string, { value: string; label: string; description?: string }[]> = {
  ollama: [
    // NEW Cloud Models (just pulled!)
    { value: 'deepseek-v3.2:cloud', label: '🚀 DeepSeek v3.2 (NEW!)', description: 'Superior reasoning + agents' },
    { value: 'glm-4.7:cloud', label: '🌟 GLM-4.7 (NEW!)', description: 'Advanced coding (2 days old!)' },
    { value: 'kimi-k2.5:cloud', label: '🖼️ Kimi K2.5 (256K)', description: 'Multimodal, vision, agentic' },
    { value: 'gemini-3-flash-preview:cloud', label: '⚡ Gemini 3 Flash (NEW!)', description: 'Fast frontier intelligence' },
    { value: 'nemotron-3-nano:30b-cloud', label: '💎 Nemotron 3 Nano (30B)', description: 'Efficient agentic tasks' },
    { value: 'minimax-m2.1:cloud', label: '🎯 MiniMax M2.1 (NEW!)', description: 'Multilingual code engineering' },
    { value: 'devstral-2:123b-cloud', label: '💪 Devstral 2 (123B)', description: 'Heavy-duty multi-file editing' },
    // Existing Cloud Models
    { value: 'devstral-small-2:24b-cloud', label: '⚡ Devstral Small 2 (24B)', description: 'Fast, code-focused' },
    { value: 'qwen3-coder:480b-cloud', label: '🧠 Qwen 3 Coder (480B)', description: 'Deep reasoning' },
    { value: 'deepseek-v3.1:671b-cloud', label: '🔍 DeepSeek v3.1 (671B)', description: 'Code expert' },
    { value: 'glm-4.6:cloud', label: '🌟 GLM-4.6 (200K ctx)', description: 'Long context' },
    { value: 'mistral-large-3:675b-cloud', label: '💫 Mistral Large 3 (675B)', description: 'Powerful' },
    { value: 'gemini-3-pro-preview:latest', label: '💎 Gemini 3 Pro Preview', description: 'Google\'s most intelligent' },
    // Local Models
    { value: 'llama3.3:70b', label: '🦙 Llama 3.3 (70B)', description: 'Meta\'s best' },
    { value: 'codellama:34b', label: '🦙 CodeLlama (34B)', description: 'Code specialized' },
    { value: 'qwen2.5-coder:7b', label: '⚡ Qwen 2.5 Coder (7B)', description: 'Fast local' },
    { value: 'qwen2.5-coder:32b', label: '🧠 Qwen 2.5 Coder (32B)', description: 'Balanced' },
  ],
  anthropic: [
    { value: 'claude-opus-4-6', label: '🧠 Claude Opus 4.6', description: 'Flagship' },
    { value: 'claude-opus-4-5-20251101', label: '🧠 Claude Opus 4.5', description: 'Frontier' },
    { value: 'claude-opus-4-20250514', label: '🧠 Claude Opus 4', description: 'Legacy' },
    { value: 'claude-sonnet-4-20250514', label: '🎭 Claude Sonnet 4', description: 'Latest Sonnet' },
    { value: 'claude-3-5-sonnet-20241022', label: '🎭 Claude 3.5 Sonnet', description: 'Best coding' },
    { value: 'claude-3-haiku-20240307', label: '⚡ Claude 3 Haiku', description: 'Fast & cheap' },
    { value: 'claude-3-opus-20240229', label: '🧠 Claude 3 Opus', description: 'Legacy' },
  ],
  openai: [
    { value: 'gpt-5.2-2025-12-11', label: '🤖 GPT-5.2 (Latest)', description: 'Ultra advanced coding & reasoning' },
    { value: 'gpt-5.2', label: '🧠 GPT-5.2 (Flagship)', description: 'Best for coding & agentic tasks' },
    { value: 'gpt-4o', label: '🧠 GPT-4o', description: 'Latest multimodal' },
    { value: 'gpt-4o-mini', label: '⚡ GPT-4o Mini', description: 'Fast & cheap' },
    { value: 'gpt-4-turbo', label: '🧠 GPT-4 Turbo', description: '128K context' },
    { value: 'o1-preview', label: '🔮 o1 Preview', description: 'Reasoning model' },
    { value: 'o1-mini', label: '⚡ o1 Mini', description: 'Fast reasoning' },
  ],
  openrouter: [
    { value: 'anthropic/claude-sonnet-4-20250514', label: '🎭 Claude Sonnet 4', description: 'Via OpenRouter' },
    { value: 'anthropic/claude-3.5-sonnet', label: '🎭 Claude 3.5 Sonnet', description: 'Best coding' },
    { value: 'openai/gpt-4o', label: '🧠 GPT-4o', description: 'OpenAI flagship' },
    { value: 'google/gemini-pro-1.5', label: '💎 Gemini Pro 1.5', description: '1M context' },
    { value: 'meta-llama/llama-3.3-70b-instruct', label: '🦙 Llama 3.3 70B', description: 'Open source' },
    { value: 'qwen/qwen-2.5-coder-32b-instruct', label: '🧠 Qwen 2.5 Coder 32B', description: 'Code expert' },
    { value: 'deepseek/deepseek-chat', label: '🔍 DeepSeek Chat', description: 'Affordable' },
  ]
};

const Settings: React.FC<SettingsProps> = ({ onSettingsChange }) => {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({});
  const [allModels, setAllModels] = useState<Array<{id: string, provider: string, displayName: string}>>([]);
  const [showAssetManager, setShowAssetManager] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Listen for settings changes from other components (real-time sync)
  useEffect(() => {
    const handleSettingsChanged = (event: CustomEvent) => {
      console.log('[Settings] Received settings-changed event, reloading...');
      // Only reload if the event wasn't triggered by this component
      if (event.detail) {
        setSettings(event.detail);
      }
    };

    window.addEventListener('agentprime-settings-changed', handleSettingsChanged as EventListener);
    
    return () => {
      window.removeEventListener('agentprime-settings-changed', handleSettingsChanged as EventListener);
    };
  }, []);

  // Load models from ALL providers
  useEffect(() => {
    if (settings) {
      loadAllProviderModels();
    }
  }, [settings]);

  const loadSettings = async () => {
    try {
      const loadedSettings = await window.agentAPI.getSettings();
      setSettings(loadedSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch available models for a provider
  const loadProviderModels = async (provider: string) => {
    try {
      const models = await window.agentAPI.getProviderModels(provider);
      if (models && Array.isArray(models)) {
        setProviderModels(prev => ({
          ...prev,
          [provider]: models.map(m => m.id || m)
        }));
      }
    } catch (error) {
      console.log(`Could not fetch ${provider} models:`, error);
    }
  };

  // Load models from ALL providers for unified dropdown
  const loadAllProviderModels = async () => {
    const providers = ['ollama', 'openai', 'anthropic', 'openrouter'];
    const combinedModels: Array<{id: string, provider: string, displayName: string}> = [];
    const seenModels = new Set<string>();

    // First, add all static MODEL_OPTIONS as base
    for (const [provider, options] of Object.entries(MODEL_OPTIONS)) {
      for (const opt of options) {
        const key = `${provider}-${opt.value}`;
        if (!seenModels.has(key)) {
          seenModels.add(key);
          combinedModels.push({
            id: opt.value,
            provider,
            displayName: `${getProviderEmoji(provider)} ${opt.label.replace(/^[^\s]+\s/, '')} (${provider})`
          });
        }
      }
    }

    // Then try to fetch dynamic models from running services
    for (const provider of providers) {
      try {
        const models = await window.agentAPI.getProviderModels(provider);
        if (models && Array.isArray(models)) {
          for (const m of models) {
            const modelId = m.id || m;
            const key = `${provider}-${modelId}`;
            if (!seenModels.has(key)) {
              seenModels.add(key);
              combinedModels.push({
                id: modelId,
                provider,
                displayName: `${getProviderEmoji(provider)} ${modelId} (${provider})`
              });
            }
          }

          // Also store in providerModels state for individual provider access
          setProviderModels(prev => ({
            ...prev,
            [provider]: models.map(m => m.id || m)
          }));
        }
      } catch (error) {
        console.log(`Could not fetch ${provider} models (using static list):`, error);
      }
    }

    // Sort: OpenAI first, then Ollama, then others
    combinedModels.sort((a, b) => {
      const order = { openai: 0, ollama: 1, anthropic: 2, openrouter: 3 };
      const orderA = order[a.provider as keyof typeof order] ?? 99;
      const orderB = order[b.provider as keyof typeof order] ?? 99;
      return orderA - orderB;
    });

    setAllModels(combinedModels);
  };

  // Get emoji for provider
  const getProviderEmoji = (provider: string) => {
    const emojis: Record<string, string> = {
      ollama: '🦙',
      'ollama-secondary': '🦙',
      anthropic: '🎭',
      openai: '🧠',
      openrouter: '🌐'
    };
    return emojis[provider] || '🤖';
  };

  // Get model options for a provider, merging with dynamic provider models
  const getModelOptions = (provider: string) => {
    const baseOptions = MODEL_OPTIONS[provider] || [];

    if (providerModels[provider] && providerModels[provider].length > 0) {
      // Add any provider models not already in the list
      const existingValues = new Set(baseOptions.map(o => o.value));
      const dynamicOptions = providerModels[provider]
        .filter((m: string) => !existingValues.has(m))
        .map((m: string) => ({
          value: m,
          label: `📦 ${m}`,
          description: 'Dynamic model'
        }));
      return [...baseOptions, ...dynamicOptions];
    }

    return baseOptions;
  };

  // Handle model selection - automatically set provider
  const handleModelChange = (modelId: string) => {
    const selectedModel = allModels.find(m => m.id === modelId);
    if (selectedModel) {
      // Set both the model and its provider
      saveSettings({
        activeModel: modelId,
        activeProvider: selectedModel.provider
      });
    }
  };

  const saveSettings = async (newSettings: Partial<SettingsType>) => {
    if (!settings) return;

    setSaving(true);
    try {
      const updatedSettings = await window.agentAPI.updateSettings(newSettings);
      setSettings(updatedSettings);
      onSettingsChange?.(newSettings);
      
      // Dispatch custom event for real-time sync with other components
      window.dispatchEvent(new CustomEvent('agentprime-settings-changed', { 
        detail: updatedSettings 
      }));
      console.log('[Settings] Dispatched settings-changed event');
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateProviderConfig = (provider: keyof SettingsType['providers'], config: Partial<ProviderConfig>) => {
    if (!settings) return;

    const updatedProviders = {
      ...settings.providers,
      [provider]: { ...settings.providers[provider], ...config }
    };

    saveSettings({ providers: updatedProviders });
  };

  if (loading) {
    return (
      <div className="settings-loading">
        <div className="spinner"></div>
        <p>Loading settings...</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="settings-error">
        <p>Failed to load settings</p>
        <button onClick={loadSettings} className="secondary-btn">Retry</button>
      </div>
    );
  }

  return (
    <div className="settings-panel">
      {/* General Settings */}
      <div className="settings-section">
        <h3>General</h3>

        <div className="setting-item">
          <label htmlFor="theme">Theme</label>
          <select
            id="theme"
            value={settings.theme}
            onChange={(e) => saveSettings({ theme: e.target.value })}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>

        <div className="setting-item">
          <label htmlFor="fontSize">Font Size</label>
          <input
            id="fontSize"
            type="number"
            min="8"
            max="24"
            value={settings.fontSize}
            onChange={(e) => saveSettings({ fontSize: parseInt(e.target.value) })}
          />
        </div>

        <div className="setting-item">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.autoSave}
              onChange={(e) => saveSettings({ autoSave: e.target.checked })}
            />
            Auto Save
          </label>
        </div>

        <div className="setting-item">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.inlineCompletions}
              onChange={(e) => saveSettings({ inlineCompletions: e.target.checked })}
            />
            Inline Completions
          </label>
        </div>

        <div className="setting-item">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.dinoBuddyMode}
              onChange={(e) => saveSettings({ dinoBuddyMode: e.target.checked })}
            />
            Dino Buddy Mode
          </label>
        </div>

        <div className="setting-item">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.useSpecializedAgents}
              onChange={(e) => saveSettings({ useSpecializedAgents: e.target.checked })}
            />
            Specialized Agents Mode
          </label>
        </div>
      </div>

      {/* AI Provider Settings */}
      <div className="settings-section">
        <h3>AI Provider</h3>

        <div className="setting-item">
          <label htmlFor="activeProvider">Active Provider</label>
          <select
            id="activeProvider"
            value={settings.activeProvider}
            onChange={(e) => saveSettings({ activeProvider: e.target.value })}
          >
            <option value="ollama">Ollama</option>
            <option value="ollama-secondary">Ollama Secondary</option>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </div>

        <div className="setting-item">
          <label htmlFor="activeModel">Active Model</label>
          <select
            id="activeModel"
            value={`${settings.activeProvider}:${settings.activeModel}`}
            onChange={(e) => {
              const [provider, ...modelParts] = e.target.value.split(':');
              const model = modelParts.join(':');
              saveSettings({ activeProvider: provider, activeModel: model });
            }}
          >
            <optgroup label="🧠 OpenAI">
              <option value="openai:gpt-5.2-2025-12-11">🤖 GPT-5.2 (Latest)</option>
              <option value="openai:gpt-5.2">🧠 GPT-5.2 (Flagship)</option>
              <option value="openai:gpt-4o">🧠 GPT-4o</option>
              <option value="openai:gpt-4o-mini">⚡ GPT-4o Mini</option>
            </optgroup>
            <optgroup label="🦙 Ollama">
              <option value="ollama:deepseek-v3.2:cloud">🚀 DeepSeek v3.2 (NEW!)</option>
              <option value="ollama:glm-4.7:cloud">🌟 GLM-4.7 (NEW!)</option>
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

        <div className="setting-item">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.dualOllamaEnabled}
              onChange={(e) => saveSettings({ dualOllamaEnabled: e.target.checked })}
            />
            Enable Dual Ollama (Legacy)
          </label>
        </div>
      </div>

      {/* Dual Model System - Like Cursor! */}
      <div className="settings-section">
        <h3>🚀 Dual Model System</h3>
        <p className="settings-description">
          Use two models at once: a fast model for quick tasks and a deep model for complex reasoning.
        </p>

        <div className="setting-item">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.dualModelEnabled || false}
              onChange={(e) => saveSettings({ dualModelEnabled: e.target.checked })}
            />
            Enable Dual Model System
          </label>
        </div>

        {settings.dualModelEnabled && settings.dualModelConfig && (
          <div className="dual-model-config">
            {/* Fast Model - Unified Dropdown */}
            <div className="model-config-card fast">
              <div className="model-config-header">
                <span className="model-icon">⚡</span>
                <h4>Fast Model</h4>
                <span className="model-badge">Quick responses</span>
              </div>
              <div className="setting-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.dualModelConfig.fastModel?.enabled ?? true}
                    onChange={(e) => saveSettings({
                      dualModelConfig: {
                        ...settings.dualModelConfig,
                        fastModel: { ...settings.dualModelConfig.fastModel, enabled: e.target.checked }
                      }
                    })}
                  />
                  Enabled
                </label>
              </div>
              <div className="setting-item">
                <label>Model (All Providers)</label>
                <select
                  value={`${settings.dualModelConfig.fastModel?.provider || 'openai'}:${settings.dualModelConfig.fastModel?.model || ''}`}
                  onChange={(e) => {
                    const [provider, ...modelParts] = e.target.value.split(':');
                    const model = modelParts.join(':');
                    saveSettings({
                      dualModelConfig: {
                        ...settings.dualModelConfig,
                        fastModel: { ...settings.dualModelConfig.fastModel, provider, model }
                      }
                    });
                  }}
                >
                  <optgroup label="🧠 OpenAI">
                    <option value="openai:gpt-5.2-2025-12-11">🤖 GPT-5.2 (Latest)</option>
                    <option value="openai:gpt-5.2">🧠 GPT-5.2 (Flagship)</option>
                    <option value="openai:gpt-4o">🧠 GPT-4o</option>
                    <option value="openai:gpt-4o-mini">⚡ GPT-4o Mini</option>
                  </optgroup>
                  <optgroup label="🦙 Ollama">
                    <option value="ollama:deepseek-v3.2:cloud">🚀 DeepSeek v3.2 (NEW!)</option>
                    <option value="ollama:glm-4.7:cloud">🌟 GLM-4.7 (NEW!)</option>
                    <option value="ollama:devstral-small-2:24b-cloud">⚡ Devstral Small (24B)</option>
                    <option value="ollama:qwen3-coder:480b-cloud">🧠 Qwen 3 Coder (480B)</option>
                    <option value="ollama:deepseek-v3.1:671b-cloud">🔍 DeepSeek v3.1 (671B)</option>
                    <option value="ollama:qwen2.5-coder:7b">⚡ Qwen 2.5 Coder (7B)</option>
                    <option value="ollama:qwen2.5-coder:32b">🧠 Qwen 2.5 Coder (32B)</option>
                  </optgroup>
                  <optgroup label="🎭 Anthropic">
                    <option value="anthropic:claude-opus-4-6">🧠 Claude Opus 4.6</option>
                    <option value="anthropic:claude-opus-4-5-20251101">🧠 Claude Opus 4.5</option>
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
            </div>

            {/* Deep Model - Unified Dropdown */}
            <div className="model-config-card deep">
              <div className="model-config-header">
                <span className="model-icon">🧠</span>
                <h4>Deep Model</h4>
                <span className="model-badge">Complex reasoning</span>
              </div>
              <div className="setting-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.dualModelConfig.deepModel?.enabled ?? true}
                    onChange={(e) => saveSettings({
                      dualModelConfig: {
                        ...settings.dualModelConfig,
                        deepModel: { ...settings.dualModelConfig.deepModel, enabled: e.target.checked }
                      }
                    })}
                  />
                  Enabled
                </label>
              </div>
              <div className="setting-item">
                <label>Model (All Providers)</label>
                <select
                  value={`${settings.dualModelConfig.deepModel?.provider || 'openai'}:${settings.dualModelConfig.deepModel?.model || ''}`}
                  onChange={(e) => {
                    const [provider, ...modelParts] = e.target.value.split(':');
                    const model = modelParts.join(':');
                    saveSettings({
                      dualModelConfig: {
                        ...settings.dualModelConfig,
                        deepModel: { ...settings.dualModelConfig.deepModel, provider, model }
                      }
                    });
                  }}
                >
                  <optgroup label="🧠 OpenAI">
                    <option value="openai:gpt-5.2-2025-12-11">🤖 GPT-5.2 (Latest)</option>
                    <option value="openai:gpt-5.2">🧠 GPT-5.2 (Flagship)</option>
                    <option value="openai:gpt-4o">🧠 GPT-4o</option>
                    <option value="openai:gpt-4o-mini">⚡ GPT-4o Mini</option>
                  </optgroup>
                  <optgroup label="🦙 Ollama">
                    <option value="ollama:deepseek-v3.2:cloud">🚀 DeepSeek v3.2 (NEW!)</option>
                    <option value="ollama:glm-4.7:cloud">🌟 GLM-4.7 (NEW!)</option>
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
            </div>

            {/* Auto-Routing */}
            <div className="auto-routing-config">
              <h4>🔀 Auto-Routing</h4>
              <div className="setting-item">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.dualModelConfig.autoRoute ?? true}
                    onChange={(e) => saveSettings({
                      dualModelConfig: {
                        ...settings.dualModelConfig,
                        autoRoute: e.target.checked
                      }
                    })}
                  />
                  Automatically route to best model based on task complexity
                </label>
              </div>

              {settings.dualModelConfig.autoRoute && (
                <>
                  <div className="setting-item">
                    <label>Complexity Threshold (1-10)</label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={settings.dualModelConfig.complexityThreshold ?? 6}
                      onChange={(e) => saveSettings({
                        dualModelConfig: {
                          ...settings.dualModelConfig,
                          complexityThreshold: parseInt(e.target.value)
                        }
                      })}
                    />
                    <span className="threshold-value">
                      {settings.dualModelConfig.complexityThreshold ?? 6}
                      <small> (higher = more uses deep model)</small>
                    </span>
                  </div>

                  <div className="setting-item">
                    <label>Deep Model Triggers (comma-separated)</label>
                    <input
                      type="text"
                      value={(settings.dualModelConfig.deepModelTriggers || []).join(', ')}
                      onChange={(e) => saveSettings({
                        dualModelConfig: {
                          ...settings.dualModelConfig,
                          deepModelTriggers: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                        }
                      })}
                      placeholder="e.g., analyze, debug, refactor, explain"
                    />
                  </div>

                  <div className="setting-item">
                    <label>Fast Model Triggers (comma-separated)</label>
                    <input
                      type="text"
                      value={(settings.dualModelConfig.fastModelTriggers || []).join(', ')}
                      onChange={(e) => saveSettings({
                        dualModelConfig: {
                          ...settings.dualModelConfig,
                          fastModelTriggers: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                        }
                      })}
                      placeholder="e.g., quick, simple, format, rename"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Provider Configurations */}
      <div className="settings-section">
        <h3>Provider Configurations</h3>

        {/* Ollama */}
        <div className="provider-config">
          <h4>Ollama</h4>
          <div className="setting-item">
            <label htmlFor="ollama-endpoint">Endpoint</label>
            <input
              id="ollama-endpoint"
              type="text"
              value={settings.providers.ollama?.baseUrl || settings.providers.ollama?.endpoint || ''}
              onChange={(e) => updateProviderConfig('ollama', { baseUrl: e.target.value, endpoint: e.target.value })}
              placeholder="http://localhost:11434"
            />
          </div>
        </div>

        {/* Ollama Secondary */}
        <div className="provider-config">
          <h4>Ollama Secondary</h4>
          <div className="setting-item">
            <label htmlFor="ollama-secondary-endpoint">Endpoint</label>
            <input
              id="ollama-secondary-endpoint"
              type="text"
              value={settings.providers.ollamaSecondary?.baseUrl || settings.providers.ollamaSecondary?.endpoint || ''}
              onChange={(e) => updateProviderConfig('ollamaSecondary', { baseUrl: e.target.value, endpoint: e.target.value })}
              placeholder="http://localhost:11435"
            />
          </div>
        </div>

        {/* Anthropic */}
        <div className="provider-config">
          <h4>Anthropic</h4>
          <div className="setting-item">
            <label htmlFor="anthropic-api-key">API Key</label>
            <input
              id="anthropic-api-key"
              type="password"
              value={settings.providers.anthropic?.apiKey || ''}
              onChange={(e) => updateProviderConfig('anthropic', { apiKey: e.target.value })}
              placeholder="sk-ant-..."
            />
          </div>
          <div className="setting-item">
            <label htmlFor="anthropic-endpoint">Endpoint (optional)</label>
            <input
              id="anthropic-endpoint"
              type="text"
              value={settings.providers.anthropic?.baseUrl || settings.providers.anthropic?.endpoint || ''}
              onChange={(e) => updateProviderConfig('anthropic', { baseUrl: e.target.value, endpoint: e.target.value })}
              placeholder="https://api.anthropic.com"
            />
          </div>
        </div>

        {/* OpenAI */}
        <div className="provider-config">
          <h4>OpenAI</h4>
          <div className="setting-item">
            <label htmlFor="openai-api-key">API Key</label>
            <input
              id="openai-api-key"
              type="password"
              value={settings.providers.openai?.apiKey || ''}
              onChange={(e) => updateProviderConfig('openai', { apiKey: e.target.value })}
              placeholder="sk-..."
            />
          </div>
          <div className="setting-item">
            <label htmlFor="openai-endpoint">Endpoint (optional)</label>
            <input
              id="openai-endpoint"
              type="text"
              value={settings.providers.openai?.baseUrl || settings.providers.openai?.endpoint || ''}
              onChange={(e) => updateProviderConfig('openai', { baseUrl: e.target.value, endpoint: e.target.value })}
              placeholder="https://api.openai.com"
            />
          </div>
        </div>

        {/* OpenRouter */}
        <div className="provider-config">
          <h4>OpenRouter</h4>
          <div className="setting-item">
            <label htmlFor="openrouter-api-key">API Key</label>
            <input
              id="openrouter-api-key"
              type="password"
              value={settings.providers.openrouter?.apiKey || ''}
              onChange={(e) => updateProviderConfig('openrouter', { apiKey: e.target.value })}
              placeholder="sk-or-v1-..."
            />
          </div>
          <div className="setting-item">
            <label htmlFor="openrouter-endpoint">Endpoint (optional)</label>
            <input
              id="openrouter-endpoint"
              type="text"
              value={settings.providers.openrouter?.baseUrl || settings.providers.openrouter?.endpoint || ''}
              onChange={(e) => updateProviderConfig('openrouter', { baseUrl: e.target.value, endpoint: e.target.value })}
              placeholder="https://openrouter.ai/api"
            />
          </div>
        </div>
      </div>

      {/* Asset Manager */}
      <div className="settings-section">
        <h3>🎨 Asset Manager</h3>
        <p className="settings-description">
          Browse and download free game assets from trusted sources. Perfect for Diablo 2 style games!
        </p>
        <div className="setting-item">
          <button
            className="asset-manager-btn"
            onClick={() => setShowAssetManager(true)}
          >
            🎨 Open Asset Manager
          </button>
          <p className="setting-hint">
            Access free 3D models, textures, sprites, and audio from Poly Pizza, Kenney.nl, Polyhaven, and more.
          </p>
        </div>
      </div>

      {/* Save Status */}
      {saving && (
        <div className="save-status">
          <div className="spinner small"></div>
          <span>Saving...</span>
        </div>
      )}

      {/* Asset Manager Modal */}
      <AssetManager
        isOpen={showAssetManager}
        onClose={() => setShowAssetManager(false)}
      />
    </div>
  );
};

export default Settings;
