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
export const TOOTHPICK_ATTACK_BONUS = 2 as const;

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

/** Hit-points of a Cashier enemy. */
export const CASHIER_HP = 4 as const;

/** Hit-points of a Loader enemy. */
export const LOADER_HP = 4 as const;

/** Hit-points of a Guard enemy. */
export const GUARD_HP = 8 as const;

/** Hit-points of the Boss. */
export const BOSS_HP = 40 as const;

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

// ── Items ─────────────────────────────────────────────────────────

/** Number of turns enemies are frozen after using an Energy Drink. */
export const ENERGY_DRINK_TURNS = 3 as const;

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
export const BOSS_RATPOISON_CLOUDS_P2 = 2 as const;

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
