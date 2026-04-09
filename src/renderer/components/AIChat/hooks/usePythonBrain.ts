/**
 * usePythonBrain - Hook for managing Python Brain (orchestrator + memory) connection
 */

import { useState, useEffect, useCallback } from 'react';
import { PythonBrainStatus } from '../types';

interface UsePythonBrainReturn {
  status: PythonBrainStatus;
  isConnected: boolean;
  routeMessage: (message: string, context: any) => Promise<any>;
  recordOutcome: (message: string, success: boolean, model: string, steps: number) => Promise<void>;
}

export function usePythonBrain(): UsePythonBrainReturn {
  const [status, setStatus] = useState<PythonBrainStatus>({
    enabled: false,
    connected: false,
    memories: 0,
    patterns: 0,
    lastCheck: null
  });

  // Check Python Brain status periodically
  useEffect(() => {
    const checkBrainStatus = async () => {
      try {
        const api = window.agentAPI as any;
        const statusSummary = typeof api?.getSystemStatusSummary === 'function'
          ? await api.getSystemStatusSummary().catch(() => null)
          : null;
        const brainEnabled = statusSummary?.success ? statusSummary.status?.brain?.enabled === true : false;

        if (!brainEnabled) {
          setStatus({
            enabled: false,
            connected: false,
            memories: 0,
            patterns: 0,
            lastCheck: new Date()
          });
          return;
        }

        if (api?.brainAvailable) {
          const isConnected = await api.brainAvailable();
          if (isConnected) {
            const stats = await api.brainStats();
            setStatus({
              enabled: true,
              connected: true,
              memories: stats?.memory?.total_memories || 0,
              patterns: stats?.memory?.total_code_patterns || 0,
              lastCheck: new Date()
            });
            console.log('[AIChat] 🧠 Python Brain connected:', stats);
          } else {
            setStatus(prev => ({
              ...prev,
              enabled: true,
              connected: false,
              lastCheck: new Date()
            }));
          }
        }
      } catch (error) {
        console.warn('[AIChat] Python Brain not available:', error);
        setStatus(prev => ({
          ...prev,
          enabled: prev.enabled,
          connected: false,
          lastCheck: new Date()
        }));
      }
    };
    
    // Check on mount
    checkBrainStatus();
    
    // Re-check every 30 seconds
    const interval = setInterval(checkBrainStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Route message through Python Brain
  const routeMessage = useCallback(async (message: string, context: any) => {
    if (!status.connected) return null;
    
    try {
      const api = window.agentAPI as any;
      if (api?.brainRoute) {
        return await api.brainRoute(message, context);
      }
    } catch (error) {
      console.warn('[AIChat] Brain routing failed:', error);
    }
    return null;
  }, [status.connected]);

  // Record outcome for learning
  const recordOutcome = useCallback(async (
    message: string, 
    success: boolean, 
    model: string, 
    steps: number
  ) => {
    if (!status.connected) return;
    
    try {
      const api = window.agentAPI as any;
      if (api?.brainRecordOutcome) {
        await api.brainRecordOutcome(message, success, model, steps);
        console.log('[AIChat] 🧠 Recorded outcome:', success ? 'success' : 'failure');
      }
    } catch (error) {
      // Non-critical, don't interrupt flow
    }
  }, [status.connected]);

  return {
    status,
    isConnected: status.connected,
    routeMessage,
    recordOutcome
  };
}

export default usePythonBrain;

