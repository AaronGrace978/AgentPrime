/**
 * AIChat Component - Re-export from modular structure
 * 
 * The AIChat component has been refactored from 1,632 lines to a modular architecture:
 * 
 * - AIChat/types.ts        - Type definitions
 * - AIChat/constants.ts    - Model options, prompts, etc.
 * - AIChat/hooks/          - Custom hooks (useDualModel, usePythonBrain, useWorkspace)
 * - AIChat/components/     - Sub-components (ChatHeader, MessageList, ChatInput, etc.)
 * - AIChat/index.tsx       - Main component (~350 lines)
 * 
 * This file maintains backward compatibility for existing imports.
 */

export { default } from './AIChat/index';
export * from './AIChat/types';
