/** The kinds of tiles a floor can be built from. */
export enum Tile {
  Wall = 0,
  Floor = 1,
  StairsDown = 2,
}

/** Can an actor stand on / walk through this tile? */
export function isWalkable(tile: Tile): boolean {
  return tile === Tile.Floor || tile === Tile.StairsDown;
}
