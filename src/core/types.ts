/**
 * SHARED CONTRACT — the single source of truth all three devs build against.
 *
 *   A (generation)  implements  GenerateLevel  → produces Room[]
 *   B (gameplay)    implements  Game           → owns & mutates GameState
 *   C (render/UI)   reads        GameState      → draws it
 *
 * Nobody adds fields here without the others agreeing. Keep it stable.
 */

export type Vec2 = { x: number; y: number };

/** The three kinds of cell. Shelf is a free-standing in-room obstacle. */
export enum Tile {
  Floor = 0,
  Wall = 1,
  Shelf = 2,
}

export type EnemyKind = "cashier" | "loader" | "guard" | "boss";

export type FoodKind =
  | "cheese" | "croissant" | "cookie" | "bread" | "sausage" // regular pool (levels 1–5)
  | "cake" | "sushi" | "shrimp" | "steak" | "chocolate"; // premium pool (levels 6–10)

export type ItemKind = "toothpick" | "energy" | "bigcheese";

export interface Enemy {
  kind: EnemyKind;
  pos: Vec2;
  hp: number;
  /** true = moves 2 tiles per player turn (levels 8+). */
  fast: boolean;
}

export interface Food {
  kind: FoodKind;
  pos: Vec2;
  heal: number;
  score: number;
}

export interface Trap {
  pos: Vec2;
}

export interface Item {
  kind: ItemKind;
  pos: Vec2;
}

/** A transition tile. нора → sibling room; люк → next/prev level. */
export interface Exit {
  kind: "nora" | "luk";
  dir: "fwd" | "back";
  pos: Vec2;
}

/** One room = one screen. Produced by A, consumed by B & C. */
export interface Room {
  w: number;
  h: number;
  /** length === w*h, row-major. */
  tiles: Tile[];
  /** where the mouse appears when it has no incoming нора. */
  entry: Vec2;
  exits: Exit[];
  enemies: Enemy[];
  food: Food[];
  traps: Trap[];
  items: Item[];
  isBossArena: boolean;
}

export type Phase = "title" | "playing" | "gameover" | "win";

export interface Player {
  pos: Vec2;
  hp: number;
  maxHp: number;
  attack: number;
}

/** The whole live run. B owns and mutates this; C only reads it. */
export interface GameState {
  seed: number;
  level: number; // 1..10
  roomIndex: number; // position in the current level's room chain
  roomCount: number; // rooms in the current level
  score: number;
  player: Player;
  room: Room; // the current (visible) room
  /** Active poison-cloud tiles (boss fight). B fills during the fight; C renders. */
  clouds: Vec2[];
  phase: Phase;
}

/** A implements this; B calls it to get a level's chain of rooms. */
export type GenerateLevel = (seed: number, level: number) => Room[];

/** B implements this; C (main.ts) drives it from input. */
export interface Game {
  readonly state: GameState;
  /** Advance one turn by moving the player (dx,dy ∈ {-1,0,1}). */
  movePlayer(dx: number, dy: number): void;
  /** Start a brand-new run (random seed if omitted). */
  restart(seed?: number): void;
  /** Start a run with a specific seed (title-screen seed box). */
  startWithSeed(seed: number): void;
}

// --- tiny shared helpers (pure, no deps) ---------------------------------

export function tileAt(room: Room, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= room.w || y >= room.h) return Tile.Wall;
  return room.tiles[y * room.w + x];
}

/** Only Floor is walkable — Wall and Shelf block. */
export function isWalkable(room: Room, x: number, y: number): boolean {
  return tileAt(room, x, y) === Tile.Floor;
}
