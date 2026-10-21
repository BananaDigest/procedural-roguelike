/**
 * LevelChain — one shop (level) = a linear chain of rooms joined by нори.
 *
 *   room 0 ⇄нора⇄ room 1 ⇄нора⇄ … ⇄нора⇄ room N-1 ⇄люк⇄ next shop
 *   (room 0 also has a люк back to the previous shop, except on level 1)
 *
 * Level 10 is special: exactly 2 rooms — a small approach room, then the boss arena.
 * Implements the shared `GenerateLevel` contract that B calls.
 */
import { Mulberry32, levelSeed } from "../rng/Mulberry32.ts";
import type { GenerateLevel, Room } from "../core/types.ts";
import { generateRoom } from "./RoomGen.ts";
import { LAST_LEVEL } from "./Spawns.ts";

export const ROOMS_PER_LEVEL = { min: 4, max: 7 };

/** How many rooms `level` has for this run seed (4–7; level 10 → 2). */
export function roomCountForLevel(baseSeed: number, level: number): number {
  if (level === LAST_LEVEL) return 2;
  return new Mulberry32(levelSeed(baseSeed, level)).int(ROOMS_PER_LEVEL.min, ROOMS_PER_LEVEL.max);
}

/** The whole chain of rooms of one level. Same (seed, level) → same rooms. */
export const generateLevel: GenerateLevel = (seed: number, level: number): Room[] => {
  const count = roomCountForLevel(seed, level);
  const rooms: Room[] = [];
  for (let index = 0; index < count; index++) {
    rooms.push(generateRoom({ baseSeed: seed, level, index, count }));
  }
  return rooms;
};
