/**
 * @file Fly.ts
 *
 * "Муха" (Fly) companion weapon & living shield system for "А тебе?".
 *
 * Mechanics:
 * - Found as a maggot larva on the floor. When picked up, spawns a fly companion.
 * - Army size: stacks up to 5 flies maximum.
 * - Formation: flies always fly near the player in the 8 blocks around the player.
 *   • Never overlap with each other (each fly has a distinct tile).
 *   • Never stand on the player's tile (never behind the player).
 * - Attack: when an enemy approaches within 1 block of the player (8 blocks around player),
 *   flies swarm towards that enemy and attack, dealing 2 damage per fly.
 * - Living Shield: when an enemy attacks the player, the player takes 0 damage!
 *   Instead, one of the flies intercepts the blow and takes the damage.
 * - Transitions: flies transition across rooms and levels with the player.
 */

import { Fly, Vec2, Room, Enemy, isWalkable } from "../core/types.ts";
import { Mulberry32 } from "../rng/Mulberry32.ts";
import { FLY_HP, FLY_DAMAGE, MAX_FLIES } from "./balance.ts";
import { removeDeadEnemies } from "./Combat.ts";

/**
 * 8 relative offsets around a center cell (excluding (0,0)).
 */
export const SURROUNDING_DIRS: readonly Vec2[] = [
  { x: 0, y: -1 },  // N
  { x: 1, y: -1 },  // NE
  { x: 1, y: 0 },   // E
  { x: 1, y: 1 },   // SE
  { x: 0, y: 1 },   // S
  { x: -1, y: 1 },  // SW
  { x: -1, y: 0 },  // W
  { x: -1, y: -1 }, // NW
];

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

/**
 * Calculate unique, non-overlapping fly slots in the 8 blocks surrounding
 * the player (strictly excluding playerPos).
 *
 * If enemies are near the player, slots closest to those enemies are prioritized
 * so the flies swarm directly towards the approaching threat.
 */
export function getFlySlots(
  playerPos: Vec2,
  room: Room,
  enemies: readonly Enemy[] = [],
  flyCount: number = MAX_FLIES,
  rng?: Mulberry32,
): Vec2[] {
  // Collect walkable floor tiles in the 8 blocks around player
  const walkable: Vec2[] = [];
  for (const d of SURROUNDING_DIRS) {
    const nx = playerPos.x + d.x;
    const ny = playerPos.y + d.y;
    if (isWalkable(room, nx, ny)) {
      walkable.push({ x: nx, y: ny });
    }
  }

  // Corner fallback: if player has fewer than flyCount walkable neighbors (e.g. corner),
  // expand to radius 2 floor tiles so each fly always gets a unique tile
  if (walkable.length < flyCount) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) continue;
        const nx = playerPos.x + dx;
        const ny = playerPos.y + dy;
        if (
          isWalkable(room, nx, ny) &&
          !walkable.some((s) => s.x === nx && s.y === ny)
        ) {
          walkable.push({ x: nx, y: ny });
        }
      }
    }
  }

  // If room is extremely constrained, fallback to any valid in-bounds non-player tiles
  if (walkable.length === 0) {
    for (const d of SURROUNDING_DIRS) {
      const nx = Math.max(1, Math.min(room.w - 2, playerPos.x + d.x));
      const ny = Math.max(1, Math.min(room.h - 2, playerPos.y + d.y));
      if (nx !== playerPos.x || ny !== playerPos.y) {
        if (!walkable.some((s) => s.x === nx && s.y === ny)) {
          walkable.push({ x: nx, y: ny });
        }
      }
    }
  }

  // Threat check: any living enemies in the 8 blocks around player (or radius ≤ 3)
  let threats = enemies.filter(
    (e) =>
      e.hp > 0 &&
      Math.max(Math.abs(e.pos.x - playerPos.x), Math.abs(e.pos.y - playerPos.y)) <= 1,
  );

  if (threats.length === 0) {
    threats = enemies.filter(
      (e) =>
        e.hp > 0 &&
        Math.max(Math.abs(e.pos.x - playerPos.x), Math.abs(e.pos.y - playerPos.y)) <= 3,
    );
  }

  if (threats.length > 0) {
    // Sort slots by distance to the closest enemy — flies swarm towards the threat!
    walkable.sort((a, b) => {
      const distA = Math.min(
        ...threats.map((e) => Math.abs(a.x - e.pos.x) + Math.abs(a.y - e.pos.y)),
      );
      const distB = Math.min(
        ...threats.map((e) => Math.abs(b.x - e.pos.x) + Math.abs(b.y - e.pos.y)),
      );
      return distA - distB;
    });
  } else if (rng) {
    // Idle buzzing: slight offset rotation so flies feel alive
    const offset = rng.int(0, walkable.length - 1);
    const rotated = [...walkable.slice(offset), ...walkable.slice(0, offset)];
    walkable.length = 0;
    walkable.push(...rotated);
  }

  return walkable.slice(0, flyCount);
}

/**
 * Move flies around the player:
 * - Each fly gets a unique slot (no overlapping).
 * - No fly is on the player's tile.
 * - When an enemy approaches within 1 block, flies position themselves closest to the enemy.
 */
export function moveFlies(
  flies: Fly[],
  playerPos: Vec2,
  room: Room,
  enemies: readonly Enemy[],
  rng: Mulberry32,
): void {
  const alive = flies.filter((f) => f.hp > 0);
  if (alive.length === 0) return;

  const slots = getFlySlots(playerPos, room, enemies, alive.length, rng);
  for (let i = 0; i < alive.length; i++) {
    if (i < slots.length) {
      alive[i].pos = { ...slots[i] };
    }
  }
}

/**
 * Reposition flies when entering a new room or level.
 */
export function repositionFlies(
  flies: Fly[],
  playerPos: Vec2,
  room: Room,
  enemies: readonly Enemy[] = [],
): void {
  const alive = flies.filter((f) => f.hp > 0);
  if (alive.length === 0) return;

  const slots = getFlySlots(playerPos, room, enemies, alive.length);
  for (let i = 0; i < alive.length; i++) {
    if (i < slots.length) {
      alive[i].pos = { ...slots[i] };
    }
  }
}

/**
 * Flies attack enemies within 1 block of the player (8 blocks around us)
 * or within 1 block of any fly.
 * Each fly deals FLY_DAMAGE (2).
 */
export function fliesAttackEnemies(
  flies: Fly[],
  playerPos: Vec2,
  room: Room,
): { hitCount: number; killedAny: boolean } {
  let hitCount = 0;
  let killedAny = false;

  const livingFlies = flies.filter((f) => f.hp > 0);
  if (livingFlies.length === 0) return { hitCount: 0, killedAny: false };

  // Targets: living enemies in 8 blocks around the player OR in radius 1 of any fly
  const targets = room.enemies.filter(
    (e) =>
      e.hp > 0 &&
      (Math.max(Math.abs(e.pos.x - playerPos.x), Math.abs(e.pos.y - playerPos.y)) <= 1 ||
        livingFlies.some((f) => isInFlyRadius(f.pos, e.pos))),
  );

  if (targets.length === 0) return { hitCount: 0, killedAny: false };

  // Each living fly strikes the closest target
  for (const fly of livingFlies) {
    let bestEnemy = targets[0];
    let bestDist =
      Math.abs(bestEnemy.pos.x - fly.pos.x) + Math.abs(bestEnemy.pos.y - fly.pos.y);

    for (let i = 1; i < targets.length; i++) {
      const e = targets[i];
      if (e.hp <= 0) continue;
      const d =
        Math.abs(e.pos.x - fly.pos.x) + Math.abs(e.pos.y - fly.pos.y);
      if (d < bestDist) {
        bestDist = d;
        bestEnemy = e;
      }
    }

    if (bestEnemy && bestEnemy.hp > 0) {
      bestEnemy.hp -= FLY_DAMAGE;
      hitCount++;
      if (bestEnemy.hp <= 0) {
        killedAny = true;
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
