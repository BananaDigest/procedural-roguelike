/**
 * Shared size config — the one place that sets how big things are.
 *
 * Rendering works in LOGICAL pixels: one tile = TILE_SIZE. All drawing code
 * is written in these units; the Renderer scales the whole canvas by one
 * factor to fit the browser window, so tiles, sprites, effects and HUD all
 * grow together. Game logic never sees pixels — it works in tiles.
 */

/** Logical size of one tile, px (before window scaling). */
export const TILE_SIZE = 28;

/**
 * Viewport, in tiles. Must hold the biggest room (the level-10 arena,
 * 25×15 after ROOM_SCALE) plus a top row for the HUD bar.
 * `npm run gen:check` fails if a generated room doesn't fit.
 */
export const VIEW = { w: 26, h: 17 };

/** Rooms on levels fromLevel..toLevel are `factor`× wider and taller (rounded to whole tiles). */
export const ROOM_SCALE = { factor: 1.25, fromLevel: 6, toLevel: 10 };

/** Never shrink the game below this window scale (tiny browser windows scroll instead). */
export const MIN_WINDOW_SCALE = 0.5;

/**
 * Cheese power: on first reaching the boss arena the player gets
 * floor(cheese / CHEESE_BONUS_DIVIDER) extra damage AND extra HP (+maxHp). Once per run.
 */
export const CHEESE_BONUS_DIVIDER = 100;

/** DEBUG: hotkey opens a «go to level 1–10» box (testing / demos). Set false before release. */
export const DEBUG_LEVEL_SELECT = true;
/** KeyboardEvent.code of that hotkey (` — the key left of 1). */
export const DEBUG_LEVEL_SELECT_KEY = "Backquote";
/** Same flag also enables: this key kills the level-10 boss instantly. */
export const DEBUG_KILL_BOSS_KEY = "KeyK";
