import * as THREE from 'three';

export class AudioManager {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.audioLoader = new THREE.AudioLoader();
    this.buffers = {}; 
    
    this.activeContext = this.listener.context;
  }

  async loadSounds() {
    const loadPromise = (name, path) => {
      return new Promise((resolve) => {
        this.audioLoader.load(path, (buffer) => {
          this.buffers[name] = buffer; 
          resolve();
        }, undefined, (error) => {
          console.error(`Failed to load audio: ${path}`, error);
          resolve(); // Resolve anyway so the engine doesn't crash on a missing file
        });
      });
    }

    await Promise.all([
      loadPromise('pistol', '/audio/pistol.mp3'),
      loadPromise('shotgun', '/audio/shotgun.mp3'), // Shotgun explicitly loaded here
      loadPromise('zombie', '/audio/zombie.mp3'),
      loadPromise('zombie_death', '/audio/zombie-death.mp3')
    ]);
  }

  playShot(name, volume = 0.2) {
    const buffer = this.buffers[name];
    if (!buffer) {
      console.warn(`Audio buffer missing for: ${name}`);
      return;
    }

    if (this.activeContext.state === 'suspended') this.activeContext.resume();

    const source = this.activeContext.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.activeContext.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(this.listener.getInput());

    source.start(0);

    source.onended = () => {
      source.disconnect();
      gainNode.disconnect();
    };
  }
}