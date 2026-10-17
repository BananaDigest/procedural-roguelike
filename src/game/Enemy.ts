import { Level, Point } from "./Level.ts";
import { Player } from "./Player.ts";

/** Enemy archetypes. Add more as you climb toward the Standard tier. */
export type EnemyKind = "slime" | "bat";

/**
 * A grid enemy — SCAFFOLD for Week 2 (Day 8).
 *
 * Turn model: every time the player moves one tile, call takeTurn() on each
 * living enemy. Slimes can wander randomly; smarter enemies should step along
 * a BFS/A* path toward the player (see Lab 07 / fov/Shadowcast for FOV gating).
 */
export class Enemy {
  constructor(
    public kind: EnemyKind,
    public x: number,
    public y: number,
    public hp: number,
    public attack: number,
  ) {}

  get pos(): Point {
    return { x: this.x, y: this.y };
  }

  takeTurn(_level: Level, _player: Player): void {
    // TODO: move toward player (bump-to-attack) or wander. Day 8–9.
  }
}
