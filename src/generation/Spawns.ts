/**
 * Spawn tables — WHAT goes into a room on a given level.
 * (WHERE it goes is RoomGen's job.) Pure data + rng, no layout.
 */
import { Mulberry32 } from "../rng/Mulberry32.ts";
import type { EnemyKind, FoodKind, ItemKind } from "../core/types.ts";
import { MAGGOT_SPAWN_CHANCE } from "../game/balance.ts";

export { MAGGOT_SPAWN_CHANCE };

export const LAST_LEVEL = 10;

/** Starting enemy HP (see «Баланс»). B may re-balance these in balance.ts. */
export const ENEMY_HP: Record<EnemyKind, number> = {
  cashier: 4,
  loader: 4,
  guard: 8,
  boss: 40,
};

/** Levels 1–5 = regular market, 6–10 = premium «black» market. */
export function isPremium(level: number): boolean {
  return level >= 6;
}

/** From level 8 every enemy takes 2 steps per player turn. */
export function isFastLevel(level: number): boolean {
  return level >= 8;
}

/**
 * The progression table: which enemies ONE room of `level` gets.
 * Once a type appears it stays in the pool deeper (except level 9 — guards only).
 * Level 10: room 0 is the quiet approach (0–2 enemies); the arena has only the boss
 * (RoomGen places the boss itself).
 */
export function enemiesForLevel(level: number, rng: Mulberry32): EnemyKind[] {
  switch (level) {
    case 1:
      return [];
    case 2:
      return ["cashier"];
    case 3:
    case 4:
      return ["cashier", "loader"];
    case 5:
    case 6:
      return ["cashier", "loader", "guard"];
    case 7:
    case 8: {
      const out: EnemyKind[] = [];
      for (const kind of ["cashier", "loader", "guard"] as const) {
        const n = rng.int(1, 3);
        for (let i = 0; i < n; i++) out.push(kind);
      }
      return out;
    }
    case 9: {
      const n = rng.int(1, 2);
      return new Array<EnemyKind>(n).fill("guard");
    }
    default: {
      // level 10, approach room — «затишшя перед бурею»
      const n = rng.int(0, 2);
      const out: EnemyKind[] = [];
      for (let i = 0; i < n; i++) out.push(rng.pick(["cashier", "loader", "guard"] as const));
      return out;
    }
  }
}

/** Traps per room: none before level 4, then 1–3. */
export function trapCountForLevel(level: number, rng: Mulberry32): number {
  return level >= 4 ? rng.int(1, 3) : 0;
}

// --- food ----------------------------------------------------------------
// All food in a pool works the same; the weight only sets how often each
// look shows up (cheap-looking food is common, fancy food is rare).

const REGULAR_POOL: { value: FoodKind; weight: number }[] = [
  { value: "bread", weight: 30 },
  { value: "cookie", weight: 25 },
  { value: "croissant", weight: 20 },
  { value: "sausage", weight: 15 },
  { value: "cheese", weight: 10 },
];

const PREMIUM_POOL: { value: FoodKind; weight: number }[] = [
  { value: "chocolate", weight: 30 },
  { value: "cake", weight: 25 },
  { value: "sushi", weight: 20 },
  { value: "shrimp", weight: 15 },
  { value: "steak", weight: 10 },
];

export const FOOD_VALUE = {
  regular: { heal: 3, score: 10 },
  premium: { heal: 6, score: 25 },
} as const;

export function pickFood(level: number, rng: Mulberry32): { kind: FoodKind; heal: number; score: number } {
  const premium = isPremium(level);
  const kind = rng.weighted(premium ? PREMIUM_POOL : REGULAR_POOL);
  const v = premium ? FOOD_VALUE.premium : FOOD_VALUE.regular;
  return { kind, heal: v.heal, score: v.score };
}

// --- power-ups -----------------------------------------------------------

/** Chance that a room has a power-up at all («0–1, рідко»). */
export const POWERUP_CHANCE = 0.15;

const POWERUP_POOL: { value: ItemKind; weight: number }[] = [
  { value: "energy", weight: 2 },
  { value: "toothpick", weight: 1 },
];

/** 0 or 1 power-up for a room. The Big Cheese is never rolled — B spawns it after the boss. */
export function rollPowerup(rng: Mulberry32): ItemKind | null {
  return rng.chance(POWERUP_CHANCE) ? rng.weighted(POWERUP_POOL) : null;
}
