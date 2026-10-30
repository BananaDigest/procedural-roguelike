/**
 * @file Fly.ts
 *
 * "Муха" (Fly) companion weapon system for "А тебе?".
 *
 * Players find a maggot larva on the floor. When picked up, it turns into a fly.
 * - Army cap: up to 5 flies maximum.
 * - Flies follow the player and transition across rooms and levels.
 * - Radius 1 tile: flies deal 2 damage to all enemies within 1 cell of them.
 * - Enemies can attack flies (a fly has 4 HP).
 * - Flies never attack the player.
 */

import { Fly, Vec2, Room, isWalkable } from "../core/types.ts";
import { Mulberry32 } from "../rng/Mulberry32.ts";
import { FLY_HP, FLY_DAMAGE, MAX_FLIES } from "./balance.ts";
import { removeDeadEnemies } from "./Combat.ts";

/**
 * Create a new fly companion at the given position.
 */
export function createFly(pos: Vec2): Fly {
  return {
    pos: { ...pos },
    hp: FLY_HP,
    maxHp: FLY_HP,
  };
}

/**
 * Check whether target `b` is within 1-tile radius of `a`
 * (Chebyshev distance ≤ 1, covering all 8 adjacent tiles and the center tile).
 */
export function isInFlyRadius(a: Vec2, b: Vec2): boolean {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
}

/** 8-directional offsets */
const ALL_DIRS: readonly Vec2[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
];

/**
 * Move flies to stay near the player (radius 1–2).
 * If a fly is farther away, it moves towards the player.
 * If already near the player, it buzzes randomly around the player.
 */
export function moveFlies(
  flies: Fly[],
  playerPos: Vec2,
  room: Room,
  rng: Mulberry32,
): void {
  // Collect walkable tiles surrounding the player (radius 1)
  const aroundPlayer: Vec2[] = [];
  for (const d of ALL_DIRS) {
    const nx = playerPos.x + d.x;
    const ny = playerPos.y + d.y;
    if (isWalkable(room, nx, ny)) {
      aroundPlayer.push({ x: nx, y: ny });
    }
  }

  for (const fly of flies) {
    if (fly.hp <= 0) continue;

    const dist = Math.max(
      Math.abs(fly.pos.x - playerPos.x),
      Math.abs(fly.pos.y - playerPos.y),
    );

    if (dist > 1) {
      // Step closer to player
      let best = fly.pos;
      let bestDist = dist;

      for (const d of ALL_DIRS) {
        const nx = fly.pos.x + d.x;
        const ny = fly.pos.y + d.y;
        if (isWalkable(room, nx, ny)) {
          const dNext = Math.max(
            Math.abs(nx - playerPos.x),
            Math.abs(ny - playerPos.y),
          );
          if (dNext < bestDist) {
            bestDist = dNext;
            best = { x: nx, y: ny };
          }
        }
      }
      fly.pos = { ...best };
    } else {
      // Already adjacent — 60% chance to buzz to a different adjacent cell
      if (aroundPlayer.length > 0 && rng.chance(0.6)) {
        fly.pos = { ...rng.pick(aroundPlayer) };
      }
    }
  }
}

/**
 * Teleport and spread flies around the player when transitioning
 * to a new room or level.
 */
export function repositionFlies(
  flies: Fly[],
  playerPos: Vec2,
  room: Room,
): void {
  const spots: Vec2[] = [];
  for (const d of ALL_DIRS) {
    const nx = playerPos.x + d.x;
    const ny = playerPos.y + d.y;
    if (isWalkable(room, nx, ny)) {
      spots.push({ x: nx, y: ny });
    }
  }

  for (let i = 0; i < flies.length; i++) {
    if (spots.length > 0) {
      flies[i].pos = { ...spots[i % spots.length] };
    } else {
      flies[i].pos = { ...playerPos };
    }
  }
}

/**
 * Each living fly deals FLY_DAMAGE (2) to every enemy within a 1-tile radius.
 * Mutates enemies and removes dead enemies if any died.
 */
export function fliesAttackEnemies(
  flies: Fly[],
  room: Room,
): { hitCount: number; killedAny: boolean } {
  let hitCount = 0;
  let killedAny = false;

  for (const fly of flies) {
    if (fly.hp <= 0) continue;

    for (const enemy of room.enemies) {
      if (enemy.hp <= 0) continue;

      if (isInFlyRadius(fly.pos, enemy.pos)) {
        enemy.hp -= FLY_DAMAGE;
        hitCount++;
        if (enemy.hp <= 0) {
          killedAny = true;
        }
      }
    }
  }

  if (killedAny) {
    removeDeadEnemies(room);
  }

  return { hitCount, killedAny };
}

/**
 * Filter out dead flies from the army.
 */
export function removeDeadFlies(flies: Fly[]): Fly[] {
  return flies.filter((f) => f.hp > 0);
}

export { MAX_FLIES, FLY_HP, FLY_DAMAGE };

