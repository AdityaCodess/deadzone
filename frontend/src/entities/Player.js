import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WeaponManager } from './WeaponManager.js';
import { InventoryManager } from '../ui/InventoryManager.js';
import { InteractionManager } from '../systems/InteractionManager.js';

export class Player {
  constructor(scene, camera, canvas, playerConfig, weaponConfig, zombieManager, startingInventory) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.zombieManager = zombieManager;
    this.weaponConfig = weaponConfig;
    
    this.controls = new PointerLockControls(this.camera, this.canvas);
    this.controls.maxPolarAngle = Math.PI - 0.6;
    
    this.moveState = { forward: false, backward: false, left: false, right: false };
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    
    this.speed = playerConfig.baseSpeed;
    this.maxHealth = playerConfig.maxHealth;
    this.health = this.maxHealth;
    
    this.isDead = false;
    this.isShooting = false;

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = 'Idle_Gun';
    this.weaponManager = null;
    
    this.inventoryManager = new InventoryManager(
      startingInventory,
      (weaponName) => {
        if (this.weaponManager) this.weaponManager.switchWeapon(weaponName);
      },
      (shouldLock) => {
        if (shouldLock && !this.isDead) this.controls.lock();
        else this.controls.unlock();
      }
    );

    this.interactionManager = new InteractionManager(this.scene, this.camera, this.inventoryManager);

    this._buildAmmoUI();
    this._bindEvents();
  }

  _buildAmmoUI() {
    this.ammoContainer = document.createElement('div');
    this.ammoContainer.style.cssText = `
      position: fixed; bottom: 30px; right: 30px;
      background: rgba(43, 39, 38, 0.9); border: 2px solid #5a5654;
      padding: 10px 20px; border-radius: 8px; z-index: 100;
      color: #fff; font-family: monospace; font-weight: bold;
      box-shadow: inset 0 0 10px rgba(0,0,0,0.8), 0 4px 6px rgba(0,0,0,0.5); 
      display: flex; align-items: baseline; gap: 10px; pointer-events: none;
    `;
    document.body.appendChild(this.ammoContainer);
  }

  async loadModel() {
    const loader = new GLTFLoader();
    
    return new Promise((resolve) => {
      loader.load('/deadzone-assets/Characters_Matt.gltf', (gltf) => {
        this.model = gltf.scene;

        const weapons = ['Axe', 'Guitar', 'Knife', 'Rifle', 'Shotgun', 'SMG', 'Spear', 'WoodenBat_Barbed', 'WoodenBat_Saw'];
        weapons.forEach(w => {
          const mesh = this.model.getObjectByName(w);
          if (mesh) mesh.visible = false;
        });

        this.mixer = new THREE.AnimationMixer(this.model);
        gltf.animations.forEach((clip) => {
          this.actions[clip.name] = this.mixer.clipAction(clip);
        });

        this.weaponManager = new WeaponManager(this.scene, this.camera, this.model, this.weaponConfig);

        const activeItem = this.inventoryManager.items[this.inventoryManager.activeHotbarIndex];
        if (activeItem) this.weaponManager.switchWeapon(activeItem);

        if (this.actions['Idle_Gun']) this.actions['Idle_Gun'].play();

        this.model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        this.scene.add(this.model);
        resolve();
      });
    });
  }

  _bindEvents() {
    this.controls.addEventListener('unlock', () => {
      this.isShooting = false;
      this.moveState = { forward: false, backward: false, left: false, right: false };
    });

    this.canvas.addEventListener('click', () => {
      if (!this.isDead && !this.controls.isLocked && !this.inventoryManager.isOpen) {
        this.controls.lock();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (this.isDead) {
        if (e.code === 'KeyR') window.location.reload();
        return;
      }

      if (e.code === 'Tab') {
        e.preventDefault();
        this.inventoryManager.toggle();
        return;
      }

      if (e.code === 'KeyE' && !this.inventoryManager.isOpen) {
        this.interactionManager.interact();
      }

      if (e.code === 'KeyR' && this.weaponManager) {
        this.weaponManager.reload();
      }
      
      if (this.weaponManager && !this.inventoryManager.isOpen) {
        const digit = parseInt(e.key);
        if (!isNaN(digit) && digit >= 1 && digit <= 5) {
          this.inventoryManager.equipHotbar(digit - 1);
        }
      }

      this._onKeyChange(e.code, true);
    });

    document.addEventListener('keyup', (e) => this._onKeyChange(e.code, false));
    
    document.addEventListener('mousedown', (e) => {
      if (this.controls.isLocked && e.button === 0 && !this.isDead && !this.inventoryManager.isOpen) {
        this.isShooting = true;
        this._shoot(); 
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isShooting = false;
      }
    });
  }

  _onKeyChange(code, isPressed) {
    if (this.isDead || this.inventoryManager.isOpen) return;
    switch (code) {
      case 'KeyW': this.moveState.forward = isPressed; break;
      case 'KeyS': this.moveState.backward = isPressed; break;
      case 'KeyA': this.moveState.left = isPressed; break;
      case 'KeyD': this.moveState.right = isPressed; break;
    }
  }

  _shoot() {
    if (!this.weaponManager) return;
    const shotResults = this.weaponManager.shoot(this.scene.children);

    if (shotResults) {
      shotResults.forEach(shot => {
        const validHit = shot.hit;

        if (validHit.object.userData.isZombieMesh) {
          const bloodGroup = new THREE.Group();
          const bGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
          const bMat = new THREE.MeshBasicMaterial({ color: 0xcc0000 });
          
          const bloodParticles = [];
          for (let i = 0; i < 4; i++) { 
            const p = new THREE.Mesh(bGeo, bMat);
            p.position.copy(validHit.point);
            p.userData.velocity = new THREE.Vector3(
              (Math.random() - 0.5) * 3,
              Math.random() * 3 + 1,
              (Math.random() - 0.5) * 3
            );
            bloodGroup.add(p);
            bloodParticles.push(p);
          }
          this.scene.add(bloodGroup);

          const bloodStartTime = performance.now();
          const animateBlood = () => {
            const elapsed = (performance.now() - bloodStartTime) / 1000;
            if (elapsed < 0.3) {
              bloodParticles.forEach(p => {
                p.position.addScaledVector(p.userData.velocity, 0.016);
                p.userData.velocity.y -= 9.8 * 0.016;
              });
              requestAnimationFrame(animateBlood);
            } else {
              this.scene.remove(bloodGroup);
              bGeo.dispose();
              bMat.dispose();
            }
          };
          requestAnimationFrame(animateBlood);

          validHit.object.material.color.setHex(0xff3333);
          setTimeout(() => validHit.object.material.color.setHex(0xffffff), 100);

          const zombie = validHit.object.userData.rootZombie;
          this.zombieManager.takeDamage(zombie, shot.damage);
        }
      });
    }
  }

  takeDamage(amount) {
    if (this.isDead) return;
    
    this.health -= amount;

    const blood = document.createElement('div');
    blood.style.position = 'fixed';
    blood.style.top = '0';
    blood.style.left = '0';
    blood.style.width = '100vw';
    blood.style.height = '100vh';
    blood.style.boxShadow = 'inset 0 0 140px rgba(220, 0, 0, 0.95)';
    blood.style.backgroundColor = 'rgba(160, 0, 0, 0.3)';
    blood.style.pointerEvents = 'none';
    blood.style.transition = 'opacity 0.4s ease';
    document.body.appendChild(blood);
    
    setTimeout(() => {
      blood.style.opacity = '0';
      setTimeout(() => blood.remove(), 400);
    }, 200);

    if (this.health <= 0) {
      this.isDead = true;
      this.controls.unlock();

      if (this.actions['Idle_Gun']) this.actions['Idle_Gun'].fadeOut(0.2);
      if (this.actions['Run_Gun']) this.actions['Run_Gun'].fadeOut(0.2);
      if (this.actions['Death']) {
        this.actions['Death'].reset().fadeIn(0.2).setLoop(THREE.LoopOnce, 1);
        this.actions['Death'].clampWhenFinished = true;
        this.actions['Death'].play();
      }

      const startCamPos = this.camera.position.clone();
      const backDir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
      const targetCamPos = startCamPos.clone().add(backDir.multiplyScalar(2.5)).add(new THREE.Vector3(0, 1.2, 0));
      
      let camProgress = 0;
      const deathCamInterval = setInterval(() => {
        camProgress += 0.02;
        if (camProgress <= 1.0) {
          this.camera.position.lerpVectors(startCamPos, targetCamPos, camProgress);
          if (this.model) this.camera.lookAt(this.model.position.clone().add(new THREE.Vector3(0, 1.0, 0)));
        } else {
          clearInterval(deathCamInterval);
        }
      }, 16);
    }
  }

  update(delta) {
    if (this.mixer) this.mixer.update(delta);

    if (this.isShooting && this.weaponManager && this.controls.isLocked) {
      const activeWeapon = this.weaponManager.currentWeaponName;
      if (this.weaponConfig[activeWeapon].automatic) {
        this._shoot();
      }
    }

    if (this.model && this.controls.isLocked && !this.inventoryManager.isOpen) {
      this.model.position.copy(this.camera.position);
      this.model.position.y -= 1.6;

      const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      camDir.y = 0;
      camDir.normalize();
      
      this.model.position.sub(camDir.multiplyScalar(0.28));

      const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.model.rotation.y = euler.y + Math.PI;

      const armBone = this.model.getObjectByName('LowerArmL') || this.model.getObjectByName('HandL');
      if (armBone) {
        armBone.rotation.x = euler.x; 
      }

      if (!this.isDead) {
        const isMoving = this.moveState.forward || this.moveState.backward || this.moveState.left || this.moveState.right;
        const targetAction = isMoving ? 'Run_Gun' : 'Idle_Gun';

        if (this.currentAction !== targetAction) {
          const prev = this.actions[this.currentAction];
          const next = this.actions[targetAction];
          if (prev && next) {
            next.reset().fadeIn(0.2);
            prev.fadeOut(0.2);
            next.play();
          }
          this.currentAction = targetAction;
        }
      }
    }
    
    if (this.weaponManager) {
        this.weaponManager.update(delta);

        // UPDATE AMMO UI
        if (this.ammoContainer) {
          const wName = this.weaponManager.currentWeaponName;
          const current = this.weaponManager.ammoState[wName];
          const max = this.weaponManager.serverWeapons[wName].maxAmmo;
          const isReloading = this.weaponManager.isReloading;
          
          if (isReloading) {
            this.ammoContainer.innerHTML = `<span style="color: #ffaa00; font-size: 1.4rem;">RELOADING...</span>`;
          } else {
            const color = current <= (max * 0.25) ? '#ff4444' : '#ffffff';
            this.ammoContainer.innerHTML = `
              <span style="font-size: 1rem; color: #aaa;">${wName.toUpperCase()}</span>
              <span style="color: ${color}; font-size: 2.2rem;">${current}</span> 
              <span style="color: #666; font-size: 1.2rem;">/ ${max}</span>
            `;
          }
        }
    }

    if (this.controls.isLocked && !this.isDead && !this.inventoryManager.isOpen) {
      this.velocity.x -= this.velocity.x * 10.0 * delta;
      this.velocity.z -= this.velocity.z * 10.0 * delta;

      this.direction.z = Number(this.moveState.forward) - Number(this.moveState.backward);
      this.direction.x = Number(this.moveState.right) - Number(this.moveState.left);
      this.direction.normalize();

      if (this.moveState.forward || this.moveState.backward) this.velocity.z -= this.direction.z * this.speed * delta;
      if (this.moveState.left || this.moveState.right) this.velocity.x -= this.direction.x * this.speed * delta;

      this.controls.moveRight(-this.velocity.x * delta);
      this.controls.moveForward(-this.velocity.z * delta);

      this.camera.position.y = 1.6;
    }

    if (this.interactionManager) {
      const canInteract = this.controls.isLocked && !this.isDead && !this.inventoryManager.isOpen;
      this.interactionManager.update(canInteract);
    }
  }
}