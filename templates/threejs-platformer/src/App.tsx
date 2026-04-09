import { useEffect, useRef } from 'react';
import { Game } from './game/Game';
import './styles.css';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const game = new Game(containerRef.current);
    gameRef.current = game;
    game.animate();

    return () => {
      gameRef.current?.dispose();
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="game-panel" ref={containerRef} />

      <div className="hud">
        <div className="hud-card hero-card">
          <div className="eyebrow">Deterministic Template</div>
          <h1>Three.js Platformer</h1>
          <p className="subtitle">
            A playful side-scroller baseline with layered platforms, responsive movement, and a
            clean path for further level design.
          </p>
        </div>

        <div className="hud-card metrics-card">
          <div className="metric">
            <span className="metric-label">Score</span>
            <strong className="metric-value" id="score-value">
              0 / 0
            </strong>
          </div>
          <div className="metric">
            <span className="metric-label">Status</span>
            <strong className="metric-value" id="status-value">
              Ready
            </strong>
          </div>
        </div>

        <div className="hud-card controls-card">
          <h2>Controls</h2>
          <div className="controls-grid">
            <div className="control-row">
              <span className="control-key">A / D</span>
              <span className="control-label">Run left / right</span>
            </div>
            <div className="control-row">
              <span className="control-key">W / S</span>
              <span className="control-label">Shift lane depth</span>
            </div>
            <div className="control-row">
              <span className="control-key">Space</span>
              <span className="control-label">Jump</span>
            </div>
            <div className="control-row">
              <span className="control-key">R</span>
              <span className="control-label">Restart the run</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
