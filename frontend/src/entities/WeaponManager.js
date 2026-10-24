import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { shaderPipeline } from '../systems/ShaderPipeline.js';

export class WeaponManager {
  constructor(scene, camera, playerModel, serverWeapons, serverConsumables, audioManager) {
    this.scene = scene;
    this.camera = camera;
    this.playerModel = playerModel;
    this.serverWeapons = serverWeapons; 
    this.serverConsumables = serverConsumables || {};
    this.audioManager = audioManager;
    
    this.currentWeaponName = null;
    this.weaponMesh = null;
    this.standaloneReloadMesh = null;
    this.reloadMeshCache = {};
    this.consumableMeshCache = {};
    this.activeConsumableMesh = null;
    this.loader = new GLTFLoader();
    
    this.isReloading = false;
    this.reloadTimer = 0;
    this.lastShotTime = 0;
    this.baseQuaternion = new THREE.Quaternion();

    this.visualConfigs = {
      'Pistol': { meshName: 'Pistol', muzzleOffset: new THREE.Vector3(0, 0.1, 0.5) },
      'Rifle':  { meshName: 'Rifle', muzzleOffset: new THREE.Vector3(0, 0.1, 0.8) },
      'Shotgun':{ meshName: 'Shotgun', muzzleOffset: new THREE.Vector3(0, 0.1, 0.7) }
    };

    this.ammoState = {};
    for (const [weaponName, config] of Object.entries(this.serverWeapons)) {
      this.ammoState[weaponName] = config.maxAmmo;
    }

    this.raycaster = new THREE.Raycaster();
    this.rayVec = new THREE.Vector2();

    this.sharedTracerMat = new THREE.LineBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.6 });

    this._tempCamPos = new THREE.Vector3();
    this._tempCamDir = new THREE.Vector3();
    this._tempCamRight = new THREE.Vector3();

    this.updateReferences();
  }

  stopShooting() {}

  switchWeapon(itemName) {
    this.stopShooting();
    if (this.isReloading) return;

    // Hide currently visible weapon or consumable mesh
    if (this.weaponMesh) {
      this.weaponMesh.visible = false;
      this.weaponMesh = null;
    }
    if (this.activeConsumableMesh) {
      this.activeConsumableMesh.visible = false;
      this.activeConsumableMesh = null;
    }

    // Check if the item is a Consumable (e.g. Medkit)
    if (itemName && this.serverConsumables[itemName]) {
      this.currentWeaponName = null;
      this._equipConsumableMesh(itemName);
      return;
    }

    // Check if the item is a Weapon
    if (!itemName || !this.serverWeapons[itemName]) {
      this.currentWeaponName = null;
      return;
    }

    this.currentWeaponName = itemName;
    if (this.playerModel && this.visualConfigs[itemName]) {
      this.weaponMesh = this.playerModel.getObjectByName(this.visualConfigs[itemName].meshName);
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
      const mesh = gltf.scene;
      shaderPipeline.optimizeModel(mesh, false, true);
      mesh.scale.setScalar(0.35);
      mesh.position.set(0, 0.05, 0.15);
      handNode.add(mesh);
      this.consumableMeshCache[itemName] = mesh;

      if (!this.currentWeaponName) {
        this.activeConsumableMesh = mesh;
        mesh.visible = true;
      } else {
        mesh.visible = false;
      }
    });
  }

  updateReferences() {
    if (this.playerModel && !this.weaponMesh && this.currentWeaponName && this.visualConfigs[this.currentWeaponName]) {
      this.weaponMesh = this.playerModel.getObjectByName(this.visualConfigs[this.currentWeaponName].meshName);
      if (this.weaponMesh) {
        this.baseQuaternion.copy(this.weaponMesh.quaternion);
      }
    }
  }

  getMuzzlePosition() {
    this.updateReferences();
    if (this.weaponMesh && !this.isReloading) {
      return this.weaponMesh.localToWorld(this.visualConfigs[this.currentWeaponName].muzzleOffset.clone());
    }
    return this.camera.position.clone().add(new THREE.Vector3(0, 0, -0.5));
  }

  shoot(targetObjects) {
    if (this.isReloading || !this.currentWeaponName) {
      this.stopShooting();
      return null;
    }
    
    const config = this.serverWeapons[this.currentWeaponName];
    const now = performance.now();
    
    if (now - this.lastShotTime < config.fireRate) return null; 
    if (this.ammoState[this.currentWeaponName] <= 0) {
      this.stopShooting();
      return null;
    }

    if (this.audioManager) {
      const soundName = this.currentWeaponName === 'Shotgun' ? 'shotgun' : 'pistol';
      this.audioManager.playShot(soundName, 0.2);
    }

    this.ammoState[this.currentWeaponName]--;
    this.lastShotTime = now;

    this.camera.fov = 73;
    this.camera.updateProjectionMatrix();
    setTimeout(() => {
      this.camera.fov = 75;
      this.camera.updateProjectionMatrix();
    }, 50);

    const muzzleOrigin = this.getMuzzlePosition();
    const hits = [];
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

    return hits.length > 0 ? hits : null;
  }

  reload() {
    this.stopShooting();
    
    if (!this.currentWeaponName) return;
    const maxAmmo = this.serverWeapons[this.currentWeaponName].maxAmmo;
    if (this.isReloading || this.ammoState[this.currentWeaponName] >= maxAmmo) return;
    
    this.isReloading = true;
    this.reloadTimer = 0;

    if (this.weaponMesh) {
      this.weaponMesh.visible = false;
    }

    if (this.playerModel) {
      if (!this.reloadMeshCache[this.currentWeaponName]) {
        const sourceMesh = this.playerModel.getObjectByName(this.visualConfigs[this.currentWeaponName].meshName);
        if (sourceMesh) {
          this.reloadMeshCache[this.currentWeaponName] = new THREE.Mesh(
            sourceMesh.geometry,
            sourceMesh.material
          );
        }
      }
      this.standaloneReloadMesh = this.reloadMeshCache[this.currentWeaponName];
      if (this.standaloneReloadMesh) {
        this.scene.add(this.standaloneReloadMesh);
      }
    }
  }

  update(delta) {
    this.updateReferences();

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