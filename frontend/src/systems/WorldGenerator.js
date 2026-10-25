import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { shaderPipeline } from './ShaderPipeline.js';

export class WorldGenerator {
  constructor(scene, environmentManager) {
    this.scene = scene;
    this.environmentManager = environmentManager;
    this.tileSize = 20; 
    this.gridRows = 29;
    this.gridCols = 29;
    this.offsetX = (this.gridCols * this.tileSize) / 2 - (this.tileSize / 2);
    this.offsetZ = (this.gridRows * this.tileSize) / 2 - (this.tileSize / 2);

    this.mapLayout = [];
    this.roadPositions = [];
    this.colliders = []; 
    this.spatialColliderGrid = new Map();
    this.lampTransforms = [];
    this.meshTemplates = {};

    this._initLampResources();
  }

  _initLampResources() {
    this.poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5.0, 6);
    this.armGeo = new THREE.BoxGeometry(1.2, 0.08, 0.08);
    this.bulbGeo = new THREE.BoxGeometry(0.4, 0.1, 0.25);
    this.glowGeo = new THREE.PlaneGeometry(14, 14);

    this.poleMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    this.bulbMat = new THREE.MeshStandardMaterial({
      color: 0xffeedd,
      emissive: 0xffaa44,
      emissiveIntensity: 0
    });
  }

  _queueStreetLamp(posX, posZ, localX, localZ, armDirX, armDirZ) {
    const worldX = posX + localX;
    const worldZ = posZ + localZ;
    this.lampTransforms.push({ worldX, worldZ, armDirX, armDirZ });

    if (this.environmentManager) {
      const worldLightPos = new THREE.Vector3(worldX + armDirX * 1.2, 4.5, worldZ + armDirZ * 1.2);
      this.environmentManager.registerStreetLamp(worldLightPos, this.bulbMat);
    }
  }

  _buildInstancedStreetLamps() {
    const count = this.lampTransforms.length;
    if (count === 0) return;

    const poleInstanced = new THREE.InstancedMesh(this.poleGeo, this.poleMat, count);
    const armInstanced = new THREE.InstancedMesh(this.armGeo, this.poleMat, count);
    const bulbInstanced = new THREE.InstancedMesh(this.bulbGeo, this.bulbMat, count);
    const glowInstanced = new THREE.InstancedMesh(this.glowGeo, shaderPipeline.lampGlowMaterial, count);

    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const { worldX, worldZ, armDirX, armDirZ } = this.lampTransforms[i];

      dummy.position.set(worldX, 2.5, worldZ);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      poleInstanced.setMatrixAt(i, dummy.matrix);

      dummy.position.set(worldX + armDirX * 0.5, 4.9, worldZ + armDirZ * 0.5);
      dummy.rotation.set(0, armDirZ !== 0 ? Math.PI / 2 : 0, 0);
      dummy.updateMatrix();
      armInstanced.setMatrixAt(i, dummy.matrix);

      dummy.position.set(worldX + armDirX * 1.0, 4.82, worldZ + armDirZ * 1.0);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bulbInstanced.setMatrixAt(i, dummy.matrix);

      dummy.position.set(worldX + armDirX * 1.5, 0.03, worldZ + armDirZ * 1.5);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      glowInstanced.setMatrixAt(i, dummy.matrix);
    }

    poleInstanced.frustumCulled = false;
    armInstanced.frustumCulled = false;
    bulbInstanced.frustumCulled = false;
    glowInstanced.frustumCulled = false;

    this.scene.add(poleInstanced, armInstanced, bulbInstanced, glowInstanced);
    this.lampTransforms = [];
  }

  async loadAssets() {
    const loader = new GLTFLoader();
    
    const loadPromise = (name, path, isRoad) => {
      return new Promise((resolve, reject) => {
        loader.load(path, (gltf) => {
          shaderPipeline.optimizeModel(gltf.scene, !isRoad, true);
          
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          
          const alignY = isRoad ? -box.max.y : -box.min.y;
          gltf.scene.position.set(-center.x, alignY, -center.z);
          
          const wrapper = new THREE.Group();
          wrapper.add(gltf.scene);
          
          let scaleY = 1;
          if (size.x > 0 && size.z > 0) {
            if (isRoad) {
              wrapper.scale.set(this.tileSize / size.x, 1, this.tileSize / size.z);
            } else {
              const maxDim = Math.max(size.x, size.z);
              const scaleFactor = (this.tileSize * 0.88) / maxDim;
              wrapper.scale.set(scaleFactor, scaleFactor, scaleFactor);
              scaleY = scaleFactor;
            }
          }

          wrapper.updateMatrixWorld(true);

          const subMeshes = [];
          wrapper.traverse((child) => {
            if (child.isMesh) {
              subMeshes.push({
                geometry: child.geometry,
                material: child.material,
                localMatrix: child.matrixWorld.clone(),
                castShadow: !isRoad,
                receiveShadow: true
              });
            }
          });

          const fittedBox = new THREE.Box3().setFromObject(wrapper);
          const fittedSize = fittedBox.getSize(new THREE.Vector3());

          this.meshTemplates[name] = {
            subMeshes,
            halfWidth: (fittedSize.x * 0.5) - 0.35,
            halfDepth: (fittedSize.z * 0.5) - 0.35,
            height: Math.max(20, fittedSize.y * scaleY)
          };
          resolve();
        }, undefined, reject);
      });
    };

    await Promise.all([
      loadPromise('road_straight', '/deadzone-assets/Street_Straight.gltf', true),
      loadPromise('road_intersection', '/deadzone-assets/Street_4Way.gltf', true),
      loadPromise('pavement_base', '/deadzone-assets/Floor_4x4.gltf', true),
      loadPromise('bldg_small', '/deadzone-assets/Building_Small_1.gltf', false),
      loadPromise('bldg_med', '/deadzone-assets/Building_Medium_2_001.gltf', false),
      loadPromise('bldg_large', '/deadzone-assets/Building_Large_2.gltf', false)
    ]);
  }

  async generate(serverWorldState) {
    await this.loadAssets();

    if (serverWorldState && serverWorldState.mapLayout) {
      this.gridRows = serverWorldState.gridRows;
      this.gridCols = serverWorldState.gridCols;
      this.tileSize = serverWorldState.tileSize;
      this.offsetX = serverWorldState.offsetX;
      this.offsetZ = serverWorldState.offsetZ;
      this.mapLayout = serverWorldState.mapLayout;
    }

    const rows = this.gridRows;
    const cols = this.gridCols;

    const foundationGeo = new THREE.PlaneGeometry(cols * this.tileSize, rows * this.tileSize);
    const foundationMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const foundation = new THREE.Mesh(foundationGeo, foundationMat);
    foundation.rotation.x = -Math.PI / 2;
    foundation.position.set(0, -0.45, 0); 
    foundation.receiveShadow = true;
    this.scene.add(foundation);

    const instanceBuckets = {
      road_straight: [],
      road_intersection: [],
      pavement_base: [],
      bldg_small: [],
      bldg_med: [],
      bldg_large: []
    };

    const dummy = new THREE.Object3D();

    // Build road tiles from server mapLayout
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        if (this.mapLayout[z][x] !== 0) continue;

        const posX = (x * this.tileSize) - this.offsetX;
        const posZ = (z * this.tileSize) - this.offsetZ;
        this.roadPositions.push(new THREE.Vector3(posX, 0, posZ));

        const up = z > 0 ? this.mapLayout[z - 1][x] === 0 : false;
        const down = z < rows - 1 ? this.mapLayout[z + 1][x] === 0 : false;
        const left = x > 0 ? this.mapLayout[z][x - 1] === 0 : false;
        const right = x < cols - 1 ? this.mapLayout[z][x + 1] === 0 : false;
        
        const isVertical = up || down;
        const isHorizontal = left || right;
        const isIntersection = (isVertical && isHorizontal);

        if (isIntersection) {
          dummy.position.set(posX, 0, posZ);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          instanceBuckets.road_intersection.push(dummy.matrix.clone());

          if (z > 0 && x > 0 && this.mapLayout[z - 1][x - 1] === 1 && (x + z) % 2 === 0) {
            this._queueStreetLamp(posX, posZ, -8.2, -8.2, 1, 0);
          }
        } else {
          dummy.position.set(posX, 0, posZ);
          dummy.rotation.set(0, isHorizontal ? Math.PI / 2 : 0, 0);
          dummy.updateMatrix();
          instanceBuckets.road_straight.push(dummy.matrix.clone());

          if ((x + z) % 2 === 0) {
            const side = ((x * 3 + z) % 2 === 0) ? 1 : -1;
            if (isHorizontal) {
              this._queueStreetLamp(posX, posZ, 0, side * 8.2, 0, -side);
            } else {
              this._queueStreetLamp(posX, posZ, side * 8.2, 0, -side, 0);
            }
          }
        }
      }
    }

    // Build buildings from server buildingPlacements
    const placements = serverWorldState?.buildingPlacements || [];
    for (const b of placements) {
      dummy.position.set(b.posX, 0, b.posZ);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      instanceBuckets.pavement_base.push(dummy.matrix.clone());

      const rotY = (b.rotSteps * Math.PI) / 2;
      dummy.position.set(b.posX, 0, b.posZ);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();
      instanceBuckets[b.asset].push(dummy.matrix.clone());

      const tpl = this.meshTemplates[b.asset];
      if (tpl) {
        const hx = (b.rotSteps % 2 === 1) ? tpl.halfDepth : tpl.halfWidth;
        const hz = (b.rotSteps % 2 === 1) ? tpl.halfWidth : tpl.halfDepth;
        const bldgBox = new THREE.Box3(
          new THREE.Vector3(b.posX - hx, -1, b.posZ - hz),
          new THREE.Vector3(b.posX + hx, 50, b.posZ + hz)
        );
        this.colliders.push(bldgBox);
        this.spatialColliderGrid.set(`${b.x}_${b.z}`, bldgBox);
      }
    }

    const finalMatrix = new THREE.Matrix4();
    for (const [assetName, matrices] of Object.entries(instanceBuckets)) {
      const count = matrices.length;
      const tpl = this.meshTemplates[assetName];
      if (!tpl || count === 0) continue;

      for (const sub of tpl.subMeshes) {
        const instMesh = new THREE.InstancedMesh(sub.geometry, sub.material, count);
        instMesh.castShadow = sub.castShadow;
        instMesh.receiveShadow = sub.receiveShadow;
        instMesh.frustumCulled = false;

        for (let i = 0; i < count; i++) {
          finalMatrix.multiplyMatrices(matrices[i], sub.localMatrix);
          instMesh.setMatrixAt(i, finalMatrix);
        }
        instMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(instMesh);
      }
    }

    this._buildInstancedStreetLamps();
    this.meshTemplates = {};
  }

  checkCollision(box3, worldX, worldZ) {
    const gx = Math.round((worldX + this.offsetX) / this.tileSize);
    const gz = Math.round((worldZ + this.offsetZ) / this.tileSize);

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const col = this.spatialColliderGrid.get(`${gx + dx}_${gz + dz}`);
        if (col && box3.intersectsBox(col)) return true;
      }
    }
    return false;
  }

  getRandomRoadPosition(minDistFromCenter = 18, maxDistFromCenter = 90) {
    const validRoads = this.roadPositions.filter(pos => {
      const d = Math.hypot(pos.x, pos.z);
      return d >= minDistFromCenter && d <= maxDistFromCenter;
    });
    if (validRoads.length === 0) return new THREE.Vector3(0, 0, -20);
    return validRoads[Math.floor(Math.random() * validRoads.length)].clone();
  }

  update() {}
}