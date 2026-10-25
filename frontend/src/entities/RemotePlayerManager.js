import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
    this.remotePlayers = new Map(); // socketId -> { root, mixer, actions, currentAction, equippedWeapon }
  }

  async spawnRemotePlayers(playersList, localSocketId) {
    for (const p of playersList) {
      if (p.socketId === localSocketId) continue;
      await this.addOrUpdatePlayer(p);
    }
  }

  async addOrUpdatePlayer(playerInfo) {
    if (this.remotePlayers.has(playerInfo.socketId)) return;

    const modelPath = CHAR_PATHS[playerInfo.character] || CHAR_PATHS.Matt;
    return new Promise((resolve) => {
      this.loader.load(modelPath, (gltf) => {
        const model = gltf.scene;
        shaderPipeline.optimizeModel(model, true, true);

        const box = new THREE.Box3().setFromObject(model);
        const footYOffset = -box.min.y;

        EMBEDDED_WEAPONS.forEach(w => {
          const m = model.getObjectByName(w);
          if (m) m.visible = false;
        });

        const pistol = model.getObjectByName('Pistol');
        if (pistol) pistol.visible = true;

        const mixer = new THREE.AnimationMixer(model);
        const actions = {};
        gltf.animations.forEach(clip => {
          actions[clip.name] = mixer.clipAction(clip);
        });
        if (actions['Idle_Gun']) actions['Idle_Gun'].play();

        const [x, y, z] = playerInfo.position || [0, 1.6, 0];
        model.position.set(x, (y - 1.6) + footYOffset, z);

        // Floating username nametag sprite
        const tagSprite = this._createNameTag(playerInfo.username || 'Survivor');
        tagSprite.position.set(0, 2.15, 0);
        model.add(tagSprite);

        this.scene.add(model);
        this.remotePlayers.set(playerInfo.socketId, {
          root: model,
          footYOffset,
          mixer,
          actions,
          currentAction: 'Idle_Gun',
          equippedWeapon: 'Pistol',
          targetPos: new THREE.Vector3(x, (y - 1.6) + footYOffset, z),
          targetRotY: playerInfo.rotationY || 0
        });
        resolve();
      }, undefined, () => resolve());
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
    const rp = this.remotePlayers.get(data.socketId);
    if (!rp) return;

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
      EMBEDDED_WEAPONS.forEach(w => {
        const m = rp.root.getObjectByName(w);
        if (m) m.visible = false;
      });
      const meshName = data.equippedWeapon === 'Bat' ? 'WoodenBat_Barbed' : data.equippedWeapon;
      if (meshName) {
        const activeMesh = rp.root.getObjectByName(meshName);
        if (activeMesh) activeMesh.visible = true;
      }
    }
  }

  removePlayer(socketId) {
    const rp = this.remotePlayers.get(socketId);
    if (!rp) return;
    rp.mixer.stopAllAction();
    this.scene.remove(rp.root);
    this.remotePlayers.delete(socketId);
  }

  update(delta) {
    this.remotePlayers.forEach((rp) => {
      rp.mixer.update(delta);
      rp.root.position.lerp(rp.targetPos, Math.min(1, delta * 12));
      rp.root.rotation.y = rp.targetRotY;
    });
  }
}