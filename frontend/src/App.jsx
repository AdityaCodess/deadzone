import { useEffect, useRef } from 'react';
import { Lobby3D } from './ui/Lobby3D.js';
import { GameEngine } from './core/GameEngine.js'; // Adjust path if GameEngine is in ./GameEngine.js

export default function App() {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let activeEngine = null;
    const lobby = new Lobby3D(canvasRef.current, (launchOptions) => {
      activeEngine = new GameEngine(canvasRef.current, launchOptions);
      activeEngine.init();
    });

    return () => {
      lobby.cleanup();
      if (activeEngine) activeEngine.cleanup();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      style={{ width: '100vw', height: '100vh', display: 'block', outline: 'none' }}
    />
  );
}