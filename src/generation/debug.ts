/**
 * ASCII dump of generated rooms — for checking the generator in the console.
 *
 *   #  wall      =  shelf     .  floor     @  entry
 *   O  нора fwd  o  нора back  L  люк fwd  l  люк back
 *   c  cashier   g  loader (вантажник)     G  guard   B  boss
 *   *  food      ^  trap      t  toothpick  e  energy drink
 */
import { type EnemyKind, type ItemKind, type Room, Tile } from "../core/types.ts";

const ENEMY_CH: Record<EnemyKind, string> = { cashier: "c", loader: "g", guard: "G", boss: "B" };
const ITEM_CH: Record<ItemKind, string> = { toothpick: "t", energy: "e", bigcheese: "C" };

export function roomToAscii(room: Room): string {
  const grid: string[][] = [];
  for (let y = 0; y < room.h; y++) {
    const row: string[] = [];
    for (let x = 0; x < room.w; x++) {
      const t = room.tiles[y * room.w + x];
      row.push(t === Tile.Wall ? "#" : t === Tile.Shelf ? "=" : ".");
    }
    grid.push(row);
  }
  const put = (x: number, y: number, ch: string) => (grid[y][x] = ch);

  for (const t of room.traps) put(t.pos.x, t.pos.y, "^");
  for (const f of room.food) put(f.pos.x, f.pos.y, "*");
  for (const i of room.items) put(i.pos.x, i.pos.y, ITEM_CH[i.kind]);
  for (const e of room.enemies) put(e.pos.x, e.pos.y, ENEMY_CH[e.kind]);
  for (const e of room.exits) {
    const ch = e.kind === "nora" ? "o" : "l";
    put(e.pos.x, e.pos.y, e.dir === "fwd" ? ch.toUpperCase() : ch);
  }
  put(room.entry.x, room.entry.y, "@");

  return grid.map((r) => r.join("")).join("\n");
}

export function levelToAscii(rooms: Room[], level: number): string {
  return rooms
    .map((r, i) => {
      const tag = r.isBossArena ? " (BOSS ARENA)" : "";
      return `Level ${level} · Room ${i + 1}/${rooms.length} · ${r.w}×${r.h}${tag}\n${roomToAscii(r)}`;
    })
    .join("\n\n");
}
