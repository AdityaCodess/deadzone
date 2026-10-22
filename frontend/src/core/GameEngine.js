import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Player } from '../entities/Player.js';
import { ZombieManager } from '../entities/ZombieManager.js';

export class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);
    this.scene.fog = new THREE.Fog(0x111111, 10, 60);

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

    this._bindEvents();
    this._setupLighting();
  }

  async init() {
    try {
      // Inside GameEngine.js init()
      const response = await fetch('http://localhost:3000/api/config', { cache: 'no-store' });
      const gameConfig = await response.json();

      this.zombieManager = new ZombieManager(this.scene, this.camera, gameConfig.zombies);
      this.player = new Player(this.scene, this.camera, this.canvas, gameConfig.player, gameConfig.weapons, this.zombieManager, gameConfig.startingInventory);

      await Promise.all([
        this._loadEnvironment(),
        this.player.loadModel(),
        this.zombieManager.spawnZombie(),
        this._spawnLoot()
      ]);
      this.renderer.setAnimationLoop((time) => this._gameLoop(time));
    } catch (error) {
      console.error("Failed to load backend config:", error);
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

  async _loadEnvironment() {
    const loader = new GLTFLoader();
    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    
    return new Promise((resolve) => {
      loader.load('/deadzone-assets/Street_4Way.gltf', (gltf) => {
        const environment = gltf.scene;
        
        environment.traverse((child) => {
          if (child.isMesh) {
            child.receiveShadow = true;
            child.castShadow = true;
            if (child.material) {
              const textureMaps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'];
              textureMaps.forEach(mapType => {
                if (child.material[mapType]) {
                  child.material[mapType].anisotropy = maxAnisotropy;
                  child.material[mapType].needsUpdate = true;
                }
              });
            }
          }
        });
        
        this.scene.add(environment);
        resolve();
      });
    });
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

    if (this.player) this.player.update(delta);
    if (this.zombieManager) this.zombieManager.update(delta, this.player);

    this.renderer.render(this.scene, this.camera);
  }

  cleanup() {
    this.renderer.dispose();
    this.renderer.setAnimationLoop(null);
  }
}