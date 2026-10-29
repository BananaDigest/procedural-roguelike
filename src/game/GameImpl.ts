/**
 * @file GameImpl.ts
 *
 * The central game-logic class for "А тебе?" — implements the {@link Game}
 * interface and ties together room generation, combat, enemy AI, and boss
 * mechanics.
 *
 * This is the **one class** Person B (gameplay) owns.  It is constructed
 * with a {@link GenerateLevel} function (produced by Person A) and exposes
 * a read-only {@link GameState} consumed by Person C (renderer / UI).
 *
 * Key responsibilities:
 * - Turn loop (`movePlayer`) with bump-to-attack, pickups, exits
 * - Room / level memory (visited rooms keep their mutated state)
 * - Room & level transitions (нора = sibling room, люк = next/prev level)
 * - Boss fight orchestration (level 10 arena)
 * - Deterministic RNG — all randomness is derived from the game seed
 */

import {
  Game,
  GameState,
  GenerateLevel,
  Room,
} from "../core/types.ts";
import { Mulberry32 } from "../rng/Mulberry32.ts";
import {
  PLAYER_BASE_ATTACK,
  TOOTHPICK_ATTACK_BONUS,
  ENERGY_DRINK_TURNS,
  TOTAL_LEVELS,
  MAX_FLIES,
} from "./balance.ts";
import { createPlayer, tryMovePlayer } from "./Player.ts";
import {
  createFly,
  getFlySlots,
  moveFlies,
  repositionFlies,
  fliesAttackEnemies,
  removeDeadFlies,
} from "./Fly.ts";
import {
  playerAttackDamage,
  playerAttackEnemy,
  removeDeadEnemies,
  pickUpFood,
  applyTrapDamage,
} from "./Combat.ts";
import { processDementedMouseTurn } from "./DementedMouse.ts";
import { processEnemyTurns } from "./Enemy.ts";
import {
  BossState,
  createBossState,
  findBoss,
  processBossTurn,
  PoisonCloud,
} from "./Boss.ts";
import { CHEESE_BONUS_DIVIDER } from "../config.ts";

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Create a deep copy of a {@link Room}, cloning every mutable sub-object
 * (tiles array, entity arrays, positions).
 *
 * Used when saving / restoring visited rooms so mutations in the live room
 * never bleed into the stored snapshot and vice-versa.
 */
function deepCloneRoom(room: Room): Room {
  return {
    w: room.w,
    h: room.h,
    tiles: [...room.tiles],
    entry: { ...room.entry },
    exits: room.exits.map((e) => ({ ...e, pos: { ...e.pos } })),
    enemies: room.enemies.map((e) => ({ ...e, pos: { ...e.pos } })),
    food: room.food.map((f) => ({ ...f, pos: { ...f.pos } })),
    traps: room.traps.map((t) => ({ pos: { ...t.pos } })),
    items: room.items.map((i) => ({ ...i, pos: { ...i.pos } })),
    dementedMouse: room.dementedMouse
      ? { ...room.dementedMouse, pos: { ...room.dementedMouse.pos } }
      : null,
    isBossArena: room.isBossArena,
  };
}

/** Unique string key for a room position inside the run. */
function roomKey(level: number, roomIndex: number): string {
  return `${level}-${roomIndex}`;
}

// ── GameImpl ─────────────────────────────────────────────────────

/**
 * Main game implementation — owns the mutable {@link GameState} and drives
 * every system each turn.
 */
export class GameImpl implements Game {
  // ── Public (read by C) ──────────────────────────────────────────

  /** The live game state.  C reads this; only GameImpl mutates it. */
  state: GameState;

  /** `true` after the player picks up the Toothpick weapon (permanent). */
  hasToothpick = false;

  /** Cheese-power bonus granted on reaching the boss (0 = none yet / too little cheese). */
  cheeseBonus = 0;
  /** True once the player has reached the boss this run — the bonus is rolled only then. */
  cheeseBonusApplied = false;

  /** Turns remaining on the Energy Drink freeze effect. */
  energyTurnsLeft = 0;

  /** Boss-fight state — non-null only inside the level-10 arena. */
  bossState: BossState | null = null;

  /** Active poison clouds from the boss fight — C reads for rendering. */
  poisonClouds: PoisonCloud[] = [];

  /** >0 means the player just took damage — C uses for a flash effect. */
  playerHitFlash = 0;

  /**
   * Total player turns elapsed in the current run.
   * Used to derive a deterministic RNG seed for enemy AI each turn.
   */
  turnCount = 0;

  // ── Private ─────────────────────────────────────────────────────

  /** The level-chain generator supplied by Person A. */
  private readonly generateLevel: GenerateLevel;

  /** Deep-cloned snapshots of rooms the player has already visited. */
  private visitedRooms = new Map<string, Room>();

  /** Generated room chains, keyed by level number. */
  private levelChains = new Map<number, Room[]>();

  /**
   * Master RNG for the run.  Used only for things that don't need to be
   * perfectly reproducible per-turn (seed generation in `restart()`).
   * Enemy AI uses a per-turn derived RNG instead.
   */
  private rng: Mulberry32;

  // ── Constructor ─────────────────────────────────────────────────

  /**
   * @param generateLevel - Room-chain generator (Person A's implementation,
   *   or `stubGenerateLevel` for tests).
   */
  constructor(generateLevel: GenerateLevel) {
    this.generateLevel = generateLevel;
    this.rng = new Mulberry32(0);

    // Placeholder state — actual game starts via restart() / startWithSeed().
    this.state = {
      seed: 0,
      level: 1,
      roomIndex: 0,
      roomCount: 1,
      score: 0,
      player: createPlayer({ x: 0, y: 0 }),
      room: {
        w: 1,
        h: 1,
        tiles: [0],
        entry: { x: 0, y: 0 },
        exits: [],
        enemies: [],
        food: [],
        traps: [],
        items: [],
        isBossArena: false,
      },
      clouds: [],
      flies: [],
      phase: "title",
    };
  }

  // ── Game interface ──────────────────────────────────────────────

  /** Start a brand-new run.  If no seed is given one is derived from the RNG. */
  restart(seed?: number): void {
    const s = seed ?? this.rng.int(0, 0xffffffff);
    this.initRun(s);
  }

  /** Start a run with a specific seed (title-screen seed box). */
  startWithSeed(seed: number): void {
    this.initRun(seed);
  }

  /**
   * Advance one turn by attempting to move the player by (dx, dy).
   *
   * Movement logic:
   * 1. If the target cell contains a living enemy → bump-to-attack.
   * 2. Else if the target cell is walkable → move the player there.
   * 3. Else → blocked, no turn passes.
   *
   * After the player acts, pickups / exits / enemy turns / boss turn
   * are processed in order.
   */
  movePlayer(dx: number, dy: number): void {
    if (this.state.phase !== "playing") return;

    const { player, room } = this.state;
    const nx = player.pos.x + dx;
    const ny = player.pos.y + dy;

    // ── 1. Bump-to-attack ──────────────────────────────────────
    const targetEnemy = room.enemies.find(
      (e) => e.hp > 0 && e.pos.x === nx && e.pos.y === ny,
    );
    if (targetEnemy) {
      // Player.attack already includes TOOTHPICK_ATTACK_BONUS when the
      // toothpick is held, so we pass `false` to avoid double-counting.
      const killed = playerAttackEnemy(player, targetEnemy, false);
      if (killed) removeDeadEnemies(room);
      // Player stays in place — still counts as a turn.
      this.postPlayerAction();
      return;
    }

    if (
      room.dementedMouse &&
      room.dementedMouse.hp > 0 &&
      room.dementedMouse.pos.x === nx &&
      room.dementedMouse.pos.y === ny
    ) {
      const dmg = playerAttackDamage(player, false);
      room.dementedMouse.hp -= dmg;
      if (room.dementedMouse.hp <= 0) {
        room.dementedMouse = null;
      }
      this.postPlayerAction();
      return;
    }

    // ── 2. Walkability check & Move ───────────────────────────
    if (!tryMovePlayer(player, room, dx, dy)) return; // blocked — no turn passes

    // Interactions at new position
    this.checkPickups();

    // Exit transition (room / level change) — if triggered, enemy turns
    // are deferred to the next player action in the new room.
    if (this.checkExits()) return;

    this.postPlayerAction();
  }

  // ── Internals ───────────────────────────────────────────────────

  /** Reset all state and start a fresh run from level 1, room 0. */
  private initRun(seed: number): void {
    this.rng = new Mulberry32(seed);
    this.visitedRooms.clear();
    this.levelChains.clear();
    this.hasToothpick = false;
    this.cheeseBonus = 0;
    this.cheeseBonusApplied = false;
    this.energyTurnsLeft = 0;
    this.bossState = null;
    this.poisonClouds = [];
    this.playerHitFlash = 0;
    this.turnCount = 0;

    const chain = this.getOrGenerateChain(seed, 1);
    const room = deepCloneRoom(chain[0]);

    this.state = {
      seed,
      level: 1,
      roomIndex: 0,
      roomCount: chain.length,
      score: 0,
      player: createPlayer(room.entry),
      room,
      clouds: [],
      flies: [],
      phase: "playing",
    };
  }

  /**
   * Return the room chain for the given level, generating it (and caching)
   * if it hasn't been produced yet.
   */
  private getOrGenerateChain(seed: number, level: number): Room[] {
    let chain = this.levelChains.get(level);
    if (!chain) {
      chain = this.generateLevel(seed, level);
      this.levelChains.set(level, chain);
    }
    return chain;
  }

  /** Snapshot the current room's state into the visited-rooms map. */
  private saveCurrentRoom(): void {
    const key = roomKey(this.state.level, this.state.roomIndex);
    this.visitedRooms.set(key, deepCloneRoom(this.state.room));
  }

  /**
   * Load a room at the given (level, roomIndex).
   * Prefers a previously-saved snapshot; falls back to the generated chain.
   */
  private loadRoom(level: number, roomIndex: number): Room {
    const key = roomKey(level, roomIndex);
    const saved = this.visitedRooms.get(key);
    if (saved) return deepCloneRoom(saved);

    const chain = this.getOrGenerateChain(this.state.seed, level);
    return deepCloneRoom(chain[roomIndex]);
  }

  /** Handle food, item, and trap pickups at the player's current cell. */
  private checkPickups(): void {
    const { player, room } = this.state;
    const px = player.pos.x;
    const py = player.pos.y;

    // ── Food ──────────────────────────────────────────────────
    const foodIdx = room.food.findIndex(
      (f) => f.pos.x === px && f.pos.y === py,
    );
    if (foodIdx >= 0) {
      const f = room.food[foodIdx];
      this.state.score += pickUpFood(player, f.heal, f.score);
      room.food.splice(foodIdx, 1);
    }

    // ── Items ─────────────────────────────────────────────────
    const itemIdx = room.items.findIndex(
      (i) => i.pos.x === px && i.pos.y === py,
    );
    if (itemIdx >= 0) {
      const item = room.items[itemIdx];
      room.items.splice(itemIdx, 1);

      switch (item.kind) {
        case "toothpick":
          this.hasToothpick = true;
          // keep the cheese-power bonus if it was already granted
          player.attack = PLAYER_BASE_ATTACK + TOOTHPICK_ATTACK_BONUS + this.cheeseBonus;
          break;
        case "energy":
          this.energyTurnsLeft = ENERGY_DRINK_TURNS;
          break;
        case "maggot":
          if (this.state.flies.length < MAX_FLIES) {
            const occupied = new Set(this.state.flies.map((f) => `${f.pos.x},${f.pos.y}`));
            occupied.add(`${player.pos.x},${player.pos.y}`);
            const slots = getFlySlots(player.pos, room, room.enemies, MAX_FLIES);
            const freeSlot =
              slots.find((s) => !occupied.has(`${s.x},${s.y}`)) ??
              slots[0] ?? { x: player.pos.x + 1, y: player.pos.y };
            this.state.flies.push(createFly(freeSlot));
          } else {
            for (const f of this.state.flies) {
              f.hp = f.maxHp;
            }
          }
          break;
        case "bigcheese":
          this.state.phase = "win";
          return; // game won — skip further checks
      }
    }

    // ── Traps (one-shot: removed after triggering) ────────────
    const trapIdx = room.traps.findIndex(
      (t) => t.pos.x === px && t.pos.y === py,
    );
    if (trapIdx >= 0) {
      applyTrapDamage(player);
      room.traps.splice(trapIdx, 1);
      this.playerHitFlash = 3;
      if (player.hp <= 0) {
        this.state.phase = "gameover";
      }
    }
  }

  /**
   * Check whether the player is standing on an exit tile and, if so,
   * perform the appropriate room or level transition.
   *
   * @returns `true` if a transition occurred (caller should skip the
   *   rest of the turn).
   */
  private checkExits(): boolean {
    const { player, room } = this.state;
    const exit = room.exits.find(
      (e) => e.pos.x === player.pos.x && e.pos.y === player.pos.y,
    );
    if (!exit) return false;

    this.saveCurrentRoom();

    if (exit.kind === "nora") {
      this.transitionNora(exit.dir);
    } else {
      // Luk — level boundary
      if (!this.transitionLuk(exit.dir)) return false;
    }

    this.afterTransition();
    return true;
  }

  /**
   * DEBUG: jump straight to the start of `level` (1..TOTAL_LEVELS) — the
   * same path as walking through a люк forward: current room is saved,
   * the level is generated (or loaded from memory), player lands at its start.
   *
   * @returns `false` if not playing or `level` is out of range.
   */
  jumpToLevel(level: number): boolean {
    if (this.state.phase !== "playing") return false;
    if (!Number.isInteger(level) || level < 1 || level > TOTAL_LEVELS) return false;

    this.saveCurrentRoom();
    this.enterLevel(level, "fwd");
    this.afterTransition();
    return true;
  }

  /**
   * DEBUG: instantly kill the Cleaning Lady. Works only while the player is
   * in the level-10 arena with the boss alive. Goes through the same path as
   * a killing bite (remove the dead enemy → turn passes → boss turn sees her
   * gone → Big Cheese spawns), so victory works exactly as in normal play.
   *
   * @returns `true` if the boss was killed.
   */
  debugKillBoss(): boolean {
    const { room } = this.state;
    if (this.state.phase !== "playing" || this.state.level !== TOTAL_LEVELS) return false;
    if (!room.isBossArena) return false;
    const boss = findBoss(room);
    if (!boss) return false;

    boss.hp = 0;
    removeDeadEnemies(room);
    this.postPlayerAction();
    return true;
  }

  /**
   * Cheese power — on first reaching the boss: +floor(cheese / divider) to
   * damage, HP and maxHp. Cheese itself is not spent. Once per run.
   */
  private applyCheeseBonus(): void {
    if (this.cheeseBonusApplied) return;
    this.cheeseBonusApplied = true;

    const bonus = Math.floor(this.state.score / CHEESE_BONUS_DIVIDER);
    if (bonus <= 0) return;
    const { player } = this.state;
    this.cheeseBonus = bonus;
    player.attack += bonus;
    player.maxHp += bonus;
    player.hp += bonus;
  }

  /** Shared tail of every room/level change: boss state, clouds, flies. */
  private afterTransition(): void {
    // Entering a boss arena?
    if (this.state.room.isBossArena && !this.bossState) {
      this.bossState = createBossState();
    }
    if (this.state.room.isBossArena) this.applyCheeseBonus();
    this.state.clouds =
      this.state.room.isBossArena && this.bossState
        ? this.bossState.clouds.map((c) => ({ ...c.pos }))
        : [];

    // Flies follow the player into the new room/level
    if (this.state.flies.length > 0) {
      repositionFlies(this.state.flies, this.state.player.pos, this.state.room, this.state.room.enemies);
    }
  }

  /**
   * Transition through a нора (sibling room in the same level).
   *
   * @param dir - `"fwd"` moves to roomIndex+1, `"back"` to roomIndex-1.
   */
  private transitionNora(dir: "fwd" | "back"): void {
    const newIndex =
      dir === "fwd" ? this.state.roomIndex + 1 : this.state.roomIndex - 1;

    const newRoom = this.loadRoom(this.state.level, newIndex);
    this.state.roomIndex = newIndex;
    this.state.room = newRoom;

    // Place the player at the opposite nора in the destination room.
    const arrivalDir = dir === "fwd" ? "back" : "fwd";
    const arrivalExit = newRoom.exits.find(
      (e) => e.kind === "nora" && e.dir === arrivalDir,
    );
    this.state.player.pos = arrivalExit
      ? { ...arrivalExit.pos }
      : { ...newRoom.entry };
  }

  /**
   * Transition through a люк (level boundary).
   *
   * @param dir - `"fwd"` goes to the next level, `"back"` to the previous.
   * @returns `true` if the transition succeeded, `false` if out-of-bounds.
   */
  private transitionLuk(dir: "fwd" | "back"): boolean {
    const newLevel =
      dir === "fwd" ? this.state.level + 1 : this.state.level - 1;

    if (newLevel < 1 || newLevel > TOTAL_LEVELS) return false;

    this.enterLevel(newLevel, dir);
    return true;
  }

  /**
   * Move the player into `newLevel`: generate/load its room chain and place
   * the player at the arrival point.
   *
   * @param dir - `"fwd"` arrives at the level's start (room 0),
   *   `"back"` at its end (last room).
   */
  private enterLevel(newLevel: number, dir: "fwd" | "back"): void {
    const chain = this.getOrGenerateChain(this.state.seed, newLevel);
    const newIndex = dir === "fwd" ? 0 : chain.length - 1;
    const newRoom = this.loadRoom(newLevel, newIndex);

    this.state.level = newLevel;
    this.state.roomIndex = newIndex;
    this.state.roomCount = chain.length;
    this.state.room = newRoom;

    // Toothpick buff expires on entering a new level
    this.hasToothpick = false;
    this.state.player.attack = PLAYER_BASE_ATTACK;

    // Place player at the arrival point.
    if (dir === "fwd") {
      // Entering from the start of the new level.
      const backLuk = newRoom.exits.find(
        (e) => e.kind === "luk" && e.dir === "back",
      );
      this.state.player.pos = backLuk
        ? { ...backLuk.pos }
        : { ...newRoom.entry };
    } else {
      // Going back to the end of the previous level.
      const fwdLuk = newRoom.exits.find(
        (e) => e.kind === "luk" && e.dir === "fwd",
      );
      this.state.player.pos = fwdLuk
        ? { ...fwdLuk.pos }
        : { ...newRoom.entry };
    }

    // Initialise boss state when entering the level-10 arena.
    if (newLevel === TOTAL_LEVELS && newRoom.isBossArena) {
      this.bossState = createBossState();
    }
  }

  /**
   * Post-action phase — runs after the player's action (move or attack)
   * each turn.
   *
   * Execution order:
   * 1. Increment the global turn counter.
   * 2. Process enemy turns (skip if Energy Drink is active).
   * 3. Process boss turn (rat-poison clouds, defeat check).
   * 4. Decrement Energy Drink countdown.
   * 5. Decrement visual flash counters.
   * 6. Check for player death.
   */
  private postPlayerAction(): void {
    const { player, room } = this.state;

    // Advance the deterministic turn counter.
    this.turnCount++;

    // Derive a per-turn RNG from the game seed + positional data.
    // This keeps enemy behaviour deterministic for the same sequence of
    // player actions, without relying on Date.now() or Math.random().
    const turnRng = new Mulberry32(
      (this.state.seed +
        this.state.level * 10000 +
        this.state.roomIndex * 100 +
        this.turnCount) >>>
        0,
    );

    // ── Fly companion turns (movement & attack) ───────────────
    if (this.state.flies.length > 0) {
      moveFlies(this.state.flies, player.pos, room, room.enemies, turnRng);
      fliesAttackEnemies(this.state.flies, player.pos, room);
    }

    // ── Enemy turns ───────────────────────────────────────────
    const hpBefore = player.hp;
    processEnemyTurns(
      room,
      player,
      turnRng,
      this.energyTurnsLeft > 0,
      this.state.flies,
    );
    if (player.hp < hpBefore) this.playerHitFlash = 3;

    // Remove any flies defeated by enemies
    if (this.state.flies.length > 0) {
      this.state.flies = removeDeadFlies(this.state.flies);
    }

    // ── Demented teammate turn ───────────────────────────────
    if (room.dementedMouse && room.dementedMouse.hp > 0) {
      const hpBeforeMouse = player.hp;
      processDementedMouseTurn(
        room.dementedMouse,
        room,
        player,
        this.state.flies,
        turnRng,
      );
      if (player.hp < hpBeforeMouse) this.playerHitFlash = 3;
      if (room.dementedMouse.hp <= 0) {
        room.dementedMouse = null;
      }
      if (this.state.flies.length > 0) {
        this.state.flies = removeDeadFlies(this.state.flies);
      }
    }

    // ── Boss turn ─────────────────────────────────────────────
    if (this.bossState && room.isBossArena) {
      const bossDefeated = processBossTurn(
        this.bossState,
        room,
        player,
        turnRng,
      );
      this.poisonClouds = this.bossState.clouds;
      this.state.clouds = this.bossState.clouds.map((c) => ({ ...c.pos }));

      if (bossDefeated) {
        // Spawn the Big Cheese near the arena centre.
        const cx = Math.floor(room.w / 2);
        const cy = Math.floor(room.h / 2);
        room.items.push({ kind: "bigcheese", pos: { x: cx, y: cy } });
      }
    }

    // ── Energy drink countdown ────────────────────────────────
    if (this.energyTurnsLeft > 0) this.energyTurnsLeft--;

    // ── Visual flash countdown ────────────────────────────────
    if (this.playerHitFlash > 0) this.playerHitFlash--;

    // ── Death check ───────────────────────────────────────────
    if (player.hp <= 0) {
      this.state.phase = "gameover";
    }
  }
}
