import { useEffect, useRef } from 'react';
import { Game } from './game/Game';
import './styles.css';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize game
    const game = new Game(containerRef.current);
    gameRef.current = game;
    game.animate();

    return () => {
      game.dispose();
    };
  }, []);

  return (
    <div className="game-container">
      <div ref={containerRef} className="game-canvas" />
      <div className="ui-overlay">
        <div className="instructions">
          <h2>🎮 Controls</h2>
          <p>WASD - Move</p>
          <p>Space - Jump</p>
          <p>Mouse - Look around</p>
          <p>Click to lock pointer</p>
        </div>
      </div>
    </div>
  );
}

export default App;

