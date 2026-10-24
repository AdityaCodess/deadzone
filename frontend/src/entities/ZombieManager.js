import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { shaderPipeline } from '../systems/ShaderPipeline.js';

export class ZombieManager {
  constructor(scene, playerCamera, serverZombies, audioManager) {
    this.scene = scene;
    this.playerCamera = playerCamera;
    this.serverZombies = serverZombies;
    this.audioManager = audioManager;
    this.zombies = [];
    this.mixers = [];
    this._targetPos = new THREE.Vector3();

    this.baseGltf = null;
    this.loader = new GLTFLoader();
  }

  async spawnZombie(position = new THREE.Vector3(0, 0, -10)) {
    if (!this.baseGltf) {
      this.baseGltf = await new Promise((resolve, reject) => {
        this.loader.load('/deadzone-assets/Zombie_Basic.gltf', (gltf) => {
          shaderPipeline.optimizeModel(gltf.scene, true, true);
          resolve(gltf);
        }, undefined, reject);
      });
    }

    // Clone skeleton & share geometry/textures instead of re-parsing the GLTF file
    const zombie = SkeletonUtils.clone(this.baseGltf.scene);
    zombie.position.copy(position);
    
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
      mixer: mixer
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

    // 1. Immediately stop the lock-on groan loop and play zombie-death.mp3
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
      zombie.position.y += 0.15; 
    }
  }

  update(delta, player) {
    const config = this.serverZombies.basic; 

    for (let i = 0; i < this.zombies.length; i++) {
      const zombie = this.zombies[i];
      
      const distSqToCam = zombie.position.distanceToSquared(this.playerCamera.position);
      if (distSqToCam < 3600) {
        zombie.userData.mixer.update(delta);
      }

      if (zombie.userData.state === 'dead') continue;

      const actions = zombie.userData.actions;

      // If player is dead, stop zombie groans and switch to Idle
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
        this._targetPos.set(this.playerCamera.position.x, zombie.position.y, this.playerCamera.position.z);
        const distance = zombie.position.distanceTo(this._targetPos);

        // Start/maintain zombie.mp3 loop as soon as zombie is locked on (within 25m)
        if (this.audioManager) {
          this.audioManager.updateEntityLoop(zombie.userData.id, 'zombie', distance, 25, 0.3);
        }

        if (distance > 2.0) {
          zombie.lookAt(this._targetPos);
          zombie.translateZ(config.speed * delta); 

          if (zombie.userData.currentAction !== 'Run') {
            if (actions['Run'] && actions[zombie.userData.currentAction]) {
              actions['Run'].reset().fadeIn(0.2);
              actions[zombie.userData.currentAction].fadeOut(0.2);
              actions['Run'].play();
            }
            zombie.userData.currentAction = 'Run';
          }
        } else {
          zombie.lookAt(this._targetPos);

          const attackClipName = actions['Attack'] ? 'Attack' : (actions['Punch'] ? 'Punch' : 'Run');
          if (zombie.userData.currentAction !== attackClipName) {
            if (actions[attackClipName] && actions[zombie.userData.currentAction]) {
              actions[attackClipName].reset().fadeIn(0.2);
              actions[zombie.userData.currentAction].fadeOut(0.2);
              actions[attackClipName].play();
            }
            zombie.userData.currentAction = attackClipName;
          }

          if (player && !player.isDead) {
            if (!zombie.userData.lastAttackTime || performance.now() - zombie.userData.lastAttackTime > config.attackCooldown) {
              player.takeDamage(config.damage);
              zombie.userData.lastAttackTime = performance.now();
            }
          }
        }
      }
    }
  }
}