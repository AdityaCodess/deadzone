import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyConfig = {
  '/api': {
    target: 'http://127.0.0.1:3001',
    changeOrigin: true,
    secure: false
  },
  // This is what forwards the Colyseus API to the backend!
  '/matchmake': {
    target: 'http://127.0.0.1:3001',
    changeOrigin: true,
    secure: false
  }
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    headers: {
      'ngrok-skip-browser-warning': 'true',
      'Access-Control-Allow-Origin': '*'
    },
    proxy: proxyConfig
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    headers: {
      'ngrok-skip-browser-warning': 'true',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=31536000'
    },
    proxy: proxyConfig
  },
  assetsInclude: ['**/*.gltf', '**/*.glb', '**/*.bin']
});