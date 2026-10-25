import crypto from 'crypto';
import { gameConfig } from '../config/gameConfig.js';

class WorldService {
  constructor() {
    this.syncMapDimensions();
    this.mapSeed = Date.now();
    this.mapLayout = [];
    this.buildingPlacements = [];
    this.roadPositions = [];

    this.groundDrops = new Map();
    this.lootBoxes = new Map();
    this.playerStates = new Map();

    this.generateNewWorld();
  }

  syncMapDimensions() {
    const cfg = gameConfig.mapConfig || {};
    this.gridRows = cfg.gridRows || 35;
    this.gridCols = cfg.gridCols || 35;
    this.tileSize = cfg.tileSize || 20;
    this.targetLootBoxes = cfg.lootBoxCount || 18;
    this.minLootBoxSpacing = cfg.minLootBoxSpacing || 45;
    this.offsetX = (this.gridCols * this.tileSize) / 2 - (this.tileSize / 2);
    this.offsetZ = (this.gridRows * this.tileSize) / 2 - (this.tileSize / 2);
  }

  // Call this with custom rows/cols anytime you want to dynamically expand the map!
  expandMap(newRows, newCols, newLootBoxCount) {
    if (newRows) gameConfig.mapConfig.gridRows = newRows;
    if (newCols) gameConfig.mapConfig.gridCols = newCols;
    if (newLootBoxCount) gameConfig.mapConfig.lootBoxCount = newLootBoxCount;
    this.syncMapDimensions();
    this.generateNewWorld();
  }

  generateNewWorld() {
    this.syncMapDimensions();
    this.mapSeed = Date.now();
    this.groundDrops.clear();
    this.lootBoxes.clear();
    this.buildingPlacements = [];
    this.roadPositions = [];

    const rows = this.gridRows;
    const cols = this.gridCols;
    const centerR = Math.floor(rows / 2);
    const centerC = Math.floor(cols / 2);

    const grid = Array.from({ length: rows }, () => new Array(cols).fill(1));
    const roadRows = new Set([0, centerR, rows - 1]);
    const roadCols = new Set([0, centerC, cols - 1]);

    let r = 2 + Math.floor(Math.random() * 2);
    while (r < rows - 2) {
      if (Math.abs(r - centerR) !== 1) roadRows.add(r);
      r += 2 + Math.floor(Math.random() * 3);
    }

    let c = 2 + Math.floor(Math.random() * 2);
    while (c < cols - 2) {
      if (Math.abs(c - centerC) !== 1) roadCols.add(c);
      c += 2 + Math.floor(Math.random() * 3);
    }

    roadRows.forEach(rowIdx => {
      for (let x = 0; x < cols; x++) grid[rowIdx][x] = 0;
    });
    roadCols.forEach(colIdx => {
      for (let z = 0; z < rows; z++) grid[z][colIdx] = 0;
    });

    const rList = Array.from(roadRows).sort((a, b) => a - b);
    const cList = Array.from(roadCols).sort((a, b) => a - b);

    for (let i = 0; i < rList.length - 1; i++) {
      for (let j = 0; j < cList.length - 1; j++) {
        if (Math.random() < 0.30) {
          const r1 = rList[i], r2 = rList[i + 1];
          const c1 = cList[j], c2 = cList[j + 1];
          if (c2 - c1 >= 3) {
            const midC = Math.floor((c1 + c2) / 2);
            if (Math.abs(midC - centerC) !== 1) {
              for (let z = r1; z <= r2; z++) grid[z][midC] = 0;
            }
          }
        }
      }
    }

    for (let d = -2; d <= 2; d++) {
      grid[centerR][centerC + d] = 0;
      grid[centerR + d][centerC] = 0;
    }
    grid[centerR - 1][centerC - 1] = 1;
    grid[centerR - 1][centerC + 1] = 1;
    grid[centerR + 1][centerC - 1] = 1;
    grid[centerR + 1][centerC + 1] = 1;

    this.mapLayout = grid;

    const buildingPool = ['bldg_small', 'bldg_med', 'bldg_large'];
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const posX = (x * this.tileSize) - this.offsetX;
        const posZ = (z * this.tileSize) - this.offsetZ;

        if (grid[z][x] === 0) {
          this.roadPositions.push([posX, 0, posZ]);
        } else {
          this.buildingPlacements.push({
            x,
            z,
            posX,
            posZ,
            asset: buildingPool[Math.floor(Math.random() * buildingPool.length)],
            rotSteps: Math.floor(Math.random() * 4)
          });
        }
      }
    }

    this._seedLootBoxesOnly();
  }

  _getModelInfo(itemName) {
    if (gameConfig.weapons[itemName]) {
      return {
        modelPath: gameConfig.weapons[itemName].modelPath,
        targetSize: itemName === 'RPG' ? 1.1 : (itemName === 'Grenade' ? 0.35 : 0.85)
      };
    }
    if (gameConfig.consumables[itemName]) {
      return {
        modelPath: gameConfig.consumables[itemName].modelPath,
        targetSize: gameConfig.consumables[itemName].targetSize || 0.45
      };
    }
    if (gameConfig.ammoItems && gameConfig.ammoItems[itemName]) {
      return {
        modelPath: gameConfig.ammoItems[itemName].modelPath,
        targetSize: gameConfig.ammoItems[itemName].targetSize || 0.40
      };
    }
    return { modelPath: null, targetSize: 0.4 };
  }

  _seedLootBoxesOnly() {
    const placedPositions = [];

    // 1 box near center intersection + 17 distributed across city blocks/avenues
    const firstBoxPos = [4.5, 0.02, -9.0];
    this._createLootBox(firstBoxPos);
    placedPositions.push(firstBoxPos);

    let attempts = 0;
    while (placedPositions.length < this.targetLootBoxes && attempts < 350) {
      attempts++;
      const road = this.roadPositions[Math.floor(Math.random() * this.roadPositions.length)];
      if (!road) continue;

      const candidate = [road[0] + (Math.random() - 0.5) * 8, 0.02, road[2] + (Math.random() - 0.5) * 8];
      const tooClose = placedPositions.some(
        p => Math.hypot(p[0] - candidate[0], p[2] - candidate[2]) < this.minLootBoxSpacing
      );

      if (!tooClose) {
        this._createLootBox(candidate);
        placedPositions.push(candidate);
      }
    }
  }

  _createLootBox(position) {
    const id = `box_${crypto.randomUUID().slice(0, 8)}`;
    const possibleItems = [
      { itemName: 'Medkit', count: 1 },
      { itemName: 'Grenade', count: 1 },
      { itemName: 'RPG', count: 1 },
      { itemName: 'rpg_ammo', count: 1 },
      { itemName: 'assault_ammo', count: 20 },
      { itemName: 'smg_ammo', count: 25 },
      { itemName: 'shotgun_ammo', count: 8 },
      { itemName: 'pistol_ammo', count: 15 },
      { itemName: 'SMG', count: 1 },
      { itemName: 'Shotgun', count: 1 },
      { itemName: 'Rifle', count: 1 },
      { itemName: 'Axe', count: 1 },
      { itemName: 'Bat', count: 1 },
      { itemName: 'Guitar', count: 1 }
    ];

    const numItems = 2 + Math.floor(Math.random() * 2);
    const items = [];
    for (let i = 0; i < numItems; i++) {
      const pick = possibleItems[Math.floor(Math.random() * possibleItems.length)];
      items.push({
        slotId: `slot_${crypto.randomUUID().slice(0, 6)}`,
        itemName: pick.itemName,
        count: pick.count
      });
    }

    this.lootBoxes.set(id, {
      id,
      modelPath: '/deadzone-assets/lootbox.gltf',
      position,
      items
    });
  }

  createGroundDrop(itemName, count, position) {
    const id = `drop_${crypto.randomUUID().slice(0, 8)}`;
    const { modelPath, targetSize } = this._getModelInfo(itemName);
    const drop = {
      id,
      itemName,
      count: Number(count) || 1,
      position,
      modelPath,
      targetSize
    };
    this.groundDrops.set(id, drop);
    return drop;
  }

  pickupGroundDrop(dropId) {
    const drop = this.groundDrops.get(dropId);
    if (!drop) return null;
    this.groundDrops.delete(dropId);
    return drop;
  }

  claimLootBoxItem(boxId, slotId) {
    const box = this.lootBoxes.get(boxId);
    if (!box) return { valid: false, reason: 'Lootbox no longer exists' };

    const idx = box.items.findIndex(item => item.slotId === slotId);
    if (idx === -1) {
      return { valid: false, reason: 'Item already taken by another player', remainingItems: box.items };
    }

    const [claimed] = box.items.splice(idx, 1);
    const boxEmpty = box.items.length === 0;
    if (boxEmpty) {
      this.lootBoxes.delete(boxId);
    }

    return {
      valid: true,
      claimed,
      boxId,
      boxEmpty,
      remainingItems: box.items
    };
  }

  rollZombieLoot(position) {
    if (Math.random() > 0.25) return null;
    const table = [
      { itemName: 'pistol_ammo', count: 10 },
      { itemName: 'assault_ammo', count: 20 },
      { itemName: 'smg_ammo', count: 25 },
      { itemName: 'shotgun_ammo', count: 6 },
      { itemName: 'rpg_ammo', count: 1 },
      { itemName: 'Medkit', count: 1 },
      { itemName: 'Grenade', count: 1 }
    ];
    const pick = table[Math.floor(Math.random() * table.length)];
    return this.createGroundDrop(pick.itemName, pick.count, [position[0], 0.02, position[2]]);
  }

  setPlayerEquipped(playerId, itemName) {
    this.playerStates.set(playerId, { equipped: itemName, updatedAt: Date.now() });
  }

  getWorldState() {
    return {
      seed: this.mapSeed,
      gridRows: this.gridRows,
      gridCols: this.gridCols,
      tileSize: this.tileSize,
      offsetX: this.offsetX,
      offsetZ: this.offsetZ,
      mapLayout: this.mapLayout,
      buildingPlacements: this.buildingPlacements,
      roadPositions: this.roadPositions,
      groundDrops: Array.from(this.groundDrops.values()),
      lootBoxes: Array.from(this.lootBoxes.values())
    };
  }
}

export const worldService = new WorldService();