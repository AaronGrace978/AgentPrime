/**
 * BrainSelector - Instant/Standard/Deep budget toggle with organized model configuration
 */

import React, { useState } from 'react';
import { DualMode, BrainConfig } from '../types';
import {
  PROVIDER_OPTIONS,
  getModelLabel,
  getModelOptionsForProvider,
  getProviderLabel
} from '../constants';

interface BrainSelectorProps {
  mode: DualMode;
  brainConfig: BrainConfig;
  onModeChange: (mode: DualMode) => void;
  onConfigChange: (config: Partial<BrainConfig>) => void;
}

type BrainModelKey = 'fastModel' | 'deepModel';

export const BrainSelector: React.FC<BrainSelectorProps> = ({
  mode,
  brainConfig,
  onModeChange,
  onConfigChange
}) => {
  const [showConfig, setShowConfig] = useState(false);

  const modeButtonStyle = (buttonMode: DualMode) => ({
    padding: '6px 12px',
    border: 'none',
    borderRadius: '7px',
    fontSize: '12px',
    fontWeight: mode === buttonMode ? '700' as const : '600' as const,
    fontFamily: 'inherit',
    cursor: 'pointer' as const,
    transition: 'all 0.12s ease',
    background: mode === buttonMode ? 'var(--prime-accent)' : 'transparent',
    color: mode === buttonMode ? '#ffffff' : 'var(--prime-text-secondary)',
    boxShadow: mode === buttonMode ? '0 6px 14px rgba(59, 130, 246, 0.22)' : 'none'
  });

  const updateModel = (key: BrainModelKey, nextProvider: string, nextModel: string) => {
    onConfigChange({
      [key]: {
        ...brainConfig[key],
        provider: nextProvider,
        model: nextModel
      }
    });
  };

  const handleProviderChange = (key: BrainModelKey, nextProvider: string) => {
    const options = getModelOptionsForProvider(nextProvider);
    const currentModel = brainConfig[key].model;
    const nextModel = options.some((option) => option.value === currentModel)
      ? currentModel
      : (options[0]?.value || currentModel);
    updateModel(key, nextProvider, nextModel);
  };

  const handleModelChange = (key: BrainModelKey, nextModel: string) => {
    updateModel(key, brainConfig[key].provider, nextModel);
  };

  const renderModelEditor = (
    key: BrainModelKey,
    title: string,
    description: string,
    accentColor: string
  ) => {
    const current = brainConfig[key];
    const options = getModelOptionsForProvider(current.provider);

    return (
      <div style={{
        border: '1px solid var(--prime-border)',
        borderRadius: '12px',
        padding: '14px',
        background: 'var(--prime-bg)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '12px'
        }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--prime-text)' }}>
              {title}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--prime-text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
              {description}
            </div>
          </div>
          <div style={{
            padding: '4px 8px',
            borderRadius: '999px',
            background: `${accentColor}1A`,
            border: `1px solid ${accentColor}40`,
            color: accentColor,
            fontSize: '10px',
            fontWeight: '700',
            whiteSpace: 'nowrap'
          }}>
            {getProviderLabel(current.provider)}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '8px' }}>
          <select
            value={current.provider}
            onChange={(e) => handleProviderChange(key, e.target.value)}
            style={{
              width: '100%',
              padding: '9px 10px',
              borderRadius: '8px',
              border: '1px solid var(--prime-border)',
              background: 'var(--prime-surface)',
              color: 'var(--prime-text)',
              fontSize: '13px',
              fontFamily: 'inherit',
              cursor: 'pointer'
            }}
          >
            {PROVIDER_OPTIONS.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>

          <select
            value={current.model}
            onChange={(e) => handleModelChange(key, e.target.value)}
            style={{
              width: '100%',
              padding: '9px 10px',
              borderRadius: '8px',
              border: '1px solid var(--prime-border)',
              background: 'var(--prime-surface)',
              color: 'var(--prime-text)',
              fontSize: '13px',
              fontFamily: 'inherit',
              cursor: 'pointer'
            }}
          >
            {options.map((option) => (
              <option key={`${current.provider}:${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{
          marginTop: '10px',
          fontSize: '11px',
          color: 'var(--prime-text-muted)',
          lineHeight: 1.4
        }}>
          Current: <span style={{ color: 'var(--prime-text)' }}>{getModelLabel(current.provider, current.model)}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
        background: 'var(--prime-surface)',
        padding: '3px',
        borderRadius: '10px',
        border: '1px solid var(--prime-border)'
      }}>
        <button
          onClick={() => onModeChange('instant')}
          style={modeButtonStyle('instant')}
          title={`Instant - keep turns fast with ${getModelLabel(brainConfig.fastModel.provider, brainConfig.fastModel.model)}`}
        >
          Instant
        </button>
        <button
          onClick={() => onModeChange('standard')}
          style={modeButtonStyle('standard')}
          title={`Standard - default budget between ${getModelLabel(brainConfig.fastModel.provider, brainConfig.fastModel.model)} and ${getModelLabel(brainConfig.deepModel.provider, brainConfig.deepModel.model)}`}
        >
          Standard
        </button>
        <button
          onClick={() => onModeChange('deep')}
          style={modeButtonStyle('deep')}
          title={`Deep - maximum reflection with ${getModelLabel(brainConfig.deepModel.provider, brainConfig.deepModel.model)}`}
        >
          Deep
        </button>
        <button
          onClick={() => setShowConfig(!showConfig)}
          style={{
            padding: '6px 8px',
            border: 'none',
            borderRadius: '7px',
            fontSize: '12px',
            fontWeight: '600',
            fontFamily: 'inherit',
            cursor: 'pointer',
            background: showConfig ? 'var(--prime-surface-hover)' : 'transparent',
            color: showConfig ? 'var(--prime-text)' : 'var(--prime-text-muted)',
            transition: 'all 0.12s ease'
          }}
          title="Configure fast and deep models"
        >
          Models
        </button>
      </div>

      {showConfig && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '8px',
          background: 'var(--prime-surface)',
          border: '1px solid var(--prime-border)',
          borderRadius: '14px',
          padding: '16px',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.18)',
          zIndex: 100,
          minWidth: '360px',
          maxWidth: '420px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '14px'
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--prime-text)' }}>
                Runtime budget
              </div>
              <div style={{ fontSize: '11px', color: 'var(--prime-text-muted)', marginTop: '4px' }}>
                Keep instant and deep models organized by provider.
              </div>
            </div>
            <button
              onClick={() => setShowConfig(false)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--prime-text-muted)',
                fontSize: '16px',
                fontFamily: 'inherit',
                padding: 0
              }}
              aria-label="Close model configuration"
            >
              x
            </button>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            marginBottom: '12px'
          }}>
            <div style={{
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'var(--prime-bg)',
              border: '1px solid var(--prime-border)'
            }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--prime-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Fast
              </div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--prime-text)', marginTop: '6px' }}>
                {getModelLabel(brainConfig.fastModel.provider, brainConfig.fastModel.model)}
              </div>
            </div>
            <div style={{
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'var(--prime-bg)',
              border: '1px solid var(--prime-border)'
            }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--prime-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Deep
              </div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--prime-text)', marginTop: '6px' }}>
                {getModelLabel(brainConfig.deepModel.provider, brainConfig.deepModel.model)}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            {renderModelEditor('fastModel', 'Fast model', 'Best for quick asks, edits, and lightweight code generation.', 'var(--prime-blue)')}
            {renderModelEditor('deepModel', 'Deep model', 'Best for planning, debugging, larger edits, and deeper reasoning.', 'var(--prime-purple)')}
          </div>

          <p style={{ margin: '12px 0 0', fontSize: '11px', color: 'var(--prime-text-muted)', textAlign: 'center' }}>
            Changes sync with Settings in real time.
          </p>
        </div>
      )}
    </div>
  );
};

export default BrainSelector;
