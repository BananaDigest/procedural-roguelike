/**
 * RoomGen — builds ONE room from a seed.
 *
 *   size → floor rectangle with a wall frame → 0–3 free-standing shelves
 *   → exits (нора / люк) → entry → enemies, food, traps, power-up
 *   → flood-fill safety check (regenerate if anything is unreachable)
 *
 * Every random decision goes through Mulberry32 seeded with
 * baseSeed + level·100 + roomIndex, so the same seed → the same room.
 */
import { Mulberry32, roomSeed } from "../rng/Mulberry32.ts";
import { type Enemy, type Exit, type Food, type Item, type Room, Tile, type Trap, type Vec2 } from "../core/types.ts";
import { floodFill, isRoomConnected } from "./ConnectivityCheck.ts";
import {
  ENEMY_HP,
  LAST_LEVEL,
  enemiesForLevel,
  isFastLevel,
  pickFood,
  rollPowerup,
  trapCountForLevel,
} from "./Spawns.ts";

export interface RoomSpec {
  baseSeed: number;
  level: number; // 1..10
  index: number; // 0-based position in the level's chain
  count: number; // rooms in this level
}

/** Room size limits, in tiles, INCLUDING the wall frame. */
export const ROOM_W = { min: 11, max: 18 };
export const ROOM_H = { min: 8, max: 12 };
/** Boss arena: bigger than any normal room, still fits the 20×14 viewport (+ HUD row). */
export const ARENA = { w: 20, h: 12 };
/** Level 10, room 1 — the small quiet room before the arena. */
export const APPROACH = { w: { min: 11, max: 13 }, h: { min: 8, max: 9 } };

const MAX_ATTEMPTS = 20;

export function generateRoom(spec: RoomSpec): Room {
  const seed = roomSeed(spec.baseSeed, spec.level, spec.index);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // attempt 0 uses the room's own seed; retries mix in the attempt number.
    const rng = new Mulberry32(attempt === 0 ? seed : seed ^ Math.imul(attempt, 0x9e3779b1));
    const room = buildRoom(spec, rng, true);
    if (room && isRoomConnected(room)) return room;
  }
  // Can't really happen (shelves never touch), but never ship a broken room:
  // without shelves the room is an open rectangle and always connected.
  return buildRoom(spec, new Mulberry32(seed), false)!;
}

export function isBossArena(spec: RoomSpec): boolean {
  return spec.level === LAST_LEVEL && spec.index === spec.count - 1;
}

function buildRoom(spec: RoomSpec, rng: Mulberry32, withShelves: boolean): Room | null {
  const { level, index, count } = spec;
  const arena = isBossArena(spec);

  // 1. size + wall frame
  const approach = level === LAST_LEVEL && !arena;
  const sizeW = approach ? APPROACH.w : ROOM_W;
  const sizeH = approach ? APPROACH.h : ROOM_H;
  const w = arena ? ARENA.w : rng.int(sizeW.min, sizeW.max);
  const h = arena ? ARENA.h : rng.int(sizeH.min, sizeH.max);
  const tiles = new Array<Tile>(w * h).fill(Tile.Floor);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) tiles[y * w + x] = Tile.Wall;
    }
  }

  // 2. shelves (none in the arena — the boss fight needs open space)
  if (!arena && withShelves) placeShelves(tiles, w, h, rng.int(0, 3), rng);

  const room: Room = {
    w,
    h,
    tiles,
    entry: { x: 1, y: 1 },
    exits: [],
    enemies: [],
    food: [],
    traps: [],
    items: [],
    isBossArena: arena,
  };

  // Floor cells, in random order. Everything below is taken from this pool.
  const floor: Vec2[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) if (tiles[y * w + x] === Tile.Floor) floor.push({ x, y });
  }
  rng.shuffle(floor);
  const used = new Set<number>(); // cells already holding something
  const reserved = new Set<number>(); // cells kept empty (around exits & entry)
  const key = (p: Vec2) => p.y * w + p.x;

  const take = (ok: (p: Vec2) => boolean): Vec2 | null => {
    for (const p of floor) {
      const k = key(p);
      if (!used.has(k) && !reserved.has(k) && ok(p)) {
        used.add(k);
        return p;
      }
    }
    return null;
  };
  const reserveAround = (p: Vec2) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) reserved.add(key({ x: p.x + dx, y: p.y + dy }));
  };

  // 3. exits + entry
  const hasBackNora = index > 0;
  const hasBackLuk = index === 0 && level > 1;
  const hasFwdNora = index < count - 1;
  const hasFwdLuk = index === count - 1 && level < LAST_LEVEL;

  const back: Exit[] = [];
  if (hasBackNora) back.push({ kind: "nora", dir: "back", pos: { x: 0, y: 0 } });
  if (hasBackLuk) back.push({ kind: "luk", dir: "back", pos: { x: 0, y: 0 } });
  const fwd: Exit[] = [];
  if (hasFwdNora) fwd.push({ kind: "nora", dir: "fwd", pos: { x: 0, y: 0 } });
  if (hasFwdLuk) fwd.push({ kind: "luk", dir: "fwd", pos: { x: 0, y: 0 } });

  const placed: Vec2[] = [];
  for (const exit of back) {
    const p = takeFar(take, placed, w, h);
    if (!p) return null;
    exit.pos = p;
    placed.push(p);
  }

  // Entry: next to the way back in (where the mouse arrives), or anywhere on
  // the very first room of the run.
  if (back.length > 0) {
    const b = back[0].pos;
    const near = take((p) => Math.abs(p.x - b.x) + Math.abs(p.y - b.y) === 1);
    if (!near) return null;
    room.entry = near;
  } else {
    const p = take(() => true);
    if (!p) return null;
    room.entry = p;
  }
  placed.push(room.entry);

  // Forward exits as far from the way in as the room allows.
  for (const exit of fwd) {
    const p = takeFar(take, placed, w, h);
    if (!p) return null;
    exit.pos = p;
    placed.push(p);
  }

  room.exits = [...back, ...fwd];
  for (const e of room.exits) reserveAround(e.pos);
  reserveAround(room.entry);

  // Only spawn on tiles the entry can reach.
  const reach = floodFill(room, room.entry);
  const reachable = (p: Vec2) => reach[key(p)];

  // 4. enemies — not right next to the entry, so arriving is never a free hit.
  const fast = isFastLevel(level);
  const farFromEntry = (d: number) => (p: Vec2) =>
    reachable(p) && Math.max(Math.abs(p.x - room.entry.x), Math.abs(p.y - room.entry.y)) >= d;

  if (arena) {
    // boss in the center (or the nearest free cell, if an exit landed there)
    const c = { x: Math.floor(w / 2), y: Math.floor(h / 2) };
    let boss: Vec2 | null = null;
    for (let r = 0; r < Math.max(w, h) && !boss; r++) {
      boss = take((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) <= r);
    }
    if (!boss) return null;
    room.enemies.push({ kind: "boss", pos: boss, hp: ENEMY_HP.boss, fast: true });
  } else {
    for (const kind of enemiesForLevel(level, rng)) {
      const p = take(farFromEntry(4)) ?? take(farFromEntry(2));
      if (!p) break; // room too crowded — fewer enemies is fine
      const enemy: Enemy = { kind, pos: p, hp: ENEMY_HP[kind], fast };
      room.enemies.push(enemy);
    }
  }

  // 5. food 2–4
  const foodCount = rng.int(2, 4);
  for (let i = 0; i < foodCount; i++) {
    const p = take(reachable);
    if (!p) break;
    const f = pickFood(level, rng);
    const food: Food = { kind: f.kind, pos: p, heal: f.heal, score: f.score };
    room.food.push(food);
  }

  // 6. traps 1–3 (from level 4)
  const trapCount = trapCountForLevel(level, rng);
  for (let i = 0; i < trapCount; i++) {
    const p = take(reachable);
    if (!p) break;
    const trap: Trap = { pos: p };
    room.traps.push(trap);
  }

  // 7. power-up 0–1, rare (the arena gets none — the Big Cheese appears there later)
  const power = arena ? null : rollPowerup(rng);
  if (power) {
    const p = take(reachable);
    if (p) {
      const item: Item = { kind: power, pos: p };
      room.items.push(item);
    }
  }

  return room;
}

/**
 * Take a free cell far from `from` (Manhattan). Prefers cells in the farthest
 * half of the room; falls back to any free cell.
 */
function takeFar(
  take: (ok: (p: Vec2) => boolean) => Vec2 | null,
  from: readonly Vec2[],
  w: number,
  h: number,
): Vec2 | null {
  if (from.length === 0) return take(() => true);
  const minDist = (p: Vec2) => Math.min(...from.map((q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y)));
  const span = w + h - 4; // largest possible distance inside the frame
  return take((p) => minDist(p) >= span / 2) ?? take((p) => minDist(p) >= 3) ?? take(() => true);
}

/**
 * 0–`n` free-standing shelves: straight runs of 2–4 tiles. A shelf never
 * touches a wall or another shelf (one tile of floor all around), so the
 * floor around shelves always stays one connected region.
 */
function placeShelves(tiles: Tile[], w: number, h: number, n: number, rng: Mulberry32): void {
  for (let s = 0; s < n; s++) {
    for (let tries = 0; tries < 30; tries++) {
      const horizontal = rng.chance(0.6);
      const len = rng.int(2, 4);
      const sw = horizontal ? len : 1;
      const sh = horizontal ? 1 : len;
      // shelf cells live in [2, w-3] × [2, h-3] → a floor gap to the wall frame
      if (w - 4 < sw || h - 4 < sh) continue;
      const x0 = rng.int(2, w - 3 - sw + 1);
      const y0 = rng.int(2, h - 3 - sh + 1);

      let free = true;
      for (let y = y0 - 1; y <= y0 + sh && free; y++) {
        for (let x = x0 - 1; x <= x0 + sw; x++) {
          if (tiles[y * w + x] === Tile.Shelf) {
            free = false;
            break;
          }
        }
      }
      if (!free) continue;

      for (let y = y0; y < y0 + sh; y++) for (let x = x0; x < x0 + sw; x++) tiles[y * w + x] = Tile.Shelf;
      break;
    }
  }
}
