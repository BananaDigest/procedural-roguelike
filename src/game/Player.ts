import { Level } from "./Level.ts";

/** The player actor. Grid position + stats (stats used from Week 2 on). */
export class Player {
  x = 0;
  y = 0;
  hp = 20;
  maxHp = 20;
  attack = 4;

  placeAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /**
   * Attempt to move by (dx, dy). Returns true if the player actually moved
   * (i.e. the destination tile was walkable). Blocked moves return false.
   */
  tryMove(dx: number, dy: number, level: Level): boolean {
    const nx = this.x + dx;
    const ny = this.y + dy;
    if (!level.isWalkable(nx, ny)) return false;
    this.x = nx;
    this.y = ny;
    return true;
  }
}
