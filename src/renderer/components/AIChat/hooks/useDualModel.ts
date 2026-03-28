/**
 * useDualModel - Hook for managing dual model (fast/deep) routing state
 */

import { useState, useEffect, useCallback } from 'react';
import { DualModelState, BrainConfig, DualMode } from '../types';
import { DEFAULT_BRAIN_CONFIG, DEFAULT_DUAL_MODEL_STATE } from '../constants';

interface UseDualModelReturn {
  dualModel: DualModelState;
  brainConfig: BrainConfig;
  setMode: (mode: DualMode) => void;
  saveBrainConfig: (newConfig: Partial<BrainConfig>) => Promise<void>;
}

export function useDualModel(): UseDualModelReturn {
  const [dualModel, setDualModel] = useState<DualModelState>(DEFAULT_DUAL_MODEL_STATE);
  const [brainConfig, setBrainConfig] = useState<BrainConfig>(DEFAULT_BRAIN_CONFIG);

  // Listen for dual model routing updates from main process
  useEffect(() => {
    const handleRouting = (event: any, data: any) => {
      console.log('[DualModel] Routing event received:', data);
      setDualModel(prev => ({
        ...prev,
        currentModel: data.model,
        currentProvider: data.provider,
        lastComplexity: data.complexity,
        lastReasoning: data.reasoning,
        mode: data.mode
      }));
    };
    
    if (window.agentAPI && window.agentAPI.on) {
      window.agentAPI.on('dual-model-routing', handleRouting);
    }
    
    return () => {
      if (window.agentAPI && window.agentAPI.removeListener) {
        window.agentAPI.removeListener('dual-model-routing');
      }
    };
  }, []);

  // Load dual model config from settings
  const loadConfig = useCallback(async () => {
    try {
      const settings = await window.agentAPI.getSettings();
      if (settings?.dualModelEnabled && settings?.dualModelConfig) {
        setDualModel(prev => ({ ...prev, enabled: true }));
        
        if (settings.dualModelConfig.fastModel) {
          setBrainConfig(prev => ({
            ...prev,
            fastModel: {
              provider: settings.dualModelConfig.fastModel.provider || 'anthropic',
              model: settings.dualModelConfig.fastModel.model || 'claude-sonnet-4-20250514',
              enabled: settings.dualModelConfig.fastModel.enabled ?? true
            }
          }));
        }
        if (settings.dualModelConfig.deepModel) {
          setBrainConfig(prev => ({
            ...prev,
            deepModel: {
              provider: settings.dualModelConfig.deepModel.provider || 'anthropic',
              model: settings.dualModelConfig.deepModel.model || 'claude-sonnet-4-20250514',
              enabled: settings.dualModelConfig.deepModel.enabled ?? true
            }
          }));
        }
      }
    } catch (error) {
      console.error('Failed to load dual model config:', error);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Listen for settings changes from other components (real-time sync)
  useEffect(() => {
    const handleSettingsChanged = () => {
      console.log('[DualModel] Settings changed, reloading config...');
      loadConfig();
    };

    // Listen for custom event from Settings component
    window.addEventListener('agentprime-settings-changed', handleSettingsChanged);
    
    // Also listen for IPC if available
    if (window.agentAPI && window.agentAPI.on) {
      window.agentAPI.on('settings-changed', handleSettingsChanged);
    }

    return () => {
      window.removeEventListener('agentprime-settings-changed', handleSettingsChanged);
      if (window.agentAPI && window.agentAPI.removeListener) {
        window.agentAPI.removeListener('settings-changed');
      }
    };
  }, [loadConfig]);

  // Set mode helper
  const setMode = useCallback((mode: DualMode) => {
    setDualModel(prev => ({ ...prev, mode, enabled: true }));
  }, []);

  // Save brain config to settings
  const saveBrainConfig = useCallback(async (newConfig: Partial<BrainConfig>) => {
    const updatedConfig = { ...brainConfig, ...newConfig };
    setBrainConfig(updatedConfig);
    
    try {
      const currentSettings = await window.agentAPI.getSettings();
      const existingDualConfig = currentSettings?.dualModelConfig || {};
      
      const updatedSettings = await window.agentAPI.updateSettings({
        dualModelEnabled: true,
        dualModelConfig: {
          ...existingDualConfig,
          fastModel: updatedConfig.fastModel,
          deepModel: updatedConfig.deepModel,
          autoRoute: existingDualConfig.autoRoute ?? true,
          complexityThreshold: existingDualConfig.complexityThreshold ?? 6,
          deepModelTriggers: existingDualConfig.deepModelTriggers ?? ['analyze', 'debug', 'refactor', 'explain'],
          fastModelTriggers: existingDualConfig.fastModelTriggers ?? ['quick', 'simple', 'format', 'rename']
        }
      });
      
      // Dispatch custom event for real-time sync with Settings component
      window.dispatchEvent(new CustomEvent('agentprime-settings-changed', { 
        detail: updatedSettings 
      }));
      console.log('[AIChat] Brain config saved and synced');
    } catch (error) {
      console.error('Failed to save brain config:', error);
    }
  }, [brainConfig]);

  // Update complexity from routing
  const updateComplexity = useCallback((complexity: number, reasoning: string) => {
    setDualModel(prev => ({
      ...prev,
      lastComplexity: complexity,
      lastReasoning: reasoning
    }));
  }, []);

  return {
    dualModel,
    brainConfig,
    setMode,
    saveBrainConfig
  };
}

export default useDualModel;

