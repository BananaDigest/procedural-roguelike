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
 *   Every N player turns the boss throws rat-poison at the player's position,
 *   spawning an irregular poison cloud (2 to 5 cells in width and height,
 *   never a square/rectangle/circle) generated organically.
 *
 *   ### Telegraph mechanic & Turn timing:
 *   - Turn 0 (throw turn): cloud appears visually, 0 damage.
 *   - Turn 1 (player's 1st step): telegraph/reaction step, 0 damage.
 *   - Turn 2+ (player's 2nd step and onward): deals poison damage each step
 *     the player is inside the cloud until it despawns.
 *   - If the player leaves and later returns while the cloud is still alive,
 *     poison damage applies as long as they are inside.
 *
 *   Clouds dissipate automatically after BOSS_POISON_CLOUD_DURATION turns.
 *
 *   ### Phases
 *   - **Phase 1** (HP > 50 %): throws every 4 turns, 1 irregular cloud per throw.
 *   - **Phase 2** (HP ≤ 50 %): throws every 2 turns, 1 irregular cloud per throw.
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
  BOSS_POISON_CLOUD_DURATION,
  BOSS_HP,
} from "./balance.ts";
import { generatePoisonCloudTiles } from "./PoisonCloudGen.ts";
import { emitGameEvent } from "./events.ts";

// ── Types ────────────────────────────────────────────────────────

/**
 * A poison cloud sitting on the arena floor.
 *
 * Clouds are **telegraphed**: they appear on turn 0, give a 1-step grace
 * period on turn 1, and become toxic starting on step 2 (`turnCount - placedOnTurn >= 2`).
 */
export interface PoisonCloud {
  /** World position of the cloud inside the boss arena. */
  pos: Vec2;
  /**
   * The boss-fight turn number when this cloud was placed.
   * Damage is only applied when `BossState.turnCount - placedOnTurn >= 2`
   * (i.e. on the 2nd step and subsequent steps).
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
 * 1. **Poison damage** — any active cloud (turnCount - placedOnTurn >= 2)
 *    that overlaps the player's current position applies poison damage.
 * 2. **Cloud cleanup** — clouds older than BOSS_POISON_CLOUD_DURATION turns are removed.
 * 3. **Rat-poison throw** — if the turn counter hits the interval for
 *    the current phase, new irregular clouds are spawned.
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

  // ── 1. Apply poison damage ──────────────────────────────────────
  // Timing rules:
  // - Step 0 (placement turn): 0 damage (telegraph).
  // - Step 1 (player's 1st move): 0 damage (reaction step).
  // - Step 2+ (player's 2nd move onward): damage applied if standing in cloud.
  // - Leaving and re-entering continues to apply damage while inside.
  const inActivePoison = bossState.clouds.some(
    c =>
      bossState.turnCount - c.placedOnTurn >= 2 &&
      c.pos.x === player.pos.x &&
      c.pos.y === player.pos.y,
  );
  if (inActivePoison) {
    applyPoisonDamage(player);
  }

  // ── 2. Remove old clouds after BOSS_POISON_CLOUD_DURATION turns ─
  bossState.clouds = bossState.clouds.filter(
    c => bossState.turnCount - c.placedOnTurn <= BOSS_POISON_CLOUD_DURATION,
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
    emitGameEvent({ type: "bossThrow", actor: boss });
    for (let i = 0; i < cloudCount; i++) {
      const origin =
        i === 0
          ? player.pos
          : {
              x: player.pos.x + rng.int(-2, 2),
              y: player.pos.y + rng.int(-2, 2),
            };
      const tiles = generatePoisonCloudTiles(origin, room, rng);
      for (const tile of tiles) {
        const existing = bossState.clouds.find(
          c => c.pos.x === tile.x && c.pos.y === tile.y,
        );
        if (existing) {
          existing.placedOnTurn = Math.min(
            existing.placedOnTurn,
            bossState.turnCount,
          );
        } else {
          bossState.clouds.push({
            pos: tile,
            placedOnTurn: bossState.turnCount,
          });
        }
      }
    }
  }

  return false;
}
