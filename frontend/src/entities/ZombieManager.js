import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { shaderPipeline } from '../systems/ShaderPipeline.js';
import { ApiClient } from '../services/apiClient.js';

export class ZombieManager {
  constructor(scene, playerCamera, serverZombies, audioManager, worldGenerator, onZombieDropCallback, networkManager) {
    this.scene = scene;
    this.playerCamera = playerCamera;
    this.serverZombies = serverZombies;
    this.audioManager = audioManager;
    this.worldGenerator = worldGenerator;
    this.onZombieDropCallback = onZombieDropCallback;
    this.networkManager = networkManager;

    this.zombies = [];
    this.zombieMap = new Map();
    this.mixers = [];
    this._targetPos = new THREE.Vector3();
    this._zombieBox = new THREE.Box3();
    this._zMin = new THREE.Vector3();
    this._zMax = new THREE.Vector3();

    this.baseGltf = null;
    this.groundYOffset = 0;
    this.loader = new GLTFLoader();
    this.isClientOnly = false;
  }

  async initBaseModel() {
    if (!this.baseGltf) {
      this.baseGltf = await new Promise((resolve, reject) => {
        this.loader.load('/deadzone-assets/Zombie_Basic.gltf', (gltf) => {
          shaderPipeline.optimizeModel(gltf.scene, true, true);
          const box = new THREE.Box3().setFromObject(gltf.scene);
          this.groundYOffset = -box.min.y;
          resolve(gltf);
        }, undefined, reject);
      });
    }
  }

  async spawnZombie(position = new THREE.Vector3(0, 0, -14), customId = null) {
    await this.initBaseModel();

    const zombie = SkeletonUtils.clone(this.baseGltf.scene);
    zombie.position.set(position.x, this.groundYOffset, position.z);
    
    const mixer = new THREE.AnimationMixer(zombie);
    this.mixers.push(mixer);
    
    const actions = {};
    this.baseGltf.animations.forEach((clip) => {
      actions[clip.name] = mixer.clipAction(clip);
    });

    const id = customId || THREE.MathUtils.generateUUID();
    zombie.userData = { 
      id,
      isZombie: true, 
      health: this.serverZombies.basic.health, 
      state: 'alive',
      currentAction: 'Run',
      actions,
      mixer,
      attackWindupUntil: 0,
      lastAttackTime: 0,
      deathTimestamp: 0,
      targetPos: new THREE.Vector3(position.x, this.groundYOffset, position.z),
      targetRotY: 0
    };

    zombie.traverse((child) => {
      if (child.isMesh) {
        child.userData.isZombieMesh = true;
        child.userData.rootZombie = zombie;
      }
    });

    if (actions['Run']) actions['Run'].play();

    this.scene.add(zombie);
    this.zombies.push(zombie);
    this.zombieMap.set(id, zombie);
    return zombie;
  }

  takeDamage(zombie, amount) {
    if (!zombie || zombie.userData.state === 'dead') return;

    if (this.isClientOnly && this.networkManager) {
      this.networkManager.socket?.emit('z:hit', {
        zombieId: zombie.userData.id,
        damage: amount
      });
      return;
    }

    zombie.userData.health -= amount;
    if (zombie.userData.health <= 0) {
      this.killZombie(zombie);
    }
  }

  killZombie(zombie) {
    if (zombie.userData.state === 'dead') return;
    zombie.userData.state = 'dead';
    zombie.userData.deathTimestamp = performance.now();

    if (this.audioManager) {
      this.audioManager.stopEntityLoop(zombie.userData.id);
      this.audioManager.playShot('zombie_death', 0.35);
    }

    zombie.traverse((child) => {
      if (child.isMesh) child.userData.isZombieMesh = false;
    });

    const actions = zombie.userData.actions;
    if (actions[zombie.userData.currentAction]) {
      actions[zombie.userData.currentAction].fadeOut(0.2);
    }

    const deathAction = actions['Death'] || actions['Die'];
    if (deathAction) {
      deathAction.reset().fadeIn(0.2).setLoop(THREE.LoopOnce, 1).play();
      deathAction.clampWhenFinished = true; 
      zombie.userData.currentAction = 'Death';
      zombie.position.y = this.groundYOffset;
    }

    if (!this.isClientOnly) {
      const deathPos = [zombie.position.x, 0.02, zombie.position.z];
      ApiClient.requestZombieLoot(deathPos).then((res) => {
        if (res?.valid && res.drop && this.onZombieDropCallback) {
          this.onZombieDropCallback(res.drop);
        }
      }).catch(() => {});
    }
  }

  // Listens directly to the backend Colyseus Schema
  syncFromSchema(zombieId, zState) {
    let zombie = this.zombieMap.get(zombieId);

    if (!zombie) {
      this.spawnZombie(new THREE.Vector3(zState.x, 0, zState.z), zombieId);
      return;
    }

    zombie.userData.targetPos.set(zState.x, this.groundYOffset, zState.z);
    zombie.userData.targetRotY = zState.rotY;

    if (zState.state === 'dead' && zombie.userData.state !== 'dead') {
      this.killZombie(zombie);
    } else if (zState.state !== 'dead') {
      const action = zState.state || 'Run';
      const actions = zombie.userData.actions;
      
      if (action !== zombie.userData.currentAction && actions[action]) {
        if (actions[zombie.userData.currentAction]) actions[zombie.userData.currentAction].fadeOut(0.15);
        actions[action].reset().fadeIn(0.15).play();
        zombie.userData.currentAction = action;
      }
    }
  }

  removeZombie(zombieId) {
    const zombie = this.zombieMap.get(zombieId);
    if (!zombie) return;
    const index = this.zombies.indexOf(zombie);
    if (index !== -1) this._destroyZombieCorpse(index);
  }

  // Host serializes objects properly into an object array for the backend to ingest
  serializeForNetwork() {
    const list = [];
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      list.push({
        id: z.userData.id,
        position: [
          Math.round(z.position.x * 100) / 100,
          Math.round(z.position.y * 100) / 100,
          Math.round(z.position.z * 100) / 100
        ],
        rotationY: Math.round(z.rotation.y * 100) / 100,
        state: z.userData.state === 'dead' ? 'dead' : z.userData.currentAction
      });
    }
    return list;
  }

  _destroyZombieCorpse(index) {
    const zombie = this.zombies[index];
    if (!zombie) return;

    this.zombieMap.delete(zombie.userData.id);
    const mixer = zombie.userData.mixer;
    if (mixer) {
      mixer.stopAllAction();
      mixer.uncacheRoot(zombie);
      const mIdx = this.mixers.indexOf(mixer);
      if (mIdx !== -1) this.mixers.splice(mIdx, 1);
    }

    this.scene.remove(zombie);
    this.zombies.splice(index, 1);
  }

  update(delta, player, allPlayersPos = []) {
    const config = this.serverZombies.basic; 
    const cleanupDelayMs = (config.corpseCleanupDelay || 5.0) * 1000;
    const now = performance.now();

    if (this.isClientOnly) {
      const factor = Math.min(1, delta * 15);
      for (let i = this.zombies.length - 1; i >= 0; i--) {
        const z = this.zombies[i];
        z.userData.mixer.update(delta);

        if (z.userData.state === 'dead') {
          const elapsed = now - z.userData.deathTimestamp;
          if (elapsed > cleanupDelayMs - 1000) z.position.y -= delta * 0.6;
          if (elapsed >= cleanupDelayMs) this._destroyZombieCorpse(i);
          continue;
        }

        z.position.lerp(z.userData.targetPos, factor);
        let diff = z.userData.targetRotY - z.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        z.rotation.y += diff * factor;
      }
      return;
    }

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const zombie = this.zombies[i];
      zombie.userData.mixer.update(delta);

      if (zombie.userData.state === 'dead') {
        const elapsed = now - zombie.userData.deathTimestamp;
        if (elapsed > cleanupDelayMs - 1000) zombie.position.y -= delta * 0.6;
        if (elapsed >= cleanupDelayMs) this._destroyZombieCorpse(i);
        continue;
      }

      zombie.position.y = this.groundYOffset;
      const actions = zombie.userData.actions;

      let nearestTarget = this.playerCamera.position;
      let minDistance = Math.hypot(nearestTarget.x - zombie.position.x, nearestTarget.z - zombie.position.z);

      for (const pPos of allPlayersPos) {
        const d = Math.hypot(pPos.x - zombie.position.x, pPos.z - zombie.position.z);
        if (d < minDistance) {
          minDistance = d;
          nearestTarget = pPos;
        }
      }

      const dx = nearestTarget.x - zombie.position.x;
      const dz = nearestTarget.z - zombie.position.z;
      this._targetPos.set(nearestTarget.x, zombie.position.y, nearestTarget.z);
      zombie.lookAt(this._targetPos);

      const minSeparation = 1.35;
      if (minDistance < minSeparation && minDistance > 0.001) {
        const pushBack = minSeparation - minDistance;
        zombie.position.x -= (dx / minDistance) * pushBack;
        zombie.position.z -= (dz / minDistance) * pushBack;
      }

      const isSwinging = now < zombie.userData.attackWindupUntil;
      const attackRange = 1.85;

      if (minDistance > attackRange && !isSwinging) {
        const step = Math.min(config.speed * delta, minDistance - minSeparation);
        if (step > 0) {
          zombie.position.x += (dx / minDistance) * step;
          zombie.position.z += (dz / minDistance) * step;
        }
        if (zombie.userData.currentAction !== 'Run') {
          if (actions['Run'] && actions[zombie.userData.currentAction]) {
            actions['Run'].reset().fadeIn(0.2);
            actions[zombie.userData.currentAction].fadeOut(0.2);
            actions['Run'].play();
          }
          zombie.userData.currentAction = 'Run';
        }
      } else {
        const atkClip = actions['Attack'] ? 'Attack' : 'Run';
        if (zombie.userData.currentAction !== atkClip && actions[atkClip]) {
          actions[atkClip].reset().fadeIn(0.2).play();
          if (actions[zombie.userData.currentAction]) actions[zombie.userData.currentAction].fadeOut(0.2);
          zombie.userData.currentAction = atkClip;
        }

        if (minDistance <= attackRange + 0.3 && now - zombie.userData.lastAttackTime > config.attackCooldown) {
          if (nearestTarget === this.playerCamera.position && player && !player.isDead) {
            player.takeDamage(config.damage);
          }
          zombie.userData.lastAttackTime = now;
          zombie.userData.attackWindupUntil = now + 650;
        }
      }
    }
  }
}