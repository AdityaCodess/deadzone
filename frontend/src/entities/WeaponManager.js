import * as THREE from 'three';

export class WeaponManager {
  constructor(scene, camera, playerModel, serverWeapons) {
    this.scene = scene;
    this.camera = camera;
    this.playerModel = playerModel;
    this.serverWeapons = serverWeapons; 
    
    this.currentWeaponName = 'Pistol';
    this.weaponMesh = null;
    this.standaloneReloadMesh = null;
    
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
    this.center = new THREE.Vector2(0, 0);
    this.updateReferences();
  }

  switchWeapon(weaponName) {
    if (this.isReloading || this.currentWeaponName === weaponName) return;

    if (this.weaponMesh) {
      this.weaponMesh.visible = false;
    }

    // Unarm player if slot is empty
    if (!weaponName || !this.serverWeapons[weaponName]) {
       this.currentWeaponName = null;
       this.weaponMesh = null;
       return;
    }

    this.currentWeaponName = weaponName;
    this.weaponMesh = this.playerModel.getObjectByName(this.visualConfigs[weaponName].meshName);
    
    if (this.weaponMesh) {
      this.weaponMesh.visible = true;
      this.baseQuaternion.copy(this.weaponMesh.quaternion);
    }
  }

  updateReferences() {
    if (this.playerModel && !this.weaponMesh && this.currentWeaponName) {
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

  shoot(sceneObjects) {
    if (this.isReloading || !this.currentWeaponName) return null;
    
    const config = this.serverWeapons[this.currentWeaponName];
    const now = performance.now();
    
    if (now - this.lastShotTime < config.fireRate) {
      return null; 
    }

    if (this.ammoState[this.currentWeaponName] <= 0) {
      return null;
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
      const offsetX = (Math.random() - 0.5) * spread;
      const offsetY = (Math.random() - 0.5) * spread;
      
      this.raycaster.far = config.range;
      this.raycaster.setFromCamera(new THREE.Vector2(offsetX, offsetY), this.camera);
      
      const intersects = this.raycaster.intersectObjects(sceneObjects, true);
      
      const validHit = intersects.find(hit => {
        if (!this.playerModel) return true;
        let isSelf = false;
        hit.object.traverseAncestors((ancestor) => {
          if (ancestor === this.playerModel) isSelf = true;
        });
        return !isSelf && hit.object !== this.playerModel;
      });

      const endPoint = validHit ? validHit.point : muzzleOrigin.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(config.range));

      const tracerGeo = new THREE.BufferGeometry().setFromPoints([muzzleOrigin, endPoint]);
      const tracerMat = new THREE.LineBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.6 });
      const tracerLine = new THREE.Line(tracerGeo, tracerMat);
      this.scene.add(tracerLine);
      
      setTimeout(() => {
        this.scene.remove(tracerLine);
        tracerGeo.dispose();
        tracerMat.dispose();
      }, 45);

      if (validHit) {
        hits.push({ hit: validHit, damage: config.damage });
      }
    }

    return hits.length > 0 ? hits : null;
  }

  reload() {
    if (!this.currentWeaponName) return;
    const maxAmmo = this.serverWeapons[this.currentWeaponName].maxAmmo;
    if (this.isReloading || this.ammoState[this.currentWeaponName] >= maxAmmo) return;
    
    this.isReloading = true;
    this.reloadTimer = 0;

    if (this.weaponMesh) {
      this.weaponMesh.visible = false;
    }

    if (this.playerModel) {
      const sourceMesh = this.playerModel.getObjectByName(this.visualConfigs[this.currentWeaponName].meshName);
      if (sourceMesh) {
        this.standaloneReloadMesh = new THREE.Mesh(
          sourceMesh.geometry.clone(),
          sourceMesh.material.clone()
        );
        this.standaloneReloadMesh.scale.set(1.0, 1.0, 1.0);
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
        const camPos = this.camera.position.clone();
        const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const arcY = Math.sin(progress * Math.PI) * 0.25;

        const targetPos = camPos
          .add(camDir.multiplyScalar(0.8))
          .add(camRight.multiplyScalar(0.2))
          .add(new THREE.Vector3(0, -0.2 + arcY, 0));

        this.standaloneReloadMesh.position.copy(targetPos);
        this.standaloneReloadMesh.rotation.x = easeProgress * Math.PI * 4;
        this.standaloneReloadMesh.rotation.y = easeProgress * Math.PI * 2;
      }

      if (progress >= 1.0) {
        this.ammoState[this.currentWeaponName] = this.serverWeapons[this.currentWeaponName].maxAmmo;
        this.isReloading = false;
        
        if (this.standaloneReloadMesh) {
          this.scene.remove(this.standaloneReloadMesh);
          this.standaloneReloadMesh.geometry.dispose();
          if (Array.isArray(this.standaloneReloadMesh.material)) {
            this.standaloneReloadMesh.material.forEach(m => m.dispose());
          } else {
            this.standaloneReloadMesh.material.dispose();
          }
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