import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Player } from '../entities/Player.js';
import { ZombieManager } from '../entities/ZombieManager.js';
import { WorldGenerator } from '../systems/WorldGenerator.js';
import { AudioManager } from '../systems/AudioManager.js';
import { EnvironmentManager } from '../systems/EnvironmentManager.js';

export class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);
    this.scene.fog = new THREE.Fog(0x111111, 10, 50); 

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 1.6, 0); 

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.prevTime = performance.now();
    
    this.player = null;
    this.zombieManager = null;
    this.audioManager = new AudioManager(this.camera);
    
    // Initialize EnvironmentManager FIRST so the WorldGenerator can pass lights to it
    this.environmentManager = new EnvironmentManager(this.scene);
    this.worldGenerator = new WorldGenerator(this.scene, this.environmentManager);

    this._bindEvents();
  }

  async init() {
    try {
      this.scene.fog = new THREE.Fog(0x111111, 20, 120); 

      const response = await fetch('http://localhost:3001/api/config', { cache: 'no-store' });
      const rawText = await response.text();
      const gameConfig = JSON.parse(rawText);

      this.zombieManager = new ZombieManager(this.scene, this.camera, gameConfig.zombies, this.audioManager);
      this.player = new Player(this.scene, this.camera, this.canvas, gameConfig.player, gameConfig.weapons, this.zombieManager, gameConfig.startingInventory, this.worldGenerator, this.audioManager);
      
      try {
        await Promise.all([
          this.worldGenerator.generate(),
          this.audioManager.loadSounds(),
          this.player.loadModel(),
          this.zombieManager.spawnZombie(),
          this._spawnLoot()
        ]);
      } catch (assetError) {
        console.error("ASSET LOADING FAILED, but starting engine anyway:", assetError);
      }
      
      this.renderer.setAnimationLoop((time) => this._gameLoop(time));
    } catch (error) {
      console.error("CRITICAL ENGINE FAILURE:", error);
    }
  }

  async _spawnLoot() {
    const loader = new GLTFLoader();
    return new Promise((resolve) => {
      loader.load('/deadzone-assets/Shotgun.gltf', (gltf) => {
        const shotgun = gltf.scene;
        
        shotgun.position.set(0, 0.1, -4);
        shotgun.rotation.y = Math.PI / 2;
        
        shotgun.userData = {
          isInteractable: true,
          type: 'pickup',
          itemName: 'Shotgun'
        };

        shotgun.traverse((child) => {
          if (child.isMesh) {
            child.userData.isInteractable = true; 
          }
        });

        this.scene.add(shotgun);
        resolve();
      });
    });
  }

  _bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

 _gameLoop(time) {
    const delta = (time - this.prevTime) / 1000;
    this.prevTime = time;

    if (this.environmentManager) {
      this.environmentManager.update(delta, this.camera.position);
    }

    if (this.player) {
      this.player.update(delta);
      this.worldGenerator.update(this.player.camera.position); 
    }
    
    if (this.zombieManager && this.player) {
      const isPlaying = this.player.controls.isLocked || this.player.isDead;
      
      if (isPlaying) {
        this.zombieManager.update(delta, this.player);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  cleanup() {
    this.renderer.dispose();
    this.renderer.setAnimationLoop(null);
  }
}