import { Client } from '@colyseus/sdk';
import { ApiClient } from '../services/apiClient.js';

const BACKEND_ORIGIN = import.meta.env.VITE_BACKEND_URL || window.location.origin;

export class NetworkManager {
  constructor() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const hostname = window.location.hostname;
    const wsUrl = import.meta.env.VITE_BACKEND_URL 
      ? import.meta.env.VITE_BACKEND_URL.replace(/^http/, 'ws')
      : `${protocol}://${hostname}:3001`;
      
    this.client = new Client(wsUrl);
    this.room = null;
    
    // We will track the players manually to completely bypass the Vite .onAdd crash!
    this.knownPlayers = new Set();

    this.onLobbyUpdated = null;
    this.onMatchStart = null;
    this.onLoadProgress = null;
    this.onAllPlayersReady = null;
    this.onRemotePlayerMoved = null;
    this.onRemotePlayerLeft = null;
    this.onWorldRemoveDrop = null;
    this.onWorldSpawnDrop = null;
    this.onWorldSyncLootBox = null;
    this.onRemoteShotFX = null;

    this._lastSentHash = '';
  }

  async createRoom(character) {
    const token = ApiClient.getToken();
    this.room = await this.client.create("deadzone", { token, character });
    this._bindRoomEvents();
    return this.room;
  }

  async joinRoom(roomId, character) {
    const token = ApiClient.getToken();
    this.room = await this.client.joinById(roomId, { token, character });
    this._bindRoomEvents();
    return this.room;
  }

  _bindRoomEvents() {
    // THE NUCLEAR FIX: Every time the server ticks, we natively read the raw Map.
    // This requires ZERO Colyseus Schema decorators and is 100% Vite-proof.
    this.room.onStateChange((state) => {
      if (!state || !state.players) return;

      // 1. Detect New Players & Update Movements natively
      state.players.forEach((player, sessionId) => {
        
        // Emulate .onAdd
        if (!this.knownPlayers.has(sessionId)) {
          this.knownPlayers.add(sessionId);
          if (this.onLobbyUpdated) this.onLobbyUpdated(this.room);
        }

        // Emulate .onChange
        if (sessionId !== this.room.sessionId && this.onRemotePlayerMoved) {
          this.onRemotePlayerMoved({
            socketId: sessionId, 
            position: [player.x, player.y, player.z],
            rotationY: player.rotY,
            action: player.action,
            equippedWeapon: player.equippedWeapon
          });
        }
      });

      // 2. Detect Removed Players natively
      this.knownPlayers.forEach((sessionId) => {
        if (!state.players.has(sessionId)) {
          this.knownPlayers.delete(sessionId);
          if (this.onLobbyUpdated) this.onLobbyUpdated(this.room);
          if (this.onRemotePlayerLeft) this.onRemotePlayerLeft(sessionId);
        }
      });
    });

    this.room.onMessage("match:start", (payload) => {
      if (this.onMatchStart) this.onMatchStart({ room: this.room, worldState: payload.worldState });
    });

    this.room.onMessage("match:loadProgress", (data) => {
      if (this.onLoadProgress) this.onLoadProgress(data);
    });

    this.room.onMessage("match:allReady", () => {
      if (this.onAllPlayersReady) this.onAllPlayersReady();
    });

    this.room.onMessage("player:shotFX", (fxData) => {
      if (this.onRemoteShotFX) this.onRemoteShotFX(fxData);
    });
    this.room.onMessage("world:removeDrop", (d) => {
      if (this.onWorldRemoveDrop) this.onWorldRemoveDrop(d.dropId);
    });
    this.room.onMessage("world:spawnDrop", (d) => {
      if (this.onWorldSpawnDrop) this.onWorldSpawnDrop(d.drop);
    });
    this.room.onMessage("world:syncLootBox", (d) => {
      if (this.onWorldSyncLootBox) this.onWorldSyncLootBox(d);
    });
  }

  isHost() {
    const me = this.room?.state?.players?.get(this.room.sessionId);
    return me ? me.isHost : false;
  }

  selectCharacter(character) {
    this.room?.send("lobby:selectCharacter", { character });
  }

  startMatch() {
    return new Promise((resolve) => {
      this.room?.send("lobby:start");
      resolve();
    });
  }

  notifyPlayerLoaded() {
    this.room?.send("match:playerLoaded");
  }

  sendPlayerState(position, rotationY, action, equippedWeapon) {
    if (!this.room) return;

    const rx = Math.round(position.x * 100) / 100;
    const ry = Math.round(position.y * 100) / 100;
    const rz = Math.round(position.z * 100) / 100;
    const rYaw = Math.round(rotationY * 100) / 100;
    const act = action || 'Idle_Gun';
    const wep = equippedWeapon || '';

    const hash = `${rx}|${ry}|${rz}|${rYaw}|${act}|${wep}`;
    if (hash === this._lastSentHash) return;
    this._lastSentHash = hash;

    this.room.send("p:m", [rx, ry, rz, rYaw, act, wep]);
  }

  notifyDropPickedUp(dropId) {
    this.room?.send("world:lootPickedUp", { dropId });
  }

  notifyItemDropped(drop) {
    this.room?.send("world:itemDropped", { drop });
  }

  notifyLootBoxUpdated(boxId, boxEmpty, remainingItems) {
    this.room?.send("world:lootBoxUpdated", { boxId, boxEmpty, remainingItems });
  }

  broadcastShotFX(origin, direction, weaponName) {
    this.room?.send("player:shotFX", {
      origin: [origin.x, origin.y, origin.z],
      direction: [direction.x, direction.y, direction.z],
      weaponName
    });
  }

  disconnect() {
    if (this.room) {
      this.room.leave();
      this.room = null;
      this.knownPlayers.clear();
    }
  }
}

export const networkManager = new NetworkManager();