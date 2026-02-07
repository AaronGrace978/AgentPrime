/**
 * AgentPrime - Main Renderer Application
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../components/App';
import '../styles.css';

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
