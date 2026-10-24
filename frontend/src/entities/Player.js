import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WeaponManager } from './WeaponManager.js';
import { InventoryManager } from '../ui/InventoryManager.js';
import { InteractionManager } from '../systems/InteractionManager.js';
import { shaderPipeline } from '../systems/ShaderPipeline.js';
import { ApiClient } from '../services/apiClient.js';

export class Player {
  constructor(scene, camera, canvas, playerConfig, weaponConfig, consumableConfig, zombieManager, startingInventory, worldGenerator, audioManager) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.zombieManager = zombieManager;
    this.weaponConfig = weaponConfig;
    this.consumableConfig = consumableConfig || {};
    this.worldGenerator = worldGenerator;
    this.audioManager = audioManager;
   
    this.controls = new PointerLockControls(this.camera, this.canvas);
    this.controls.maxPolarAngle = Math.PI - 0.6;
    
    this.moveState = { forward: false, backward: false, left: false, right: false };
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    
    this.baseSpeed = playerConfig.baseSpeed;
    this.sprintMultiplier = playerConfig.sprintMultiplier;
    this.gravity = playerConfig.gravity;
    this.jumpForce = playerConfig.jumpForce;
    
    this.maxStamina = playerConfig.maxStamina || 100;
    this.stamina = this.maxStamina;
    this.staminaDrain = playerConfig.staminaDrain || 25.0;
    this.staminaRegen = playerConfig.staminaRegen || 6.0;
    this.jumpCost = playerConfig.jumpCost || 20.0;
    
    this.canJump = true;
    this.isSprintingInput = false; 
    this.isExhausted = false; 
    
    this.maxHealth = playerConfig.maxHealth;
    this.health = this.maxHealth;
    
    this.isDead = false;
    this.isShooting = false;
    this.equippedItemName = null;
    this.lastConsumableUseTime = 0;
    this.isUsingConsumable = false;

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = 'Idle_Gun';
    this.weaponManager = null;

    this.sharedBloodGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
    this.sharedBloodMat = new THREE.MeshBasicMaterial({ color: 0xcc0000 });

    this._playerBox = new THREE.Box3();
    this._minVec = new THREE.Vector3();
    this._maxVec = new THREE.Vector3();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

    this._lastHudAmmoKey = '';
    this._lastHudHealth = -1;

    // Build icon map from backend consumableConfig
    const itemIcons = {};
    for (const [name, cfg] of Object.entries(this.consumableConfig)) {
      if (cfg.iconPath) itemIcons[name] = cfg.iconPath;
    }
    
    this.inventoryManager = new InventoryManager(
      startingInventory,
      itemIcons,
      (itemName) => {
        this.equippedItemName = itemName;
        if (this.weaponManager) {
          this.weaponManager.switchWeapon(itemName);
        }
      },
      (shouldLock) => {
        if (shouldLock && !this.isDead) {
          this.canvas.focus(); 
          this.controls.lock();
        } else {
          this.controls.unlock();
        }
      }
    );

    this.interactionManager = new InteractionManager(this.scene, this.camera, this.inventoryManager);

    this._buildHUD();
    this._bindEvents();
  }

  _buildHUD() {
    document.querySelectorAll('#ammo-hud, #health-hud').forEach(el => el.remove());

    this.ammoContainer = document.createElement('div');
    this.ammoContainer.id = 'ammo-hud';
    this.ammoContainer.style.cssText = `
      position: fixed; bottom: 30px; right: 30px;
      background: rgba(43, 39, 38, 0.9); border: 2px solid #5a5654;
      padding: 10px 20px; border-radius: 8px; z-index: 100;
      color: #fff; font-family: monospace; font-weight: bold;
      box-shadow: inset 0 0 10px rgba(0,0,0,0.8), 0 4px 6px rgba(0,0,0,0.5); 
      display: flex; align-items: baseline; gap: 10px; pointer-events: none;
    `;
    document.body.appendChild(this.ammoContainer);

    this.healthContainer = document.createElement('div');
    this.healthContainer.id = 'health-hud';
    this.healthContainer.style.cssText = `
      position: fixed; bottom: 30px; left: 30px;
      background: rgba(43, 39, 38, 0.9); border: 2px solid #5a5654;
      padding: 10px 20px; border-radius: 8px; z-index: 100;
      color: #fff; font-family: monospace; font-weight: bold;
      box-shadow: inset 0 0 10px rgba(0,0,0,0.8), 0 4px 6px rgba(0,0,0,0.5); 
      display: flex; flex-direction: column; gap: 6px; pointer-events: none; width: 220px;
    `;
    
    this.healthText = document.createElement('div');
    this.healthText.style.cssText = `font-size: 1.2rem; display: flex; justify-content: space-between; align-items: baseline;`;
    
    this.healthBarBg = document.createElement('div');
    this.healthBarBg.style.cssText = `width: 100%; height: 14px; background: #1a1818; border-radius: 4px; border: 1px solid #000; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.8);`;
    
    this.healthBarFill = document.createElement('div');
    this.healthBarFill.style.cssText = `width: 100%; height: 100%; background: #33cc33; transition: width 0.2s ease-out, background-color 0.3s;`;
    this.healthBarBg.appendChild(this.healthBarFill);
    
    this.staminaText = document.createElement('div');
    this.staminaText.style.cssText = `font-size: 0.85rem; color: #aaa; margin-top: 4px; display: flex; justify-content: space-between;`;
    this.staminaText.innerText = 'STAMINA';

    this.staminaBarBg = document.createElement('div');
    this.staminaBarBg.style.cssText = `width: 100%; height: 8px; background: #1a1818; border-radius: 4px; border: 1px solid #000; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.8);`;
    
    this.staminaBarFill = document.createElement('div');
    this.staminaBarFill.style.cssText = `width: 100%; height: 100%; background: #00aaff; transition: width 0.1s linear, background-color 0.3s;`;
    this.staminaBarBg.appendChild(this.staminaBarFill);

    this.healthContainer.appendChild(this.healthText);
    this.healthContainer.appendChild(this.healthBarBg);
    this.healthContainer.appendChild(this.staminaText);
    this.healthContainer.appendChild(this.staminaBarBg);
    
    document.body.appendChild(this.healthContainer);
  }

  async loadModel() {
    const loader = new GLTFLoader();
    
    return new Promise((resolve) => {
      loader.load('/deadzone-assets/Characters_Matt.gltf', (gltf) => {
        this.model = gltf.scene;
        shaderPipeline.optimizeModel(this.model, true, true);

        const weapons = ['Axe', 'Guitar', 'Knife', 'Rifle', 'Shotgun', 'SMG', 'Spear', 'WoodenBat_Barbed', 'WoodenBat_Saw'];
        weapons.forEach(w => {
          const mesh = this.model.getObjectByName(w);
          if (mesh) mesh.visible = false;
        });

        this.mixer = new THREE.AnimationMixer(this.model);
        gltf.animations.forEach((clip) => {
          this.actions[clip.name] = this.mixer.clipAction(clip);
        });

        this.weaponManager = new WeaponManager(
          this.scene,
          this.camera,
          this.model,
          this.weaponConfig,
          this.consumableConfig,
          this.audioManager
        );

        const activeItem = this.inventoryManager.getActiveItem();
        this.equippedItemName = activeItem;
        if (activeItem) this.weaponManager.switchWeapon(activeItem);

        if (this.actions['Idle_Gun']) this.actions['Idle_Gun'].play();

        this.scene.add(this.model);
        resolve();
      });
    });
  }

  _bindEvents() {
    this.controls.addEventListener('unlock', () => {
      this.isShooting = false;
      this.isSprintingInput = false;
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
        this.canvas.focus(); 
        this.inventoryManager.toggle();
        return;
      }

      if (e.code === 'KeyE' && !this.inventoryManager.isOpen) {
        this.interactionManager.interact();
      }

      if (e.code === 'KeyR' && this.weaponManager) {
        this.weaponManager.reload();
      }

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.isSprintingInput = true;
      }
      
      if (e.code === 'Space' && this.canJump && this.controls.isLocked && !this.inventoryManager.isOpen) {
        if (this.stamina >= this.jumpCost && !this.isExhausted) {
          this.velocity.y += this.jumpForce;
          this.stamina -= this.jumpCost;
          this.canJump = false;
        }
      }
      
      if (this.weaponManager && !this.inventoryManager.isOpen) {
        const digit = parseInt(e.key);
        if (!isNaN(digit) && digit >= 1 && digit <= 5) {
          this.inventoryManager.equipHotbar(digit - 1);
        }
      }

      this._onKeyChange(e.code, true);
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.isSprintingInput = false;
      }
      this._onKeyChange(e.code, false);
    });
    
    document.addEventListener('mousedown', (e) => {
      if (this.controls.isLocked && e.button === 0 && !this.isDead && !this.inventoryManager.isOpen) {
        if (this.equippedItemName && this.consumableConfig[this.equippedItemName]) {
          this._useConsumable(this.equippedItemName);
        } else {
          this.isShooting = true;
          this._shoot(); 
        }
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isShooting = false;
      }
    });
  }

  async _useConsumable(itemName) {
    if (this.isUsingConsumable) return;
    const stats = this.consumableConfig[itemName];
    if (!stats) return;

    const now = performance.now();
    if (now - this.lastConsumableUseTime < (stats.cooldown || 1.0) * 1000) return;
    if (stats.type === 'heal' && this.health >= this.maxHealth) return;

    this.isUsingConsumable = true;
    try {
      const result = await ApiClient.useConsumable(itemName, this.health);
      if (result && result.valid) {
        this.health = result.newHealth;
        this.lastConsumableUseTime = performance.now();
        this.inventoryManager.consumeActiveItem();

        const healFlash = document.createElement('div');
        healFlash.style.cssText = `
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          box-shadow: inset 0 0 120px rgba(0, 220, 80, 0.75);
          background-color: rgba(0, 160, 60, 0.15); pointer-events: none;
          transition: opacity 0.4s ease; z-index: 90;
        `;
        document.body.appendChild(healFlash);
        setTimeout(() => {
          healFlash.style.opacity = '0';
          setTimeout(() => healFlash.remove(), 400);
        }, 200);
      }
    } catch (err) {
      console.error('Failed to use consumable via backend:', err);
    } finally {
      this.isUsingConsumable = false;
    }
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
    if (!this.weaponManager || !this.weaponManager.currentWeaponName) return;
    const targetList = this.zombieManager ? this.zombieManager.zombies : [];
    const shotResults = this.weaponManager.shoot(targetList);

    if (shotResults) {
      shotResults.forEach(shot => {
        const validHit = shot.hit;

        if (validHit.object.userData.isZombieMesh) {
          const bloodGroup = new THREE.Group();
          const bloodParticles = [];
          for (let i = 0; i < 4; i++) { 
            const p = new THREE.Mesh(this.sharedBloodGeo, this.sharedBloodMat);
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
            }
          };
          requestAnimationFrame(animateBlood);

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
    blood.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      box-shadow: inset 0 0 140px rgba(220, 0, 0, 0.95);
      background-color: rgba(160, 0, 0, 0.3); pointer-events: none;
      transition: opacity 0.4s ease;
    `;
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

  _checkWallCollision() {
    if (!this.worldGenerator || !this.worldGenerator.colliders) return false;
    const radius = 0.4;
    const height = 1.6;
    const pos = this.camera.position;
    
    this._minVec.set(pos.x - radius, pos.y - height, pos.z - radius);
    this._maxVec.set(pos.x + radius, pos.y + 0.2, pos.z + radius);
    this._playerBox.set(this._minVec, this._maxVec);

    const colliders = this.worldGenerator.colliders;
    for (let i = 0; i < colliders.length; i++) {
      if (this._playerBox.intersectsBox(colliders[i])) return true;
    }
    return false;
  }

  update(delta) {
    if (this.mixer) this.mixer.update(delta);

    if (this.isShooting && this.weaponManager && this.controls.isLocked) {
      if (this.weaponManager.currentWeaponName && this.weaponConfig[this.weaponManager.currentWeaponName]?.automatic) {
        this._shoot();
      }
    }
    
    let isPhysicallySprinting = false;
    let currentSpeed = this.baseSpeed;

    if (this.controls.isLocked && !this.isDead && !this.inventoryManager.isOpen) {
      const isMovingForward = this.moveState.forward;
      
      if (this.stamina <= 0) {
        this.isExhausted = true;
      } else if (this.stamina >= this.maxStamina * 0.25) {
        this.isExhausted = false; 
      }
      
      if (this.isSprintingInput && isMovingForward && !this.isExhausted) {
        isPhysicallySprinting = true;
        currentSpeed = this.baseSpeed * this.sprintMultiplier;
        this.stamina = Math.max(0, this.stamina - this.staminaDrain * delta);
      } else if (this.stamina < this.maxStamina) {
        this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * delta);
      }
    }

    if (this.model && !this.isDead) {
      this.model.position.copy(this.camera.position);
      this.model.position.y -= 1.6;

      this._euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.model.rotation.y = this._euler.y + Math.PI;

      this.model.position.x += Math.sin(this._euler.y) * 0.28;
      this.model.position.z += Math.cos(this._euler.y) * 0.28;

      const armBone = this.model.getObjectByName('LowerArmL') || this.model.getObjectByName('HandL');
      if (armBone) {
        armBone.rotation.x = this._euler.x; 
      }

      const isMoving = (this.moveState.forward || this.moveState.backward || this.moveState.left || this.moveState.right) && this.controls.isLocked && !this.inventoryManager.isOpen;
      let targetAction = 'Idle_Gun';

      if (!this.canJump) {
        targetAction = this.actions['Jump_Gun'] ? 'Jump_Gun' : (this.actions['Jump'] ? 'Jump' : 'Idle_Gun');
      } else if (isMoving) {
        targetAction = (isPhysicallySprinting && this.actions['Sprint_Gun']) ? 'Sprint_Gun' : 'Run_Gun';
      }

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
    
    if (this.weaponManager) {
      this.weaponManager.update(delta);

      if (this.ammoContainer) {
        const wName = this.weaponManager.currentWeaponName;
        const consumable = this.equippedItemName ? this.consumableConfig[this.equippedItemName] : null;
        const current = wName ? this.weaponManager.ammoState[wName] : 0;
        const isReloading = this.weaponManager.isReloading;
        const hudKey = `${this.equippedItemName}_${wName}_${current}_${isReloading}`;

        if (this._lastHudAmmoKey !== hudKey) {
          this._lastHudAmmoKey = hudKey;
          if (wName) {
            const max = this.weaponManager.serverWeapons[wName].maxAmmo;
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
          } else if (consumable) {
            this.ammoContainer.innerHTML = `
              <span style="font-size: 1rem; color: #33cc33;">${this.equippedItemName.toUpperCase()}</span>
              <span style="color: #fff; font-size: 1.3rem;">+${consumable.healAmount} HP [LMB]</span>
            `;
          } else {
            this.ammoContainer.innerHTML = `<span style="color: #aaa; font-size: 1.4rem;">UNARMED</span>`;
          }
        }
      }
    }

    if (this.healthContainer) {
      const currentHealth = Math.ceil(Math.max(0, this.health));
      if (this._lastHudHealth !== currentHealth || this.isDead) {
        this._lastHudHealth = currentHealth;
        const hpPercent = (currentHealth / this.maxHealth) * 100;
        
        if (this.isDead) {
          this.healthText.innerHTML = `<span style="color: #ff4444; width: 100%; text-align: center; font-size: 1.5rem;">YOU ARE DEAD [R]</span>`;
        } else {
          this.healthText.innerHTML = `
            <span style="color: #aaa;">HEALTH</span>
            <span style="font-size: 1.8rem; color: #fff;">${currentHealth}</span>
          `;
        }
        
        this.healthBarFill.style.width = `${hpPercent}%`;
        if (hpPercent > 50) this.healthBarFill.style.backgroundColor = '#33cc33';
        else if (hpPercent > 25) this.healthBarFill.style.backgroundColor = '#ffaa00';
        else this.healthBarFill.style.backgroundColor = '#ff4444';
      }
      
      const stamPercent = (this.stamina / this.maxStamina) * 100;
      this.staminaBarFill.style.width = `${stamPercent}%`;
      this.staminaBarFill.style.backgroundColor = this.isExhausted ? '#888888' : (stamPercent < 25 ? '#ff4444' : '#00aaff');
    }

    if (!this.isDead) {
      this.velocity.y -= this.gravity * delta;
      this.velocity.x -= this.velocity.x * 10.0 * delta;
      this.velocity.z -= this.velocity.z * 10.0 * delta;

      if (this.controls.isLocked && !this.inventoryManager.isOpen) {
        this.direction.z = Number(this.moveState.forward) - Number(this.moveState.backward);
        this.direction.x = Number(this.moveState.right) - Number(this.moveState.left);
        this.direction.normalize();

        if (this.moveState.forward || this.moveState.backward) this.velocity.z -= this.direction.z * currentSpeed * delta;
        if (this.moveState.left || this.moveState.right) this.velocity.x -= this.direction.x * currentSpeed * delta;
      }

      const startX = this.camera.position.x;
      const startZ = this.camera.position.z;

      this.controls.moveRight(-this.velocity.x * delta);
      this.controls.moveForward(-this.velocity.z * delta);

      const endX = this.camera.position.x;
      const endZ = this.camera.position.z;

      this.camera.position.set(endX, this.camera.position.y, startZ);
      if (this._checkWallCollision()) {
        this.camera.position.x = startX; 
      }

      const updatedX = this.camera.position.x; 
      this.camera.position.set(updatedX, this.camera.position.y, endZ);
      if (this._checkWallCollision()) {
        this.camera.position.z = startZ; 
      }
      
      this.camera.position.y += this.velocity.y * delta;

      if (this.camera.position.y < 1.6) {
        this.camera.position.y = 1.6;
        this.velocity.y = 0;
        this.canJump = true;
      }
    }

    if (this.interactionManager) {
      const canInteract = this.controls.isLocked && !this.isDead && !this.inventoryManager.isOpen;
      this.interactionManager.update(canInteract, delta);
    }
  }
}