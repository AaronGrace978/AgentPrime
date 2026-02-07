import React, { useState, useEffect } from 'react';

function App() {
  const [version, setVersion] = useState<string>('');
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    // Get app info from Electron
    if (window.electronAPI) {
      window.electronAPI.getAppVersion().then(setVersion);
      window.electronAPI.getPlatform().then(setPlatform);
    }
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <h1>{{projectName}}</h1>
        </div>
        <p className="tagline">{{description}}</p>
      </header>

      <main className="app-main">
        <div className="card">
          <h2>Welcome!</h2>
          <p>Your Electron + React app is ready to go.</p>
          
          <div className="info-grid">
            <div className="info-item">
              <span className="label">Platform</span>
              <span className="value">{platform || 'Loading...'}</span>
            </div>
            <div className="info-item">
              <span className="label">Version</span>
              <span className="value">{version || '1.0.0'}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Getting Started</h2>
          <ul className="feature-list">
            <li>Edit <code>src/renderer/App.tsx</code> to modify this page</li>
            <li>Edit <code>src/main/main.ts</code> for Electron configuration</li>
            <li>Add IPC handlers in <code>src/main/preload.ts</code></li>
          </ul>
        </div>
      </main>

      <footer className="app-footer">
        <p>Created with AgentPrime 🚀</p>
      </footer>
    </div>
  );
}

export default App;
