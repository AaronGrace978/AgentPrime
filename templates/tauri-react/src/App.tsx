import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

function App() {
  const [greeting, setGreeting] = useState('');
  const [name, setName] = useState('');

  async function greet() {
    const response = await invoke<string>('greet', { name });
    setGreeting(response);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <span className="logo-icon">🦀</span>
          <h1>{{projectName}}</h1>
        </div>
        <p className="tagline">{{description}}</p>
      </header>

      <main className="app-main">
        <div className="card">
          <h2>Welcome to Tauri!</h2>
          <p>Your lightweight desktop app is ready.</p>
          
          <div className="greet-form">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name..."
            />
            <button onClick={greet}>Greet</button>
          </div>
          
          {greeting && (
            <div className="greeting">
              <p>{greeting}</p>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Getting Started</h2>
          <ul className="feature-list">
            <li>Edit <code>src/App.tsx</code> for React UI</li>
            <li>Edit <code>src-tauri/src/main.rs</code> for Rust backend</li>
            <li>Add Tauri commands with <code>#[tauri::command]</code></li>
          </ul>
        </div>

        <div className="card benefits">
          <h2>Why Tauri?</h2>
          <div className="benefit-grid">
            <div className="benefit">
              <span className="benefit-icon">📦</span>
              <span>~10MB bundle</span>
            </div>
            <div className="benefit">
              <span className="benefit-icon">⚡</span>
              <span>Native speed</span>
            </div>
            <div className="benefit">
              <span className="benefit-icon">🔒</span>
              <span>Secure by default</span>
            </div>
            <div className="benefit">
              <span className="benefit-icon">🦀</span>
              <span>Rust-powered</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>Created with AgentPrime 🚀</p>
      </footer>
    </div>
  );
}

export default App;
