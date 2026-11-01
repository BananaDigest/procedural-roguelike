/**
 * @file DrunkardsWalk.ts
 *
 * Drunkard's Walk (Random Walk) algorithm for procedural generation.
 * Part of Lab 26 requirements.
 *
 * Generates an organic, winding tunnel between two points by simulating
 * a random walker with a directional bias toward the target.
 */

import { Vec2 } from "../core/types.ts";
import { Mulberry32 } from "../rng/Mulberry32.ts";

export interface DrunkardWalkOptions {
  /** Step length in pixels / grid units for each walk step (default: 3). */
  stepSize?: number;
  /** Probability (0..1) of stepping toward the destination vs. completely random (default: 0.65). */
  biasTowardsTarget?: number;
  /** Maximum number of steps before directly snapping to destination (default: 600). */
  maxSteps?: number;
}

/**
 * Generate a procedural path between `start` and `end` using Drunkard's Walk.
 *
 * @param start   - Origin coordinates.
 * @param end     - Destination coordinates.
 * @param rng     - Seeded PRNG instance (for determinism).
 * @param options - Tuning parameters.
 * @returns Array of 2D points tracing the carved corridor.
 */
export function generateDrunkardCorridor(
  start: Vec2,
  end: Vec2,
  rng: Mulberry32,
  options: DrunkardWalkOptions = {},
): Vec2[] {
  const step = options.stepSize ?? 3;
  const bias = options.biasTowardsTarget ?? 0.65;
  const maxSteps = options.maxSteps ?? 600;

  const points: Vec2[] = [{ x: Math.round(start.x), y: Math.round(start.y) }];
  let cx = start.x;
  let cy = start.y;

  const DIRS: readonly Vec2[] = [
    { x: step, y: 0 },
    { x: -step, y: 0 },
    { x: 0, y: step },
    { x: 0, y: -step },
  ];

  let lastMove: Vec2 | null = null;
  let steps = 0;
  while (steps++ < maxSteps) {
    const dx = end.x - cx;
    const dy = end.y - cy;
    const dist = Math.hypot(dx, dy);

    // Reached destination proximity
    if (dist <= step * 1.2) {
      break;
    }

    // Determine target-preferred directions
    const preferred: Vec2[] = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx !== 0) preferred.push({ x: Math.sign(dx) * step, y: 0 });
      if (dy !== 0) preferred.push({ x: 0, y: Math.sign(dy) * step });
    } else {
      if (dy !== 0) preferred.push({ x: 0, y: Math.sign(dy) * step });
      if (dx !== 0) preferred.push({ x: Math.sign(dx) * step, y: 0 });
    }

    // Avoid immediate 180° backtrack so the corridor traces crisp, distinct paths
    const validPreferred = lastMove
      ? preferred.filter((d) => !(d.x === -lastMove!.x && d.y === -lastMove!.y))
      : preferred;
    const candidatesPreferred = validPreferred.length > 0 ? validPreferred : preferred;

    const validDirs = lastMove
      ? DIRS.filter((d) => !(d.x === -lastMove!.x && d.y === -lastMove!.y))
      : DIRS;

    let move: Vec2;
    if (rng.chance(bias) && candidatesPreferred.length > 0) {
      move = rng.pick(candidatesPreferred);
    } else {
      move = rng.pick(validDirs.length > 0 ? validDirs : DIRS);
    }

    lastMove = move;
    cx += move.x;
    cy += move.y;
    points.push({ x: Math.round(cx), y: Math.round(cy) });
  }

  // Ensure path ends exactly at destination
  points.push({ x: Math.round(end.x), y: Math.round(end.y) });
  return points;
}

