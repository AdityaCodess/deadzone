import { Room } from 'colyseus';
import jwt from 'jsonwebtoken';
import { GameState, PlayerState, ZombieState } from './schema/GameState.js';

const JWT_SECRET = process.env.JWT_SECRET || 'deadzone_super_secret_jwt_key_2026';

export class DeadzoneRoom extends Room {
  maxClients = 4;

  onCreate(options) {
    this.setState(new GameState());
    this.state.roomCode = this.roomId;

    this.onMessage("p:m", (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.x = data[0];
        player.y = data[1];
        player.z = data[2];
        player.rotY = data[3];
        player.action = data[4];
        player.equippedWeapon = data[5];
      }
    });

    this.onMessage("lobby:selectCharacter", (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (player && data.character) {
        player.character = data.character;
      }
    });

    this.onMessage("lobby:start", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player?.isHost) {
        this.state.status = "loading";
        this.broadcast("match:start", {});
      }
    });

    this.onMessage("match:playerLoaded", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.isLoaded = true;

      let allLoaded = true;
      let loadedCount = 0;
      this.state.players.forEach(player => {
        if (player.isLoaded) loadedCount++;
        else allLoaded = false;
      });

      this.broadcast("match:loadProgress", { loadedCount, totalCount: this.state.players.size });

      if (allLoaded && this.state.status === 'loading') {
        this.state.status = "playing";
        this.broadcast("match:allReady");
      }
    });
    
    this.onMessage("z:sync", (client, zombieList) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.isHost) return;
      
      zombieList.forEach(zData => {
        let z = this.state.zombies.get(zData.id);
        if (!z) {
          z = new ZombieState();
          z.id = zData.id;
          this.state.zombies.set(zData.id, z);
        }
        z.x = zData.position[0];
        z.y = zData.position[1];
        z.z = zData.position[2];
        z.rotY = zData.rotationY;
        z.state = zData.state;
      });
    });
  }

  onAuth(client, options, request) {
    if (!options.token) {
      return { user: { username: options.guestName || `Guest_${Math.floor(Math.random() * 1000)}`, id: `guest_${client.sessionId}` } };
    }
    try {
      return { user: jwt.verify(options.token, JWT_SECRET) };
    } catch (e) {
      return { user: { username: options.guestName || `Guest_${Math.floor(Math.random() * 1000)}`, id: `guest_${client.sessionId}` } };
    }
  }

  onJoin(client, options, auth) {
    const player = new PlayerState();
    player.username = auth?.user?.username || options.guestName || "Operative";
    player.character = options.character || "Matt";
    player.isHost = this.state.players.size === 0;

    this.state.players.set(client.sessionId, player);
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    if (this.state.players.size > 0) {
      const hasHost = Array.from(this.state.players.values()).some(p => p.isHost);
      if (!hasHost) {
        const nextHost = this.state.players.values().next().value;
        if (nextHost) nextHost.isHost = true;
      }
    }
  }
}