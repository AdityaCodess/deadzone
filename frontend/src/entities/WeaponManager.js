import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { shaderPipeline } from '../systems/ShaderPipeline.js';

export class WeaponManager {
  constructor(scene, camera, playerModel, serverWeapons, serverConsumables, audioManager, inventoryManager, zombieManager, worldGenerator, onDepleteCallback) {
    this.scene = scene;
    this.camera = camera;
    this.playerModel = playerModel;
    this.serverWeapons = serverWeapons; 
    this.serverConsumables = serverConsumables || {};
    this.audioManager = audioManager;
    this.inventoryManager = inventoryManager;
    this.zombieManager = zombieManager;
    this.worldGenerator = worldGenerator;
    this.onDepleteCallback = onDepleteCallback;
    
    this.currentWeaponName = null;
    this.weaponMesh = null;
    this.standaloneReloadMesh = null;
    this.reloadMeshCache = {};
    this.consumableMeshCache = {};
    this.activeConsumableMesh = null;
    this.loader = new GLTFLoader();

    // Explosion & Projectile state
    this.explosionGltf = null;
    this.activeProjectiles = [];
    this.activeExplosions = [];
    this._preloadExplosionAsset();
    
    this.isReloading = false;
    this.reloadTimer = 0;

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
      'Pistol':  { meshName: 'Pistol',           muzzleOffset: new THREE.Vector3(0, 0.08, 0.38) },
      'Rifle':   { meshName: 'Rifle',            muzzleOffset: new THREE.Vector3(0, 0.08, 0.65) },
      'SMG':     { meshName: 'SMG',              muzzleOffset: new THREE.Vector3(0, 0.08, 0.50) },
      'Shotgun': { meshName: 'Shotgun',          muzzleOffset: new THREE.Vector3(0, 0.08, 0.60) },
      'RPG':     { meshName: 'RPG',              muzzleOffset: new THREE.Vector3(0, 0.10, 0.70) },
      'Grenade': { meshName: 'Grenade',          muzzleOffset: new THREE.Vector3(0, 0.05, 0.25) },
      'Axe':     { meshName: 'Axe',              muzzleOffset: new THREE.Vector3(0, 0.1, 0.4) },
      'Bat':     { meshName: 'WoodenBat_Barbed', muzzleOffset: new THREE.Vector3(0, 0.1, 0.4) },
      'Guitar':  { meshName: 'Guitar',           muzzleOffset: new THREE.Vector3(0, 0.1, 0.4) }
    };

    this.ammoState = {};
    for (const [weaponName, config] of Object.entries(this.serverWeapons)) {
      this.ammoState[weaponName] = config.infiniteAmmo ? Infinity : (config.maxAmmo || 1);
    }

    this.raycaster = new THREE.Raycaster();
    this.aimRaycaster = new THREE.Raycaster();
    this.rayVec = new THREE.Vector2();

    this.sharedTracerMat = new THREE.LineBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.75 });
    this.rocketGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6);
    this.rocketGeo.rotateX(Math.PI / 2);
    this.rocketMat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
    this.grenadeProjGeo = new THREE.SphereGeometry(0.11, 8, 8);
    this.grenadeProjMat = new THREE.MeshLambertMaterial({ color: 0x2d4c1e });

    this._tempCamPos = new THREE.Vector3();
    this._tempCamDir = new THREE.Vector3();
    this._tempCamRight = new THREE.Vector3();
    this._swingQuat = new THREE.Quaternion();
    this._swingEuler = new THREE.Euler();
    this._projBox = new THREE.Box3();

    this.updateReferences();
  }

  _preloadExplosionAsset() {
    this.loader.load('/deadzone-assets/lp_explosion.gltf', (gltf) => {
      this.explosionGltf = gltf;
    }, undefined, (err) => {
      console.warn('Could not preload lp_explosion.gltf:', err);
    });
  }

  stopShooting() {}

  switchWeapon(itemName) {
    this.stopShooting();
    if (this.isReloading || this.isSpecialAnimating) return;

    // FIX: If re-equipping the exact same weapon/grenade (e.g. stack count went from 2 -> 1),
    // keep the mesh visible in the player's hand!
    if (itemName && itemName === this.currentWeaponName && this.weaponMesh) {
      this.weaponMesh.visible = true;
      return;
    }

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
      this._equipExternalHandMesh(itemName, this.serverConsumables[itemName].modelPath, 0.25, false);
      return;
    }

    if (!itemName || !this.serverWeapons[itemName]) {
      this.currentWeaponName = null;
      return;
    }

    this.currentWeaponName = itemName;
    const cfg = this.serverWeapons[itemName];
    const meshName = this.visualConfigs[itemName]?.meshName || cfg.meshName || itemName;

    if (this.playerModel) {
      const embeddedMesh = this.playerModel.getObjectByName(meshName);
      if (embeddedMesh) {
        this.weaponMesh = embeddedMesh;
        this.weaponMesh.visible = true;
        this.baseQuaternion.copy(this.weaponMesh.quaternion);
      } else if (cfg.modelPath) {
        const handSize = itemName === 'RPG' ? 0.95 : (itemName === 'Grenade' ? 0.20 : 0.65);
        this._equipExternalHandMesh(itemName, cfg.modelPath, handSize, true);
      }
    }
  }
  _equipExternalHandMesh(itemName, modelPath, targetHandSize = 0.25, isWeaponMesh = false) {
    if (!this.playerModel || !modelPath) return;
    const refGun = this.playerModel.getObjectByName('Rifle') || this.playerModel.getObjectByName('Pistol');
    const handNode = refGun ? refGun.parent : (this.playerModel.getObjectByName('HandR') || this.playerModel);

    if (this.consumableMeshCache[itemName]) {
      const cached = this.consumableMeshCache[itemName];
      cached.visible = true;
      if (isWeaponMesh) {
        this.weaponMesh = cached;
        this.baseQuaternion.copy(cached.quaternion);
      } else {
        this.activeConsumableMesh = cached;
      }
      return;
    }

    this.loader.load(modelPath, (gltf) => {
      const wrapper = new THREE.Group();
      const mesh = gltf.scene;
      shaderPipeline.optimizeModel(mesh, false, true);

      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      mesh.position.sub(center);

      // CRITICAL FIX FOR RPG GRIP ORIENTATION:
      // If the model's longest axis is X instead of Z, rotate the inner mesh by -90 degrees on Y so the barrel points straight forward!
      if (itemName === 'RPG') {
        if (size.x > size.z) {
          mesh.rotation.y = -Math.PI / 2;
        } else {
          mesh.rotation.y = Math.PI;
        }
      }

      wrapper.add(mesh);

      if (maxDim > 0) {
        wrapper.scale.setScalar(targetHandSize / maxDim);
      }

      // Copy the exact hand bone alignment from the embedded Rifle so the player holds it naturally
      if (refGun && isWeaponMesh) {
        wrapper.position.copy(refGun.position);
        wrapper.quaternion.copy(refGun.quaternion);
        if (itemName === 'RPG') {
          wrapper.position.y += 0.06;
          wrapper.position.z += 0.08;
        }
      } else {
        wrapper.position.set(0, 0.06, 0.18);
      }

      handNode.add(wrapper);
      this.consumableMeshCache[itemName] = wrapper;

      if (this.currentWeaponName === itemName && isWeaponMesh) {
        this.weaponMesh = wrapper;
        this.baseQuaternion.copy(wrapper.quaternion);
        wrapper.visible = true;
      } else if (!this.currentWeaponName && !isWeaponMesh) {
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
      const found = this.playerModel.getObjectByName(meshName);
      if (found) {
        this.weaponMesh = found;
        this.baseQuaternion.copy(this.weaponMesh.quaternion);
      }
    }
  }

  // FIXED MUZZLE ORIGIN: Forces world matrix update on the player model & weapon bone so bullets/tracers spawn at the exact gun barrel
  getMuzzlePosition() {
    this.updateReferences();
    if (this.playerModel) {
      this.playerModel.updateMatrixWorld(true);
    }
    if (this.weaponMesh && !this.isReloading && !this.isSpecialAnimating) {
      this.weaponMesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(this.weaponMesh);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        return center.addScaledVector(forward, 0.35);
      }
    }
    // Fallback right-hand shoulder offset
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    return this.camera.position.clone()
      .addScaledVector(forward, 0.65)
      .addScaledVector(right, 0.25)
      .add(new THREE.Vector3(0, -0.18, 0));
  }

  _getOrBuildStandaloneMesh(weaponName) {
    if (!this.reloadMeshCache[weaponName] && this.playerModel) {
      const meshName = this.visualConfigs[weaponName]?.meshName || weaponName;
      const sourceMesh = this.playerModel.getObjectByName(meshName) || this.consumableMeshCache[weaponName];

      if (sourceMesh) {
        const clone = sourceMesh.clone();
        clone.visible = true;
        clone.position.set(0, 0, 0);
        clone.rotation.set(0, 0, 0);
        clone.scale.set(1, 1, 1);

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

  _triggerExplosion(impactPoint, blastRadius) {
    if (this.audioManager) {
      this.audioManager.playShot('blast', 0.55);
    }

    if (this.zombieManager && this.zombieManager.zombies) {
      const rSq = blastRadius * blastRadius;
      for (const zombie of this.zombieManager.zombies) {
        if (zombie.userData.state === 'alive') {
          const dx = zombie.position.x - impactPoint.x;
          const dz = zombie.position.z - impactPoint.z;
          if (dx * dx + dz * dz <= rSq) {
            this.zombieManager.takeDamage(zombie, 9999);
          }
        }
      }
    }

    if (this.explosionGltf) {
      const expRoot = new THREE.Group();
      // Lock explosion center strictly to ground level (y = 0.0)
      expRoot.position.set(impactPoint.x, 0.0, impactPoint.z);

      const expScene = this.explosionGltf.scene.clone(true);
      const visualScale = 24.0 * blastRadius;
      expRoot.scale.setScalar(visualScale);
      expRoot.add(expScene);
      this.scene.add(expRoot);

      const mixer = new THREE.AnimationMixer(expScene);
      let maxDuration = 1.0;
      this.explosionGltf.animations.forEach((clip) => {
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        if (clip.duration > maxDuration) maxDuration = clip.duration;
      });

      // Force frame-0 update so initial bounding box is calculated immediately
      mixer.update(0.016);
      expRoot.updateMatrixWorld(true);

      this.activeExplosions.push({
        root: expRoot,
        mixer,
        elapsed: 0,
        duration: maxDuration,
        impactX: impactPoint.x,
        impactZ: impactPoint.z
      });
    }
  }

  shoot(targetObjects) {
    if (this.isReloading || this.isSwinging || this.isSpecialAnimating || !this.currentWeaponName) {
      this.stopShooting();
      return null;
    }
    
    const config = this.serverWeapons[this.currentWeaponName];
    const now = performance.now();
    
    if (now - this.lastShotTime < config.fireRate) return null; 

   // Throwables (Grenade) check stack count in inventory
    if (config.type === 'throwable') {
      const activeSlot = this.inventoryManager ? this.inventoryManager.getActiveSlotData() : null;
      if (!activeSlot || activeSlot.count <= 0) return null;

      this.lastShotTime = now;
      if (this.audioManager) this.audioManager.playShot(config.audio || 'grenade', 0.35);

      const origin = this.getMuzzlePosition();
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
      const velocity = forward.multiplyScalar(config.throwSpeed || 18.0);
      velocity.y += 4.5; // Upward throw arc

      // Build a properly scaled world-space projectile (0.18m diameter) so it is never huge in mid-air
      const grenadeProj = new THREE.Group();
      if (this.weaponMesh) {
        const clonedModel = this.weaponMesh.clone(true);
        clonedModel.visible = true;
        clonedModel.position.set(0, 0, 0);
        clonedModel.rotation.set(0, 0, 0);
        clonedModel.scale.set(1, 1, 1);

        const box = new THREE.Box3().setFromObject(clonedModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        clonedModel.position.sub(center);
        grenadeProj.add(clonedModel);

        // Lock thrown grenade size to 18cm (0.18m) in world space
        if (maxDim > 0) {
          grenadeProj.scale.setScalar(0.18 / maxDim);
        }
      } else {
        grenadeProj.add(new THREE.Mesh(this.grenadeProjGeo, this.grenadeProjMat));
      }

      grenadeProj.position.copy(origin);
      this.scene.add(grenadeProj);

      this.activeProjectiles.push({
        type: 'grenade',
        mesh: grenadeProj,
        velocity,
        gravity: 22.0,
        timer: 0,
        maxTime: config.fuseTime || 2.0,
        blastRadius: config.blastRadius || 6.5
      });

      // Consume 1 grenade from the stack
      if (this.inventoryManager) {
        this.inventoryManager.consumeActiveItem(1);
        const remaining = this.inventoryManager.getActiveSlotData()?.count || 0;
        // If we still have another grenade in the stack, briefly hide for 150ms (throw motion) then show the next grenade in hand!
        if (remaining > 0 && this.weaponMesh) {
          this.weaponMesh.visible = false;
          setTimeout(() => {
            if (this.currentWeaponName === 'Grenade' && this.weaponMesh) {
              this.weaponMesh.visible = true;
            }
          }, 150);
        }
      }
      return null;
    }

    // RPG Launcher
    if (config.type === 'launcher') {
      if (this.ammoState[this.currentWeaponName] <= 0) {
        this.reload();
        return null;
      }

      this.ammoState[this.currentWeaponName]--;
      this.lastShotTime = now;
      if (this.audioManager) this.audioManager.playShot(config.audio || 'rpg', 0.4);

      const muzzleOrigin = this.getMuzzlePosition();
      this.aimRaycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
      const aimPoint = this.aimRaycaster.ray.at(60, new THREE.Vector3());
      const shootDir = aimPoint.sub(muzzleOrigin).normalize();

      const rocketMesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
      rocketMesh.position.copy(muzzleOrigin);
      rocketMesh.lookAt(muzzleOrigin.clone().add(shootDir));
      this.scene.add(rocketMesh);

      this.activeProjectiles.push({
        type: 'rpg',
        mesh: rocketMesh,
        velocity: shootDir.multiplyScalar(config.projectileSpeed || 38.0),
        gravity: 0,
        timer: 0,
        maxTime: 3.5,
        blastRadius: config.blastRadius || 11.0
      });

      return null;
    }

    if (!config.infiniteAmmo && this.ammoState[this.currentWeaponName] <= 0) {
      this.stopShooting();
      return null;
    }

    const isMelee = config.type === 'melee';
    const isSpecialGuitar = config.type === 'special_melee';

    if (this.audioManager) {
      const soundName = config.audio || (this.currentWeaponName === 'Shotgun' ? 'shotgun' : 'pistol');
      const vol = isSpecialGuitar ? 0.45 : (isMelee ? 0.35 : 0.2);
      this.audioManager.playShot(soundName, vol);
    }

    if (!config.infiniteAmmo) {
      this.ammoState[this.currentWeaponName]--;
    }
    this.lastShotTime = now;

    if (isSpecialGuitar) {
      this.isSpecialAnimating = true;
      this.specialTimer = 0;
      this.specialDuration = config.specialDuration || 4.0;
      this.pendingDeplete = this.ammoState[this.currentWeaponName] <= 0;

      if (this.weaponMesh) this.weaponMesh.visible = false;

      this.standaloneSpecialMesh = this._getOrBuildStandaloneMesh(this.currentWeaponName);
      if (this.standaloneSpecialMesh) this.scene.add(this.standaloneSpecialMesh);
    } else if (isMelee) {
      this.isSwinging = true;
      this.swingTimer = 0;
      this.swingDuration = config.swingDuration || 0.32;
    } else {
      this.camera.fov = 73;
      this.camera.updateProjectionMatrix();
      setTimeout(() => {
        this.camera.fov = 75;
        this.camera.updateProjectionMatrix();
      }, 50);
    }

    const hits = [];

    if (isMelee || isSpecialGuitar) {
      const strikeRays = [[0, 0], [-0.12, 0], [0.12, 0], [0, -0.08], [0, 0.08]];
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
      // TRUE MUZZLE-ORIGIN RAYCASTING: Ray originates from the gun's physical barrel and converges on the camera crosshair target
      const muzzleOrigin = this.getMuzzlePosition();
      const pellets = config.pellets || 1;
      const spread = config.spread || 0;

      for (let i = 0; i < pellets; i++) {
        this.rayVec.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
        this.aimRaycaster.setFromCamera(this.rayVec, this.camera);

        // Find where the player's crosshair is aiming
        const aimHits = this.aimRaycaster.intersectObjects(targetObjects, true);
        const targetPoint = aimHits.length > 0
          ? aimHits[0].point.clone()
          : this.aimRaycaster.ray.at(config.range, new THREE.Vector3());

        // Cast the actual physical bullet ray from the gun's muzzle to the targetPoint
        const bulletDir = targetPoint.clone().sub(muzzleOrigin).normalize();
        this.raycaster.set(muzzleOrigin, bulletDir);
        this.raycaster.far = config.range;

        const intersects = this.raycaster.intersectObjects(targetObjects, true);
        const validHit = intersects[0];

        const endPoint = validHit
          ? validHit.point
          : muzzleOrigin.clone().addScaledVector(bulletDir, config.range);

        const tracerGeo = new THREE.BufferGeometry().setFromPoints([muzzleOrigin, endPoint]);
        const tracerLine = new THREE.Line(tracerGeo, this.sharedTracerMat);
        this.scene.add(tracerLine);
        
        setTimeout(() => {
          this.scene.remove(tracerLine);
          tracerGeo.dispose();
        }, 55);

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
    if (!config || config.infiniteAmmo || config.type === 'melee' || config.type === 'special_melee' || config.type === 'throwable') return;

    const maxAmmo = config.maxAmmo;
    const currentAmmo = this.ammoState[this.currentWeaponName];
    if (this.isReloading || currentAmmo >= maxAmmo) return;

    // Check if the player has matching reserve ammo in their inventory
    const ammoType = config.ammoType;
    if (ammoType && this.inventoryManager) {
      const reserve = this.inventoryManager.getTotalItemCount(ammoType);
      if (reserve <= 0) return; // Cannot reload without reserve ammo!
    }
    
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

  _updateProjectilesAndExplosions(delta) {
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const proj = this.activeProjectiles[i];
      proj.timer += delta;

      if (proj.gravity) {
        proj.velocity.y -= proj.gravity * delta;
      }

      const nextPos = proj.mesh.position.clone().addScaledVector(proj.velocity, delta);
      let shouldDetonate = proj.timer >= proj.maxTime;

      if (proj.type === 'rpg') {
        if (nextPos.y <= 0.05) {
          nextPos.y = 0.05;
          shouldDetonate = true;
        }
        if (!shouldDetonate && this.worldGenerator) {
          this._projBox.setFromCenterAndSize(nextPos, new THREE.Vector3(0.3, 0.3, 0.3));
          if (this.worldGenerator.checkCollision(this._projBox, nextPos.x, nextPos.z)) {
            shouldDetonate = true;
          }
        }
        if (!shouldDetonate && this.zombieManager) {
          for (const z of this.zombieManager.zombies) {
            if (z.userData.state === 'alive' && z.position.distanceToSquared(nextPos) < 1.4) {
              shouldDetonate = true;
              break;
            }
          }
        }
      } else if (proj.type === 'grenade') {
        if (nextPos.y <= 0.12) {
          nextPos.y = 0.12;
          proj.velocity.y = Math.abs(proj.velocity.y) * 0.45;
          proj.velocity.x *= 0.72;
          proj.velocity.z *= 0.72;
        }
        if (this.worldGenerator) {
          this._projBox.setFromCenterAndSize(nextPos, new THREE.Vector3(0.25, 0.25, 0.25));
          if (this.worldGenerator.checkCollision(this._projBox, nextPos.x, nextPos.z)) {
            proj.velocity.x *= -0.6;
            proj.velocity.z *= -0.6;
          }
        }
        proj.mesh.rotation.x += delta * 8;
        proj.mesh.rotation.z += delta * 6;
      }

      proj.mesh.position.copy(nextPos);

      if (shouldDetonate) {
        this._triggerExplosion(proj.mesh.position, proj.blastRadius);
        this.scene.remove(proj.mesh);
        this.activeProjectiles.splice(i, 1);
      }
    }

    // Keep explosion strictly locked to ground (y = 0.0) without sky-clipping
    for (let i = this.activeExplosions.length - 1; i >= 0; i--) {
      const exp = this.activeExplosions[i];
      exp.elapsed += delta;
      exp.mixer.update(delta);

      // Explicitly lock root position to ground surface so keyframe tracks cannot lift it into the air
      exp.root.position.set(exp.impactX, 0.0, exp.impactZ);

      if (exp.elapsed >= exp.duration) {
        this.scene.remove(exp.root);
        this.activeExplosions.splice(i, 1);
      }
    }
  }

  update(delta) {
    this.updateReferences();
    this._updateProjectilesAndExplosions(delta);

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

    if (this.isSpecialAnimating) {
      this.specialTimer += delta;
      const progress = Math.min(this.specialTimer / this.specialDuration, 1.0);

      if (this.standaloneSpecialMesh) {
        this._tempCamPos.copy(this.camera.position);
        this._tempCamDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this._tempCamRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);

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
          if (this.onDepleteCallback) this.onDepleteCallback();
        } else if (this.weaponMesh) {
          this.weaponMesh.visible = true;
          this.weaponMesh.quaternion.copy(this.baseQuaternion);
        }
      }
    }

    if (this.isReloading && this.currentWeaponName) {
      this.reloadTimer += delta;
      const config = this.serverWeapons[this.currentWeaponName];
      const reloadDuration = config.reloadTime;
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
        const needed = config.maxAmmo - this.ammoState[this.currentWeaponName];
        if (config.ammoType && this.inventoryManager) {
          const loaded = this.inventoryManager.consumeItemByName(config.ammoType, needed);
          this.ammoState[this.currentWeaponName] += loaded;
        } else {
          this.ammoState[this.currentWeaponName] = config.maxAmmo;
        }

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