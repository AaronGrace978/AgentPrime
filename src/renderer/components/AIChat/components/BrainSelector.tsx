/**
 * BrainSelector - Fast/Auto/Deep mode toggle with config popover
 */

import React, { useState, useMemo } from 'react';
import { DualMode, BrainConfig } from '../types';
import { MODEL_OPTIONS } from '../constants';

interface BrainSelectorProps {
  mode: DualMode;
  brainConfig: BrainConfig;
  onModeChange: (mode: DualMode) => void;
  onConfigChange: (config: Partial<BrainConfig>) => void;
}

// Build unified model list from all providers
const buildUnifiedModelList = () => {
  const models: Array<{ value: string; label: string; provider: string }> = [];
  const providerEmojis: Record<string, string> = {
    ollama: '🦙',
    openai: '🧠',
    anthropic: '🎭',
    openrouter: '🌐'
  };

  // Add models from each provider
  for (const [provider, options] of Object.entries(MODEL_OPTIONS)) {
    for (const opt of options) {
      models.push({
        value: `${provider}:${opt.value}`,
        label: `${providerEmojis[provider] || '🤖'} ${opt.label} (${provider})`,
        provider
      });
    }
  }

  return models;
};

const UNIFIED_MODELS = buildUnifiedModelList();

export const BrainSelector: React.FC<BrainSelectorProps> = ({
  mode,
  brainConfig,
  onModeChange,
  onConfigChange
}) => {
  const [showConfig, setShowConfig] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: 'var(--prime-surface-hover)',
        padding: '4px',
        borderRadius: '12px',
        border: '1px solid var(--prime-border)'
      }}>
        <button
          onClick={() => onModeChange('fast')}
          style={{
            padding: '6px 14px',
            border: 'none',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: mode === 'fast' 
              ? `linear-gradient(135deg, var(--prime-amber), var(--prime-warning))` 
              : 'transparent',
            color: mode === 'fast' ? 'white' : 'var(--prime-text-secondary)',
            boxShadow: mode === 'fast' ? 'var(--prime-shadow-md)' : 'none'
          }}
          title={`⚡ Fast: ${brainConfig.fastModel.model.split(':')[0]}`}
        >
          ⚡ Fast
        </button>
        <button
          onClick={() => onModeChange('auto')}
          style={{
            padding: '6px 14px',
            border: 'none',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: mode === 'auto' 
              ? `linear-gradient(135deg, var(--prime-success), var(--prime-green))` 
              : 'transparent',
            color: mode === 'auto' ? 'white' : 'var(--prime-text-secondary)',
            boxShadow: mode === 'auto' ? 'var(--prime-shadow-md)' : 'none'
          }}
          title="🔀 Auto: Smart routing based on task complexity"
        >
          🔀 Auto
        </button>
        <button
          onClick={() => onModeChange('deep')}
          style={{
            padding: '6px 14px',
            border: 'none',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: mode === 'deep' 
              ? `linear-gradient(135deg, var(--prime-purple), var(--accent-secondary))` 
              : 'transparent',
            color: mode === 'deep' ? 'white' : 'var(--prime-text-secondary)',
            boxShadow: mode === 'deep' ? 'var(--prime-shadow-md)' : 'none'
          }}
          title={`🧠 Deep: ${brainConfig.deepModel.model.split(':')[0]}`}
        >
          🧠 Deep
        </button>
        <button
          onClick={() => setShowConfig(!showConfig)}
          style={{
            padding: '6px 8px',
            border: 'none',
            borderRadius: '8px',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: showConfig ? 'var(--prime-border)' : 'transparent',
            color: 'var(--prime-text-secondary)'
          }}
          title="Configure brain models"
        >
          ⚙️
        </button>
      </div>

      {/* Config Popover */}
      {showConfig && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '0',
          marginTop: '8px',
          background: 'var(--prime-surface)',
          border: '1px solid var(--prime-border)',
          borderRadius: '12px',
          padding: '16px',
          boxShadow: 'var(--prime-shadow-lg)',
          zIndex: 100,
          minWidth: '320px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--prime-text)' }}>
              🧠 Configure AI Brains
            </h4>
            <button
              onClick={() => setShowConfig(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--prime-text-muted)', fontSize: '16px' }}
            >
              ×
            </button>
          </div>

          {/* Fast Brain Config - Single Unified Dropdown */}
          <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--prime-accent-light)', borderRadius: '8px', border: '1px solid var(--prime-amber)' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--prime-amber)', marginBottom: '8px' }}>
              ⚡ Fast Brain
            </div>
            <select
              value={`${brainConfig.fastModel.provider}:${brainConfig.fastModel.model}`}
              onChange={(e) => {
                const [provider, ...modelParts] = e.target.value.split(':');
                const model = modelParts.join(':');
                onConfigChange({ 
                  fastModel: { ...brainConfig.fastModel, provider, model }
                });
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--prime-border)',
                fontSize: '13px',
                background: 'var(--prime-surface)',
                color: 'var(--prime-text)'
              }}
            >
              <optgroup label="🧠 OpenAI">
                {MODEL_OPTIONS.openai?.map(opt => (
                  <option key={`openai:${opt.value}`} value={`openai:${opt.value}`}>{opt.label}</option>
                ))}
              </optgroup>
              <optgroup label="🦙 Ollama">
                {MODEL_OPTIONS.ollama?.map(opt => (
                  <option key={`ollama:${opt.value}`} value={`ollama:${opt.value}`}>{opt.label}</option>
                ))}
              </optgroup>
              <optgroup label="🎭 Anthropic">
                {MODEL_OPTIONS.anthropic?.map(opt => (
                  <option key={`anthropic:${opt.value}`} value={`anthropic:${opt.value}`}>{opt.label}</option>
                ))}
              </optgroup>
              <optgroup label="🌐 OpenRouter">
                {MODEL_OPTIONS.openrouter?.map(opt => (
                  <option key={`openrouter:${opt.value}`} value={`openrouter:${opt.value}`}>{opt.label}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Deep Brain Config - Single Unified Dropdown */}
          <div style={{ padding: '12px', background: 'var(--prime-accent-light)', borderRadius: '8px', border: '1px solid var(--prime-purple)' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--prime-purple)', marginBottom: '8px' }}>
              🧠 Deep Brain
            </div>
            <select
              value={`${brainConfig.deepModel.provider}:${brainConfig.deepModel.model}`}
              onChange={(e) => {
                const [provider, ...modelParts] = e.target.value.split(':');
                const model = modelParts.join(':');
                onConfigChange({ 
                  deepModel: { ...brainConfig.deepModel, provider, model }
                });
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--prime-border)',
                fontSize: '13px',
                background: 'var(--prime-surface)',
                color: 'var(--prime-text)'
              }}
            >
              <optgroup label="🧠 OpenAI">
                {MODEL_OPTIONS.openai?.map(opt => (
                  <option key={`openai:${opt.value}`} value={`openai:${opt.value}`}>{opt.label}</option>
                ))}
              </optgroup>
              <optgroup label="🦙 Ollama">
                {MODEL_OPTIONS.ollama?.map(opt => (
                  <option key={`ollama:${opt.value}`} value={`ollama:${opt.value}`}>{opt.label}</option>
                ))}
              </optgroup>
              <optgroup label="🎭 Anthropic">
                {MODEL_OPTIONS.anthropic?.map(opt => (
                  <option key={`anthropic:${opt.value}`} value={`anthropic:${opt.value}`}>{opt.label}</option>
                ))}
              </optgroup>
              <optgroup label="🌐 OpenRouter">
                {MODEL_OPTIONS.openrouter?.map(opt => (
                  <option key={`openrouter:${opt.value}`} value={`openrouter:${opt.value}`}>{opt.label}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <p style={{ margin: '12px 0 0', fontSize: '11px', color: 'var(--prime-text-muted)', textAlign: 'center' }}>
            Changes sync automatically with Settings
          </p>
        </div>
      )}
    </div>
  );
};

export default BrainSelector;

