import { Level, Point } from "../game/Level.ts";
import { Tile } from "../game/Tile.ts";
import { Mulberry32 } from "../rng/Mulberry32.ts";
import { reachableTiles } from "./ConnectivityCheck.ts";

export interface DrunkardsWalkOptions {
  width: number;
  height: number;
  /** Fraction of the map to carve into floor, 0..1. Higher = more open. */
  fillRatio: number;
  /** Chance per step the walker turns instead of going straight (winding). */
  turnChance: number;
}

const DEFAULTS: DrunkardsWalkOptions = {
  width: 60,
  height: 40,
  fillRatio: 0.42,
  turnChance: 0.25,
};

const DIRS: Point[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

/**
 * Drunkard's walk: drop a walker in the middle, carve floor as it staggers
 * around, biased to keep going straight. Simple, fast, and always produces
 * one connected blob (the walker never teleports), so connectivity is free.
 *
 * Deterministic in `rng` — same seed → same floor.
 */
export function generateDrunkardsWalk(
  rng: Mulberry32,
  opts: Partial<DrunkardsWalkOptions> = {},
): Level {
  const o = { ...DEFAULTS, ...opts };
  const level = new Level(o.width, o.height, Tile.Wall);

  const target = Math.floor(o.width * o.height * o.fillRatio);
  let carved = 0;

  // Keep the walker off the outer ring so there's always a wall border.
  let x = Math.floor(o.width / 2);
  let y = Math.floor(o.height / 2);
  let dir = rng.pick(DIRS);

  const carve = (cx: number, cy: number) => {
    if (level.get(cx, cy) === Tile.Wall) {
      level.set(cx, cy, Tile.Floor);
      carved++;
    }
  };
  carve(x, y);

  // Cap iterations so a pathological run can't loop forever.
  const maxSteps = target * 20;
  for (let step = 0; carved < target && step < maxSteps; step++) {
    if (rng.chance(o.turnChance)) dir = rng.pick(DIRS);

    const nx = x + dir.x;
    const ny = y + dir.y;

    // Bounce off the border instead of leaving the map.
    if (nx <= 0 || ny <= 0 || nx >= o.width - 1 || ny >= o.height - 1) {
      dir = rng.pick(DIRS);
      continue;
    }

    x = nx;
    y = ny;
    carve(x, y);
  }

  placeSpawnAndStairs(level, rng);
  return level;
}

/**
 * Put the player on a known floor tile, then put the staircase on the
 * reachable floor tile farthest from spawn (so descending feels earned).
 */
function placeSpawnAndStairs(level: Level, rng: Mulberry32): void {
  const floors = level.floorTiles();
  const spawn = rng.pick(floors);
  level.spawn = spawn;

  const reachable = reachableTiles(level, spawn);

  // Pick the farthest reachable tile (Manhattan distance) for the stairs.
  let best = spawn;
  let bestDist = -1;
  for (const key of reachable) {
    const x = key % level.width;
    const y = Math.floor(key / level.width);
    const dist = Math.abs(x - spawn.x) + Math.abs(y - spawn.y);
    if (dist > bestDist) {
      bestDist = dist;
      best = { x, y };
    }
  }

  level.stairs = best;
  level.set(best.x, best.y, Tile.StairsDown);
}
