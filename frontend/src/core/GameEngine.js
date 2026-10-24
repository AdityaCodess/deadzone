import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Player } from '../entities/Player.js';
import { ZombieManager } from '../entities/ZombieManager.js';
import { WorldGenerator } from '../systems/WorldGenerator.js';
import { AudioManager } from '../systems/AudioManager.js';
import { EnvironmentManager } from '../systems/EnvironmentManager.js';
import { shaderPipeline } from '../systems/ShaderPipeline.js';
import { ApiClient } from '../services/apiClient.js';
import { MinimapManager } from '../ui/MinimapManager.js';

export class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.isDisposed = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);
    this.scene.fog = new THREE.Fog(0x111111, 25, 140); 

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 160);
    this.camera.position.set(0, 1.6, 0); 

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.prevTime = performance.now();
    
    this.player = null;
    this.zombieManager = null;
    this.minimapManager = null;
    this.audioManager = new AudioManager();
    
    this.environmentManager = new EnvironmentManager(this.scene);
    this.worldGenerator = new WorldGenerator(this.scene, this.environmentManager);
    this._camEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    this._bindEvents();
  }

  async init() {
    try {
      const gameConfig = await ApiClient.getGameConfig();
      if (this.isDisposed) return;

      this.zombieManager = new ZombieManager(
        this.scene,
        this.camera,
        gameConfig.zombies,
        this.audioManager,
        this.worldGenerator
      );
      this.player = new Player(
        this.scene,
        this.camera,
        this.canvas,
        gameConfig.player,
        gameConfig.weapons,
        gameConfig.consumables,
        this.zombieManager,
        gameConfig.startingInventory,
        this.worldGenerator,
        this.audioManager
      );
      
      try {
        await Promise.all([
          this.worldGenerator.generate(),
          this.audioManager.loadSounds(),
          this.player.loadModel(),
          this._spawnLoot(gameConfig.worldLoot)
        ]);

        // Spawn 1 zombie down the main road and 5 more on procedural roads around the city
        await this.zombieManager.spawnZombie(new THREE.Vector3(0, 0, -16));
        for (let i = 0; i < 5; i++) {
          const roadPos = this.worldGenerator.getRandomRoadPosition(22, 85);
          await this.zombieManager.spawnZombie(roadPos);
        }
      } catch (assetError) {
        console.error("ASSET LOADING FAILED, but starting engine anyway:", assetError);
      }

      if (this.isDisposed) return;

      this.minimapManager = new MinimapManager(
        this.worldGenerator,
        this.zombieManager,
        this.player.interactionManager
      );

      this.renderer.setAnimationLoop((time) => this._gameLoop(time));
    } catch (error) {
      if (!this.isDisposed) {
        console.error("CRITICAL ENGINE FAILURE:", error);
      }
    }
  }

  async _spawnLoot(lootList) {
    if (this.isDisposed) return;

    const defaultTestLoot = [
      { itemName: 'Axe',     modelPath: '/deadzone-assets/Axe.gltf',              position: [-5.0, 0.02, -4], rotationY: 0,           targetSize: 0.85 },
      { itemName: 'SMG',     modelPath: '/deadzone-assets/SMG.gltf',              position: [-3.0, 0.02, -4], rotationY: Math.PI / 2, targetSize: 0.75 },
      { itemName: 'Shotgun', modelPath: '/deadzone-assets/Shotgun.gltf',          position: [-1.0, 0.02, -4], rotationY: Math.PI / 2, targetSize: 0.95 },
      { itemName: 'Medkit',  modelPath: '/deadzone-assets/medkit.gltf',           position: [1.0, 0.02, -4],  rotationY: 0,           targetSize: 0.45 },
      { itemName: 'Bat',     modelPath: '/deadzone-assets/WoodenBat_Barbed.gltf', position: [3.0, 0.02, -4],  rotationY: 0,           targetSize: 0.90 },
      { itemName: 'Guitar',  modelPath: '/deadzone-assets/Guitar.gltf',           position: [5.0, 0.02, -4],  rotationY: 0,           targetSize: 1.05 }
    ];

    const itemsToSpawn = (Array.isArray(lootList) && lootList.length > 0) ? lootList : defaultTestLoot;
    const loader = new GLTFLoader();

    const spawnPromises = itemsToSpawn.map((lootCfg) => {
      return new Promise((resolve) => {
        loader.load(lootCfg.modelPath, (gltf) => {
          if (this.isDisposed) {
            resolve();
            return;
          }
          const rawScene = gltf.scene;
          shaderPipeline.optimizeModel(rawScene, false, true);

          const box = new THREE.Box3().setFromObject(rawScene);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);

          rawScene.position.set(-center.x, -box.min.y, -center.z);

          const itemWrapper = new THREE.Group();
          itemWrapper.add(rawScene);

          const desiredSize = lootCfg.targetSize || 0.75;
          if (maxDim > 0) {
            itemWrapper.scale.setScalar(desiredSize / maxDim);
          }

          const [x, , z] = lootCfg.position || [0, 0.02, -4];
          itemWrapper.position.set(x, 0.02, z); // Sits flush on top of the y=0 road surface
          itemWrapper.rotation.y = lootCfg.rotationY || 0;

          itemWrapper.userData = {
            isInteractable: true,
            type: 'pickup',
            itemName: lootCfg.itemName
          };

          itemWrapper.traverse((child) => {
            if (child.isMesh) {
              child.userData.isInteractable = true;
            }
          });

          this.scene.add(itemWrapper);
          if (this.player && this.player.interactionManager) {
            this.player.interactionManager.registerInteractable(itemWrapper);
          }
          resolve();
        }, undefined, (err) => {
          console.error(`Failed to load loot ${lootCfg.itemName}:`, err);
          resolve();
        });
      });
    });

    await Promise.all(spawnPromises);
  }

  _bindEvents() {
    this._onResize = () => {
      if (this.isDisposed) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);
  }

  _gameLoop(time) {
    if (this.isDisposed) return;
    const delta = Math.min((time - this.prevTime) / 1000, 0.1);
    this.prevTime = time;

    if (this.environmentManager) {
      this.environmentManager.update(delta, this.camera.position);
    }

    if (this.player) {
      this.player.update(delta);
    }
    
    if (this.zombieManager && this.player) {
      const isPlaying = this.player.controls.isLocked || this.player.isDead;
      if (isPlaying) {
        this.zombieManager.update(delta, this.player);
      }
    }

    if (this.minimapManager) {
      this._camEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.minimapManager.update(this.camera.position, this._camEuler.y);
    }

    this.renderer.render(this.scene, this.camera);
  }

  cleanup() {
    this.isDisposed = true;
    window.removeEventListener('resize', this._onResize);
    this.renderer.setAnimationLoop(null);
    
    if (this.audioManager) this.audioManager.cleanup();
    if (this.minimapManager) this.minimapManager.cleanup();

    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });

    this.renderer.dispose();
  }
}