/**
 * @file Boss.ts
 *
 * Boss-fight logic for the final boss — the Cleaning Lady (прибиральниця)
 * on level 10 of "А тебе?".
 *
 * The boss is located in the second (and final) room of level 10, which is
 * a large open arena with no shelves (Room.isBossArena === true).
 *
 * ## Mechanics
 *
 * - **Melee:** Bump-to-attack (player → boss) and adjacent-attack
 *   (boss → player) are handled through Combat.ts / Enemy.ts as with any
 *   other enemy — the boss is just another entry in `room.enemies` with
 *   `kind === "boss"`.
 *
 * - **Ranged — rat poison (миш'як):**
 *   Every N player turns the boss throws rat-poison at the mouse's current
 *   position, spawning a poison cloud on that cell.
 *
 *   ### Telegraph mechanic
 *   Clouds are **telegraphed**: when a cloud is placed it does NOT deal
 *   damage immediately. Instead, it appears visually on the arena floor
 *   to warn the player. Damage is applied on the **next** player turn —
 *   only if the player is still standing in the cloud. This gives the
 *   player one turn to move out of the way.
 *
 *   Clouds dissipate automatically after 3 turns.
 *
 *   ### Phases
 *   - **Phase 1** (HP > 50 %): throws every 4 turns, 1 cloud per throw.
 *   - **Phase 2** (HP ≤ 50 %): throws every 2 turns, 2 clouds per throw
 *     (the second cloud lands on a random cardinal-adjacent cell to the
 *     player's position).
 */

import { Vec2, Room, Player, Enemy } from "../core/types.ts";
import { Mulberry32 } from "../rng/Mulberry32.ts";
import { applyPoisonDamage } from "./Combat.ts";
import {
  BOSS_PHASE2_HP_THRESHOLD,
  BOSS_RATPOISON_INTERVAL_P1,
  BOSS_RATPOISON_INTERVAL_P2,
  BOSS_RATPOISON_CLOUDS_P1,
  BOSS_RATPOISON_CLOUDS_P2,
  BOSS_HP,
} from "./balance.ts";

// ── Types ────────────────────────────────────────────────────────

/**
 * A poison cloud sitting on the arena floor.
 *
 * Clouds are **telegraphed**: they appear one turn before they become
 * dangerous.  The renderer can use `placedOnTurn` to show a warning
 * sprite on the placement turn and a "damage" sprite on subsequent turns.
 */
export interface PoisonCloud {
  /** World position of the cloud inside the boss arena. */
  pos: Vec2;
  /**
   * The boss-fight turn number when this cloud was placed.
   * Damage is only applied when `BossState.turnCount > placedOnTurn`
   * (i.e. the turn AFTER placement).
   */
  placedOnTurn: number;
}

/**
 * Persistent state for the boss encounter.
 *
 * Created once when the player first enters the boss arena and kept
 * across turns until the fight is over.
 */
export interface BossState {
  /** Player turns elapsed since the fight started (increments each move). */
  turnCount: number;
  /** Active poison clouds on the arena floor. */
  clouds: PoisonCloud[];
  /** Whether the boss has been defeated. */
  defeated: boolean;
}

// ── Factory ──────────────────────────────────────────────────────

/** Create the initial boss-fight state (no clouds, turn 0). */
export function createBossState(): BossState {
  return { turnCount: 0, clouds: [], defeated: false };
}

// ── Queries ──────────────────────────────────────────────────────

/**
 * Find the boss enemy in the given room, if it is still alive.
 *
 * @param room - The current room (expected to be the boss arena).
 * @returns The boss `Enemy`, or `undefined` if absent / dead.
 */
export function findBoss(room: Room): Enemy | undefined {
  return room.enemies.find(e => e.kind === "boss" && e.hp > 0);
}

/**
 * Whether the boss has entered phase 2 (HP at or below the threshold).
 *
 * @param boss - The boss enemy to check.
 * @returns `true` when `boss.hp ≤ BOSS_HP * BOSS_PHASE2_HP_THRESHOLD`.
 */
function isPhase2(boss: Enemy): boolean {
  return boss.hp <= BOSS_HP * BOSS_PHASE2_HP_THRESHOLD;
}

// ── Turn processing ──────────────────────────────────────────────

/**
 * Process boss-specific logic **after** regular enemy turns.
 *
 * Execution order each player turn:
 * 1. **Poison damage** — any cloud placed on a *previous* turn that
 *    overlaps the player's current position applies poison damage.
 * 2. **Cloud cleanup** — clouds older than 3 turns are removed.
 * 3. **Rat-poison throw** — if the turn counter hits the interval for
 *    the current phase, new clouds are spawned (telegraphed — they will
 *    only deal damage on the *next* call).
 * 4. **Defeat check** — if the boss's HP has reached 0 (via melee
 *    handled elsewhere), mark the fight as won so the caller can
 *    spawn the Big Cheese and transition to the win state.
 *
 * @param bossState - Mutable boss-fight state.
 * @param room      - The boss arena room.
 * @param player    - The player (mutated when poison damage applies).
 * @param rng       - Seeded PRNG for deterministic cloud placement.
 * @returns `true` if the boss was just defeated *this* turn.
 */
export function processBossTurn(
  bossState: BossState,
  room: Room,
  player: Player,
  rng: Mulberry32,
): boolean {
  const boss = findBoss(room);

  // Boss already dead? Mark defeated once and signal the caller.
  if (!boss || boss.hp <= 0) {
    if (!bossState.defeated) {
      bossState.defeated = true;
      return true;
    }
    return false;
  }

  bossState.turnCount++;

  // ── 1. Apply poison damage from clouds placed on previous turns ──
  for (const cloud of bossState.clouds) {
    if (
      cloud.placedOnTurn < bossState.turnCount &&
      cloud.pos.x === player.pos.x &&
      cloud.pos.y === player.pos.y
    ) {
      applyPoisonDamage(player);
    }
  }

  // ── 2. Remove old clouds (dissipate after 3 turns) ───────────────
  bossState.clouds = bossState.clouds.filter(
    c => bossState.turnCount - c.placedOnTurn <= 3,
  );

  // ── 3. Rat-poison throw ──────────────────────────────────────────
  const phase2 = isPhase2(boss);
  const interval = phase2
    ? BOSS_RATPOISON_INTERVAL_P2
    : BOSS_RATPOISON_INTERVAL_P1;
  const cloudCount = phase2
    ? BOSS_RATPOISON_CLOUDS_P2
    : BOSS_RATPOISON_CLOUDS_P1;

  if (bossState.turnCount % interval === 0) {
    // First cloud always lands at the player's current position.
    bossState.clouds.push({
      pos: { x: player.pos.x, y: player.pos.y },
      placedOnTurn: bossState.turnCount,
    });

    // Additional clouds land on random cardinal-adjacent cells (phase 2).
    const dirs: readonly Vec2[] = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];
    for (let i = 1; i < cloudCount; i++) {
      const d = rng.pick(dirs);
      bossState.clouds.push({
        pos: { x: player.pos.x + d.x, y: player.pos.y + d.y },
        placedOnTurn: bossState.turnCount,
      });
    }
  }

  return false;
}
