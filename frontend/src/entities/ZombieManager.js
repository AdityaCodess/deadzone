import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class ZombieManager {
  constructor(scene, playerCamera, serverZombies, audioManager) {
    this.scene = scene;
    this.playerCamera = playerCamera;
    this.serverZombies = serverZombies;
    this.audioManager = audioManager;
    this.zombies = [];
    this.mixers = [];
  }

  async spawnZombie(position = new THREE.Vector3(0, 0, -10)) {
    const loader = new GLTFLoader();
    
    return new Promise((resolve) => {
      loader.load('/deadzone-assets/Zombie_Basic.gltf', (gltf) => {
        const zombie = gltf.scene;
        zombie.position.copy(position);
        
        const mixer = new THREE.AnimationMixer(zombie);
        this.mixers.push(mixer);
        
        const actions = {};
        gltf.animations.forEach((clip) => {
          actions[clip.name] = mixer.clipAction(clip);
        });

        zombie.userData = { 
          isZombie: true, 
          health: this.serverZombies.basic.health, 
          state: 'alive',
          currentAction: 'Run',
          actions: actions,
          mixer: mixer
        };

        zombie.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.userData.isZombieMesh = true;
            child.userData.rootZombie = zombie;
          }
        });

        if (actions['Run']) actions['Run'].play();

        this.scene.add(zombie);
        this.zombies.push(zombie);
        resolve();
      });
    });
  }

  takeDamage(zombie, amount) {
    if (zombie.userData.state === 'dead') return;

    zombie.userData.health -= amount;

    if (zombie.userData.health <= 0) {
      this.killZombie(zombie);
    }
  }

  killZombie(zombie) {
    zombie.userData.state = 'dead';
    if (this.audioManager) this.audioManager.playShot('zombie_death', 0.8);

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
    this.mixers.forEach(mixer => mixer.update(delta));
    const config = this.serverZombies.basic; 

    this.zombies.forEach(zombie => {
      if (zombie.userData.state === 'dead') return;

      const actions = zombie.userData.actions;

      if (player && player.isDead) {
        const idleAction = actions['Idle'] || actions['Stand'] || actions['Run'];
        if (zombie.userData.currentAction !== 'Idle' && idleAction) {
          if (actions[zombie.userData.currentAction]) actions[zombie.userData.currentAction].fadeOut(0.3);
          idleAction.reset().fadeIn(0.3).play();
          zombie.userData.currentAction = 'Idle';
        }
        return; 
      }

      if (zombie.userData.state === 'alive') {
        const targetPos = this.playerCamera.position.clone();
        targetPos.y = zombie.position.y; 
        
        const distance = zombie.position.distanceTo(targetPos);

        if (distance > 2.0) {
          zombie.lookAt(targetPos);
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
          zombie.lookAt(targetPos);

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
              if (this.audioManager) this.audioManager.playShot('zombie', 0.5);
              player.takeDamage(config.damage);
              zombie.userData.lastAttackTime = performance.now();
            }
          }
        }
      }
    });
  }
}