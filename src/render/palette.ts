/**
 * Palettes — two moods selected by level.
 *   Levels 1–5: light "regular market" (blue/red shelf outlines).
 *   Levels 6–10: dark "premium" market (graphite/silver).
 * Only the floor/fog/outline change; object colours are fixed in the Renderer.
 */

export interface Palette {
  floor: string; // room floor fill
  dot: string; // faint centre dot on floor tiles
  shelf: string; // free-standing shelf blocks
  b1: string; // room outline colour 1 (even rooms)
  b2: string; // room outline colour 2 (odd rooms)
  fog: string; // everything outside the current room
  hudText: string; // HUD label colour
}

export const LIGHT: Palette = {
  floor: "#dfe3e9",
  dot: "#c7cdd6",
  shelf: "#7e8694",
  b1: "#0a4ea2",
  b2: "#e2231a",
  fog: "#06070a",
  hudText: "#dfe3e9",
};

export const DARK: Palette = {
  floor: "#232428",
  dot: "#2e3036",
  shelf: "#3a3f48",
  b1: "#4a4f59",
  b2: "#d9dde1",
  fog: "#06070a",
  hudText: "#f2f3f5",
};

/** Levels 1–5 → light, 6–10 → dark. */
export function paletteForLevel(level: number): Palette {
  return level <= 5 ? LIGHT : DARK;
}
