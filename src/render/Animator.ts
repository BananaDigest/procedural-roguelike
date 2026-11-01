/**
 * Animator — the VISUAL state of characters, kept apart from the logical one.
 *
 * The game stays strictly turn-based: after every player action main.ts calls
 * `sync()`, which compares the new GameState with the last one it saw
 * (positions, HP, who disappeared) and reads the turn's GameEvents (who
 * attacked whom). From that it starts time-based animations: slides, lunges,
 * damage tints, death fades, mop swings. The Renderer then asks `pose()` /
 * `flyPose()` every frame for where and how to draw each character.
 *
 * Randomness here is cosmetic only (Math.random / time-based hash) — the
 * seeded Mulberry32 streams of the game are never touched.
 * All distances are in TILES (the Renderer multiplies by TILE_SIZE).
 */
import { type Enemy, type Fly, type GameState, type Item, type Room, type Vec2, isWalkable } from "../core/types.ts";
import type { GameEvent } from "../game/events.ts";
import { BOSS_PHASE2_HP_THRESHOLD } from "../game/balance.ts";
import { ANIM } from "../config.ts";

type ActorKind = "player" | "enemy" | "demented" | "fly";
/** ghosts can also be a picked-up maggot (the one floor object that animates) */
type GhostKind = ActorKind | "maggot";

const NEVER = -1e12; // "animation started long ago" → finished

interface Track {
  kind: ActorKind;
  /** last logical cell we saw */
  cell: Vec2;
  hp: number;
  /** cells to slide through this turn (from … to); length 1 = standing */
  path: Vec2[];
  moveT0: number;
  lungeT0: number;
  lungeDelay: number;
  lungeDir: Vec2;
  /** fly dart: target point in tiles (cell centre) */
  dartTarget: Vec2 | null;
  shakeT0: number;
  flashT0: number;
  flashColor: string;
  swingT0: number;
  swingAmp: number;
  phaseT0: number;
  /** own random time offset, so idle loops of different characters never sync */
  phase: number;
  /** blinking: current blink start, optional second blink, when the next one comes */
  blinkT0: number;
  blink2T0: number;
  nextBlink: number;
  /** flies: smoothed follow point (tile-space centre of the mouse) + ring angle */
  anchor: Vec2;
  angle: number;
}

/** How to draw a character this frame. x/y = top-left of its (virtual) tile, in tiles. */
export interface Pose {
  x: number;
  y: number;
  scale: number;
  alpha: number;
  tint: string | null;
  tintA: number;
  /** boss mop rotation, radians */
  mop: number;
  /** eyes closed (thin lines) this frame */
  blink: boolean;
  /** idle breathing: vertical body scale about the feet (1 = none) */
  breathY: number;
}

export interface Ghost {
  kind: GhostKind;
  /** the dead object (enemy → kind for the sprite; fly / teammate for their sprite) */
  obj: object;
  x: number;
  y: number;
  t0: number;
}

/** Cosmetic per-frame face parameters of the demented teammate. */
export interface DementedFace {
  hair: Vec2[]; // jitter of the 4 hair tips, tiles
  pupil: Vec2; // pupil offset, tiles
  drool: number; // 0..1 cycle phase
}

const easeOut = (k: number) => 1 - (1 - k) ** 3;
const clamp01 = (k: number) => (k < 0 ? 0 : k > 1 ? 1 : k);
/** Deterministic 0..1 noise from a number (no RNG state). */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export class Animator {
  private tracks = new Map<object, Track>();
  private ghosts: Ghost[] = [];
  private room: Room | null = null;
  private player: object | null = null;
  private lastUpdate = 0;
  /** maggots on the floor of the current room → their own wiggle phase (ms) */
  private maggots = new Map<Item, number>();

  // ── turn sync ────────────────────────────────────────────────

  /** Call after every state change (turn, new run, level jump). */
  sync(state: GameState, events: GameEvent[], now: number): void {
    const room = state.room;

    // New room / new run → everyone simply appears in place (no slide between rooms).
    if (room !== this.room || state.player !== this.player) {
      this.room = room;
      this.player = state.player;
      this.tracks.clear();
      this.ghosts = [];
      this.maggots.clear();
      for (const [obj, kind, pos, hp] of this.actors(state)) this.tracks.set(obj, this.newTrack(kind, pos, hp, now));
      this.placeFliesNow(state);
      this.syncMaggots(room, now);
      return;
    }

    // A maggot that vanished was picked up: it shrinks away, and a new fly
    // (if one was born) starts from its cell.
    const picked = this.syncMaggots(room, now);

    const alive = new Set<object>();
    const moved = new Set<object>();
    for (const [obj, kind, pos, hp] of this.actors(state)) {
      alive.add(obj);
      let t = this.tracks.get(obj);
      if (!t) {
        t = this.newTrack(kind, pos, hp, now);
        if (kind === "fly") {
          t.anchor = picked ? { x: picked.x + 0.5, y: picked.y + 0.5 } : this.center(this.tracks.get(state.player)!, now);
        }
        this.tracks.set(obj, t);
        continue;
      }
      if (kind !== "fly" && (pos.x !== t.cell.x || pos.y !== t.cell.y)) {
        const d = Math.abs(pos.x - t.cell.x) + Math.abs(pos.y - t.cell.y);
        t.path = d <= 2 ? pathBetween(t.cell, pos, room) : [{ ...pos }];
        t.moveT0 = d <= 2 ? now : NEVER;
        moved.add(obj);
      }
      t.cell = { ...pos };

      if (hp < t.hp) {
        t.flashT0 = now;
        t.flashColor = kind === "player" || kind === "fly" ? "#e2231a" : "#ffffff";
        const boss = obj as Enemy;
        if (kind === "enemy" && boss.kind === "boss") {
          const line = boss.maxHp * BOSS_PHASE2_HP_THRESHOLD;
          if (t.hp > line && hp <= line) t.phaseT0 = now;
        }
      }
      t.hp = hp;
    }

    // Attacks / boss throws from this turn's event log.
    for (const e of events) {
      const t = this.tracks.get(e.actor);
      if (!t || !alive.has(e.actor)) continue;
      if (e.type === "bossThrow") {
        t.swingT0 = now;
        t.swingAmp = ANIM.mopThrowSwing;
        continue;
      }
      if (t.kind === "fly") {
        t.dartTarget = { x: e.target.x + 0.5, y: e.target.y + 0.5 };
        t.lungeT0 = now;
        continue;
      }
      // Lunge toward the target; a fly target is aimed at where the fly is DRAWN.
      const aim = this.flyAt(state, e.target, now) ?? { x: e.target.x + 0.5, y: e.target.y + 0.5 };
      const dx = aim.x - (t.cell.x + 0.5);
      const dy = aim.y - (t.cell.y + 0.5);
      const len = Math.hypot(dx, dy) || 1;
      t.lungeDir = { x: dx / len, y: dy / len };
      t.lungeT0 = now;
      t.lungeDelay = moved.has(e.actor) ? ANIM.moveMs : 0;
      if (t.kind === "demented" && e.targetIsPlayer) {
        t.shakeT0 = now + t.lungeDelay;
        t.lungeDelay += ANIM.shakeMs;
      }
      if (t.kind === "enemy" && (e.actor as Enemy).kind === "boss") {
        t.swingT0 = now + t.lungeDelay;
        t.swingAmp = ANIM.mopSwing;
      }
    }

    // Whoever vanished died this turn → leave a fading ghost where they were drawn.
    for (const [obj, t] of this.tracks) {
      if (alive.has(obj)) continue;
      const p = t.kind === "fly" ? this.flyPose(obj as Fly, state, now) : this.pose(obj, now);
      if (p) this.ghosts.push({ kind: t.kind, obj, x: p.x, y: p.y, t0: now });
      this.tracks.delete(obj);
    }
  }

  /** Per-frame: blink schedules, flies catch up with the mouse, old ghosts are dropped. */
  update(state: GameState, now: number): void {
    const dt = Math.min(100, Math.max(0, now - this.lastUpdate));
    this.lastUpdate = now;
    this.ghosts = this.ghosts.filter((g) => now - g.t0 < ghostMs(g.kind));

    // Everyone but flies blinks on their own random schedule.
    for (const t of this.tracks.values()) {
      if (t.kind === "fly" || now < t.nextBlink) continue;
      t.blinkT0 = now;
      const crazy = t.kind === "demented";
      t.blink2T0 = crazy && Math.random() < ANIM.doubleBlinkChance ? now + ANIM.blinkMs + ANIM.doubleBlinkGapMs : NEVER;
      t.nextBlink = now + nextBlinkIn(crazy);
    }

    const pt = this.tracks.get(state.player);
    if (!pt) return;
    const target = this.center(pt, now);
    const n = state.flies.length;
    state.flies.forEach((f, i) => {
      const t = this.tracks.get(f);
      if (!t) return;
      const tau = ANIM.flyFollowMs + i * ANIM.flyFollowStepMs;
      const k = 1 - Math.exp(-dt / tau);
      t.anchor.x += (target.x - t.anchor.x) * k;
      t.anchor.y += (target.y - t.anchor.y) * k;
      const want = ringAngle(i, n);
      t.angle += wrapAngle(want - t.angle) * (1 - Math.exp(-dt / 120));
    });
  }

  /** True while this turn's slides / lunges are still playing (input waits or queues). */
  isBusy(now: number): boolean {
    for (const t of this.tracks.values()) {
      if (t.kind === "fly") continue;
      if (now < t.moveT0 + ANIM.moveMs) return true;
      if (now < t.lungeT0 + t.lungeDelay + ANIM.lungeMs) return true;
    }
    return false;
  }

  /** Jump every running slide / lunge to its end (fast input must never feel slow). */
  finish(): void {
    for (const t of this.tracks.values()) {
      t.moveT0 = NEVER;
      t.lungeT0 = NEVER;
      t.shakeT0 = NEVER;
      t.path = [t.cell];
    }
  }

  // ── per-frame queries ────────────────────────────────────────

  /** Pose of the mouse / an enemy / the teammate (null = not tracked). */
  pose(obj: object, now: number): Pose | null {
    const t = this.tracks.get(obj);
    if (!t) return null;
    const base = this.pathPos(t, now);
    let x = base.x;
    let y = base.y;

    const lk = (now - t.lungeT0 - t.lungeDelay) / ANIM.lungeMs;
    if (lk > 0 && lk < 1) {
      const off = Math.sin(Math.PI * lk) * ANIM.lunge;
      x += t.lungeDir.x * off;
      y += t.lungeDir.y * off;
    }
    const sk = (now - t.shakeT0) / ANIM.shakeMs;
    if (sk >= 0 && sk < 1) x += Math.sin(now * 0.9) * ANIM.shake;

    let scale = 1;
    if (t.kind === "player") scale = 1 + ANIM.breath * (0.5 - 0.5 * Math.cos((2 * Math.PI * now) / ANIM.breathMs));

    const { tint, tintA } = this.tintOf(t, now);
    const wk = (now - t.swingT0) / ANIM.mopSwingMs;
    let mop = wk >= 0 && wk < 1 ? -t.swingAmp * Math.sin(Math.PI * wk) : 0;

    // Idle (enemies + boss): fades out while walking / attacking / flashing, eases back after.
    let breathY = 1;
    if (t.kind === "enemy") {
      const w = clamp01((now - this.activeUntil(t)) / ANIM.idleBlendMs);
      const en = obj as Enemy;
      const boss = en.kind === "boss";
      const rage = boss && en.hp <= en.maxHp * BOSS_PHASE2_HP_THRESHOLD;
      const speed = rage ? ANIM.bossRageSpeed : 1;
      const period = (boss ? ANIM.bossBreathMs : ANIM.enemyBreathMs) * speed;
      const amp = boss ? ANIM.bossBreath : ANIM.enemyBreath;
      breathY = 1 + w * amp * (0.5 - 0.5 * Math.cos((2 * Math.PI * (now + t.phase)) / period));
      if (boss) {
        mop += w * ANIM.mopIdle * Math.sin((2 * Math.PI * (now + t.phase)) / (ANIM.mopIdleMs * speed));
        if (rage) {
          x += w * (hash(Math.floor(now / 40)) - 0.5) * 2 * ANIM.bossRageShake;
          y += w * (hash(Math.floor(now / 40) + 17) - 0.5) * 2 * ANIM.bossRageShake;
        }
      }
    }

    // Blink — never while flashing from a hit (dead ones are ghosts: no blink either).
    const blink = !tint && this.isBlinking(t, now);
    return { x, y, scale, alpha: 1, tint, tintA, mop, blink, breathY };
  }

  /** Wiggle phase (ms offset) of a maggot on the floor, or 0 if unknown. */
  maggotPhase(item: Item): number {
    return this.maggots.get(item) ?? 0;
  }

  /** Pose of a fly: ring slot around its smoothed anchor + hover + dart. */
  flyPose(fly: Fly, state: GameState, now: number): Pose | null {
    const t = this.tracks.get(fly);
    if (!t) return null;
    const i = Math.max(0, state.flies.indexOf(fly));
    let cx = t.anchor.x + Math.cos(t.angle) * ANIM.flyRing;
    let cy = t.anchor.y + Math.sin(t.angle) * ANIM.flyRing;
    const w = (2 * Math.PI * now) / ANIM.flyHoverMs;
    cx += Math.sin(w + i * 1.7) * ANIM.flyHover;
    cy += Math.cos(w * 1.3 + i * 2.3) * ANIM.flyHover;

    const dk = (now - t.lungeT0) / ANIM.flyDartMs;
    if (t.dartTarget && dk >= 0 && dk < 1) {
      const off = Math.sin(Math.PI * dk) * ANIM.flyDart;
      cx += (t.dartTarget.x - cx) * off;
      cy += (t.dartTarget.y - cy) * off;
    }
    const { tint, tintA } = this.tintOf(t, now);
    return { x: cx - 0.5, y: cy - 0.5, scale: 1, alpha: 1, tint, tintA, mop: 0, blink: false, breathY: 1 };
  }

  /** Fading ghosts of characters that died (and maggots picked up) recently. */
  ghostPoses(now: number): { ghost: Ghost; pose: Pose }[] {
    const still = { mop: 0, blink: false, breathY: 1 };
    return this.ghosts.map((g) => {
      const k = clamp01((now - g.t0) / ghostMs(g.kind));
      if (g.kind === "maggot") {
        return { ghost: g, pose: { ...still, x: g.x, y: g.y, scale: 1 - k, alpha: 1 - k, tint: null, tintA: 0 } };
      }
      if (g.kind === "fly") {
        return { ghost: g, pose: { ...still, x: g.x, y: g.y + ANIM.flyFall * k * k, scale: 1, alpha: 1 - k, tint: "#e2231a", tintA: 0.5 * (1 - k) } };
      }
      return { ghost: g, pose: { ...still, x: g.x, y: g.y, scale: 1 - (1 - ANIM.deathScale) * k, alpha: 1 - k, tint: "#ffffff", tintA: 0.6 * (1 - k) } };
    });
  }

  /** Wing width (fraction of T) — flaps every ANIM.wingFlapMs. */
  wingWidth(now: number): number {
    return Math.floor(now / ANIM.wingFlapMs) % 2 === 0 ? 0.14 : 0.07;
  }

  /** Mouse tail sway, tiles. */
  tailSway(now: number): number {
    return Math.sin((2 * Math.PI * now) / ANIM.tailMs) * ANIM.tailSway;
  }

  /** Twitchy details of the demented teammate for this frame. */
  dementedFace(now: number): DementedFace {
    const step = Math.floor(now / ANIM.hairJitterMs);
    const hair = [0, 1, 2, 3].map((i) => ({
      x: (hash(step * 7 + i) - 0.5) * 2 * ANIM.hairJitter,
      y: (hash(step * 13 + i + 50) - 0.5) * 2 * ANIM.hairJitter,
    }));

    const seg = Math.floor(now / ANIM.pupilMs);
    const k = easeOut((now % ANIM.pupilMs) / ANIM.pupilMs);
    const dirAt = (s: number) => {
      const a = hash(s) * Math.PI * 2;
      const r = ANIM.pupilRange * (0.4 + 0.6 * hash(s + 0.5));
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    };
    const a = dirAt(seg);
    const b = dirAt(seg + 1);
    const pupil = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };

    // (his blinking comes from the shared blink schedule → Pose.blink)
    return { hair, pupil, drool: (now % ANIM.droolMs) / ANIM.droolMs };
  }

  // ── internals ────────────────────────────────────────────────

  private *actors(state: GameState): Generator<[object, ActorKind, Vec2, number]> {
    yield [state.player, "player", state.player.pos, state.player.hp];
    for (const e of state.room.enemies) if (e.hp > 0) yield [e, "enemy", e.pos, e.hp];
    const dm = state.room.dementedMouse;
    if (dm && dm.hp > 0) yield [dm, "demented", dm.pos, dm.hp];
    for (const f of state.flies) if (f.hp > 0) yield [f, "fly", f.pos, f.hp];
  }

  /**
   * Keep the maggot set in step with the room's items; returns the cell of a
   * maggot that vanished this turn (picked up → shrink ghost), if any.
   */
  private syncMaggots(room: Room, now: number): Vec2 | null {
    const present = new Set<Item>();
    for (const it of room.items) {
      if (it.kind !== "maggot") continue;
      present.add(it);
      if (!this.maggots.has(it)) this.maggots.set(it, Math.random() * ANIM.maggotWiggleMs * 4);
    }
    let picked: Vec2 | null = null;
    for (const it of this.maggots.keys()) {
      if (present.has(it)) continue;
      this.maggots.delete(it);
      this.ghosts.push({ kind: "maggot", obj: it, x: it.pos.x, y: it.pos.y, t0: now });
      picked = { ...it.pos };
    }
    return picked;
  }

  /** When the last walk / lunge / flash / swing of this character ends. */
  private activeUntil(t: Track): number {
    return Math.max(
      t.moveT0 + ANIM.moveMs,
      t.lungeT0 + t.lungeDelay + ANIM.lungeMs,
      t.shakeT0 + ANIM.shakeMs,
      t.flashT0 + ANIM.flashMs,
      t.swingT0 + ANIM.mopSwingMs,
      t.phaseT0 + ANIM.phaseFlashMs,
    );
  }

  private isBlinking(t: Track, now: number): boolean {
    const a = now - t.blinkT0;
    const b = now - t.blink2T0;
    return (a >= 0 && a < ANIM.blinkMs) || (b >= 0 && b < ANIM.blinkMs);
  }

  private newTrack(kind: ActorKind, pos: Vec2, hp: number, now: number): Track {
    return {
      kind,
      cell: { ...pos },
      hp,
      path: [{ ...pos }],
      moveT0: NEVER,
      lungeT0: NEVER,
      lungeDelay: 0,
      lungeDir: { x: 0, y: 0 },
      dartTarget: null,
      shakeT0: NEVER,
      flashT0: NEVER,
      flashColor: "#ffffff",
      swingT0: NEVER,
      swingAmp: 0,
      phaseT0: NEVER,
      phase: Math.random() * 10000,
      blinkT0: NEVER,
      blink2T0: NEVER,
      nextBlink: now + Math.random() * nextBlinkIn(kind === "demented"),
      anchor: { x: pos.x + 0.5, y: pos.y + 0.5 },
      angle: 0,
    };
  }

  /** Put every fly straight into its ring slot around the mouse (room change). */
  private placeFliesNow(state: GameState): void {
    const n = state.flies.length;
    state.flies.forEach((f, i) => {
      const t = this.tracks.get(f);
      if (!t) return;
      t.anchor = { x: state.player.pos.x + 0.5, y: state.player.pos.y + 0.5 };
      t.angle = ringAngle(i, n);
    });
  }

  /** Visual centre of a fly drawn on `cell`, if one is there (to aim lunges at it). */
  private flyAt(state: GameState, cell: Vec2, now: number): Vec2 | null {
    const f = state.flies.find((fl) => fl.hp > 0 && fl.pos.x === cell.x && fl.pos.y === cell.y);
    if (!f) return null;
    const p = this.flyPose(f, state, now);
    return p ? { x: p.x + 0.5, y: p.y + 0.5 } : null;
  }

  /** Slide position (tile top-left) along this turn's path. */
  private pathPos(t: Track, now: number): Vec2 {
    const k = (now - t.moveT0) / ANIM.moveMs;
    const last = t.path[t.path.length - 1];
    if (t.path.length < 2 || k >= 1 || k < 0) return k < 0 && t.path.length > 1 ? t.path[0] : last;
    const s = easeOut(k) * (t.path.length - 1);
    const i = Math.min(t.path.length - 2, Math.floor(s));
    const f = s - i;
    const a = t.path[i];
    const b = t.path[i + 1];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }

  private center(t: Track, now: number): Vec2 {
    const p = this.pathPos(t, now);
    return { x: p.x + 0.5, y: p.y + 0.5 };
  }

  private tintOf(t: Track, now: number): { tint: string | null; tintA: number } {
    const pk = (now - t.phaseT0) / ANIM.phaseFlashMs;
    if (pk >= 0 && pk < 1) return { tint: "#e2231a", tintA: ANIM.flashAlpha * (1 - pk) };
    const fk = (now - t.flashT0) / ANIM.flashMs;
    if (fk >= 0 && fk < 1) return { tint: t.flashColor, tintA: ANIM.flashAlpha * (1 - fk) };
    return { tint: null, tintA: 0 };
  }
}

/** Cells to slide through for a 1- or 2-cell move (an L-move goes via a walkable corner). */
function pathBetween(from: Vec2, to: Vec2, room: Room): Vec2[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) + Math.abs(dy) <= 1) return [{ ...from }, { ...to }];
  if (dx === 0 || dy === 0) {
    return [{ ...from }, { x: from.x + Math.sign(dx), y: from.y + Math.sign(dy) }, { ...to }];
  }
  const viaX = { x: to.x, y: from.y };
  const viaY = { x: from.x, y: to.y };
  return [{ ...from }, isWalkable(room, viaX.x, viaX.y) ? viaX : viaY, { ...to }];
}

/** How long a ghost of this kind lingers. */
function ghostMs(kind: GhostKind): number {
  return kind === "fly" ? ANIM.flyDeathMs : kind === "maggot" ? ANIM.maggotPickMs : ANIM.deathMs;
}

/** Random gap until the next blink (the demented one blinks more often). */
function nextBlinkIn(crazy: boolean): number {
  const lo = crazy ? ANIM.dementedBlinkMinMs : ANIM.blinkMinMs;
  const hi = crazy ? ANIM.dementedBlinkMaxMs : ANIM.blinkMaxMs;
  return lo + Math.random() * (hi - lo);
}

/** Evenly spread ring angles for n flies, starting at the top. */
function ringAngle(i: number, n: number): number {
  return -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
