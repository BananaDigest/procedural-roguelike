import { Tile, isWalkable } from "./Tile.ts";

export interface Point {
  x: number;
  y: number;
}

/**
 * A single generated floor: a grid of tiles plus the spawn / stairs points.
 * Pure data — generation fills it in, the renderer reads it.
 */
export class Level {
  readonly width: number;
  readonly height: number;
  readonly tiles: Tile[];
  spawn: Point = { x: 0, y: 0 };
  stairs: Point = { x: 0, y: 0 };

  constructor(width: number, height: number, fill: Tile = Tile.Wall) {
    this.width = width;
    this.height = height;
    this.tiles = new Array(width * height).fill(fill);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Tile {
    if (!this.inBounds(x, y)) return Tile.Wall;
    return this.tiles[y * this.width + x];
  }

  set(x: number, y: number, tile: Tile): void {
    if (!this.inBounds(x, y)) return;
    this.tiles[y * this.width + x] = tile;
  }

  isWalkable(x: number, y: number): boolean {
    return this.inBounds(x, y) && isWalkable(this.get(x, y));
  }

  /** Every floor tile, as points. Handy for placement and connectivity checks. */
  floorTiles(): Point[] {
    const out: Point[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (isWalkable(this.get(x, y))) out.push({ x, y });
      }
    }
    return out;
  }
}
