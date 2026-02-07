/**
 * Renderer-specific type declarations
 */

import type { AgentAPI } from '../types/ipc';

declare global {
  interface Window {
    agentAPI: AgentAPI;
  }
}

export {};
