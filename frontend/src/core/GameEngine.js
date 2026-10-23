import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Player } from '../entities/Player.js';
import { ZombieManager } from '../entities/ZombieManager.js';
import { WorldGenerator } from '../systems/WorldGenerator.js';

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
    this.worldGenerator = new WorldGenerator(this.scene);

    this._bindEvents();
    this._setupLighting();
  }

  async init() {
    try {
      // 1. Pushed fog back so it doesn't swallow the 20m tiles
      this.scene.fog = new THREE.Fog(0x111111, 20, 120); 

      const response = await fetch('http://localhost:3001/api/config', { cache: 'no-store' });
      const rawText = await response.text();
      const gameConfig = JSON.parse(rawText);

      this.zombieManager = new ZombieManager(this.scene, this.camera, gameConfig.zombies);
      this.player = new Player(this.scene, this.camera, this.canvas, gameConfig.player, gameConfig.weapons, this.zombieManager, gameConfig.startingInventory, this.worldGenerator);
      // 2. Wrap the loader in a try/catch so the engine starts even if an asset is missing
      try {
        await Promise.all([
          this.worldGenerator.generate(),
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

  _setupLighting() {
    const ambientLight = new THREE.HemisphereLight(0x888899, 0x222222, 1.5);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 2.0);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);
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

    if (this.player) {
      this.player.update(delta);
      this.worldGenerator.update(this.player.camera.position); 
    }
    
    // 1. Check if the game is active (pointer locked) or the player is dead
    if (this.zombieManager && this.player) {
      const isPlaying = this.player.controls.isLocked || this.player.isDead;
      
      // 2. Only allow zombies to move and attack if the game isn't paused
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