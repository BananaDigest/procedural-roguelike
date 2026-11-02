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
import { ROOM_SCALE } from "../config.ts";
import {
  ENEMY_HP,
  LAST_LEVEL,
  enemiesForLevel,
  pickFood,
  rollPowerup,
  maggotSpawnChanceForLevel,
  trapCountForLevel,
} from "./Spawns.ts";
import { createWildMouse } from "../game/WildMouse.ts";
import { WILD_MOUSE_MIN_LEVEL, WILD_MOUSE_SPAWN_CHANCE } from "../game/balance.ts";

export interface RoomSpec {
  baseSeed: number;
  level: number; // 1..10
  index: number; // 0-based position in the level's chain
  count: number; // rooms in this level
  allowToothpick?: boolean;
}

/** Room size limits, in tiles, INCLUDING the wall frame (before scaledSize's level scaling). */
export const ROOM_W = { min: 11, max: 18 };
export const ROOM_H = { min: 8, max: 12 };
/** Boss arena (level 10, base size): bigger than any normal room; scaled it must fit config.VIEW. */
export const ARENA = { w: 20, h: 12 };
/** Level 10, room 1 — the small quiet room before the arena. */
export const APPROACH = { w: { min: 11, max: 13 }, h: { min: 8, max: 9 } };

const MAX_ATTEMPTS = 20;

/** Size multiplier for `level` (config.ROOM_SCALE: 1.25× on levels 6–10, else 1). */
export function roomScaleFor(level: number): number {
  return level >= ROOM_SCALE.fromLevel && level <= ROOM_SCALE.toLevel ? ROOM_SCALE.factor : 1;
}

/** A base room dimension (tiles) scaled for `level`, rounded to whole tiles. */
export function scaledSize(n: number, level: number): number {
  return Math.round(n * roomScaleFor(level));
}

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
  const w = scaledSize(arena ? ARENA.w : rng.int(sizeW.min, sizeW.max), level);
  const h = scaledSize(arena ? ARENA.h : rng.int(sizeH.min, sizeH.max), level);
  const tiles = new Array<Tile>(w * h).fill(Tile.Floor);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) tiles[y * w + x] = Tile.Wall;
    }
  }

  // 2. shelving (WFC) + box crates (Poisson-disk) — none in the arena, the boss needs space
  if (!arena && withShelves) {
    placeShelvesWFC(tiles, w, h, rng);
    placeCratesPoisson(tiles, w, h, rng);
  }

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
    wildMouse: null,
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
  //    (Double-stepping is no longer a per-enemy flag; it's a per-turn roll in
  //    processEnemyTurns, so every enemy spawns with fast:false.)
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
    room.enemies.push({ kind: "boss", pos: boss, hp: ENEMY_HP.boss, maxHp: ENEMY_HP.boss, fast: false });
  } else {
    for (const kind of enemiesForLevel(level, rng)) {
      const p = take(farFromEntry(4)) ?? take(farFromEntry(2));
      if (!p) break; // room too crowded — fewer enemies is fine
      const enemy: Enemy = { kind, pos: p, hp: ENEMY_HP[kind], maxHp: ENEMY_HP[kind], fast: false };
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
  const power = arena ? null : rollPowerup(rng, level, spec.allowToothpick ?? true);
  if (power) {
    const p = take(reachable);
    if (p) {
      const item: Item = { kind: power, pos: p };
      room.items.push(item);
    }
  }

  // 8. maggot (fly larva) — 10–15% chance per room
  if (!arena && rng.chance(maggotSpawnChanceForLevel(level))) {
    const p = take(reachable);
    if (p) {
      room.items.push({ kind: "maggot", pos: p });
    }
  }

  // 9. wild teammate ("Дика миша") — 50% chance starting level 7
  if (level >= WILD_MOUSE_MIN_LEVEL && !arena && rng.chance(WILD_MOUSE_SPAWN_CHANCE)) {
    const p = take(reachable);
    if (p) {
      room.wildMouse = createWildMouse(p);
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

// ─── Shelving: Wave Function Collapse (simple tiled model) ───────────────
//
// Tile alphabet. Each tile's four edges [N,E,S,W] carry a socket: 'f' faces
// open floor, 'h' links a horizontal run left↔right, 'v' links a vertical run
// top↔bottom. Two tiles may sit edge-to-edge only if the touching sockets are
// equal; plus two same-orientation shelves may never meet back-to-back, so
// runs stay exactly one tile thick (no blobs) and, lacking corner tiles, can
// never close a loop. With a forced floor ring inside the wall frame you can
// always walk around a run's ends → the floor stays one connected region.
interface WfcTile { shelf: boolean; o: "F" | "H" | "V"; N: string; E: string; S: string; W: string }
const WFC_TILES: WfcTile[] = [
  { shelf: false, o: "F", N: "f", E: "f", S: "f", W: "f" }, // 0 floor / walkway
  { shelf: true, o: "H", N: "f", E: "h", S: "f", W: "f" }, // 1 horizontal run — left end
  { shelf: true, o: "H", N: "f", E: "h", S: "f", W: "h" }, // 2 horizontal run — middle
  { shelf: true, o: "H", N: "f", E: "f", S: "f", W: "h" }, // 3 horizontal run — right end
  { shelf: true, o: "V", N: "f", E: "f", S: "v", W: "f" }, // 4 vertical run — top end
  { shelf: true, o: "V", N: "v", E: "f", S: "v", W: "f" }, // 5 vertical run — middle
  { shelf: true, o: "V", N: "v", E: "f", S: "f", W: "f" }, // 6 vertical run — bottom end
];
// Floor common; middles weighted up so a started run tends to extend.
const WFC_WEIGHT = [13, 1, 3, 1, 1, 3, 1];
const WFC_DIRS = [
  { dx: 0, dy: -1, edge: "N", opp: "S" },
  { dx: 1, dy: 0, edge: "E", opp: "W" },
  { dx: 0, dy: 1, edge: "S", opp: "N" },
  { dx: -1, dy: 0, edge: "W", opp: "E" },
] as const;

/** May tile `b` sit in direction `d` from tile `a`? */
function wfcCompatible(a: number, b: number, d: number): boolean {
  const ta = WFC_TILES[a], tb = WFC_TILES[b], dir = WFC_DIRS[d];
  const ea = ta[dir.edge as "N" | "E" | "S" | "W"], eb = tb[dir.opp as "N" | "E" | "S" | "W"];
  if (ea !== eb) return false;
  if (ea === "f") {
    const vert = dir.edge === "N" || dir.edge === "S";
    if (ta.o === "H" && tb.o === "H" && vert) return false; // no stacking horizontal runs
    if (ta.o === "V" && tb.o === "V" && !vert) return false; // no side-by-side vertical runs
  }
  return true;
}

const wfcBitIndex = (bit: number) => 31 - Math.clz32(bit);
function wfcBits(mask: number): number {
  let c = 0;
  while (mask) { mask &= mask - 1; c++; }
  return c;
}

/**
 * Collapse the interior into shelving runs with WFC. Falls back to a couple of
 * short free shelves on tiny rooms or if every attempt hits a contradiction.
 */
function placeShelvesWFC(tiles: Tile[], w: number, h: number, rng: Mulberry32): void {
  const iw = w - 2, ih = h - 2; // interior grid (inside the wall frame)
  if (iw < 3 || ih < 3) { placeFreeShelves(tiles, w, h, rng.int(1, 3), rng); return; }

  const N = WFC_TILES.length, FULL = (1 << N) - 1, FLOOR = 1;
  // allowed[d][a] = bitmask of tiles permitted in direction d from tile a
  const allowed: number[][] = [[], [], [], []];
  for (let d = 0; d < 4; d++) {
    for (let a = 0; a < N; a++) {
      let m = 0;
      for (let b = 0; b < N; b++) if (wfcCompatible(a, b, d)) m |= 1 << b;
      allowed[d][a] = m;
    }
  }

  const propagate = (dom: number[], seed: number[]): boolean => {
    const q = seed.slice();
    while (q.length) {
      const c = q.pop()!;
      const cx = c % iw, cy = (c / iw) | 0;
      let acc = dom[c];
      const perDir = [0, 0, 0, 0];
      while (acc) { const bit = acc & -acc; const a = wfcBitIndex(bit); for (let d = 0; d < 4; d++) perDir[d] |= allowed[d][a]; acc ^= bit; }
      for (let d = 0; d < 4; d++) {
        const nx = cx + WFC_DIRS[d].dx, ny = cy + WFC_DIRS[d].dy;
        if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue;
        const ni = ny * iw + nx, nd = dom[ni] & perDir[d];
        if (nd === 0) return false;
        if (nd !== dom[ni]) { dom[ni] = nd; q.push(ni); }
      }
    }
    return true;
  };

  for (let attempt = 0; attempt < 8; attempt++) {
    const dom = new Array<number>(iw * ih).fill(FULL);
    const ring: number[] = [];
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        if (x === 0 || y === 0 || x === iw - 1 || y === ih - 1) { dom[y * iw + x] = FLOOR; ring.push(y * iw + x); }
      }
    }
    if (!propagate(dom, ring)) continue;

    let ok = true;
    for (;;) {
      // observe: the undecided cell with the fewest options (ties broken by rng)
      let bestN = 99; const cands: number[] = [];
      for (let i = 0; i < dom.length; i++) {
        const n = wfcBits(dom[i]);
        if (n > 1) { if (n < bestN) { bestN = n; cands.length = 0; cands.push(i); } else if (n === bestN) cands.push(i); }
      }
      if (cands.length === 0) break; // fully collapsed
      const cell = cands.length === 1 ? cands[0] : rng.pick(cands);
      // collapse by weighted choice among the cell's remaining tiles
      const items: { value: number; weight: number }[] = [];
      for (let b = 0; b < N; b++) if (dom[cell] & (1 << b)) items.push({ value: b, weight: WFC_WEIGHT[b] });
      dom[cell] = 1 << rng.weighted(items);
      if (!propagate(dom, [cell])) { ok = false; break; }
    }
    if (!ok) continue;

    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        if (WFC_TILES[wfcBitIndex(dom[y * iw + x])].shelf) tiles[(y + 1) * w + (x + 1)] = Tile.Shelf;
      }
    }
    return;
  }
  placeFreeShelves(tiles, w, h, rng.int(1, 3), rng);
}

// ─── Crates: Bridson Poisson-disk sampling ───────────────────────────────

/**
 * Scatter box crates on open floor with Bridson's algorithm: sampled points
 * keep a minimum centre distance `r`, so crates spread evenly without clumping.
 * A handful of points become crates (1×1, a pair, or a 2×2 stack) wherever the
 * 1-tile-dilated footprint is clear of walls, shelves and other crates.
 */
function placeCratesPoisson(tiles: Tile[], w: number, h: number, rng: Mulberry32): void {
  const minX = 2, minY = 2, maxX = w - 2, maxY = h - 2; // continuous domain, tile units
  const dw = maxX - minX, dh = maxY - minY;
  if (dw <= 1 || dh <= 1) return;
  const r = 3, cell = r / Math.SQRT2;
  const gw = Math.ceil(dw / cell), gh = Math.ceil(dh / cell);
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts: { x: number; y: number }[] = [];
  const active: number[] = [];
  const add = (x: number, y: number) => {
    const i = pts.length;
    pts.push({ x, y });
    active.push(i);
    grid[(((y - minY) / cell) | 0) * gw + (((x - minX) / cell) | 0)] = i;
  };
  add(minX + rng.next() * dw, minY + rng.next() * dh);
  const K = 30;
  while (active.length) {
    const ai = rng.int(0, active.length - 1);
    const p = pts[active[ai]];
    let placed = false;
    for (let k = 0; k < K; k++) {
      const ang = rng.next() * Math.PI * 2, rad = r * (1 + rng.next()); // [r, 2r)
      const nx = p.x + Math.cos(ang) * rad, ny = p.y + Math.sin(ang) * rad;
      if (nx < minX || ny < minY || nx >= maxX || ny >= maxY) continue;
      const gx = ((nx - minX) / cell) | 0, gy = ((ny - minY) / cell) | 0;
      let far = true;
      for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2) && far; yy++) {
        for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
          const qi = grid[yy * gw + xx];
          if (qi >= 0) { const q = pts[qi]; if ((q.x - nx) ** 2 + (q.y - ny) ** 2 < r * r) { far = false; break; } }
        }
      }
      if (!far) continue;
      add(nx, ny);
      placed = true;
      break;
    }
    if (!placed) active.splice(ai, 1);
  }

  // turn a few of the sampled points into crates where the footprint is clear
  rng.shuffle(pts);
  const shapes: [number, number][] = [[1, 1], [1, 1], [1, 1], [2, 1], [1, 2], [2, 2]];
  const target = rng.int(2, 5);
  let made = 0;
  for (const p of pts) {
    if (made >= target) break;
    const [cw, ch] = shapes[rng.int(0, shapes.length - 1)];
    const x0 = Math.min(Math.max(2, Math.floor(p.x)), w - 3 - cw + 1);
    const y0 = Math.min(Math.max(2, Math.floor(p.y)), h - 3 - ch + 1);
    let free = true;
    for (let y = y0 - 1; y <= y0 + ch && free; y++) {
      for (let x = x0 - 1; x <= x0 + cw; x++) if (tiles[y * w + x] !== Tile.Floor) { free = false; break; }
    }
    if (!free) continue;
    for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) tiles[y * w + x] = Tile.Crate;
    made++;
  }
}

/**
 * Fallback for tiny rooms or WFC contradictions: 1–`n` short free-standing
 * shelf runs (2–4 tiles) that never touch a wall or each other.
 */
function placeFreeShelves(tiles: Tile[], w: number, h: number, n: number, rng: Mulberry32): void {
  for (let s = 0; s < n; s++) {
    for (let tries = 0; tries < 30; tries++) {
      const horizontal = rng.chance(0.6);
      const len = rng.int(2, 4);
      const sw = horizontal ? len : 1;
      const sh = horizontal ? 1 : len;
      if (w - 4 < sw || h - 4 < sh) continue;
      const x0 = rng.int(2, w - 3 - sw + 1);
      const y0 = rng.int(2, h - 3 - sh + 1);

      let free = true;
      for (let y = y0 - 1; y <= y0 + sh && free; y++) {
        for (let x = x0 - 1; x <= x0 + sw; x++) {
          if (tiles[y * w + x] !== Tile.Floor) { free = false; break; }
        }
      }
      if (!free) continue;

      for (let y = y0; y < y0 + sh; y++) for (let x = x0; x < x0 + sw; x++) tiles[y * w + x] = Tile.Shelf;
      break;
    }
  }
}
