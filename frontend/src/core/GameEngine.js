import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Player } from '../entities/Player.js';
import { ZombieManager } from '../entities/ZombieManager.js';
import { RemotePlayerManager } from '../entities/RemotePlayerManager.js';
import { WorldGenerator } from '../systems/WorldGenerator.js';
import { AudioManager } from '../systems/AudioManager.js';
import { EnvironmentManager } from '../systems/EnvironmentManager.js';
import { shaderPipeline } from '../systems/ShaderPipeline.js';
import { ApiClient } from '../services/apiClient.js';
import { MinimapManager } from '../ui/MinimapManager.js';
import { networkManager } from '../systems/NetworkManager.js';

export class GameEngine {
  constructor(canvas, launchOptions = {}) {
    this.canvas = canvas;
    this.launchOptions = launchOptions;
    this.isMultiplayer = launchOptions.mode === 'multi';
    this.isDisposed = false;
    this.isMatchReady = !this.isMultiplayer;

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
    this._netSyncTimer = 0;
    
    this.player = null;
    this.zombieManager = null;
    this.remotePlayerManager = new RemotePlayerManager(this.scene);
    this.minimapManager = null;
    this.audioManager = new AudioManager();
    this.gltfLoader = new GLTFLoader();
    this.ammoPackGeo = new THREE.BoxGeometry(0.32, 0.22, 0.22);
    this.ammoPackMat = new THREE.MeshLambertMaterial({ color: 0x5c7a3d });
    
    this.environmentManager = new EnvironmentManager(this.scene);
    this.worldGenerator = new WorldGenerator(this.scene, this.environmentManager);
    this._camEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    this._buildLoadingBarrierUI();
    this._bindEvents();
  }

  _buildLoadingBarrierUI() {
    document.querySelectorAll('#dz-match-loading').forEach(el => el.remove());
    this.loadingOverlay = document.createElement('div');
    this.loadingOverlay.id = 'dz-match-loading';
    this.loadingOverlay.style.cssText = `
      position: fixed; inset: 0; background: #0c0e12; z-index: 3000;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-family: monospace; color: #fff; gap: 16px; transition: opacity 0.4s ease;
    `;
    this.loadingStatusText = document.createElement('div');
    this.loadingStatusText.style.cssText = `color: #ffaa44; font-size: 1.4rem; letter-spacing: 3px; font-weight: bold;`;
    this.loadingStatusText.innerText = 'LOADING ASSETS...';

    this.loadingSubText = document.createElement('div');
    this.loadingSubText.style.cssText = `color: #888; font-size: 0.95rem;`;
    this.loadingSubText.innerText = this.isMultiplayer
      ? 'Connecting with squad...'
      : 'Generating sector...';

    this.loadingOverlay.appendChild(this.loadingStatusText);
    this.loadingOverlay.appendChild(this.loadingSubText);
    document.body.appendChild(this.loadingOverlay);
  }

  _hideLoadingBarrierUI() {
    this.isMatchReady = true;
    if (this.loadingOverlay) {
      this.loadingOverlay.style.opacity = '0';
      setTimeout(() => this.loadingOverlay?.remove(), 400);
    }
  }

  async init() {
    try {
      const gameConfig = await ApiClient.getGameConfig();
      if (this.isDisposed) return;

      const activeWorldState = this.launchOptions.worldState || gameConfig.worldState;
      const chosenChar = this.launchOptions.character || 'Matt';
      const charModelPath = gameConfig.characters?.[chosenChar]?.modelPath || `/deadzone-assets/Characters_${chosenChar}.gltf`;

      const isHost = !this.isMultiplayer || networkManager.isHost();

      this.zombieManager = new ZombieManager(
        this.scene,
        this.camera,
        gameConfig.zombies,
        this.audioManager,
        this.worldGenerator,
        (dropData) => {
          this.spawnSingleGroundDrop(dropData);
          if (this.isMultiplayer) networkManager.notifyItemDropped(dropData);
        },
        networkManager
      );
      this.zombieManager.isClientOnly = this.isMultiplayer && !isHost;

      this.player = new Player(
        this.scene,
        this.camera,
        this.canvas,
        gameConfig.player,
        gameConfig.weapons,
        gameConfig.consumables,
        gameConfig.ammoItems,
        this.zombieManager,
        gameConfig.startingInventory,
        this.worldGenerator,
        this.audioManager,
        (dropData) => {
          this.spawnSingleGroundDrop(dropData);
          if (this.isMultiplayer) networkManager.notifyItemDropped(dropData);
        },
        this.launchOptions // Pass launchOptions to Player for Mode checks
      );

      if (this.isMultiplayer && this.launchOptions.room) {
        this._setupMultiplayerSync(this.launchOptions.room);
      }
      
      try {
        await Promise.all([
          this.worldGenerator.generate(activeWorldState),
          this.audioManager.loadSounds(),
          this.player.loadModel(charModelPath),
          this._spawnAuthoritativeWorldLoot(activeWorldState)
        ]);

        if (this.isMultiplayer && this.launchOptions.room) {
          const playersArray = Array.from(this.launchOptions.room.state.players.entries()).map(([id, p]) => ({
            socketId: id,
            character: p.character,
            username: p.username,
            position: [p.x, p.y, p.z],
            rotationY: p.rotY
          }));
          await this.remotePlayerManager.spawnRemotePlayers(playersArray, networkManager.room?.sessionId);
        }

        if (isHost) {
          await this.zombieManager.spawnZombie(new THREE.Vector3(-1.5, 0, -18));
          await this.zombieManager.spawnZombie(new THREE.Vector3(1.5, 0, -18));
          for (let i = 0; i < 6; i++) {
            const roadPos = this.worldGenerator.getRandomRoadPosition(25, 90);
            await this.zombieManager.spawnZombie(roadPos);
          }
        }
      } catch (assetError) {
        console.error("ASSET LOADING FAILED:", assetError);
      }

      if (this.isDisposed) return;

      this.minimapManager = new MinimapManager(
        this.worldGenerator,
        this.zombieManager,
        this.player.interactionManager
      );

      this.renderer.setAnimationLoop((time) => this._gameLoop(time));

      if (this.isMultiplayer) {
        this.loadingStatusText.innerText = 'WAITING FOR SQUAD MEMBERS...';
        networkManager.notifyPlayerLoaded();
        setTimeout(() => {
          if (!this.isMatchReady) this._hideLoadingBarrierUI();
        }, 12000);
      } else {
        this._hideLoadingBarrierUI();
      }
    } catch (error) {
      if (!this.isDisposed) console.error("CRITICAL ENGINE FAILURE:", error);
    }
  }

  _setupMultiplayerSync(room) {
    const myPlayer = room.state.players.get(networkManager.room?.sessionId);
    if (myPlayer && myPlayer.x !== undefined) {
      this.camera.position.set(myPlayer.x, 1.6, myPlayer.z);
    }

    networkManager.onLoadProgress = ({ loadedCount, totalCount }) => {
      if (this.loadingSubText) {
        this.loadingSubText.innerText = `SQUAD: ${loadedCount} / ${totalCount} OPERATIVES READY`;
      }
    };

    networkManager.onAllPlayersReady = () => this._hideLoadingBarrierUI();
    networkManager.onRemotePlayerMoved = (data) => this.remotePlayerManager.onNetworkMove(data);
    networkManager.onRemotePlayerLeft = (socketId) => this.remotePlayerManager.removePlayer(socketId);

    // Native Colyseus Schema Sync for Zombies
    room.state.zombies.onAdd((zombieState, zombieId) => {
      if (this.zombieManager?.isClientOnly) {
        this.zombieManager.syncFromSchema(zombieId, zombieState);
        
        zombieState.onChange(() => {
          this.zombieManager.syncFromSchema(zombieId, zombieState);
        });
      }
    });

    room.state.zombies.onRemove((zombieState, zombieId) => {
      if (this.zombieManager?.isClientOnly) {
        this.zombieManager.removeZombie(zombieId);
      }
    });

    networkManager.room?.onMessage('z:applyDamage', ({ zombieId, damage }) => {
      const zombie = this.zombieManager?.zombieMap.get(zombieId);
      if (zombie) this.zombieManager.takeDamage(zombie, damage);
    });

    networkManager.onWorldRemoveDrop = (dropId) => this.player?.interactionManager?.removeInteractableById(dropId);
    networkManager.onWorldSpawnDrop = (drop) => this.spawnSingleGroundDrop(drop);
    networkManager.onWorldSyncLootBox = ({ boxId, boxEmpty }) => {
      if (boxEmpty) this.player?.interactionManager?.removeInteractableById(boxId);
    };
  }

  async _spawnAuthoritativeWorldLoot(worldState) {
    if (this.isDisposed || !worldState) return;
    if (worldState.groundDrops) {
      for (const drop of worldState.groundDrops) {
        if (this.isDisposed) break;
        await this.spawnSingleGroundDrop(drop);
      }
    }
    if (worldState.lootBoxes) {
      for (const box of worldState.lootBoxes) {
        if (this.isDisposed) break;
        await this._spawnLootBoxMesh(box);
      }
    }
  }

  async spawnSingleGroundDrop(dropCfg) {
    if (this.isDisposed || !dropCfg) return;
    if (!dropCfg.modelPath) {
      const crate = new THREE.Mesh(this.ammoPackGeo, this.ammoPackMat);
      const [x, , z] = dropCfg.position || [0, 0.12, 0];
      crate.position.set(x, 0.12, z);
      crate.userData = { isInteractable: true, type: 'pickup', dropId: dropCfg.id, itemName: dropCfg.itemName, count: dropCfg.count || 1 };
      this.scene.add(crate);
      this.player?.interactionManager?.registerInteractable(crate);
      return;
    }

    return new Promise((resolve) => {
      this.gltfLoader.load(dropCfg.modelPath, (gltf) => {
        if (this.isDisposed) return resolve();
        const rawScene = gltf.scene;
        shaderPipeline.optimizeModel(rawScene, false, true);

        const box = new THREE.Box3().setFromObject(rawScene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        rawScene.position.set(-center.x, -box.min.y, -center.z);
        const itemWrapper = new THREE.Group();
        itemWrapper.add(rawScene);

        const desiredSize = dropCfg.targetSize || 0.75;
        if (maxDim > 0) itemWrapper.scale.setScalar(desiredSize / maxDim);

        const [x, , z] = dropCfg.position || [0, 0.02, -4];
        itemWrapper.position.set(x, 0.02, z);

        itemWrapper.userData = { isInteractable: true, type: 'pickup', dropId: dropCfg.id, itemName: dropCfg.itemName, count: dropCfg.count || 1 };
        itemWrapper.traverse((child) => { if (child.isMesh) child.userData.isInteractable = true; });

        this.scene.add(itemWrapper);
        this.player?.interactionManager?.registerInteractable(itemWrapper);
        resolve();
      }, undefined, () => resolve());
    });
  }

  async _spawnLootBoxMesh(boxCfg) {
    return new Promise((resolve) => {
      this.gltfLoader.load(boxCfg.modelPath || '/deadzone-assets/lootbox.gltf', (gltf) => {
        if (this.isDisposed) return resolve();
        const rawScene = gltf.scene;
        shaderPipeline.optimizeModel(rawScene, true, true);

        const box = new THREE.Box3().setFromObject(rawScene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        rawScene.position.set(-center.x, -box.min.y, -center.z);
        const wrapper = new THREE.Group();
        wrapper.add(rawScene);
        if (maxDim > 0) wrapper.scale.setScalar(1.15 / maxDim);

        const [x, , z] = boxCfg.position || [0, 0.02, -9];
        wrapper.position.set(x, 0.02, z);

        wrapper.userData = { isInteractable: true, type: 'lootbox', boxId: boxCfg.id, itemName: 'Supply Lootbox', items: boxCfg.items || [] };
        wrapper.traverse((child) => { if (child.isMesh) child.userData.isInteractable = true; });

        this.scene.add(wrapper);
        this.player?.interactionManager?.registerInteractable(wrapper);
        resolve();
      }, undefined, () => resolve());
    });
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

    if (!this.isMatchReady) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.environmentManager) this.environmentManager.update(delta, this.camera.position);
    if (this.player) this.player.update(delta);
    if (this.remotePlayerManager) this.remotePlayerManager.update(delta);

    const isHost = !this.isMultiplayer || networkManager.isHost();

    if (this.isMultiplayer && this.player && this.player.model) {
      this._netSyncTimer += delta;
      if (this._netSyncTimer >= 0.066) {
        networkManager.sendPlayerState(
          this.camera.position,
          this.player.model.rotation.y,
          this.player.currentAction,
          this.player.equippedItemName
        );
      }
    }
    
    if (this.zombieManager && this.player) {
      const remotePositions = [];
      this.remotePlayerManager.remotePlayers.forEach(rp => remotePositions.push(rp.root.position));
      this.zombieManager.update(delta, this.player, remotePositions);

      // Serialize Host AI state matching the backend parsing expectations
      if (this.isMultiplayer && isHost && this._netSyncTimer >= 0.066) {
        networkManager.room?.send('z:sync', this.zombieManager.serializeForNetwork());
      }
    }

    if (this._netSyncTimer >= 0.066) this._netSyncTimer = 0;

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
    if (this.loadingOverlay) this.loadingOverlay.remove();
    if (this.audioManager) this.audioManager.cleanup();
    if (this.minimapManager) this.minimapManager.cleanup();

    this.scene.traverse((obj) => { if (obj.geometry) obj.geometry.dispose(); });
    this.renderer.dispose();
  }
}