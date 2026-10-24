import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { shaderPipeline } from '../systems/ShaderPipeline.js';

export class WeaponManager {
  constructor(scene, camera, playerModel, serverWeapons, serverConsumables, audioManager, onDepleteCallback) {
    this.scene = scene;
    this.camera = camera;
    this.playerModel = playerModel;
    this.serverWeapons = serverWeapons; 
    this.serverConsumables = serverConsumables || {};
    this.audioManager = audioManager;
    this.onDepleteCallback = onDepleteCallback;
    
    this.currentWeaponName = null;
    this.weaponMesh = null;
    this.standaloneReloadMesh = null;
    this.reloadMeshCache = {};
    this.consumableMeshCache = {};
    this.activeConsumableMesh = null;
    this.loader = new GLTFLoader();
    
    this.isReloading = false;
    this.reloadTimer = 0;

    // Melee & Guitar Special 4-second animation states
    this.isSwinging = false;
    this.swingTimer = 0;
    this.swingDuration = 0.35;

    this.isSpecialAnimating = false;
    this.specialTimer = 0;
    this.specialDuration = 4.0;
    this.standaloneSpecialMesh = null;
    this.pendingDeplete = false;

    this.lastShotTime = 0;
    this.baseQuaternion = new THREE.Quaternion();

    this.visualConfigs = {
      'Pistol':  { meshName: 'Pistol', muzzleOffset: new THREE.Vector3(0, 0.1, 0.5) },
      'Rifle':   { meshName: 'Rifle', muzzleOffset: new THREE.Vector3(0, 0.1, 0.8) },
      'SMG':     { meshName: 'SMG', muzzleOffset: new THREE.Vector3(0, 0.1, 0.65) },
      'Shotgun': { meshName: 'Shotgun', muzzleOffset: new THREE.Vector3(0, 0.1, 0.7) },
      'Axe':     { meshName: 'Axe', muzzleOffset: new THREE.Vector3(0, 0.1, 0.4) },
      'Bat':     { meshName: 'WoodenBat_Barbed', muzzleOffset: new THREE.Vector3(0, 0.1, 0.4) },
      'Guitar':  { meshName: 'Guitar', muzzleOffset: new THREE.Vector3(0, 0.1, 0.4) }
    };

    this.ammoState = {};
    for (const [weaponName, config] of Object.entries(this.serverWeapons)) {
      this.ammoState[weaponName] = config.infiniteAmmo ? Infinity : config.maxAmmo;
    }

    this.raycaster = new THREE.Raycaster();
    this.rayVec = new THREE.Vector2();

    this.sharedTracerMat = new THREE.LineBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.6 });

    this._tempCamPos = new THREE.Vector3();
    this._tempCamDir = new THREE.Vector3();
    this._tempCamRight = new THREE.Vector3();
    this._swingQuat = new THREE.Quaternion();
    this._swingEuler = new THREE.Euler();

    this.updateReferences();
  }

  stopShooting() {}

  switchWeapon(itemName) {
    this.stopShooting();
    if (this.isReloading || this.isSpecialAnimating) return;

    if (this.isSwinging && this.weaponMesh) {
      this.weaponMesh.quaternion.copy(this.baseQuaternion);
      this.isSwinging = false;
    }

    if (this.weaponMesh) {
      this.weaponMesh.visible = false;
      this.weaponMesh = null;
    }
    if (this.activeConsumableMesh) {
      this.activeConsumableMesh.visible = false;
      this.activeConsumableMesh = null;
    }

    if (itemName && this.serverConsumables[itemName]) {
      this.currentWeaponName = null;
      this._equipConsumableMesh(itemName);
      return;
    }

    if (!itemName || !this.serverWeapons[itemName]) {
      this.currentWeaponName = null;
      return;
    }

    this.currentWeaponName = itemName;
    const meshName = this.visualConfigs[itemName]?.meshName || this.serverWeapons[itemName]?.meshName || itemName;

    if (this.playerModel) {
      this.weaponMesh = this.playerModel.getObjectByName(meshName);
      // Fallback for Bat if model uses WoodenBat_Barbed
      if (!this.weaponMesh && itemName === 'Bat') {
        this.weaponMesh = this.playerModel.getObjectByName('WoodenBat_Barbed');
      }
      if (this.weaponMesh) {
        this.weaponMesh.visible = true;
        this.baseQuaternion.copy(this.weaponMesh.quaternion);
      }
    }
  }

  _equipConsumableMesh(itemName) {
    if (!this.playerModel) return;
    const handNode = this.playerModel.getObjectByName('Pistol')?.parent ||
                     this.playerModel.getObjectByName('HandR') ||
                     this.playerModel;

    if (this.consumableMeshCache[itemName]) {
      this.activeConsumableMesh = this.consumableMeshCache[itemName];
      this.activeConsumableMesh.visible = true;
      return;
    }

    const cfg = this.serverConsumables[itemName];
    if (!cfg || !cfg.modelPath) return;

    this.loader.load(cfg.modelPath, (gltf) => {
      const wrapper = new THREE.Group();
      const mesh = gltf.scene;
      shaderPipeline.optimizeModel(mesh, false, true);

      // Normalize the giant medkit model down to a compact 0.25m size in the player's hand
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      mesh.position.sub(center);
      wrapper.add(mesh);

      const targetHandSize = cfg.handSize || 0.25;
      if (maxDim > 0) {
        wrapper.scale.setScalar(targetHandSize / maxDim);
      }

      wrapper.position.set(0, 0.05, 0.12);
      handNode.add(wrapper);
      this.consumableMeshCache[itemName] = wrapper;

      if (!this.currentWeaponName) {
        this.activeConsumableMesh = wrapper;
        wrapper.visible = true;
      } else {
        wrapper.visible = false;
      }
    });
  }

  updateReferences() {
    if (this.playerModel && !this.weaponMesh && this.currentWeaponName) {
      const meshName = this.visualConfigs[this.currentWeaponName]?.meshName || this.currentWeaponName;
      this.weaponMesh = this.playerModel.getObjectByName(meshName);
      if (this.weaponMesh) {
        this.baseQuaternion.copy(this.weaponMesh.quaternion);
      }
    }
  }

  getMuzzlePosition() {
    this.updateReferences();
    if (this.weaponMesh && !this.isReloading && !this.isSpecialAnimating) {
      const offset = this.visualConfigs[this.currentWeaponName]?.muzzleOffset || new THREE.Vector3(0, 0.1, 0.5);
      return this.weaponMesh.localToWorld(offset.clone());
    }
    return this.camera.position.clone().add(new THREE.Vector3(0, 0, -0.5));
  }

  _getOrBuildStandaloneMesh(weaponName) {
    if (!this.reloadMeshCache[weaponName] && this.playerModel) {
      const meshName = this.visualConfigs[weaponName]?.meshName || weaponName;
      let sourceMesh = this.playerModel.getObjectByName(meshName);
      if (!sourceMesh && weaponName === 'Bat') {
        sourceMesh = this.playerModel.getObjectByName('WoodenBat_Barbed');
      }

      if (sourceMesh) {
        const clone = sourceMesh.clone();
        clone.visible = true;
        clone.position.set(0, 0, 0);
        clone.rotation.set(0, 0, 0);
        clone.scale.set(1, 1, 1);

        // Compute bounding box safely via setFromObject
        const box = new THREE.Box3().setFromObject(clone);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          clone.scale.setScalar(0.75 / maxDim);
        }

        this.reloadMeshCache[weaponName] = clone;
      }
    }
    return this.reloadMeshCache[weaponName] || null;
  }

  shoot(targetObjects) {
    if (this.isReloading || this.isSwinging || this.isSpecialAnimating || !this.currentWeaponName) {
      this.stopShooting();
      return null;
    }
    
    const config = this.serverWeapons[this.currentWeaponName];
    const now = performance.now();
    
    if (now - this.lastShotTime < config.fireRate) return null; 
    if (!config.infiniteAmmo && this.ammoState[this.currentWeaponName] <= 0) {
      this.stopShooting();
      return null;
    }

    const isMelee = config.type === 'melee';
    const isSpecialGuitar = config.type === 'special_melee';

    // Play corresponding weapon audio
    if (this.audioManager) {
      const soundName = config.audio || (this.currentWeaponName === 'Shotgun' ? 'shotgun' : 'pistol');
      const vol = isSpecialGuitar ? 0.45 : (isMelee ? 0.35 : 0.2);
      this.audioManager.playShot(soundName, vol);
    }

    if (!config.infiniteAmmo) {
      this.ammoState[this.currentWeaponName]--;
    }
    this.lastShotTime = now;

    // Trigger visual animation based on weapon type
    if (isSpecialGuitar) {
      // Guitar: Hide in hand and trigger 4-second aggressive riff animation
      this.isSpecialAnimating = true;
      this.specialTimer = 0;
      this.specialDuration = config.specialDuration || 4.0;
      this.pendingDeplete = this.ammoState[this.currentWeaponName] <= 0;

      if (this.weaponMesh) {
        this.weaponMesh.visible = false;
      }

      this.standaloneSpecialMesh = this._getOrBuildStandaloneMesh(this.currentWeaponName);
      if (this.standaloneSpecialMesh) {
        this.scene.add(this.standaloneSpecialMesh);
      }
    } else if (isMelee) {
      // Axe & Bat: Simple hand swing animation
      this.isSwinging = true;
      this.swingTimer = 0;
      this.swingDuration = config.swingDuration || 0.32;
    } else {
      // Guns (Pistol, Rifle, SMG, Shotgun): Camera FOV kick
      this.camera.fov = 73;
      this.camera.updateProjectionMatrix();
      setTimeout(() => {
        this.camera.fov = 75;
        this.camera.updateProjectionMatrix();
      }, 50);
    }

    // Hit detection
    const hits = [];

    if (isMelee || isSpecialGuitar) {
      // Wide melee arc check so swinging Axe, Bat, or Guitar feels responsive at close range
      const strikeRays = [
        [0, 0],
        [-0.12, 0],
        [0.12, 0],
        [0, -0.08],
        [0, 0.08]
      ];
      let matchedHit = null;
      this.raycaster.far = config.range || 3.5;

      for (const [rx, ry] of strikeRays) {
        this.rayVec.set(rx, ry);
        this.raycaster.setFromCamera(this.rayVec, this.camera);
        const intersects = this.raycaster.intersectObjects(targetObjects, true);
        if (intersects.length > 0) {
          matchedHit = intersects[0];
          break;
        }
      }

      if (matchedHit) {
        hits.push({ hit: matchedHit, damage: config.damage });
      }
    } else {
      // Standard gun raycast + bullet tracers
      const muzzleOrigin = this.getMuzzlePosition();
      const pellets = config.pellets || 1;
      const spread = config.spread || 0;

      for (let i = 0; i < pellets; i++) {
        this.rayVec.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
        
        this.raycaster.far = config.range;
        this.raycaster.setFromCamera(this.rayVec, this.camera);
        
        const intersects = this.raycaster.intersectObjects(targetObjects, true);
        const validHit = intersects[0];

        const endPoint = validHit
          ? validHit.point
          : muzzleOrigin.clone().addScaledVector(this.raycaster.ray.direction, config.range);

        const tracerGeo = new THREE.BufferGeometry().setFromPoints([muzzleOrigin, endPoint]);
        const tracerLine = new THREE.Line(tracerGeo, this.sharedTracerMat);
        this.scene.add(tracerLine);
        
        setTimeout(() => {
          this.scene.remove(tracerLine);
          tracerGeo.dispose();
        }, 45);

        if (validHit) {
          hits.push({ hit: validHit, damage: config.damage });
        }
      }
    }

    return hits.length > 0 ? hits : null;
  }

  reload() {
    this.stopShooting();
    
    if (!this.currentWeaponName || this.isSwinging || this.isSpecialAnimating) return;
    const config = this.serverWeapons[this.currentWeaponName];
    if (!config || config.infiniteAmmo || config.type === 'melee' || config.type === 'special_melee') return;

    const maxAmmo = config.maxAmmo;
    if (this.isReloading || this.ammoState[this.currentWeaponName] >= maxAmmo) return;
    
    this.isReloading = true;
    this.reloadTimer = 0;

    if (this.weaponMesh) {
      this.weaponMesh.visible = false;
    }

    this.standaloneReloadMesh = this._getOrBuildStandaloneMesh(this.currentWeaponName);
    if (this.standaloneReloadMesh) {
      this.scene.add(this.standaloneReloadMesh);
    }
  }

  update(delta) {
    this.updateReferences();

    // 1. Axe & Bat Hand Swing Animation
    if (this.isSwinging && this.weaponMesh) {
      this.swingTimer += delta;
      const progress = Math.min(this.swingTimer / this.swingDuration, 1.0);
      const swingArc = Math.sin(progress * Math.PI);

      this._swingEuler.set(-swingArc * 1.35, swingArc * 0.65, -swingArc * 0.45);
      this._swingQuat.setFromEuler(this._swingEuler);
      this.weaponMesh.quaternion.copy(this.baseQuaternion).multiply(this._swingQuat);

      if (progress >= 1.0) {
        this.isSwinging = false;
        this.weaponMesh.quaternion.copy(this.baseQuaternion);
      }
    }

    // 2. Guitar 4-Second Special Riff Animation
    if (this.isSpecialAnimating) {
      this.specialTimer += delta;
      const progress = Math.min(this.specialTimer / this.specialDuration, 1.0);

      if (this.standaloneSpecialMesh) {
        this._tempCamPos.copy(this.camera.position);
        this._tempCamDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this._tempCamRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);

        // Aggressive rock-riff vibration & spinning arc in front of the player
        const riffWave = Math.sin(progress * Math.PI * 16) * 0.08;
        const arcY = Math.sin(progress * Math.PI) * 0.18;

        this._tempCamPos
          .addScaledVector(this._tempCamDir, 0.85)
          .addScaledVector(this._tempCamRight, riffWave);
        this._tempCamPos.y += -0.15 + arcY;

        this.standaloneSpecialMesh.position.copy(this._tempCamPos);
        this.standaloneSpecialMesh.rotation.x = Math.sin(progress * Math.PI * 12) * 0.5;
        this.standaloneSpecialMesh.rotation.y = progress * Math.PI * 8;
        this.standaloneSpecialMesh.rotation.z = Math.cos(progress * Math.PI * 10) * 0.4;
      }

      if (progress >= 1.0) {
        this.isSpecialAnimating = false;

        if (this.standaloneSpecialMesh) {
          this.scene.remove(this.standaloneSpecialMesh);
          this.standaloneSpecialMesh = null;
        }

        if (this.pendingDeplete) {
          this.pendingDeplete = false;
          if (this.onDepleteCallback) {
            this.onDepleteCallback();
          }
        } else if (this.weaponMesh) {
          this.weaponMesh.visible = true;
          this.weaponMesh.quaternion.copy(this.baseQuaternion);
        }
      }
    }

    // 3. Gun Reload Animation
    if (this.isReloading && this.currentWeaponName) {
      this.reloadTimer += delta;
      
      const reloadDuration = this.serverWeapons[this.currentWeaponName].reloadTime;
      const progress = Math.min(this.reloadTimer / reloadDuration, 1.0);

      if (this.standaloneReloadMesh) {
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        this._tempCamPos.copy(this.camera.position);
        this._tempCamDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this._tempCamRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const arcY = Math.sin(progress * Math.PI) * 0.25;

        this._tempCamPos
          .addScaledVector(this._tempCamDir, 0.8)
          .addScaledVector(this._tempCamRight, 0.2);
        this._tempCamPos.y += -0.2 + arcY;

        this.standaloneReloadMesh.position.copy(this._tempCamPos);
        this.standaloneReloadMesh.rotation.x = easeProgress * Math.PI * 4;
        this.standaloneReloadMesh.rotation.y = easeProgress * Math.PI * 2;
      }

      if (progress >= 1.0) {
        this.ammoState[this.currentWeaponName] = this.serverWeapons[this.currentWeaponName].maxAmmo;
        this.isReloading = false;
        
        if (this.standaloneReloadMesh) {
          this.scene.remove(this.standaloneReloadMesh);
          this.standaloneReloadMesh = null;
        }

        if (this.weaponMesh) {
          this.weaponMesh.visible = true;
          this.weaponMesh.quaternion.copy(this.baseQuaternion);
        }
      }
    }
  }
}