import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

    this._initLampResources();
  }

  _initLampResources() {
    this.poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5.0, 8);
    this.armGeo = new THREE.BoxGeometry(1.2, 0.08, 0.08);
    this.bulbGeo = new THREE.BoxGeometry(0.4, 0.1, 0.25);

    this.poleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    this.bulbMat = new THREE.MeshStandardMaterial({
      color: 0xffeedd,
      emissive: 0xffaa44,
      emissiveIntensity: 0
    });

    // Procedural radial gradient texture for the ground light spread
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255, 180, 90, 1.0)');
    grad.addColorStop(0.5, 'rgba(255, 160, 60, 0.35)');
    grad.addColorStop(1, 'rgba(255, 140, 40, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const glowTex = new THREE.CanvasTexture(canvas);
    this.glowGeo = new THREE.PlaneGeometry(14, 14);
    this.glowMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }

  _createStreetLamp(tileContainer, posX, posZ, localX, localZ, armDirX, armDirZ) {
    const lampGroup = new THREE.Group();
    lampGroup.position.set(localX, 0, localZ);

    const pole = new THREE.Mesh(this.poleGeo, this.poleMat);
    pole.position.y = 2.5;
    lampGroup.add(pole);

    // Overhang arm pointing toward the street
    const arm = new THREE.Mesh(this.armGeo, this.poleMat);
    arm.position.set(armDirX * 0.5, 4.9, armDirZ * 0.5);
    if (armDirZ !== 0) arm.rotation.y = Math.PI / 2;
    lampGroup.add(arm);

    const bulb = new THREE.Mesh(this.bulbGeo, this.bulbMat);
    bulb.position.set(armDirX * 1.0, 4.82, armDirZ * 1.0);
    lampGroup.add(bulb);

    // Soft ground light spread decal right under the bulb
    const glowPatch = new THREE.Mesh(this.glowGeo, this.glowMat);
    glowPatch.rotation.x = -Math.PI / 2;
    glowPatch.position.set(armDirX * 1.5, 0.03, armDirZ * 1.5);
    lampGroup.add(glowPatch);

    tileContainer.add(lampGroup);

    if (this.environmentManager) {
      const worldLightPos = new THREE.Vector3(
        posX + localX + armDirX * 1.2,
        4.5,
        posZ + localZ + armDirZ * 1.2
      );
      this.environmentManager.registerStreetLamp(worldLightPos, this.bulbMat, this.glowMat);
    }
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

          // Spawn streetlamps on the sidewalk edge (8.2m from center, overhanging inward toward road)
          if (roadConnections >= 3) {
            // Corner lamp at intersections
            this._createStreetLamp(tileContainer, posX, posZ, 8.2, 8.2, -1, 0);
          } else if (isHorizontalRoad) {
            // Road runs East-West -> place lamp on North/South sidewalk (Z = ±8.2) pointing inward
            const side = ((x + z) % 2 === 0) ? 1 : -1;
            this._createStreetLamp(tileContainer, posX, posZ, 0, side * 8.2, 0, -side);
          } else {
            // Road runs North-South -> place lamp on East/West sidewalk (X = ±8.2) pointing inward
            const side = ((x + z) % 2 === 0) ? 1 : -1;
            this._createStreetLamp(tileContainer, posX, posZ, side * 8.2, 0, -side, 0);
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