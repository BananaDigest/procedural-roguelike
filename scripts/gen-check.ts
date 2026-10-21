/**
 * Person A's self-check for the world generator.
 *
 *   npm run gen                 → print level 1 of a random seed
 *   npm run gen -- 8819273 5    → print level 5 of seed 8819273
 *   npm run gen -- 8819273 all  → print all 10 levels
 *   npm run gen:check           → determinism + invariants over many seeds
 */
import { generateLevel, roomCountForLevel } from "../src/generation/LevelChain.ts";
import { levelToAscii } from "../src/generation/debug.ts";
import { isRoomConnected } from "../src/generation/ConnectivityCheck.ts";
import { APPROACH, ARENA, ROOM_H, ROOM_W } from "../src/generation/RoomGen.ts";
import { randomSeed, seedFromInput } from "../src/rng/Mulberry32.ts";
import { type Room, Tile, type Vec2 } from "../src/core/types.ts";

const args = process.argv.slice(2);

if (args[0] === "--check") {
  runChecks(Number(args[1] ?? 300));
} else {
  const seed = seedFromInput(args[0] ?? "") ?? randomSeed();
  const which = args[1] ?? "1";
  const levels = which === "all" ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [Number(which)];
  console.log(`Seed ${seed}\n`);
  for (const level of levels) console.log(levelToAscii(generateLevel(seed, level), level) + "\n");
}

function runChecks(seeds: number): void {
  const errors: string[] = [];
  const fail = (msg: string) => errors.length < 30 && errors.push(msg);
  let rooms = 0;

  for (let s = 0; s < seeds; s++) {
    const seed = s * 7919 + 13;
    for (let level = 1; level <= 10; level++) {
      const a = generateLevel(seed, level);
      const b = generateLevel(seed, level);
      const where = `seed ${seed} L${level}`;
      if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${where}: not deterministic`);

      const count = roomCountForLevel(seed, level);
      if (a.length !== count) fail(`${where}: ${a.length} rooms, expected ${count}`);
      if (level === 10 ? count !== 2 : count < 4 || count > 7) fail(`${where}: bad room count ${count}`);

      a.forEach((room, i) => {
        rooms++;
        checkRoom(room, level, i, a.length, `${where} R${i}`, fail);
      });
    }
  }

  if (errors.length) {
    console.error(`FAILED (${errors.length}+ problems):\n` + errors.join("\n"));
    process.exit(1);
  }
  console.log(`OK — ${seeds} seeds × 10 levels, ${rooms} rooms: deterministic, all invariants hold.`);
}

function checkRoom(room: Room, level: number, i: number, count: number, where: string, fail: (m: string) => void) {
  const { w, h } = room;
  if (room.tiles.length !== w * h) fail(`${where}: tiles.length`);
  if (room.isBossArena) {
    if (w !== ARENA.w || h !== ARENA.h) fail(`${where}: arena size`);
    if (room.tiles.includes(Tile.Shelf)) fail(`${where}: shelf in arena`);
    if (room.enemies.length !== 1 || room.enemies[0].kind !== "boss") fail(`${where}: arena must hold only the boss`);
  } else {
    if (w < ROOM_W.min || w > ROOM_W.max || h < ROOM_H.min || h > ROOM_H.max) fail(`${where}: size ${w}×${h}`);
    if (room.enemies.some((e) => e.kind === "boss")) fail(`${where}: boss outside arena`);
    if (level === 10 && (w > APPROACH.w.max || h > APPROACH.h.max)) fail(`${where}: approach room too big`);
    if (level === 10 && room.enemies.length > 2) fail(`${where}: approach room has ${room.enemies.length} enemies`);
  }
  if (room.isBossArena !== (level === 10 && i === count - 1)) fail(`${where}: isBossArena flag`);

  // frame is wall, shelves never touch a wall
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = room.tiles[y * w + x];
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (edge && t !== Tile.Wall) fail(`${where}: hole in frame`);
      if (!edge && t === Tile.Wall) fail(`${where}: wall inside`);
      if (t === Tile.Shelf && (x < 2 || y < 2 || x > w - 3 || y > h - 3)) fail(`${where}: shelf touches wall`);
    }

  // the right exits
  const has = (kind: string, dir: string) => room.exits.some((e) => e.kind === kind && e.dir === dir);
  if (has("nora", "back") !== i > 0) fail(`${where}: back нора`);
  if (has("nora", "fwd") !== i < count - 1) fail(`${where}: fwd нора`);
  if (has("luk", "back") !== (i === 0 && level > 1)) fail(`${where}: back люк`);
  if (has("luk", "fwd") !== (i === count - 1 && level < 10)) fail(`${where}: fwd люк`);

  // one thing per cell, all on floor, all reachable
  const all: Vec2[] = [
    room.entry,
    ...room.exits.map((e) => e.pos),
    ...room.enemies.map((e) => e.pos),
    ...room.food.map((f) => f.pos),
    ...room.traps.map((t) => t.pos),
    ...room.items.map((t) => t.pos),
  ];
  const seen = new Set<number>();
  for (const p of all) {
    const k = p.y * w + p.x;
    if (seen.has(k)) fail(`${where}: two things on (${p.x},${p.y})`);
    seen.add(k);
    if (room.tiles[k] !== Tile.Floor) fail(`${where}: object on non-floor (${p.x},${p.y})`);
  }
  if (!isRoomConnected(room)) fail(`${where}: something unreachable`);

  // counts from the design table
  const n = room.food.length;
  if (n < 2 || n > 4) fail(`${where}: food ${n}`);
  const traps = room.traps.length;
  if (level < 4 ? traps !== 0 : traps < 1 || traps > 3) fail(`${where}: traps ${traps}`);
  if (room.items.length > 1) fail(`${where}: >1 power-up`);
  const premium = ["cake", "sushi", "shrimp", "steak", "chocolate"];
  if (room.food.some((f) => premium.includes(f.kind) !== level >= 6)) fail(`${where}: wrong food pool`);
  if (room.enemies.some((e) => e.fast !== (level >= 8 || e.kind === "boss"))) fail(`${where}: fast flag`);
  if (level === 1 && room.enemies.length) fail(`${where}: enemies on level 1`);
  if (level === 9 && room.enemies.some((e) => e.kind !== "guard")) fail(`${where}: non-guard on level 9`);
}
