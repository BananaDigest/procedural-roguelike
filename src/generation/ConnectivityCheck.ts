/**
 * Flood fill over walkable tiles (4-directional — the mouse can't move diagonally).
 * Used as a safety net: every exit and every spawn must be reachable from the entry.
 */
import { type Room, type Vec2, isWalkable } from "../core/types.ts";

const DIRS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** reachable[y*w+x] === true ⇔ the tile can be walked to from `start`. */
export function floodFill(room: Room, start: Vec2): boolean[] {
  const seen = new Array<boolean>(room.w * room.h).fill(false);
  if (!isWalkable(room, start.x, start.y)) return seen;

  const stack: Vec2[] = [start];
  seen[start.y * room.w + start.x] = true;
  while (stack.length > 0) {
    const p = stack.pop()!;
    for (const d of DIRS) {
      const nx = p.x + d.x;
      const ny = p.y + d.y;
      const i = ny * room.w + nx;
      if (isWalkable(room, nx, ny) && !seen[i]) {
        seen[i] = true;
        stack.push({ x: nx, y: ny });
      }
    }
  }
  return seen;
}

/** True if every target is reachable from `start`. */
export function allReachable(room: Room, start: Vec2, targets: readonly Vec2[]): boolean {
  const seen = floodFill(room, start);
  return targets.every((t) => seen[t.y * room.w + t.x] === true);
}

/** Full check of a generated room: exits, food, items, traps and enemies all reachable. */
export function isRoomConnected(room: Room): boolean {
  const targets: Vec2[] = [
    ...room.exits.map((e) => e.pos),
    ...room.food.map((f) => f.pos),
    ...room.items.map((i) => i.pos),
    ...room.traps.map((t) => t.pos),
    ...room.enemies.map((e) => e.pos),
  ];
  return allReachable(room, room.entry, targets);
}
