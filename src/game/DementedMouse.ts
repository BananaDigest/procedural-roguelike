/**
 * @file DementedMouse.ts
 *
 * "Тімейт з деменцією" (Demented mouse teammate) system for "А тебе?".
 *
 * Appearance:
 * - Brown mouse with sticking hairs, bitten ear, drool, one tooth, and enlarged eyes.
 * - 13 HP (DEMENTED_MOUSE_HP).
 *
 * Behavior:
 * - Moves randomly and attacks either adjacent enemies or the player randomly.
 * - When attacking the player, if the player has living fly companions,
 *   a fly acts as living shield and absorbs the damage.
 * - Spawns starting from level 7 with a 50% chance per room.
 * - Does not transition between rooms (stays in the room where spawned).
 */

import {
  DementedMouse,
  Vec2,
  Room,
  Enemy,
  Player,
  Fly,
  isWalkable,
} from "../core/types.ts";
import { Mulberry32 } from "../rng/Mulberry32.ts";
import {
  DEMENTED_MOUSE_HP,
  DEMENTED_MOUSE_DAMAGE,
} from "./balance.ts";
import { removeDeadEnemies } from "./Combat.ts";
import { isAdjacent } from "./Enemy.ts";

/** Cardinal direction offsets (N, S, W, E). */
const CARDINAL_DIRS: readonly Vec2[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

/**
 * Create a new demented mouse at the given position.
 */
export function createDementedMouse(pos: Vec2): DementedMouse {
  return {
    pos: { ...pos },
    hp: DEMENTED_MOUSE_HP,
    maxHp: DEMENTED_MOUSE_HP,
  };
}

/**
 * The demented mouse attacks the player.
 * If the player has active flies, one fly intercepts as a living shield.
 */
export function dementedMouseAttackPlayer(
  mouse: DementedMouse,
  player: Player,
  flies?: Fly[],
): { hitFly: Fly | null; damage: number } {
  const dmg = DEMENTED_MOUSE_DAMAGE;

  if (flies && flies.length > 0) {
    const aliveFlies = flies.filter((f) => f.hp > 0);
    if (aliveFlies.length > 0) {
      let shieldFly = aliveFlies[0];
      let bestDist =
        Math.abs(shieldFly.pos.x - mouse.pos.x) +
        Math.abs(shieldFly.pos.y - mouse.pos.y);

      for (let i = 1; i < aliveFlies.length; i++) {
        const f = aliveFlies[i];
        const dist =
          Math.abs(f.pos.x - mouse.pos.x) + Math.abs(f.pos.y - mouse.pos.y);
        if (dist < bestDist) {
          bestDist = dist;
          shieldFly = f;
        }
      }

      shieldFly.hp = Math.max(0, shieldFly.hp - dmg);
      return { hitFly: shieldFly, damage: dmg };
    }
  }

  player.hp = Math.max(0, player.hp - dmg);
  return { hitFly: null, damage: dmg };
}

/**
 * The demented mouse attacks an enemy.
 */
export function dementedMouseAttackEnemy(
  _mouse: DementedMouse,
  enemy: Enemy,
): boolean {
  const dmg = DEMENTED_MOUSE_DAMAGE;
  enemy.hp -= dmg;
  return enemy.hp <= 0;
}

/**
 * Process one turn for the demented mouse.
 *
 * It acts unpredictably:
 * - If adjacent to enemies or player, it can randomly attack one of them, or wander.
 * - Otherwise, it wanders randomly into an unoccupied walkable floor tile.
 */
export function processDementedMouseTurn(
  mouse: DementedMouse,
  room: Room,
  player: Player,
  flies: Fly[],
  rng: Mulberry32,
): void {
  if (mouse.hp <= 0) return;

  // 1. Gather all adjacent targets (player and living enemies)
  type Target =
    | { kind: "player" }
    | { kind: "enemy"; enemy: Enemy };

  const targets: Target[] = [];
  if (isAdjacent(mouse.pos, player.pos)) {
    targets.push({ kind: "player" });
  }

  for (const enemy of room.enemies) {
    if (enemy.hp > 0 && isAdjacent(mouse.pos, enemy.pos)) {
      targets.push({ kind: "enemy", enemy });
    }
  }

  // 2. Decide if we attack or move
  let willAttack = false;
  if (targets.length > 0) {
    // 50% chance to attack when adjacent targets are present
    willAttack = rng.chance(0.5);
  }

  if (willAttack && targets.length > 0) {
    const chosen = rng.pick(targets);
    if (chosen.kind === "player") {
      dementedMouseAttackPlayer(mouse, player, flies);
    } else {
      const killed = dementedMouseAttackEnemy(mouse, chosen.enemy);
      if (killed) {
        removeDeadEnemies(room);
      }
    }
    return;
  }

  // 3. Wander to an adjacent walkable tile
  const validMoves: Vec2[] = [];
  for (const d of CARDINAL_DIRS) {
    const nx = mouse.pos.x + d.x;
    const ny = mouse.pos.y + d.y;

    if (!isWalkable(room, nx, ny)) continue;
    // Cannot step on player
    if (nx === player.pos.x && ny === player.pos.y) continue;
    // Cannot step on living enemies
    if (room.enemies.some((e) => e.hp > 0 && e.pos.x === nx && e.pos.y === ny)) continue;

    validMoves.push({ x: nx, y: ny });
  }

  if (validMoves.length > 0) {
    const chosen = rng.pick(validMoves);
    mouse.pos.x = chosen.x;
    mouse.pos.y = chosen.y;
  } else if (targets.length > 0) {
    // Trapped: attack anyway if target is adjacent
    const chosen = rng.pick(targets);
    if (chosen.kind === "player") {
      dementedMouseAttackPlayer(mouse, player, flies);
    } else {
      const killed = dementedMouseAttackEnemy(mouse, chosen.enemy);
      if (killed) {
        removeDeadEnemies(room);
      }
    }
  }
}

