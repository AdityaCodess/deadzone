import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class WorldGenerator {
  constructor(scene) {
    this.scene = scene;
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
    this.colliders = []; // Added collision registry
  }

  async loadAssets() {
    const loader = new GLTFLoader();
    
    const loadPromise = (name, path, isRoad) => {
      return new Promise((resolve, reject) => {
        loader.load(path, (gltf) => {
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          
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
    const foundationMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1.0 });
    const foundation = new THREE.Mesh(foundationGeo, foundationMat);
    foundation.rotation.x = -Math.PI / 2;
    foundation.position.set(0, -0.05, 0); 
    this.scene.add(foundation);

    const buildingPool = ['bldg_small', 'bldg_med', 'bldg_large'];

    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const posX = (x * this.tileSize) - offsetX;
        const posZ = (z * this.tileSize) - offsetZ;
        const tileType = this.mapLayout[z][x];

        let mesh = null;

        if (tileType === 0) {
          const up = z > 0 ? this.mapLayout[z-1][x] : 0;
          const down = z < rows - 1 ? this.mapLayout[z+1][x] : 0;
          const left = x > 0 ? this.mapLayout[z][x-1] : 0;
          const right = x < cols - 1 ? this.mapLayout[z][x+1] : 0;
          
          const roadConnections = (up === 0 ? 1 : 0) + (down === 0 ? 1 : 0) + (left === 0 ? 1 : 0) + (right === 0 ? 1 : 0);
          
          if (roadConnections >= 3 && this.assets['road_intersection']) {
            mesh = this.assets['road_intersection'].clone();
          } else if (this.assets['road_straight']) {
            mesh = this.assets['road_straight'].clone();
            if (left === 0 || right === 0) {
              mesh.rotation.y = Math.PI / 2; 
            }
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
            bldg.traverse((child) => { child.userData = { isWall: true }; });
            mesh.add(bldg);
          }
          
          // Generate an invisible mathematical hit-box matching the 90% building scale
          const halfSize = (this.tileSize * 0.90) / 2;
          const collisionBox = new THREE.Box3(
            new THREE.Vector3(posX - halfSize + 0.2, 0, posZ - halfSize + 0.2), // +0.2 offset prevents snagging on corners
            new THREE.Vector3(posX + halfSize - 0.2, 50, posZ + halfSize - 0.2)
          );
          this.colliders.push(collisionBox);
        }

        if (mesh) {
          mesh.position.set(posX, 0, posZ);
          mesh.visible = false; 
          this.scene.add(mesh);
          this.tiles.push({ type: tileType === 0 ? 'road' : 'building', mesh: mesh, x: posX, z: posZ });
        }
      }
    }
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