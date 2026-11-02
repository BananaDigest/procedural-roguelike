// src/rng/Mulberry32.ts
var Mulberry32 = class {
  state;
  constructor(seed) {
    this.state = seed >>> 0;
  }
  /** Next float in [0, 1). */
  next() {
    this.state = this.state + 1831565813 >>> 0;
    let t = this.state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  /** Integer in [min, max] inclusive. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  /** Random element of a non-empty array. */
  pick(arr) {
    return arr[this.int(0, arr.length - 1)];
  }
  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }
  /**
   * Weighted pick: higher `weight` → picked more often.
   * e.g. weighted([{ value: "bread", weight: 30 }, { value: "cheese", weight: 10 }])
   */
  weighted(items) {
    let total = 0;
    for (const it of items) total += it.weight;
    let roll = this.next() * total;
    for (const it of items) {
      roll -= it.weight;
      if (roll < 0) return it.value;
    }
    return items[items.length - 1].value;
  }
  /** Fisher–Yates shuffle, in place. Returns the same array. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
};
function roomSeed(baseSeed, level, roomIndex) {
  return baseSeed + level * 100 + roomIndex >>> 0;
}
function levelSeed(baseSeed, level) {
  return roomSeed(baseSeed, level, 99);
}

// src/core/types.ts
function tileAt(room, x, y) {
  if (x < 0 || y < 0 || x >= room.w || y >= room.h) return 1 /* Wall */;
  return room.tiles[y * room.w + x];
}
function isWalkable(room, x, y) {
  return tileAt(room, x, y) === 0 /* Floor */;
}

// src/generation/ConnectivityCheck.ts
var DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];
function floodFill(room, start) {
  const seen = new Array(room.w * room.h).fill(false);
  if (!isWalkable(room, start.x, start.y)) return seen;
  const stack = [start];
  seen[start.y * room.w + start.x] = true;
  while (stack.length > 0) {
    const p = stack.pop();
    for (const d of DIRS) {
      const nx = p.x + d.x;
      const ny = p.y + d.y;
      const i = ny * room.w + nx;
      if (isWalkable(room, nx, ny) && !seen[i]) {
        seen[i] = true;
        stack.push({ x: nx, y: ny });
      }
    }
  }
  return seen;
}
function allReachable(room, start, targets) {
  const seen = floodFill(room, start);
  return targets.every((t) => seen[t.y * room.w + t.x] === true);
}
function isRoomConnected(room) {
  const targets = [
    ...room.exits.map((e) => e.pos),
    ...room.food.map((f) => f.pos),
    ...room.items.map((i) => i.pos),
    ...room.traps.map((t) => t.pos),
    ...room.enemies.map((e) => e.pos)
  ];
  return allReachable(room, room.entry, targets);
}

// src/config.ts
var ROOM_SCALE = { factor: 1.25, fromLevel: 6, toLevel: 10 };

// src/game/balance.ts
var CASHIER_HP = 4;
var LOADER_HP = 4;
var GUARD_HP = 8;
var BOSS_HP = 90;
var MAGGOT_SPAWN_CHANCE = 0.15;
var MAGGOT_SPAWN_CHANCE_AFTER_L7_MULT = 2;
var TOOTHPICK_BASE_SPAWN_CHANCE = 0.1;
var TOOTHPICK_SPAWN_CHANCE_PER_LEVEL_AFTER_L7 = 0.1;
function toothpickSpawnChanceForLevel(level) {
  const extraLevels = Math.max(0, level - 7);
  return TOOTHPICK_BASE_SPAWN_CHANCE + extraLevels * TOOTHPICK_SPAWN_CHANCE_PER_LEVEL_AFTER_L7;
}
function maggotSpawnChanceForLevel(level) {
  return level > 7 ? MAGGOT_SPAWN_CHANCE * MAGGOT_SPAWN_CHANCE_AFTER_L7_MULT : MAGGOT_SPAWN_CHANCE;
}
var WILD_MOUSE_HP = 13;
var WILD_MOUSE_MIN_LEVEL = 7;
var WILD_MOUSE_SPAWN_CHANCE = 0.5;

// src/generation/Spawns.ts
var LAST_LEVEL = 10;
var ENEMY_HP = {
  cashier: CASHIER_HP,
  loader: LOADER_HP,
  guard: GUARD_HP,
  boss: BOSS_HP
};
function isPremium(level) {
  return level >= 6;
}
function enemiesForLevel(level, rng) {
  switch (level) {
    case 1:
      return [];
    case 2:
      return ["cashier"];
    case 3:
    case 4:
      return ["cashier", "loader"];
    case 5:
      return ["cashier", "loader", "guard"];
    case 6: {
      const out = ["cashier", "loader", "guard", "guard"];
      if (rng.int(0, 1)) out.push("cashier");
      return out;
    }
    case 7: {
      const out = [];
      for (const kind of ["cashier", "loader", "guard"]) {
        const n = rng.int(1, 2);
        for (let i = 0; i < n; i++) out.push(kind);
      }
      return out;
    }
    case 8: {
      const out = ["loader", "guard"];
      const extra = rng.int(1, 2);
      for (let i = 0; i < extra; i++) {
        out.push(rng.pick(["cashier", "loader", "guard"]));
      }
      return out;
    }
    case 9: {
      const n = rng.int(1, 2);
      return new Array(n).fill("guard");
    }
    default: {
      const n = rng.int(0, 2);
      const out = [];
      for (let i = 0; i < n; i++) out.push(rng.pick(["cashier", "loader", "guard"]));
      return out;
    }
  }
}
function trapCountForLevel(level, rng) {
  return level >= 4 ? rng.int(1, 3) : 0;
}
var REGULAR_POOL = [
  { value: "bread", weight: 30 },
  { value: "cookie", weight: 25 },
  { value: "croissant", weight: 20 },
  { value: "sausage", weight: 15 },
  { value: "cheese", weight: 10 }
];
var PREMIUM_POOL = [
  { value: "chocolate", weight: 30 },
  { value: "cake", weight: 25 },
  { value: "sushi", weight: 20 },
  { value: "shrimp", weight: 15 },
  { value: "steak", weight: 10 }
];
var FOOD_VALUE = {
  regular: { heal: 3, score: 10 },
  premium: { heal: 6, score: 25 }
};
function pickFood(level, rng) {
  const premium = isPremium(level);
  const kind = rng.weighted(premium ? PREMIUM_POOL : REGULAR_POOL);
  const v = premium ? FOOD_VALUE.premium : FOOD_VALUE.regular;
  return { kind, heal: v.heal, score: v.score };
}
function rollPowerup(rng, level = 1, allowToothpick = true) {
  const toothpickChance = allowToothpick ? toothpickSpawnChanceForLevel(level) : 0;
  const energyChance = 0.1;
  const totalChance = toothpickChance + energyChance;
  if (!rng.chance(totalChance)) return null;
  return rng.chance(toothpickChance / totalChance) ? "toothpick" : "energy";
}

// src/game/WildMouse.ts
function createWildMouse(pos) {
  return {
    pos: { ...pos },
    hp: WILD_MOUSE_HP,
    maxHp: WILD_MOUSE_HP
  };
}

// src/generation/RoomGen.ts
var ROOM_W = { min: 11, max: 18 };
var ROOM_H = { min: 8, max: 12 };
var ARENA = { w: 20, h: 12 };
var APPROACH = { w: { min: 11, max: 13 }, h: { min: 8, max: 9 } };
var MAX_ATTEMPTS = 20;
function roomScaleFor(level) {
  return level >= ROOM_SCALE.fromLevel && level <= ROOM_SCALE.toLevel ? ROOM_SCALE.factor : 1;
}
function scaledSize(n, level) {
  return Math.round(n * roomScaleFor(level));
}
function generateRoom(spec) {
  const seed = roomSeed(spec.baseSeed, spec.level, spec.index);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = new Mulberry32(attempt === 0 ? seed : seed ^ Math.imul(attempt, 2654435761));
    const room = buildRoom(spec, rng, true);
    if (room && isRoomConnected(room)) return room;
  }
  return buildRoom(spec, new Mulberry32(seed), false);
}
function isBossArena(spec) {
  return spec.level === LAST_LEVEL && spec.index === spec.count - 1;
}
function buildRoom(spec, rng, withShelves) {
  const { level, index, count } = spec;
  const arena = isBossArena(spec);
  const approach = level === LAST_LEVEL && !arena;
  const sizeW = approach ? APPROACH.w : ROOM_W;
  const sizeH = approach ? APPROACH.h : ROOM_H;
  const w = scaledSize(arena ? ARENA.w : rng.int(sizeW.min, sizeW.max), level);
  const h = scaledSize(arena ? ARENA.h : rng.int(sizeH.min, sizeH.max), level);
  const tiles = new Array(w * h).fill(0 /* Floor */);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) tiles[y * w + x] = 1 /* Wall */;
    }
  }
  if (!arena && withShelves) {
    placeShelvesWFC(tiles, w, h, rng);
    placeCratesPoisson(tiles, w, h, rng);
  }
  const room = {
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
    isBossArena: arena
  };
  const floor = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) if (tiles[y * w + x] === 0 /* Floor */) floor.push({ x, y });
  }
  rng.shuffle(floor);
  const used = /* @__PURE__ */ new Set();
  const reserved = /* @__PURE__ */ new Set();
  const key = (p) => p.y * w + p.x;
  const take = (ok) => {
    for (const p of floor) {
      const k = key(p);
      if (!used.has(k) && !reserved.has(k) && ok(p)) {
        used.add(k);
        return p;
      }
    }
    return null;
  };
  const reserveAround = (p) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) reserved.add(key({ x: p.x + dx, y: p.y + dy }));
  };
  const hasBackNora = index > 0;
  const hasBackLuk = index === 0 && level > 1;
  const hasFwdNora = index < count - 1;
  const hasFwdLuk = index === count - 1 && level < LAST_LEVEL;
  const back = [];
  if (hasBackNora) back.push({ kind: "nora", dir: "back", pos: { x: 0, y: 0 } });
  if (hasBackLuk) back.push({ kind: "luk", dir: "back", pos: { x: 0, y: 0 } });
  const fwd = [];
  if (hasFwdNora) fwd.push({ kind: "nora", dir: "fwd", pos: { x: 0, y: 0 } });
  if (hasFwdLuk) fwd.push({ kind: "luk", dir: "fwd", pos: { x: 0, y: 0 } });
  const placed = [];
  for (const exit of back) {
    const p = takeFar(take, placed, w, h);
    if (!p) return null;
    exit.pos = p;
    placed.push(p);
  }
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
  for (const exit of fwd) {
    const p = takeFar(take, placed, w, h);
    if (!p) return null;
    exit.pos = p;
    placed.push(p);
  }
  room.exits = [...back, ...fwd];
  for (const e of room.exits) reserveAround(e.pos);
  reserveAround(room.entry);
  const reach = floodFill(room, room.entry);
  const reachable = (p) => reach[key(p)];
  const farFromEntry = (d) => (p) => reachable(p) && Math.max(Math.abs(p.x - room.entry.x), Math.abs(p.y - room.entry.y)) >= d;
  if (arena) {
    const c = { x: Math.floor(w / 2), y: Math.floor(h / 2) };
    let boss = null;
    for (let r = 0; r < Math.max(w, h) && !boss; r++) {
      boss = take((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) <= r);
    }
    if (!boss) return null;
    room.enemies.push({ kind: "boss", pos: boss, hp: ENEMY_HP.boss, maxHp: ENEMY_HP.boss, fast: false });
  } else {
    for (const kind of enemiesForLevel(level, rng)) {
      const p = take(farFromEntry(4)) ?? take(farFromEntry(2));
      if (!p) break;
      const enemy = { kind, pos: p, hp: ENEMY_HP[kind], maxHp: ENEMY_HP[kind], fast: false };
      room.enemies.push(enemy);
    }
  }
  const foodCount = rng.int(2, 4);
  for (let i = 0; i < foodCount; i++) {
    const p = take(reachable);
    if (!p) break;
    const f = pickFood(level, rng);
    const food = { kind: f.kind, pos: p, heal: f.heal, score: f.score };
    room.food.push(food);
  }
  const trapCount = trapCountForLevel(level, rng);
  for (let i = 0; i < trapCount; i++) {
    const p = take(reachable);
    if (!p) break;
    const trap = { pos: p };
    room.traps.push(trap);
  }
  const power = arena ? null : rollPowerup(rng, level, spec.allowToothpick ?? true);
  if (power) {
    const p = take(reachable);
    if (p) {
      const item = { kind: power, pos: p };
      room.items.push(item);
    }
  }
  if (!arena && rng.chance(maggotSpawnChanceForLevel(level))) {
    const p = take(reachable);
    if (p) {
      room.items.push({ kind: "maggot", pos: p });
    }
  }
  if (level >= WILD_MOUSE_MIN_LEVEL && !arena && rng.chance(WILD_MOUSE_SPAWN_CHANCE)) {
    const p = take(reachable);
    if (p) {
      room.wildMouse = createWildMouse(p);
    }
  }
  return room;
}
function takeFar(take, from, w, h) {
  if (from.length === 0) return take(() => true);
  const minDist = (p) => Math.min(...from.map((q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y)));
  const span = w + h - 4;
  return take((p) => minDist(p) >= span / 2) ?? take((p) => minDist(p) >= 3) ?? take(() => true);
}
var WFC_TILES = [
  { shelf: false, o: "F", N: "f", E: "f", S: "f", W: "f" },
  // 0 floor / walkway
  { shelf: true, o: "H", N: "f", E: "h", S: "f", W: "f" },
  // 1 horizontal run — left end
  { shelf: true, o: "H", N: "f", E: "h", S: "f", W: "h" },
  // 2 horizontal run — middle
  { shelf: true, o: "H", N: "f", E: "f", S: "f", W: "h" },
  // 3 horizontal run — right end
  { shelf: true, o: "V", N: "f", E: "f", S: "v", W: "f" },
  // 4 vertical run — top end
  { shelf: true, o: "V", N: "v", E: "f", S: "v", W: "f" },
  // 5 vertical run — middle
  { shelf: true, o: "V", N: "v", E: "f", S: "f", W: "f" }
  // 6 vertical run — bottom end
];
var WFC_WEIGHT = [13, 1, 3, 1, 1, 3, 1];
var WFC_DIRS = [
  { dx: 0, dy: -1, edge: "N", opp: "S" },
  { dx: 1, dy: 0, edge: "E", opp: "W" },
  { dx: 0, dy: 1, edge: "S", opp: "N" },
  { dx: -1, dy: 0, edge: "W", opp: "E" }
];
function wfcCompatible(a, b, d) {
  const ta = WFC_TILES[a], tb = WFC_TILES[b], dir = WFC_DIRS[d];
  const ea = ta[dir.edge], eb = tb[dir.opp];
  if (ea !== eb) return false;
  if (ea === "f") {
    const vert = dir.edge === "N" || dir.edge === "S";
    if (ta.o === "H" && tb.o === "H" && vert) return false;
    if (ta.o === "V" && tb.o === "V" && !vert) return false;
  }
  return true;
}
var wfcBitIndex = (bit) => 31 - Math.clz32(bit);
function wfcBits(mask) {
  let c = 0;
  while (mask) {
    mask &= mask - 1;
    c++;
  }
  return c;
}
function placeShelvesWFC(tiles, w, h, rng) {
  const iw = w - 2, ih = h - 2;
  if (iw < 3 || ih < 3) {
    placeFreeShelves(tiles, w, h, rng.int(1, 3), rng);
    return;
  }
  const N = WFC_TILES.length, FULL = (1 << N) - 1, FLOOR = 1;
  const allowed = [[], [], [], []];
  for (let d = 0; d < 4; d++) {
    for (let a = 0; a < N; a++) {
      let m = 0;
      for (let b = 0; b < N; b++) if (wfcCompatible(a, b, d)) m |= 1 << b;
      allowed[d][a] = m;
    }
  }
  const propagate = (dom, seed) => {
    const q = seed.slice();
    while (q.length) {
      const c = q.pop();
      const cx = c % iw, cy = c / iw | 0;
      let acc = dom[c];
      const perDir = [0, 0, 0, 0];
      while (acc) {
        const bit = acc & -acc;
        const a = wfcBitIndex(bit);
        for (let d = 0; d < 4; d++) perDir[d] |= allowed[d][a];
        acc ^= bit;
      }
      for (let d = 0; d < 4; d++) {
        const nx = cx + WFC_DIRS[d].dx, ny = cy + WFC_DIRS[d].dy;
        if (nx < 0 || ny < 0 || nx >= iw || ny >= ih) continue;
        const ni = ny * iw + nx, nd = dom[ni] & perDir[d];
        if (nd === 0) return false;
        if (nd !== dom[ni]) {
          dom[ni] = nd;
          q.push(ni);
        }
      }
    }
    return true;
  };
  for (let attempt = 0; attempt < 8; attempt++) {
    const dom = new Array(iw * ih).fill(FULL);
    const ring = [];
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        if (x === 0 || y === 0 || x === iw - 1 || y === ih - 1) {
          dom[y * iw + x] = FLOOR;
          ring.push(y * iw + x);
        }
      }
    }
    if (!propagate(dom, ring)) continue;
    let ok = true;
    for (; ; ) {
      let bestN = 99;
      const cands = [];
      for (let i = 0; i < dom.length; i++) {
        const n = wfcBits(dom[i]);
        if (n > 1) {
          if (n < bestN) {
            bestN = n;
            cands.length = 0;
            cands.push(i);
          } else if (n === bestN) cands.push(i);
        }
      }
      if (cands.length === 0) break;
      const cell = cands.length === 1 ? cands[0] : rng.pick(cands);
      const items = [];
      for (let b = 0; b < N; b++) if (dom[cell] & 1 << b) items.push({ value: b, weight: WFC_WEIGHT[b] });
      dom[cell] = 1 << rng.weighted(items);
      if (!propagate(dom, [cell])) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        if (WFC_TILES[wfcBitIndex(dom[y * iw + x])].shelf) tiles[(y + 1) * w + (x + 1)] = 2 /* Shelf */;
      }
    }
    return;
  }
  placeFreeShelves(tiles, w, h, rng.int(1, 3), rng);
}
function placeCratesPoisson(tiles, w, h, rng) {
  const minX = 2, minY = 2, maxX = w - 2, maxY = h - 2;
  const dw = maxX - minX, dh = maxY - minY;
  if (dw <= 1 || dh <= 1) return;
  const r = 3, cell = r / Math.SQRT2;
  const gw = Math.ceil(dw / cell), gh = Math.ceil(dh / cell);
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts = [];
  const active = [];
  const add = (x, y) => {
    const i = pts.length;
    pts.push({ x, y });
    active.push(i);
    grid[((y - minY) / cell | 0) * gw + ((x - minX) / cell | 0)] = i;
  };
  add(minX + rng.next() * dw, minY + rng.next() * dh);
  const K = 30;
  while (active.length) {
    const ai = rng.int(0, active.length - 1);
    const p = pts[active[ai]];
    let placed = false;
    for (let k = 0; k < K; k++) {
      const ang = rng.next() * Math.PI * 2, rad = r * (1 + rng.next());
      const nx = p.x + Math.cos(ang) * rad, ny = p.y + Math.sin(ang) * rad;
      if (nx < minX || ny < minY || nx >= maxX || ny >= maxY) continue;
      const gx = (nx - minX) / cell | 0, gy = (ny - minY) / cell | 0;
      let far = true;
      for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2) && far; yy++) {
        for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
          const qi = grid[yy * gw + xx];
          if (qi >= 0) {
            const q = pts[qi];
            if ((q.x - nx) ** 2 + (q.y - ny) ** 2 < r * r) {
              far = false;
              break;
            }
          }
        }
      }
      if (!far) continue;
      add(nx, ny);
      placed = true;
      break;
    }
    if (!placed) active.splice(ai, 1);
  }
  rng.shuffle(pts);
  const shapes = [[1, 1], [1, 1], [1, 1], [2, 1], [1, 2], [2, 2]];
  const target = rng.int(2, 5);
  let made = 0;
  for (const p of pts) {
    if (made >= target) break;
    const [cw, ch] = shapes[rng.int(0, shapes.length - 1)];
    const x0 = Math.min(Math.max(2, Math.floor(p.x)), w - 3 - cw + 1);
    const y0 = Math.min(Math.max(2, Math.floor(p.y)), h - 3 - ch + 1);
    let free = true;
    for (let y = y0 - 1; y <= y0 + ch && free; y++) {
      for (let x = x0 - 1; x <= x0 + cw; x++) if (tiles[y * w + x] !== 0 /* Floor */) {
        free = false;
        break;
      }
    }
    if (!free) continue;
    for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) tiles[y * w + x] = 3 /* Crate */;
    made++;
  }
}
function placeFreeShelves(tiles, w, h, n, rng) {
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
          if (tiles[y * w + x] !== 0 /* Floor */) {
            free = false;
            break;
          }
        }
      }
      if (!free) continue;
      for (let y = y0; y < y0 + sh; y++) for (let x = x0; x < x0 + sw; x++) tiles[y * w + x] = 2 /* Shelf */;
      break;
    }
  }
}

// src/generation/LevelChain.ts
var ROOMS_PER_LEVEL = { min: 4, max: 7 };
function roomCountForLevel(baseSeed, level) {
  if (level === LAST_LEVEL) return 2;
  return new Mulberry32(levelSeed(baseSeed, level)).int(ROOMS_PER_LEVEL.min, ROOMS_PER_LEVEL.max);
}
var generateLevel = (seed, level) => {
  const count = roomCountForLevel(seed, level);
  const rooms = [];
  let toothpickSpawned = false;
  for (let index = 0; index < count; index++) {
    const room = generateRoom({
      baseSeed: seed,
      level,
      index,
      count,
      allowToothpick: !toothpickSpawned
    });
    if (room.items.some((i) => i.kind === "toothpick")) {
      toothpickSpawned = true;
    }
    rooms.push(room);
  }
  return rooms;
};

// src/generation/debug.ts
var ENEMY_CH = { cashier: "c", loader: "g", guard: "G", boss: "B" };
var ITEM_CH = { toothpick: "t", energy: "e", bigcheese: "C", maggot: "m" };
function roomToAscii(room) {
  const grid = [];
  for (let y = 0; y < room.h; y++) {
    const row = [];
    for (let x = 0; x < room.w; x++) {
      const t = room.tiles[y * room.w + x];
      row.push(t === 1 /* Wall */ ? "#" : t === 2 /* Shelf */ ? "=" : t === 3 /* Crate */ ? "x" : ".");
    }
    grid.push(row);
  }
  const put = (x, y, ch) => grid[y][x] = ch;
  for (const t of room.traps) put(t.pos.x, t.pos.y, "^");
  for (const f of room.food) put(f.pos.x, f.pos.y, "*");
  for (const i of room.items) put(i.pos.x, i.pos.y, ITEM_CH[i.kind]);
  for (const e of room.enemies) put(e.pos.x, e.pos.y, ENEMY_CH[e.kind]);
  for (const e of room.exits) {
    const ch = e.kind === "nora" ? "o" : "l";
    put(e.pos.x, e.pos.y, e.dir === "fwd" ? ch.toUpperCase() : ch);
  }
  put(room.entry.x, room.entry.y, "@");
  return grid.map((r) => r.join("")).join("\n");
}

// scratch/preview-rooms.ts
var bad = 0;
var samples = [];
for (let seed = 1; seed <= 300; seed++) {
  for (const level of [1, 3, 7]) {
    for (const room of generateLevel(seed, level)) {
      if (!isRoomConnected(room)) {
        bad++;
        samples.push(`DISCONNECTED seed=${seed} lvl=${level}
${roomToAscii(room)}`);
      }
    }
  }
}
for (const [seed, level] of [[2, 1], [5, 1], [11, 3], [23, 7], [42, 1], [77, 3]]) {
  const rooms = generateLevel(seed, level);
  const room = rooms[Math.min(1, rooms.length - 1)];
  console.log(`
seed=${seed} lvl=${level} ${room.w}x${room.h}`);
  console.log(roomToAscii(room));
}
console.log(`

Connectivity failures over all generated rooms: ${bad}`);
for (const s of samples.slice(0, 3)) console.log("\n" + s);
