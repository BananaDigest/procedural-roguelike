/**
 * @file Enemy.ts
 *
 * Enemy AI system for "А тебе?".
 *
 * Each enemy is locked within its room and never leaves it.
 * Every player turn this module processes all living enemies:
 *  - If adjacent to the mouse → melee attack (via Combat.ts).
 *  - Otherwise → move according to the enemy's behaviour:
 *      • Cashier / Loader — random wander (pick a random walkable neighbour
 *        or stay put).
 *      • Guard / Boss      — greedy chase (step to the adjacent walkable cell
 *        that minimises Manhattan distance to the mouse).
 *
 * Additional constraints:
 *  - Two enemies never share a cell.
 *  - Enemies ignore traps and food.
 *  - "Fast" enemies (levels 8+) execute two steps per player turn.
 *  - An active Energy Drink freezes all enemies for the turn.
 */

import { Room, Enemy, Vec2, Player, isWalkable } from "../core/types.ts";
import { Mulberry32 } from "../rng/Mulberry32.ts";
import { enemyAttackPlayer } from "./Combat.ts";

// ── Geometry helpers ─────────────────────────────────────────────────────────

/**
 * Check whether two positions are adjacent (4-directional, Manhattan
 * distance exactly 1).
 *
 * @param a - First position.
 * @param b - Second position.
 * @returns `true` if `a` and `b` are orthogonally adjacent.
 */
export function isAdjacent(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

// ── Collision helpers ────────────────────────────────────────────────────────

/**
 * Check whether a cell is free of other living enemies.
 *
 * @param x       - Target column.
 * @param y       - Target row.
 * @param enemies - All enemies in the room.
 * @param self    - The enemy that is trying to move (excluded from the check).
 * @returns `true` if no other living enemy occupies (x, y).
 */
function isFreeOfEnemies(
  x: number,
  y: number,
  enemies: readonly Enemy[],
  self: Enemy,
): boolean {
  return !enemies.some(
    (e) => e !== self && e.hp > 0 && e.pos.x === x && e.pos.y === y,
  );
}

// ── Movement helpers ─────────────────────────────────────────────────────────

/** Cardinal direction offsets (N, S, W, E). */
const DIRS: readonly Vec2[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

/**
 * Collect every valid adjacent position an enemy can step to.
 *
 * A cell qualifies when it is:
 *  1. Walkable (Floor tile within room bounds).
 *  2. Not occupied by another living enemy.
 *  3. Not occupied by the player (enemies attack adjacently, never step
 *     onto the player's cell).
 *
 * @param enemy     - The enemy to compute moves for.
 * @param room      - The current room.
 * @param enemies   - All enemies in the room.
 * @param playerPos - The player's current position.
 * @returns Array of walkable, unoccupied neighbour positions.
 */
function getValidMoves(
  enemy: Enemy,
  room: Room,
  enemies: readonly Enemy[],
  playerPos: Vec2,
): Vec2[] {
  const result: Vec2[] = [];
  for (const d of DIRS) {
    const nx = enemy.pos.x + d.x;
    const ny = enemy.pos.y + d.y;
    if (
      isWalkable(room, nx, ny) &&
      isFreeOfEnemies(nx, ny, enemies, enemy) &&
      (nx !== playerPos.x || ny !== playerPos.y)
    ) {
      result.push({ x: nx, y: ny });
    }
  }
  return result;
}

/**
 * **Wander** — pick a random valid adjacent cell, or stay put if none are
 * available.  Used by Cashier and Loader enemies.
 *
 * @param enemy     - The wandering enemy (mutated: `pos` may change).
 * @param room      - The current room.
 * @param enemies   - All enemies in the room.
 * @param playerPos - The player's current position.
 * @param rng       - Seeded PRNG instance.
 */
function wander(
  enemy: Enemy,
  room: Room,
  enemies: readonly Enemy[],
  playerPos: Vec2,
  rng: Mulberry32,
): void {
  const moves = getValidMoves(enemy, room, enemies, playerPos);
  if (moves.length > 0) {
    const target = rng.pick(moves);
    enemy.pos.x = target.x;
    enemy.pos.y = target.y;
  }
}

/**
 * **Chase** — move to the adjacent cell that minimises Manhattan distance
 * to the player.  Ties are broken randomly.  Used by Guard and Boss enemies.
 *
 * @param enemy     - The chasing enemy (mutated: `pos` may change).
 * @param room      - The current room.
 * @param enemies   - All enemies in the room.
 * @param playerPos - The player's current position.
 * @param rng       - Seeded PRNG instance (for tie-breaking).
 */
function chase(
  enemy: Enemy,
  room: Room,
  enemies: readonly Enemy[],
  playerPos: Vec2,
  rng: Mulberry32,
): void {
  const moves = getValidMoves(enemy, room, enemies, playerPos);
  if (moves.length === 0) return;

  let bestDist = Infinity;
  let best: Vec2[] = [];

  for (const m of moves) {
    const dist = Math.abs(m.x - playerPos.x) + Math.abs(m.y - playerPos.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = [m];
    } else if (dist === bestDist) {
      best.push(m);
    }
  }

  const target = rng.pick(best);
  enemy.pos.x = target.x;
  enemy.pos.y = target.y;
}

// ── Per-enemy step ───────────────────────────────────────────────────────────

/**
 * Process a single step for one enemy.
 *
 * If the enemy is adjacent to the player it attacks; otherwise it moves
 * according to its kind (wander or chase).
 *
 * @param enemy   - The acting enemy.
 * @param room    - The current room.
 * @param enemies - All enemies in the room.
 * @param player  - The player (mutated on attack).
 * @param rng     - Seeded PRNG instance.
 * @returns `true` if the enemy attacked the player this step.
 */
function stepEnemy(
  enemy: Enemy,
  room: Room,
  enemies: readonly Enemy[],
  player: Player,
  rng: Mulberry32,
): boolean {
  // Adjacent → melee attack instead of moving.
  if (isAdjacent(enemy.pos, player.pos)) {
    enemyAttackPlayer(enemy, player);
    return true;
  }

  // Move according to behaviour kind.
  if (enemy.kind === "cashier" || enemy.kind === "loader") {
    wander(enemy, room, enemies, player.pos, rng);
  } else {
    // Guard and Boss chase the player.
    chase(enemy, room, enemies, player.pos, rng);
  }

  return false;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run every living enemy's turn for the current room.
 *
 * Fast enemies (flagged via `enemy.fast`) execute **two** steps per player
 * turn.  If an enemy attacks on its first step it does **not** get a second
 * step.
 *
 * When the Energy Drink effect is active (`energyActive === true`) all
 * enemies are frozen and the function returns immediately.
 *
 * @param room         - The current room containing the enemies.
 * @param player       - The player state (may be mutated by enemy attacks).
 * @param rng          - Seeded PRNG instance.
 * @param energyActive - Whether the Energy Drink freeze effect is in play.
 * @returns `true` if **any** enemy attacked the player this round.
 */
export function processEnemyTurns(
  room: Room,
  player: Player,
  rng: Mulberry32,
  energyActive: boolean,
): boolean {
  if (energyActive) return false; // enemies are frozen during energy effect

  let anyAttacked = false;

  for (const enemy of room.enemies) {
    if (enemy.hp <= 0) continue;

    const attacked1 = stepEnemy(enemy, room, room.enemies, player, rng);
    if (attacked1) {
      anyAttacked = true;
      continue; // no second step after an attack
    }

    // Fast enemies get a second step.
    if (enemy.fast) {
      const attacked2 = stepEnemy(enemy, room, room.enemies, player, rng);
      if (attacked2) anyAttacked = true;
    }
  }

  return anyAttacked;
}
