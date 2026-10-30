import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { shaderPipeline } from '../systems/ShaderPipeline.js';

const CHAR_PATHS = {
  Matt:  '/deadzone-assets/Characters_Matt.gltf',
  Lis:   '/deadzone-assets/Characters_Lis.gltf',
  Shaun: '/deadzone-assets/Characters_Shaun.gltf',
  Sam:   '/deadzone-assets/Characters_Sam.gltf'
};

const EMBEDDED_WEAPONS = ['Axe', 'Guitar', 'Knife', 'Pistol', 'Rifle', 'Shotgun', 'SMG', 'Spear', 'WoodenBat_Barbed', 'WoodenBat_Saw'];

export class RemotePlayerManager {
  constructor(scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
    this.gltfCache = new Map();
    this.remotePlayers = new Map();
    this.pendingSpawns = new Set();
  }

  async spawnRemotePlayers(playersList, localSocketId) {
    const promises = playersList
      .filter(p => p.socketId !== localSocketId)
      .map(p => this.addOrUpdatePlayer(p));
    await Promise.all(promises);
  }

  async _loadCharGltf(characterName) {
    const key = CHAR_PATHS[characterName] ? characterName : 'Matt';
    if (this.gltfCache.has(key)) return this.gltfCache.get(key);

    return new Promise((resolve) => {
      this.loader.load(CHAR_PATHS[key], (gltf) => {
        shaderPipeline.optimizeModel(gltf.scene, false, true);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        gltf.userData = { footYOffset: -box.min.y };
        this.gltfCache.set(key, gltf);
        resolve(gltf);
      }, undefined, () => resolve(null));
    });
  }

  async addOrUpdatePlayer(playerInfo) {
    if (this.remotePlayers.has(playerInfo.socketId) || this.pendingSpawns.has(playerInfo.socketId)) return;
    this.pendingSpawns.add(playerInfo.socketId);

    const gltf = await this._loadCharGltf(playerInfo.character);
    this.pendingSpawns.delete(playerInfo.socketId);
    if (!gltf) return;

    const model = SkeletonUtils.clone(gltf.scene);
    const footYOffset = gltf.userData.footYOffset || 0;

    const weaponMap = {};
    EMBEDDED_WEAPONS.forEach(w => {
      const m = model.getObjectByName(w);
      if (m) {
        m.visible = (w === 'Pistol');
        weaponMap[w] = m;
      }
    });

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    gltf.animations.forEach(clip => {
      actions[clip.name] = mixer.clipAction(clip);
    });
    if (actions['Idle_Gun']) actions['Idle_Gun'].play();

    const [x, y, z] = playerInfo.position || [0, 1.6, 0];
    model.position.set(x, (y - 1.6) + footYOffset, z);

    const tagSprite = this._createNameTag(playerInfo.username || 'Operative');
    tagSprite.position.set(0, 2.15, 0);
    model.add(tagSprite);

    this.scene.add(model);
    this.remotePlayers.set(playerInfo.socketId, {
      root: model,
      footYOffset,
      weaponMap,
      mixer,
      actions,
      currentAction: 'Idle_Gun',
      equippedWeapon: 'Pistol',
      targetPos: new THREE.Vector3(x, (y - 1.6) + footYOffset, z),
      targetRotY: playerInfo.rotationY || 0
    });
  }

  _createNameTag(username) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(16, 12, 224, 40);
    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#00ddff';
    ctx.textAlign = 'center';
    ctx.fillText(username.toUpperCase(), 128, 40);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.5, 0.38, 1);
    return sprite;
  }

  onNetworkMove(data) {
    let rp = this.remotePlayers.get(data.socketId);

    if (!rp) {
      this.addOrUpdatePlayer({
        socketId: data.socketId,
        character: 'Matt',
        username: 'Operative',
        position: data.position,
        rotationY: data.rotationY
      });
      return;
    }

    const [x, y, z] = data.position;
    rp.targetPos.set(x, (y - 1.6) + rp.footYOffset, z);
    rp.targetRotY = data.rotationY;

    if (data.action && data.action !== rp.currentAction) {
      const prev = rp.actions[rp.currentAction];
      const next = rp.actions[data.action];
      if (prev && next) {
        next.reset().fadeIn(0.15).play();
        prev.fadeOut(0.15);
        rp.currentAction = data.action;
      }
    }

    if (data.equippedWeapon !== rp.equippedWeapon) {
      rp.equippedWeapon = data.equippedWeapon;
      Object.values(rp.weaponMap).forEach(m => { m.visible = false; });
      const meshName = data.equippedWeapon === 'Bat' ? 'WoodenBat_Barbed' : data.equippedWeapon;
      if (meshName && rp.weaponMap[meshName]) {
        rp.weaponMap[meshName].visible = true;
      }
    }
  }

  removePlayer(socketId) {
    const rp = this.remotePlayers.get(socketId);
    if (!rp) return;
    rp.mixer.stopAllAction();
    rp.mixer.uncacheRoot(rp.root);
    this.scene.remove(rp.root);
    this.remotePlayers.delete(socketId);
  }

  update(delta) {
    const lerpFactor = Math.min(1, delta * 18);
    this.remotePlayers.forEach((rp) => {
      rp.mixer.update(delta);

      // Deadband: Only lerp position if distance > 1cm to kill idle jitter
      if (rp.root.position.distanceToSquared(rp.targetPos) > 0.0001) {
        rp.root.position.lerp(rp.targetPos, lerpFactor);
      }

      let diff = rp.targetRotY - rp.root.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      if (Math.abs(diff) > 0.002) {
        rp.root.rotation.y += diff * lerpFactor;
      }
    });
  }
}