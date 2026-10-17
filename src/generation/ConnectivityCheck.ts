import { Level, Point } from "../game/Level.ts";

/**
 * Flood-fill from a start tile and return every walkable tile reachable
 * from it. Use this to guarantee the staircase (and later: items, enemies)
 * sit on tiles the player can actually reach — the #1 source of soft-locks.
 */
export function reachableTiles(level: Level, start: Point): Set<number> {
  const seen = new Set<number>();
  if (!level.isWalkable(start.x, start.y)) return seen;

  const stack: Point[] = [start];
  seen.add(start.y * level.width + start.x);

  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];

  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const key = ny * level.width + nx;
      if (!seen.has(key) && level.isWalkable(nx, ny)) {
        seen.add(key);
        stack.push({ x: nx, y: ny });
      }
    }
  }
  return seen;
}

/** Is `target` reachable on foot from `start`? */
export function isReachable(level: Level, start: Point, target: Point): boolean {
  return reachableTiles(level, start).has(target.y * level.width + target.x);
}
