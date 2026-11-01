/**
 * Game events — a tiny log of WHO attacked WHOM this turn, for the animator.
 * Purely informational: nothing in the game logic reads it, so emitting never
 * changes behaviour. The render side drains it after every player action.
 */
import type { Vec2 } from "../core/types.ts";

export type GameEvent =
  /** `actor` (player / enemy / teammate / fly object) hit something at `target`. */
  | { type: "attack"; actor: object; target: Vec2; targetIsPlayer: boolean }
  /** the boss threw rat poison (mop swing). */
  | { type: "bossThrow"; actor: object };

const MAX_QUEUED = 256; // headless runs never drain — keep it bounded

const queue: GameEvent[] = [];

export function emitGameEvent(e: GameEvent): void {
  if (queue.length >= MAX_QUEUED) queue.shift();
  queue.push(e);
}

/** Take (and clear) everything emitted since the last drain. */
export function drainGameEvents(): GameEvent[] {
  return queue.splice(0);
}

/** Helper: an attack event with a copied target position. */
export function emitAttack(actor: object, target: Vec2, targetIsPlayer = false): void {
  emitGameEvent({ type: "attack", actor, target: { x: target.x, y: target.y }, targetIsPlayer });
}
