/**
 * @file PoisonCloudGen.ts
 *
 * Procedural generation for boss poison clouds (arsenic / миш'як).
 *
 * Generates an organic, irregular cloud shape:
 * - Bounding box between 2 and 5 cells in width and height.
 * - Strictly irregular (never a rectangle, square, or symmetrical circle/disc).
 * - Connected multi-cell blob grown via Cellular Frontier Diffusion / Random Walker.
 * - Confined strictly to walkable room floor bounds.
 */

import { Vec2, Room, isWalkable } from "../core/types.ts";
import { Mulberry32 } from "../rng/Mulberry32.ts";

/**
 * Generate an irregular poison cloud tile cluster centered around an origin point.
 *
 * @param origin - The target point where the boss threw the poison (e.g. player pos).
 * @param room   - The boss arena room (used to constrain tiles to walkable floor).
 * @param rng    - Seeded PRNG for deterministic placement.
 * @returns Array of tile coordinates forming the cloud.
 */
export function generatePoisonCloudTiles(
  origin: Vec2,
  room: Room,
  rng: Mulberry32,
): Vec2[] {
  // 1. Pick target bounding box size: 2..5 in width and 2..5 in height
  const targetW = rng.int(2, 5);
  const targetH = rng.int(2, 5);

  // 2. Position the bounding box so that origin is inside it
  const offX = rng.int(0, targetW - 1);
  const offY = rng.int(0, targetH - 1);
  let minX = origin.x - offX;
  let maxX = minX + targetW - 1;
  let minY = origin.y - offY;
  let maxY = minY + targetH - 1;

  // 3. Shift and clamp box into walkable room bounds [1, room.w - 2] x [1, room.h - 2]
  const roomMinX = 1;
  const roomMaxX = room.w - 2;
  const roomMinY = 1;
  const roomMaxY = room.h - 2;

  if (minX < roomMinX) {
    maxX += roomMinX - minX;
    minX = roomMinX;
  }
  if (maxX > roomMaxX) {
    minX -= maxX - roomMaxX;
    maxX = roomMaxX;
  }
  if (minY < roomMinY) {
    maxY += roomMinY - minY;
    minY = roomMinY;
  }
  if (maxY > roomMaxY) {
    minY -= maxY - roomMaxY;
    maxY = roomMaxY;
  }

  minX = Math.max(roomMinX, minX);
  maxX = Math.min(roomMaxX, maxX);
  minY = Math.max(roomMinY, minY);
  maxY = Math.min(roomMaxY, maxY);

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const boxArea = boxW * boxH;

  const key = (x: number, y: number) => `${x},${y}`;
  const cells = new Set<string>();

  // Start growth at clamped origin
  const startX = Math.max(minX, Math.min(maxX, origin.x));
  const startY = Math.max(minY, Math.min(maxY, origin.y));
  cells.add(key(startX, startY));

  // Target count: between 45% and 80% of box area, strictly <= boxArea - 1
  const maxAllowed = Math.max(3, boxArea - 1);
  const minAllowed = Math.max(3, Math.min(maxAllowed, Math.ceil(boxArea * 0.45)));
  const targetCount = rng.int(minAllowed, maxAllowed);

  // 4. Cellular Frontier Diffusion: organic growth outwards from start point
  const frontier: Vec2[] = [];
  const frontierSet = new Set<string>();

  const addFrontier = (x: number, y: number) => {
    const dirs: readonly Vec2[] = [
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
    ];
    for (const d of dirs) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (
        nx >= minX &&
        nx <= maxX &&
        ny >= minY &&
        ny <= maxY &&
        isWalkable(room, nx, ny)
      ) {
        const k = key(nx, ny);
        if (!cells.has(k) && !frontierSet.has(k)) {
          frontierSet.add(k);
          frontier.push({ x: nx, y: ny });
        }
      }
    }
  };

  addFrontier(startX, startY);

  while (cells.size < targetCount && frontier.length > 0) {
    const idx = rng.int(0, frontier.length - 1);
    const chosen = frontier.splice(idx, 1)[0];
    frontierSet.delete(key(chosen.x, chosen.y));
    cells.add(key(chosen.x, chosen.y));
    addFrontier(chosen.x, chosen.y);
  }

  // 5. Calculate actual bounding box
  let actMinX = Infinity;
  let actMaxX = -Infinity;
  let actMinY = Infinity;
  let actMaxY = -Infinity;

  for (const k of cells) {
    const [x, y] = k.split(",").map(Number);
    if (x < actMinX) actMinX = x;
    if (x > actMaxX) actMaxX = x;
    if (y < actMinY) actMinY = y;
    if (y > actMaxY) actMaxY = y;
  }
  let actW = actMaxX - actMinX + 1;
  let actH = actMaxY - actMinY + 1;

  // Guarantee minimum dimension of 2 (if frontier has options)
  while (
    (actW < 2 || actH < 2) &&
    frontier.length > 0 &&
    cells.size < maxAllowed
  ) {
    const idx = rng.int(0, frontier.length - 1);
    const chosen = frontier.splice(idx, 1)[0];
    frontierSet.delete(key(chosen.x, chosen.y));
    cells.add(key(chosen.x, chosen.y));
    addFrontier(chosen.x, chosen.y);

    if (chosen.x < actMinX) actMinX = chosen.x;
    if (chosen.x > actMaxX) actMaxX = chosen.x;
    if (chosen.y < actMinY) actMinY = chosen.y;
    if (chosen.y > actMaxY) actMaxY = chosen.y;
    actW = actMaxX - actMinX + 1;
    actH = actMaxY - actMinY + 1;
  }

  // 6. Strict irregularity guarantee:
  // If all cells in the bounding box were filled, it would be a full rectangle/square.
  // Remove one corner to ensure it is always an irregular shape with notches/cutouts.
  if (cells.size === actW * actH) {
    const corners = [
      key(actMinX, actMinY),
      key(actMaxX, actMinY),
      key(actMinX, actMaxY),
      key(actMaxX, actMaxY),
    ];
    // Remove a corner (prefer one other than the player's direct impact cell)
    const toRemove =
      corners.find((c) => c !== key(startX, startY)) || corners[0];
    cells.delete(toRemove);
  }

  return Array.from(cells).map((k) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  });
}

