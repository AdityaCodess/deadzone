import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { shaderPipeline } from '../systems/ShaderPipeline.js';
import { ApiClient } from '../services/apiClient.js';

export class ZombieManager {
  constructor(scene, playerCamera, serverZombies, audioManager, worldGenerator, onZombieDropCallback) {
    this.scene = scene;
    this.playerCamera = playerCamera;
    this.serverZombies = serverZombies;
    this.audioManager = audioManager;
    this.worldGenerator = worldGenerator;
    this.onZombieDropCallback = onZombieDropCallback;

    this.zombies = [];
    this.mixers = [];
    this._targetPos = new THREE.Vector3();
    this._zombieBox = new THREE.Box3();
    this._zMin = new THREE.Vector3();
    this._zMax = new THREE.Vector3();

    this.baseGltf = null;
    this.groundYOffset = 0;
    this.loader = new GLTFLoader();
  }

  async spawnZombie(position = new THREE.Vector3(0, 0, -14)) {
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

    const zombie = SkeletonUtils.clone(this.baseGltf.scene);
    zombie.position.set(position.x, this.groundYOffset, position.z);
    
    const mixer = new THREE.AnimationMixer(zombie);
    this.mixers.push(mixer);
    
    const actions = {};
    this.baseGltf.animations.forEach((clip) => {
      actions[clip.name] = mixer.clipAction(clip);
    });

    zombie.userData = { 
      id: THREE.MathUtils.generateUUID(),
      isZombie: true, 
      health: this.serverZombies.basic.health, 
      state: 'alive',
      currentAction: 'Run',
      actions: actions,
      mixer: mixer,
      attackWindupUntil: 0,
      lastAttackTime: 0,
      deathTimestamp: 0
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
  }

  takeDamage(zombie, amount) {
    if (!zombie || zombie.userData.state === 'dead') return;

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
      if (child.isMesh) {
        child.userData.isZombieMesh = false;
      }
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

    // Request authoritative loot drop from server at the zombie's death location
    const deathPos = [zombie.position.x, 0.02, zombie.position.z];
    ApiClient.requestZombieLoot(deathPos).then((res) => {
      if (res && res.valid && res.drop && this.onZombieDropCallback) {
        this.onZombieDropCallback(res.drop);
      }
    }).catch(() => {});
  }

  _destroyZombieCorpse(index) {
    const zombie = this.zombies[index];
    if (!zombie) return;

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

  _isBlockedByWall(x, z) {
    if (!this.worldGenerator) return false;
    const r = 0.45;
    this._zMin.set(x - r, 0, z - r);
    this._zMax.set(x + r, 2.0, z + r);
    this._zombieBox.set(this._zMin, this._zMax);
    return this.worldGenerator.checkCollision(this._zombieBox, x, z);
  }

  update(delta, player) {
    const config = this.serverZombies.basic; 
    const cleanupDelayMs = (config.corpseCleanupDelay || 5.0) * 1000;
    const now = performance.now();

    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const zombie = this.zombies[i];
      
      const distSqToCam = zombie.position.distanceToSquared(this.playerCamera.position);
      if (distSqToCam < 6400) {
        zombie.userData.mixer.update(delta);
      }

      // CORPSE RAM CLEANUP: Sink dead body at 4s and completely destroy it at 5s (Wave respawning paused)
      if (zombie.userData.state === 'dead') {
        const elapsedDead = now - zombie.userData.deathTimestamp;
        if (elapsedDead > cleanupDelayMs - 1000) {
          zombie.position.y -= delta * 0.6;
        }
        if (elapsedDead >= cleanupDelayMs) {
          this._destroyZombieCorpse(i);
        }
        continue;
      }

      zombie.position.y = this.groundYOffset;
      const actions = zombie.userData.actions;

      if (player && player.isDead) {
        if (this.audioManager) {
          this.audioManager.stopEntityLoop(zombie.userData.id);
        }
        const idleAction = actions['Idle'] || actions['Stand'] || actions['Run'];
        if (zombie.userData.currentAction !== 'Idle' && idleAction) {
          if (actions[zombie.userData.currentAction]) actions[zombie.userData.currentAction].fadeOut(0.3);
          idleAction.reset().fadeIn(0.3).play();
          zombie.userData.currentAction = 'Idle';
        }
        continue; 
      }

      if (zombie.userData.state === 'alive') {
        const px = this.playerCamera.position.x;
        const pz = this.playerCamera.position.z;
        this._targetPos.set(px, zombie.position.y, pz);

        const dx = px - zombie.position.x;
        const dz = pz - zombie.position.z;
        const distance = Math.hypot(dx, dz);

        if (this.audioManager) {
          this.audioManager.updateEntityLoop(zombie.userData.id, 'zombie', distance, 25, 0.3);
        }

        zombie.lookAt(this._targetPos);

        const minSeparation = 1.35;
        if (distance < minSeparation && distance > 0.001) {
          const pushBack = minSeparation - distance;
          const nx = dx / distance;
          const nz = dz / distance;
          const pushedX = zombie.position.x - nx * pushBack;
          const pushedZ = zombie.position.z - nz * pushBack;
          if (!this._isBlockedByWall(pushedX, pushedZ)) {
            zombie.position.x = pushedX;
            zombie.position.z = pushedZ;
          }
        }

        const isSwingingAttack = now < zombie.userData.attackWindupUntil;
        const attackRange = 1.85;

        if (distance > attackRange && !isSwingingAttack) {
          const step = Math.min(config.speed * delta, distance - minSeparation);
          if (step > 0) {
            const dirX = dx / distance;
            const dirZ = dz / distance;
            const nextX = zombie.position.x + dirX * step;
            const nextZ = zombie.position.z + dirZ * step;

            if (!this._isBlockedByWall(nextX, zombie.position.z)) {
              zombie.position.x = nextX;
            }
            if (!this._isBlockedByWall(zombie.position.x, nextZ)) {
              zombie.position.z = nextZ;
            }
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
          const attackClipName = actions['Attack'] ? 'Attack' : (actions['Punch'] ? 'Punch' : 'Run');
          if (zombie.userData.currentAction !== attackClipName) {
            if (actions[attackClipName] && actions[zombie.userData.currentAction]) {
              actions[attackClipName].reset().fadeIn(0.2);
              actions[zombie.userData.currentAction].fadeOut(0.2);
              actions[attackClipName].play();
            }
            zombie.userData.currentAction = attackClipName;
          }

          if (player && !player.isDead && distance <= attackRange + 0.3) {
            if (now - zombie.userData.lastAttackTime > config.attackCooldown) {
              player.takeDamage(config.damage);
              zombie.userData.lastAttackTime = now;
              zombie.userData.attackWindupUntil = now + 650;
            }
          }
        }
      }
    }
  }
}