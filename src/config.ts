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

/**
 * Character animation — purely visual, never touches the turn logic.
 * Times in ms; distances/sizes as a fraction of a tile (× TILE_SIZE when drawn).
 */
export const ANIM = {
  /** slide to the next cell (ease-out); fast enemies / boss fit 2 cells into the same time */
  moveMs: 120,
  /** bump-attack: out-and-back lunge toward the target */
  lungeMs: 140,
  lunge: 0.28,
  /** damage tint on the hit character */
  flashMs: 200,
  flashAlpha: 0.75,
  /** enemy / boss / teammate death: shrink + fade */
  deathMs: 250,
  deathScale: 0.3,

  /** mouse idle: breathing scale 1.00…(1 + breath) and tail sway */
  breathMs: 1800,
  breath: 0.03,
  tailMs: 2400,
  tailSway: 0.06,

  /** boss: mop swing (radians) on a melee hit and a shorter one when throwing rat poison */
  mopSwingMs: 220,
  mopSwing: 0.9,
  mopThrowSwing: 0.5,
  /** boss phase change (HP < 50 %): red flash */
  phaseFlashMs: 300,

  /** idle comes back smoothly over this long after a walk / attack / flash */
  idleBlendMs: 300,
  /** enemy idle: vertical «breathing» of the body, 1.00…(1 + enemyBreath) */
  enemyBreathMs: 1700,
  enemyBreath: 0.03,
  /** boss idle: deeper and slower breathing, slow mop sway (radians) */
  bossBreathMs: 2300,
  bossBreath: 0.045,
  mopIdleMs: 2000,
  mopIdle: 0.08,
  /** boss phase 2 (HP < 50 %): idle runs faster (period ×), body trembles (± tiles) */
  bossRageSpeed: 0.55,
  bossRageShake: 0.02,

  /** blinking (everyone but flies): eyes become lines for blinkMs, every blinkMin…blinkMax ms */
  blinkMs: 120,
  blinkMinMs: 2000,
  blinkMaxMs: 5000,
  /** the demented teammate blinks more often, sometimes twice in a row */
  dementedBlinkMinMs: 800,
  dementedBlinkMaxMs: 2400,
  doubleBlinkChance: 0.4,
  doubleBlinkGapMs: 170,

  /** maggot on the floor: wave along 3–4 segments; shrinks away when picked up */
  maggotWiggleMs: 1400,
  maggotWiggle: 0.06,
  maggotPickMs: 150,

  /** demented teammate */
  hairJitterMs: 100,
  hairJitter: 0.035,
  pupilMs: 700,
  pupilRange: 0.04,
  droolMs: 3200,
  droolLen: 0.2,
  /** short shake before he lunges at OUR mouse */
  shakeMs: 160,
  shake: 0.05,

  /** flies */
  flyRing: 0.62,
  flyHover: 0.05,
  flyHoverMs: 900,
  wingFlapMs: 50,
  /** catch-up lag behind the mouse: first fly, then + step for each next one */
  flyFollowMs: 70,
  flyFollowStepMs: 45,
  flyDartMs: 180,
  flyDart: 0.8,
  flyDeathMs: 400,
  flyFall: 0.6,
} as const;
