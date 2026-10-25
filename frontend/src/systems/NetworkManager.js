import { io } from 'socket.io-client';
import { ApiClient } from '../services/apiClient.js';

export class NetworkManager {
  constructor() {
    this.socket = null;
    this.room = null;
    this.onLobbyUpdated = null;
    this.onMatchStart = null;
    this.onRemotePlayerMoved = null;
    this.onRemotePlayerLeft = null;
    this.onWorldRemoveDrop = null;
    this.onWorldSpawnDrop = null;
    this.onWorldSyncLootBox = null;
  }

  connect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    const token = ApiClient.getToken();
    this.socket = io('/', {
      auth: { token }
    });

    this.socket.on('lobby:updated', (room) => {
      this.room = room;
      if (this.onLobbyUpdated) this.onLobbyUpdated(room);
    });

    this.socket.on('match:start', (payload) => {
      this.room = payload.room;
      if (this.onMatchStart) this.onMatchStart(payload);
    });

    this.socket.on('player:moved', (data) => {
      if (this.onRemotePlayerMoved) this.onRemotePlayerMoved(data);
    });

    this.socket.on('player:left', ({ socketId }) => {
      if (this.onRemotePlayerLeft) this.onRemotePlayerLeft(socketId);
    });

    this.socket.on('world:removeDrop', ({ dropId }) => {
      if (this.onWorldRemoveDrop) this.onWorldRemoveDrop(dropId);
    });

    this.socket.on('world:spawnDrop', ({ drop }) => {
      if (this.onWorldSpawnDrop) this.onWorldSpawnDrop(drop);
    });

    this.socket.on('world:syncLootBox', (data) => {
      if (this.onWorldSyncLootBox) this.onWorldSyncLootBox(data);
    });
  }

  createRoom(character) {
    this.connect();
    return new Promise((resolve, reject) => {
      this.socket.emit('lobby:create', { character }, (res) => {
        if (res?.error) return reject(new Error(res.error));
        this.room = res.room;
        resolve(res.room);
      });
    });
  }

  joinRoom(code, character) {
    this.connect();
    return new Promise((resolve, reject) => {
      this.socket.emit('lobby:join', { code, character }, (res) => {
        if (res?.error) return reject(new Error(res.error));
        this.room = res.room;
        resolve(res.room);
      });
    });
  }

  selectCharacter(character) {
    if (this.socket) {
      this.socket.emit('lobby:selectCharacter', { character });
    }
  }

  startMatch() {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      this.socket.emit('lobby:start', {}, (res) => {
        if (res?.error) return reject(new Error(res.error));
        resolve(res);
      });
    });
  }

  sendPlayerState(position, rotationY, action, equippedWeapon) {
    if (!this.socket || !this.room) return;
    this.socket.emit('player:move', {
      position: [position.x, position.y, position.z],
      rotationY,
      action,
      equippedWeapon
    });
  }

  notifyDropPickedUp(dropId) {
    this.socket?.emit('world:lootPickedUp', { dropId });
  }

  notifyItemDropped(drop) {
    this.socket?.emit('world:itemDropped', { drop });
  }

  notifyLootBoxUpdated(boxId, boxEmpty, remainingItems) {
    this.socket?.emit('world:lootBoxUpdated', { boxId, boxEmpty, remainingItems });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const networkManager = new NetworkManager();