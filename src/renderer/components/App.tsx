/**
 * App Component - Re-export from modular structure
 * 
 * The App component has been refactored from 1,134 lines to a modular architecture:
 * 
 * - App/types.ts         - Type definitions
 * - App/hooks/           - Custom hooks (useFileOperations, useTabManagement, etc.)
 * - App/components/      - Sub-components (AppHeader, WelcomeScreen, etc.)
 * - App/index.tsx        - Main component (~400 lines)
 * 
 * This file maintains backward compatibility for existing imports.
 */

export { default } from './App/index';
export * from './App/types';
