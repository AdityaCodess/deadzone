import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { worldService } from '../game/WorldService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'deadzone_super_secret_jwt_key_2026';

export class SocketServer {
  constructor(httpServer) {
    this.io = new Server(httpServer, {
      cors: { origin: '*', methods: ['GET', 'POST'] }
    });

    // roomCode -> { code, hostSocketId, status: 'lobby'|'playing', players: Map<socketId, playerInfo> }
    this.rooms = new Map();
    this._setupSocketHandlers();
  }

  _generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  _serializeRoom(room) {
    return {
      code: room.code,
      hostSocketId: room.hostSocketId,
      status: room.status,
      players: Array.from(room.players.values())
    };
  }

  _setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      let currentRoomCode = null;
      let authUser = null;

      // Authenticate socket via JWT token
      const token = socket.handshake.auth?.token;
      if (token) {
        try {
          authUser = jwt.verify(token, JWT_SECRET);
        } catch (e) {}
      }

      // 1. CREATE LOBBY ROOM (Requires Login)
      socket.on('lobby:create', ({ character = 'Matt' }, callback) => {
        if (!authUser) {
          return callback?.({ error: 'You must be logged in to create a Multiplayer Lobby!' });
        }

        const code = this._generateRoomCode();
        const playerObj = {
          socketId: socket.id,
          userId: authUser.id,
          username: authUser.username,
          character,
          position: [0, 1.6, 0],
          rotationY: 0,
          action: 'Idle_Gun',
          equippedWeapon: 'Pistol'
        };

        const room = {
          code,
          hostSocketId: socket.id,
          status: 'lobby',
          players: new Map([[socket.id, playerObj]])
        };

        this.rooms.set(code, room);
        currentRoomCode = code;
        socket.join(code);

        callback?.({ success: true, room: this._serializeRoom(room) });
      });

      // 2. JOIN LOBBY ROOM (Max 4 Players)
      socket.on('lobby:join', ({ code, character = 'Matt' }, callback) => {
        if (!authUser) {
          return callback?.({ error: 'You must be logged in to join Multiplayer!' });
        }

        const cleanCode = (code || '').toUpperCase().trim();
        const room = this.rooms.get(cleanCode);
        if (!room) {
          return callback?.({ error: `Room '${cleanCode}' not found` });
        }
        if (room.status !== 'lobby') {
          return callback?.({ error: 'Match has already started!' });
        }
        if (room.players.size >= 4) {
          return callback?.({ error: 'Room is full (Max 4 players)!' });
        }

        const spawnOffsets = [
          [-2.0, 1.6, 0],
          [2.0, 1.6, 0],
          [-2.0, 1.6, 2.5],
          [2.0, 1.6, 2.5]
        ];
        const slotIndex = room.players.size;

        const playerObj = {
          socketId: socket.id,
          userId: authUser.id,
          username: authUser.username,
          character,
          position: spawnOffsets[slotIndex] || [0, 1.6, 0],
          rotationY: 0,
          action: 'Idle_Gun',
          equippedWeapon: 'Pistol'
        };

        room.players.set(socket.id, playerObj);
        currentRoomCode = cleanCode;
        socket.join(cleanCode);

        const serialized = this._serializeRoom(room);
        this.io.to(cleanCode).emit('lobby:updated', serialized);
        callback?.({ success: true, room: serialized });
      });

      // 3. CHANGE SELECTED CHARACTER IN LOBBY
      socket.on('lobby:selectCharacter', ({ character }) => {
        if (!currentRoomCode) return;
        const room = this.rooms.get(currentRoomCode);
        if (!room || !room.players.has(socket.id)) return;

        room.players.get(socket.id).character = character;
        this.io.to(currentRoomCode).emit('lobby:updated', this._serializeRoom(room));
      });

      // 4. START MATCH (Host only, enforces Minimum 2 Players & Max 4 Players)
      socket.on('lobby:start', (_, callback) => {
        if (!currentRoomCode) return;
        const room = this.rooms.get(currentRoomCode);
        if (!room) return;

        if (room.hostSocketId !== socket.id) {
          return callback?.({ error: 'Only the lobby host can start the match' });
        }
        if (room.players.size < 2) {
          return callback?.({ error: 'Minimum 2 players required to start a Multiplayer match!' });
        }

        room.status = 'playing';
        // Generate a fresh procedural city so all 2-4 players share the exact same world & lootboxes
        worldService.generateNewWorld();

        this.io.to(currentRoomCode).emit('match:start', {
          room: this._serializeRoom(room),
          worldState: worldService.getWorldState()
        });
        callback?.({ success: true });
      });

      // 5. IN-GAME PLAYER TRANSFORM & ANIMATION SYNC
      socket.on('player:move', (state) => {
        if (!currentRoomCode) return;
        const room = this.rooms.get(currentRoomCode);
        const p = room?.players.get(socket.id);
        if (!p) return;

        p.position = state.position;
        p.rotationY = state.rotationY;
        p.action = state.action;
        p.equippedWeapon = state.equippedWeapon;

        socket.to(currentRoomCode).emit('player:moved', {
          socketId: socket.id,
          ...state
        });
      });

      // 6. SHARED WORLD LOOT / LOOTBOX SYNC ACROSS PLAYERS
      socket.on('world:lootPickedUp', ({ dropId }) => {
        if (currentRoomCode) {
          socket.to(currentRoomCode).emit('world:removeDrop', { dropId });
        }
      });

      socket.on('world:itemDropped', ({ drop }) => {
        if (currentRoomCode) {
          socket.to(currentRoomCode).emit('world:spawnDrop', { drop });
        }
      });

      socket.on('world:lootBoxUpdated', ({ boxId, boxEmpty, remainingItems }) => {
        if (currentRoomCode) {
          socket.to(currentRoomCode).emit('world:syncLootBox', { boxId, boxEmpty, remainingItems });
        }
      });

      // 7. HANDLE DISCONNECT
      socket.on('disconnect', () => {
        if (!currentRoomCode) return;
        const room = this.rooms.get(currentRoomCode);
        if (!room) return;

        room.players.delete(socket.id);
        socket.to(currentRoomCode).emit('player:left', { socketId: socket.id });

        if (room.players.size === 0) {
          this.rooms.delete(currentRoomCode);
        } else {
          if (room.hostSocketId === socket.id) {
            room.hostSocketId = room.players.keys().next().value;
          }
          this.io.to(currentRoomCode).emit('lobby:updated', this._serializeRoom(room));
        }
      });
    });
  }
}