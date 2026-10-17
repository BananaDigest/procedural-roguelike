import { Level } from "../game/Level.ts";
import { Mulberry32 } from "../rng/Mulberry32.ts";

/**
 * BSP (Binary Space Partitioning) dungeon generator — SCAFFOLD.
 *
 * Idea (Day 12 side quest): recursively split the map into sub-rectangles,
 * carve a room inside each leaf, then connect sibling rooms with corridors
 * as you unwind the recursion. Produces the classic "rooms + hallways" look
 * that drunkard's walk can't.
 *
 * Steps to implement:
 *   1. Start with one rectangle covering the whole map.
 *   2. Split it (vertically or horizontally) at an rng-chosen ratio.
 *   3. Recurse until leaves are small enough.
 *   4. Carve a room inside each leaf (random size, padded from edges).
 *   5. Connect child rooms with L-shaped corridors on the way back up.
 *   6. Set level.spawn / level.stairs and return.
 */
export function generateBSP(_rng: Mulberry32, _width: number, _height: number): Level {
  throw new Error("BSP generation not implemented yet — see the scaffold notes.");
}
