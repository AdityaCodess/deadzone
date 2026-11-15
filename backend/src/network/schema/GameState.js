import * as colyseusSchema from '@colyseus/schema';
const Schema = colyseusSchema.Schema;
const MapSchema = colyseusSchema.MapSchema;

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
colyseusSchema.defineTypes(PlayerState, {
  username: "string",
  character: "string",
  isHost: "boolean",
  isLoaded: "boolean",
  x: "number",
  y: "number",
  z: "number",
  rotY: "number",
  action: "string",
  equippedWeapon: "string"
});

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
colyseusSchema.defineTypes(ZombieState, {
  id: "string",
  x: "number",
  y: "number",
  z: "number",
  rotY: "number",
  health: "number",
  state: "string",
  targetId: "string"
});

export class GameState extends Schema {
  constructor() {
    super();
    this.status = "lobby";
    this.roomCode = "";
    this.players = new MapSchema();
    this.zombies = new MapSchema();
  }
}
colyseusSchema.defineTypes(GameState, {
  status: "string",
  roomCode: "string",
  players: { map: PlayerState },
  zombies: { map: ZombieState }
});