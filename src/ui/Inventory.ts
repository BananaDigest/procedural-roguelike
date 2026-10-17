import { Item } from "../game/Item.ts";

/** Inventory — SCAFFOLD for Week 2. Holds picked-up items; render in the HUD. */
export class Inventory {
  readonly items: Item[] = [];

  add(item: Item): void {
    this.items.push(item);
  }
}
