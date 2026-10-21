/**
 * @file Player.ts
 *
 * Player representation and basic movement logic for "А тебе?".
 *
 * Handles player creation and attempting grid moves with collision
 * against Wall and Shelf obstacles.
 */

import { Player, Vec2, Room, isWalkable } from "../core/types.ts";
import { PLAYER_MAX_HP, PLAYER_BASE_ATTACK } from "./balance.ts";

/**
 * Create a new player at the given starting position with default stats.
 *
 * @param pos - Initial spawn coordinates.
 * @returns Initialized Player object.
 */
export function createPlayer(pos: Vec2): Player {
  return {
    pos: { ...pos },
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    attack: PLAYER_BASE_ATTACK,
  };
}

/**
 * Attempt to move the player by (dx, dy).
 *
 * Verifies that the destination tile is walkable (not Wall or Shelf).
 * Mutates player.pos if successful.
 *
 * @param player - The player to move.
 * @param room   - The current room to test obstacles against.
 * @param dx     - Movement delta along the X axis (-1, 0, 1).
 * @param dy     - Movement delta along the Y axis (-1, 0, 1).
 * @returns `true` if the player moved, `false` if blocked by obstacle/bounds.
 */
export function tryMovePlayer(
  player: Player,
  room: Room,
  dx: number,
  dy: number,
): boolean {
  const nx = player.pos.x + dx;
  const ny = player.pos.y + dy;

  if (!isWalkable(room, nx, ny)) {
    return false;
  }

  player.pos.x = nx;
  player.pos.y = ny;
  return true;
}

