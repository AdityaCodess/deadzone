import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { shaderPipeline } from '../systems/ShaderPipeline.js';

export class ZombieManager {
  constructor(scene, playerCamera, serverZombies, audioManager, worldGenerator) {
    this.scene = scene;
    this.playerCamera = playerCamera;
    this.serverZombies = serverZombies;
    this.audioManager = audioManager;
    this.worldGenerator = worldGenerator;
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
          // Calculate exact foot offset so zombie shoes touch y = 0.0 road surface
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
      lastAttackTime: 0
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
    if (zombie.userData.state === 'dead') return;

    zombie.userData.health -= amount;

    if (zombie.userData.health <= 0) {
      this.killZombie(zombie);
    }
  }

  killZombie(zombie) {
    if (zombie.userData.state === 'dead') return;
    zombie.userData.state = 'dead';

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
      // Keep corpse flush on the asphalt at groundYOffset (removed the +0.15 floating bug)
      zombie.position.y = this.groundYOffset;
    }
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
    const now = performance.now();

    for (let i = 0; i < this.zombies.length; i++) {
      const zombie = this.zombies[i];
      
      const distSqToCam = zombie.position.distanceToSquared(this.playerCamera.position);
      if (distSqToCam < 6400) {
        zombie.userData.mixer.update(delta);
      }

      if (zombie.userData.state === 'dead') continue;

      // Ensure alive zombie stays planted on the road surface
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

        // 1. PERSONAL SPACE SEPARATION: Never let the zombie overlap or stick inside the player when running
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

        // 2. MOVEMENT vs ATTACK WINDUP (Zombie stops moving while swinging so player can sprint away)
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
          // Within attack range or finishing attack swing
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
              // Root the zombie in place for 650ms after swinging so the player can escape
              zombie.userData.attackWindupUntil = now + 650;
            }
          }
        }
      }
    }
  }
}