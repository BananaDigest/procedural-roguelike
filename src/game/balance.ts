/**
 * @file balance.ts
 *
 * Single source of truth for all balance / tuning numbers in
 * "А тебе?" — a procedural roguelike where a mouse navigates
 * through 10 market levels.
 *
 * Every gameplay-relevant numeric constant lives here so designers
 * (and future you) only need to touch one file when rebalancing.
 */

// ── Player ────────────────────────────────────────────────────────

/** Maximum hit-points the player can have. */
export const PLAYER_MAX_HP = 20 as const;

/** Base melee attack damage (bare paws). */
export const PLAYER_BASE_ATTACK = 4 as const;

/** Extra damage granted by the Toothpick weapon (total = BASE + BONUS). */
/** Extra damage granted by the Toothpick weapon (total = BASE + BONUS = 4 + 4 = 8). */
export const TOOTHPICK_ATTACK_BONUS = 4 as const;

// ── Enemy damage to player ────────────────────────────────────────

/** Damage dealt by a Cashier enemy per hit. */
export const CASHIER_DAMAGE = 2 as const;

/** Damage dealt by a Loader enemy per hit. */
export const LOADER_DAMAGE = 2 as const;

/** Damage dealt by a Guard enemy per hit. */
export const GUARD_DAMAGE = 3 as const;

/** Damage dealt by the Boss's mop melee attack. */
export const BOSS_DAMAGE = 5 as const;

// ── Enemy HP ──────────────────────────────────────────────────────

/**
 * Enemy HP. Difficulty now comes from how MANY enemies a room holds
 * (see enemiesForLevel), so per-enemy HP stays low to keep fights snappy
 * rather than grindy.
 */

/** Hit-points of a Cashier enemy — weak wandering chip-damage fodder. */
export const CASHIER_HP = 4 as const;

/** Hit-points of a Loader enemy. */
export const LOADER_HP = 4 as const;

/** Hit-points of a Guard enemy — the chaser. */
export const GUARD_HP = 8 as const;

/** Hit-points of the Boss. */
export const BOSS_HP = 90 as const;

// ── Hazards ───────────────────────────────────────────────────────

/** Damage taken when stepping on a trap. */
export const TRAP_DAMAGE = 4 as const;

/** Damage taken per turn while standing in a poison cloud. */
export const POISON_DAMAGE = 3 as const;

// ── Food ──────────────────────────────────────────────────────────

/** HP restored by regular (common) food. */
export const REGULAR_FOOD_HEAL = 3 as const;

/** Score awarded by regular (common) food. */
export const REGULAR_FOOD_SCORE = 10 as const;

/** HP restored by premium food. */
export const PREMIUM_FOOD_HEAL = 6 as const;

/** Score awarded by premium food. */
export const PREMIUM_FOOD_SCORE = 25 as const;

// ── Items & Weapons ───────────────────────────────────────────────

/** Number of turns enemies are frozen after using an Energy Drink. */
export const ENERGY_DRINK_TURNS = 3 as const;

/** Base fly-army cap (levels 1–6). Grows in the premium levels — see maxFliesForLevel. */
export const MAX_FLIES = 3 as const;

/** Base fly hit-points (levels 1–6). Grows in the premium levels — see flyHpForLevel. */
export const FLY_HP = 3 as const;

/** Damage dealt by a fly to adjacent enemies within 1 tile. */
export const FLY_DAMAGE = 2 as const;

/**
 * Fly-army cap by level (flow channel: support scales up as enemies get
 * tougher). Levels 1–6 → 3, levels 7–10 → 5.
 */
export function maxFliesForLevel(level: number): number {
  return level >= PREMIUM_START_LEVEL + 1 ? 5 : MAX_FLIES;
}

/** Fly hit-points by level: 3 early (1–6), 4 in the late premium levels (7–10). */
export function flyHpForLevel(level: number): number {
  return level >= PREMIUM_START_LEVEL + 1 ? 4 : FLY_HP;
}

/** Spawn chance for a maggot (fly larva) per room (10–15%). */
export const MAGGOT_SPAWN_CHANCE = 0.15 as const;

/** Multiplier for maggot spawn chance after level 7 (2x). */
export const MAGGOT_SPAWN_CHANCE_AFTER_L7_MULT = 2 as const;

/** Initial (base) spawn chance for the toothpick weapon per room (10%). */
export const TOOTHPICK_BASE_SPAWN_CHANCE = 0.10 as const;

/** Additional toothpick spawn chance per level starting at level 8 (+10% per level). */
export const TOOTHPICK_SPAWN_CHANCE_PER_LEVEL_AFTER_L7 = 0.10 as const;

/** Calculate toothpick spawn chance for a given level (10% base, +10% per level after 7). */
export function toothpickSpawnChanceForLevel(level: number): number {
  const extraLevels = Math.max(0, level - 7);
  return (
    TOOTHPICK_BASE_SPAWN_CHANCE +
    extraLevels * TOOTHPICK_SPAWN_CHANCE_PER_LEVEL_AFTER_L7
  );
}

/** Calculate maggot spawn chance for a given level (doubled after level 7). */
export function maggotSpawnChanceForLevel(level: number): number {
  return level > 7
    ? MAGGOT_SPAWN_CHANCE * MAGGOT_SPAWN_CHANCE_AFTER_L7_MULT
    : MAGGOT_SPAWN_CHANCE;
}

// ── Wild Teammate ("Дика миша") ──────────────────────

/** Hit-points of the wild mouse teammate. */
export const WILD_MOUSE_HP = 13 as const;

/** Damage dealt by the wild teammate per attack. */
export const WILD_MOUSE_DAMAGE = 3 as const;

/** First level where the wild teammate can appear (level 7+). */
export const WILD_MOUSE_MIN_LEVEL = 7 as const;

/** Spawn chance per room for the wild teammate starting at level 7. */
export const WILD_MOUSE_SPAWN_CHANCE = 0.5 as const;

/** Number of steps the wild teammate takes per player turn (fast: 2 steps per 1). */
export const WILD_MOUSE_STEPS_PER_TURN = 2 as const;

// ── Enemy movement ────────────────────────────────────────────────

/**
 * From this level enemies (and the boss) may occasionally take a bonus
 * second step on their turn. Replaces the old guaranteed "fast" double-step:
 * instead of EVERY enemy always moving twice from level 8, now each one has a
 * small random chance — the threat stays without the relentless overwhelm.
 */
export const DOUBLE_STEP_MIN_LEVEL = 8 as const;

/** Per-turn chance for an enemy (or the boss) to take that bonus second step. */
export const DOUBLE_STEP_CHANCE = 0.15 as const;

/** Double-step chance for a given level (0 before DOUBLE_STEP_MIN_LEVEL). */
export function doubleStepChanceForLevel(level: number): number {
  return level >= DOUBLE_STEP_MIN_LEVEL ? DOUBLE_STEP_CHANCE : 0;
}

// ── Boss phases ───────────────────────────────────────────────────

/** Boss HP fraction below which phase 2 activates (< 50 %). */
export const BOSS_PHASE2_HP_THRESHOLD = 0.5 as const;

/** Phase 1: boss throws rat-poison every N player turns. */
export const BOSS_RATPOISON_INTERVAL_P1 = 4 as const;

/** Phase 2: boss throws rat-poison every N player turns. */
export const BOSS_RATPOISON_INTERVAL_P2 = 2 as const;

/** Phase 1: number of poison clouds per throw. */
export const BOSS_RATPOISON_CLOUDS_P1 = 1 as const;

/** Phase 2: number of poison clouds per throw. */
export const BOSS_RATPOISON_CLOUDS_P2 = 1 as const;

/** Total turns a poison cloud remains on the ground before despawning (1 warning turn + 3 damage turns). */
export const BOSS_POISON_CLOUD_DURATION = 4 as const;

// ── Room generation bounds ────────────────────────────────────────

/** Minimum food items spawned per room. */
export const MIN_ROOM_FOOD = 2 as const;

/** Maximum food items spawned per room. */
export const MAX_ROOM_FOOD = 4 as const;

/** Minimum traps spawned per room (from level 4+). */
export const MIN_ROOM_TRAPS = 1 as const;

/** Maximum traps spawned per room. */
export const MAX_ROOM_TRAPS = 3 as const;

// ── Level progression ─────────────────────────────────────────────

/** Total number of levels in the game. */
export const TOTAL_LEVELS = 10 as const;

/** First level considered premium / dark (levels 6–10). */
export const PREMIUM_START_LEVEL = 6 as const;
