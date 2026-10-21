/**
 * @file Combat.ts
 *
 * Combat system for "А тебе?".
 *
 * Handles all damage calculations and HP mutations:
 *  - bump-to-attack (player → enemy)
 *  - enemy melee     (enemy → player)
 *  - hazard damage   (traps, poison clouds)
 *  - food pickup     (healing + score)
 *  - dead-enemy cleanup
 *
 * Every function mutates the entities in place and clamps HP
 * to the [0, maxHp] range where applicable.
 */

import { Enemy, EnemyKind, Room, Player } from "../core/types.ts";
import {
  TOOTHPICK_ATTACK_BONUS,
  CASHIER_DAMAGE,
  LOADER_DAMAGE,
  GUARD_DAMAGE,
  BOSS_DAMAGE,
  TRAP_DAMAGE,
  POISON_DAMAGE,
} from "./balance.ts";

// ── Damage helpers ───────────────────────────────────────────────

/**
 * Calculate the damage the player deals in a single melee attack.
 *
 * @param player       - The current player state (provides base `attack`).
 * @param hasToothpick - Whether the player is carrying the Toothpick weapon.
 * @returns Total damage value.
 */
export function playerAttackDamage(
  player: Player,
  hasToothpick: boolean,
): number {
  return player.attack + (hasToothpick ? TOOTHPICK_ATTACK_BONUS : 0);
}

/**
 * Look up the damage an enemy of the given kind deals per hit.
 *
 * @param kind - The enemy type.
 * @returns Damage value from the balance table.
 */
export function enemyAttackDamage(kind: EnemyKind): number {
  switch (kind) {
    case "cashier":
      return CASHIER_DAMAGE;
    case "loader":
      return LOADER_DAMAGE;
    case "guard":
      return GUARD_DAMAGE;
    case "boss":
      return BOSS_DAMAGE;
  }
}

// ── Attack actions ───────────────────────────────────────────────

/**
 * Player bumps into an enemy cell — apply melee damage to the enemy.
 *
 * @param player       - The current player state.
 * @param enemy        - The target enemy (mutated: `hp` is reduced).
 * @param hasToothpick - Whether the player is carrying the Toothpick weapon.
 * @returns `true` if the enemy died (hp ≤ 0).
 */
export function playerAttackEnemy(
  player: Player,
  enemy: Enemy,
  hasToothpick: boolean,
): boolean {
  const dmg = playerAttackDamage(player, hasToothpick);
  enemy.hp -= dmg;
  return enemy.hp <= 0;
}

/**
 * An adjacent enemy attacks the player at the start of the enemy's turn.
 * Damage is subtracted and HP is clamped to a minimum of 0.
 *
 * @param enemy  - The attacking enemy.
 * @param player - The player being hit (mutated: `hp` is reduced).
 */
export function enemyAttackPlayer(enemy: Enemy, player: Player): void {
  const dmg = enemyAttackDamage(enemy.kind);
  player.hp = Math.max(0, player.hp - dmg);
}

// ── Hazard damage ────────────────────────────────────────────────

/**
 * Apply trap damage to the player. HP is clamped to a minimum of 0.
 *
 * @param player - The player who stepped on a trap (mutated).
 */
export function applyTrapDamage(player: Player): void {
  player.hp = Math.max(0, player.hp - TRAP_DAMAGE);
}

/**
 * Apply poison cloud damage to the player. HP is clamped to a minimum of 0.
 *
 * @param player - The player standing in a poison cloud (mutated).
 */
export function applyPoisonDamage(player: Player): void {
  player.hp = Math.max(0, player.hp - POISON_DAMAGE);
}

// ── Pickup ───────────────────────────────────────────────────────

/**
 * Pick up a food item: heal the player (clamped to `maxHp`) and return
 * the score value to be added to the game state.
 *
 * @param player - The player picking up food (mutated: `hp` is increased).
 * @param heal   - Amount of HP to restore.
 * @param score  - Score value of the food item.
 * @returns The score gained from picking up this food.
 */
export function pickUpFood(
  player: Player,
  heal: number,
  score: number,
): number {
  player.hp = Math.min(player.maxHp, player.hp + heal);
  return score;
}

// ── Cleanup ──────────────────────────────────────────────────────

/**
 * Remove dead enemies (hp ≤ 0) from the room's `enemies` array.
 * Mutates the array **in place** using a read/write index pass
 * (no allocation).
 *
 * @param room - The room whose enemy list should be pruned (mutated).
 */
export function removeDeadEnemies(room: Room): void {
  let write = 0;
  for (let read = 0; read < room.enemies.length; read++) {
    if (room.enemies[read].hp > 0) {
      room.enemies[write++] = room.enemies[read];
    }
  }
  room.enemies.length = write;
}
