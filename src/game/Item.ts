/**
 * Items — SCAFFOLD for Week 2 (Day 10). Picked up by walking over them.
 */
export type ItemKind = "potion" | "weapon";

export interface Item {
  kind: ItemKind;
  x: number;
  y: number;
  /** Potion: HP restored. Weapon: bonus damage. */
  power: number;
  name: string;
}

/** Apply an item's effect to whatever picks it up. Stub for Day 10. */
export function applyItem(_item: Item): void {
  // TODO: heal the player (potion) or raise attack (weapon).
}
