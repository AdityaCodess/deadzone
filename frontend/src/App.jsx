import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from './core/GameEngine';

export default function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    engineRef.current = new GameEngine(canvasRef.current);
    
    engineRef.current.init().then(() => {
      setIsLoading(false);
    });

    const handleLockChange = () => {
      setIsPlaying(document.pointerLockElement === canvasRef.current);
    };

    document.addEventListener('pointerlockchange', handleLockChange);
    
    return () => {
      document.removeEventListener('pointerlockchange', handleLockChange);
      engineRef.current.cleanup();
    };
  }, []);

  const handleStart = () => {
    if (!isLoading && canvasRef.current) {
      canvasRef.current.requestPointerLock();
    }
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#000' }}>
      <canvas 
        ref={canvasRef} 
        style={{ display: 'block', width: '100%', height: '100%', outline: 'none' }} 
      />

      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: '4px', height: '4px', backgroundColor: 'white',
        transform: 'translate(-50%, -50%)', borderRadius: '50%',
        display: isPlaying ? 'block' : 'none', pointerEvents: 'none'
      }} />

      {!isPlaying && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontFamily: 'monospace'
        }}>
          <h1 style={{ color: '#ff4444', letterSpacing: '4px', fontSize: '3rem', margin: '0 0 10px 0' }}>DEAD ZONE</h1>
          <p style={{ fontSize: '1.2rem', color: '#ccc' }}>WASD to Move | Mouse to Look</p>
          <button 
            onClick={handleStart}
            disabled={isLoading}
            style={{
              padding: '15px 30px', fontSize: '1.2rem', marginTop: '30px', fontWeight: 'bold',
              backgroundColor: isLoading ? '#333' : '#ff4444', 
              color: 'white', border: 'none', cursor: isLoading ? 'wait' : 'pointer',
              transition: 'background-color 0.2s'
            }}
          >
            {isLoading ? 'LOADING ASSETS...' : 'CLICK TO ENTER'}
          </button>
        </div>
      )}
    </div>
  );
}