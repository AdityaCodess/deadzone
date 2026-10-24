export class MinimapManager {
  constructor(worldGenerator, zombieManager, interactionManager) {
    this.worldGenerator = worldGenerator;
    this.zombieManager = zombieManager;
    this.interactionManager = interactionManager;

    this.size = 170;
    this.zoom = 1.15; // Pixels per world meter
    this._buildUI();
  }

  _buildUI() {
    document.querySelectorAll('#minimap-container').forEach(el => el.remove());

    this.container = document.createElement('div');
    this.container.id = 'minimap-container';
    this.container.style.cssText = `
      position: fixed; top: 20px; right: 20px;
      width: ${this.size}px; height: ${this.size}px;
      background: rgba(15, 17, 20, 0.9);
      border: 3px solid #5a5654; border-radius: 50%;
      box-shadow: 0 6px 20px rgba(0,0,0,0.85), inset 0 0 15px rgba(0,0,0,0.9);
      overflow: hidden; z-index: 150; pointer-events: none;
    `;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.ctx = this.canvas.getContext('2d');
    this.container.appendChild(this.canvas);

    const northBadge = document.createElement('div');
    northBadge.innerText = 'N';
    northBadge.style.cssText = `
      position: absolute; top: 4px; left: 50%; transform: translateX(-50%);
      color: #ffaa44; font-family: monospace; font-size: 11px; font-weight: bold;
      text-shadow: 0 1px 3px #000;
    `;
    this.container.appendChild(northBadge);

    document.body.appendChild(this.container);
  }

  update(playerPosition, playerYaw) {
    if (!this.ctx || !this.worldGenerator) return;

    const ctx = this.ctx;
    const half = this.size / 2;
    ctx.clearRect(0, 0, this.size, this.size);

    ctx.save();
    // Center radar on player and rotate with camera heading so "Up" is always where you look
    ctx.translate(half, half);
    ctx.rotate(playerYaw);

    const layout = this.worldGenerator.mapLayout;
    const rows = layout.length;
    const cols = layout[0].length;
    const tileSize = this.worldGenerator.tileSize;
    const offsetX = this.worldGenerator.offsetX;
    const offsetZ = this.worldGenerator.offsetZ;

    // 1. Draw Procedural City Grid (Roads & Buildings within radar range)
    const maxRadarDist = (half / this.zoom) + tileSize;
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const worldX = (x * tileSize) - offsetX;
        const worldZ = (z * tileSize) - offsetZ;

        const dx = worldX - playerPosition.x;
        const dz = worldZ - playerPosition.z;
        if (Math.abs(dx) > maxRadarDist || Math.abs(dz) > maxRadarDist) continue;

        const tileType = layout[z][x];
        const drawSize = tileSize * this.zoom;
        const screenX = dx * this.zoom - drawSize / 2;
        const screenY = dz * this.zoom - drawSize / 2;

        if (tileType === 0) {
          ctx.fillStyle = '#2d3136';
          ctx.fillRect(screenX, screenY, drawSize + 0.6, drawSize + 0.6);
        } else {
          ctx.fillStyle = '#524b48';
          ctx.fillRect(screenX + 1.5, screenY + 1.5, drawSize - 3, drawSize - 3);
          ctx.strokeStyle = '#756c68';
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX + 1.5, screenY + 1.5, drawSize - 3, drawSize - 3);
        }
      }
    }

    // 2. Draw Loot Pickups (Green Dots)
    if (this.interactionManager && this.interactionManager.interactables) {
      ctx.fillStyle = '#33ff66';
      for (const item of this.interactionManager.interactables) {
        const dx = (item.position.x - playerPosition.x) * this.zoom;
        const dz = (item.position.z - playerPosition.z) * this.zoom;
        if (dx * dx + dz * dz < half * half) {
          ctx.beginPath();
          ctx.arc(dx, dz, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 3. Draw Alive Zombies (Red Pulsing Dots)
    if (this.zombieManager && this.zombieManager.zombies) {
      ctx.fillStyle = '#ff3333';
      for (const zombie of this.zombieManager.zombies) {
        if (zombie.userData.state === 'dead') continue;
        const dx = (zombie.position.x - playerPosition.x) * this.zoom;
        const dz = (zombie.position.z - playerPosition.z) * this.zoom;
        if (dx * dx + dz * dz < half * half) {
          ctx.beginPath();
          ctx.arc(dx, dz, 3.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();

    // 4. Draw Player FOV Cone & Center Arrow
    ctx.save();
    ctx.translate(half, half);

    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, 42);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 42, -Math.PI * 0.72, -Math.PI * 0.28);
    ctx.closePath();
    ctx.fill();

    // Player Arrow
    ctx.fillStyle = '#00ddff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  cleanup() {
    if (this.container) this.container.remove();
  }
}