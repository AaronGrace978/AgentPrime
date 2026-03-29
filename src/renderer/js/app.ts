/**
 * AgentPrime - Main Renderer Application
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { loader } from '@monaco-editor/react';
import App from '../components/App';
import '../styles.css';

// Use locally bundled Monaco instead of CDN (CSP blocks external scripts)
loader.config({ paths: { vs: './monaco-editor/min/vs' } });

// Main app initialization
document.addEventListener('DOMContentLoaded', () => {
  console.log('AgentPrime renderer initialized');

  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(React.createElement(App));
  } else {
    console.error('Root element not found');
  }
});

// Export for module system
export {};
