/**
 * FIXTURES — hardcoded sample data so B and C can work WITHOUT waiting for A/B.
 *
 *   B: develop GameState logic against `fixtureRoom()` until A's generator lands.
 *   C: render & drive `StubGame` until B's real Game lands.
 *
 * Delete nothing here — just stop importing it once the real modules exist.
 */

import {
  Game,
  GameState,
  GenerateLevel,
  Room,
  Tile,
  isWalkable,
} from "./types.ts";

/** One representative room: border walls, two shelves, a few of everything. */
export function fixtureRoom(): Room {
  const w = 14;
  const h = 10;
  const tiles = new Array<Tile>(w * h).fill(Tile.Floor);
  for (let x = 0; x < w; x++) {
    tiles[x] = Tile.Wall;
    tiles[(h - 1) * w + x] = Tile.Wall;
  }
  for (let y = 0; y < h; y++) {
    tiles[y * w] = Tile.Wall;
    tiles[y * w + w - 1] = Tile.Wall;
  }
  // a couple of free-standing shelves
  tiles[3 * w + 5] = Tile.Shelf;
  tiles[3 * w + 6] = Tile.Shelf;
  tiles[6 * w + 9] = Tile.Shelf;

  return {
    w,
    h,
    tiles,
    entry: { x: 2, y: 5 },
    exits: [{ kind: "nora", dir: "fwd", pos: { x: 11, y: 4 } }],
    enemies: [
      { kind: "cashier", pos: { x: 7, y: 3 }, hp: 4, fast: false },
      { kind: "guard", pos: { x: 9, y: 7 }, hp: 8, fast: false },
    ],
    food: [
      { kind: "cheese", pos: { x: 5, y: 7 }, heal: 3, score: 10 },
      { kind: "cookie", pos: { x: 8, y: 5 }, heal: 3, score: 10 },
    ],
    traps: [{ pos: { x: 6, y: 6 } }],
    items: [{ kind: "toothpick", pos: { x: 4, y: 3 } }],
    isBossArena: false,
  };
}

export function fixtureState(): GameState {
  const room = fixtureRoom();
  return {
    seed: 12345,
    level: 3,
    roomIndex: 1,
    roomCount: 4,
    score: 12,
    player: { pos: { ...room.entry }, hp: 14, maxHp: 20, attack: 4 },
    room,
    clouds: [{ x: 6, y: 4 }],
    phase: "playing",
  };
}

/**
 * Stub generator (A replaces with real RoomGen). Returns a chain of sample
 * rooms so B's level/room navigation has something to walk through.
 */
export const stubGenerateLevel: GenerateLevel = (_seed, level) => {
  const count = level === 10 ? 2 : 4;
  const rooms: Room[] = [];
  for (let i = 0; i < count; i++) rooms.push(fixtureRoom());
  return rooms;
};

/**
 * Stub game (B replaces with real GameState logic). Just lets the player walk
 * around the fixture room — enough for C to build and test the renderer/input.
 */
export class StubGame implements Game {
  state: GameState = fixtureState();

  startWithSeed(seed: number): void {
    this.state = fixtureState();
    this.state.seed = seed;
  }

  restart(seed?: number): void {
    this.state = fixtureState();
    if (seed !== undefined) this.state.seed = seed;
  }

  movePlayer(dx: number, dy: number): void {
    const { player, room } = this.state;
    const nx = player.pos.x + dx;
    const ny = player.pos.y + dy;
    if (isWalkable(room, nx, ny)) {
      player.pos.x = nx;
      player.pos.y = ny;
    }
  }
}
