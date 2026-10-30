import { Schema, MapSchema, type } from '@colyseus/schema';

export class PlayerState extends Schema {
  constructor() {
    super();
    this.username = "";
    this.character = "Matt";
    this.isHost = false;
    this.isLoaded = false;
    this.x = 0;
    this.y = 1.6;
    this.z = 0;
    this.rotY = 0;
    this.action = "Idle_Gun";
    this.equippedWeapon = "Pistol";
  }
}
type("string")(PlayerState.prototype, "username");
type("string")(PlayerState.prototype, "character");
type("boolean")(PlayerState.prototype, "isHost");
type("boolean")(PlayerState.prototype, "isLoaded");
type("number")(PlayerState.prototype, "x");
type("number")(PlayerState.prototype, "y");
type("number")(PlayerState.prototype, "z");
type("number")(PlayerState.prototype, "rotY");
type("string")(PlayerState.prototype, "action");
type("string")(PlayerState.prototype, "equippedWeapon");

export class ZombieState extends Schema {
  constructor() {
    super();
    this.id = "";
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.rotY = 0;
    this.health = 100;
    this.state = "idle";
    this.targetId = "";
  }
}
type("string")(ZombieState.prototype, "id");
type("number")(ZombieState.prototype, "x");
type("number")(ZombieState.prototype, "y");
type("number")(ZombieState.prototype, "z");
type("number")(ZombieState.prototype, "rotY");
type("number")(ZombieState.prototype, "health");
type("string")(ZombieState.prototype, "state");
type("string")(ZombieState.prototype, "targetId");

export class GameState extends Schema {
  constructor() {
    super();
    this.status = "lobby";
    this.roomCode = "";
    this.players = new MapSchema();
    this.zombies = new MapSchema();
  }
}
type("string")(GameState.prototype, "status");
type("string")(GameState.prototype, "roomCode");
type({ map: PlayerState })(GameState.prototype, "players");
type({ map: ZombieState })(GameState.prototype, "zombies");