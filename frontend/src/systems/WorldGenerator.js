import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { shaderPipeline } from './ShaderPipeline.js';

export class WorldGenerator {
  constructor(scene, environmentManager) {
    this.scene = scene;
    this.environmentManager = environmentManager;
    this.tileSize = 20; 
    this.renderDistance = 80.0; 
    
    this.mapLayout = [
      [0, 1, 0, 1, 0, 1, 0, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 1, 1, 1, 0, 1, 0],
      [0, 1, 0, 0, 0, 0, 0, 1, 0],
      [0, 1, 0, 1, 0, 1, 0, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 1, 0, 1, 0, 1, 0]
    ];
    
    this.tiles = [];
    this.assets = {};
    this.colliders = []; 
    this.lampTransforms = [];

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
      const worldLightPos = new THREE.Vector3(
        worldX + armDirX * 1.2,
        4.5,
        worldZ + armDirZ * 1.2
      );
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

    poleInstanced.instanceMatrix.needsUpdate = true;
    armInstanced.instanceMatrix.needsUpdate = true;
    bulbInstanced.instanceMatrix.needsUpdate = true;
    glowInstanced.instanceMatrix.needsUpdate = true;

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
          
          gltf.scene.position.set(-center.x, -box.min.y, -center.z);
          
          const wrapper = new THREE.Group();
          wrapper.add(gltf.scene);
          
          if (size.x > 0 && size.z > 0) {
            if (isRoad) {
              wrapper.scale.set(this.tileSize / size.x, 1, this.tileSize / size.z);
            } else {
              const maxDim = Math.max(size.x, size.z);
              const scaleFactor = (this.tileSize * 0.90) / maxDim;
              wrapper.scale.set(scaleFactor, scaleFactor, scaleFactor);
            }
          }

          this.assets[name] = wrapper;
          resolve();
        }, undefined, (error) => {
          console.error(`Failed to load asset: ${path}`, error);
          reject(error);
        });
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

  async generate() {
    await this.loadAssets();

    const rows = this.mapLayout.length;
    const cols = this.mapLayout[0].length;
    
    const offsetX = (cols * this.tileSize) / 2 - (this.tileSize / 2);
    const offsetZ = (rows * this.tileSize) / 2 - (this.tileSize / 2);

    const foundationGeo = new THREE.PlaneGeometry(cols * this.tileSize, rows * this.tileSize);
    const foundationMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const foundation = new THREE.Mesh(foundationGeo, foundationMat);
    foundation.rotation.x = -Math.PI / 2;
    foundation.position.set(0, -0.05, 0); 
    foundation.receiveShadow = true;
    this.scene.add(foundation);

    const buildingPool = ['bldg_small', 'bldg_med', 'bldg_large'];

    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const posX = (x * this.tileSize) - offsetX;
        const posZ = (z * this.tileSize) - offsetZ;
        const tileType = this.mapLayout[z][x];

        const tileContainer = new THREE.Group();
        tileContainer.position.set(posX, 0, posZ);

        let mesh = null;

        if (tileType === 0) {
          const up = z > 0 ? this.mapLayout[z-1][x] : 0;
          const down = z < rows - 1 ? this.mapLayout[z+1][x] : 0;
          const left = x > 0 ? this.mapLayout[z][x-1] : 0;
          const right = x < cols - 1 ? this.mapLayout[z][x+1] : 0;
          
          const roadConnections = (up === 0 ? 1 : 0) + (down === 0 ? 1 : 0) + (left === 0 ? 1 : 0) + (right === 0 ? 1 : 0);
          const isHorizontalRoad = (left === 0 || right === 0) && roadConnections < 3;
          
          if (roadConnections >= 3 && this.assets['road_intersection']) {
            mesh = this.assets['road_intersection'].clone();
          } else if (this.assets['road_straight']) {
            mesh = this.assets['road_straight'].clone();
            if (isHorizontalRoad) {
              mesh.rotation.y = Math.PI / 2; 
            }
          }

          if (mesh) tileContainer.add(mesh);

          if (roadConnections >= 3) {
            this._queueStreetLamp(posX, posZ, 8.2, 8.2, -1, 0);
          } else if (isHorizontalRoad) {
            const side = ((x + z) % 2 === 0) ? 1 : -1;
            this._queueStreetLamp(posX, posZ, 0, side * 8.2, 0, -side);
          } else {
            const side = ((x + z) % 2 === 0) ? 1 : -1;
            this._queueStreetLamp(posX, posZ, side * 8.2, 0, -side, 0);
          }
        } else if (tileType === 1) {
          mesh = new THREE.Group();
          
          if (this.assets['pavement_base']) {
            const pad = this.assets['pavement_base'].clone();
            mesh.add(pad);
          }

          const randomBldg = buildingPool[Math.floor(Math.random() * buildingPool.length)];
          if (this.assets[randomBldg]) {
            const bldg = this.assets[randomBldg].clone();
            bldg.rotation.y = (Math.floor(Math.random() * 4) * Math.PI) / 2;
            mesh.add(bldg);
          }
          
          tileContainer.add(mesh);
        }

        tileContainer.visible = false; 
        this.scene.add(tileContainer);
        this.tiles.push({ type: tileType === 0 ? 'road' : 'building', mesh: tileContainer, x: posX, z: posZ });

        if (tileType === 1 && mesh) {
          tileContainer.updateMatrixWorld(true);
          const bldgBox = new THREE.Box3().setFromObject(mesh);
          bldgBox.expandByScalar(-0.6); 
          bldgBox.max.y = 50; 
          this.colliders.push(bldgBox);
        }
      }
    }

    this._buildInstancedStreetLamps();
    this.assets = {}; // Free template references after world generation
  }

  getRandomRoadPosition() {
    const roads = this.tiles.filter(t => t.type === 'road');
    if (roads.length === 0) return new THREE.Vector3(0, 1, 0);
    const randomRoad = roads[Math.floor(Math.random() * roads.length)];
    return new THREE.Vector3(randomRoad.x, 0, randomRoad.z);
  }

  update(playerPosition) {
    const sqRenderDistance = this.renderDistance * this.renderDistance;
    for (let i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i];
      const dx = tile.x - playerPosition.x;
      const dz = tile.z - playerPosition.z;
      tile.mesh.visible = (dx * dx) + (dz * dz) <= sqRenderDistance;
    }
  }
}