import { Level } from "./Level.ts";
import { Player } from "./Player.ts";
import { Tile } from "./Tile.ts";
import { Mulberry32 } from "../rng/Mulberry32.ts";
import { generateDrunkardsWalk } from "../generation/DrunkardsWalk.ts";

/**
 * Owns the run: the seed, the current floor, the player, and the rules for
 * moving and descending. Rendering and input live outside this class.
 *
 * Each floor is generated from a *derived* seed (base seed + floor number)
 * so the whole run is reproducible from one top-level seed.
 */
export class GameState {
  seed: number;
  floorNumber = 1;
  level!: Level;
  player = new Player();

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.generateFloor();
  }

  /** Per-floor RNG derived from the run seed, so floors don't share a stream. */
  private floorRng(): Mulberry32 {
    return new Mulberry32((this.seed + this.floorNumber * 0x9e3779b1) >>> 0);
  }

  generateFloor(): void {
    const rng = this.floorRng();
    this.level = generateDrunkardsWalk(rng, {
      // Nudge parameters by depth so floors don't all feel identical.
      fillRatio: 0.38 + Math.min(this.floorNumber, 8) * 0.01,
    });
    this.player.placeAt(this.level.spawn.x, this.level.spawn.y);
  }

  /** Move the player; if they land on stairs, descend to a new floor. */
  movePlayer(dx: number, dy: number): void {
    const moved = this.player.tryMove(dx, dy, this.level);
    if (!moved) return;

    if (this.level.get(this.player.x, this.player.y) === Tile.StairsDown) {
      this.descend();
    }
  }

  descend(): void {
    this.floorNumber++;
    this.generateFloor();
  }

  /** Start a brand-new run with a fresh seed. */
  newRun(seed: number): void {
    this.seed = seed >>> 0;
    this.floorNumber = 1;
    this.player = new Player();
    this.generateFloor();
  }
}
