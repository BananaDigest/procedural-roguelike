import { Level, Point } from "../game/Level.ts";

/**
 * Field of view — SCAFFOLD for the Advanced tier (fog of war).
 *
 * Recommended: recursive shadowcasting across 8 octants. Returns the set of
 * tiles currently visible from `origin` within `radius`; the renderer then
 * dims or hides everything else. Keep a separate "explored" set for the
 * classic remembered-but-dark look.
 */
export function computeFov(_level: Level, _origin: Point, _radius: number): Set<number> {
  // TODO: implement recursive shadowcasting. For now, see everything.
  return new Set<number>();
}
