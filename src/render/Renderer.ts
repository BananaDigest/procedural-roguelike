/**
 * Renderer — draws the current room of a GameState. Reads state only.
 * Viewport is VW×VH tiles (config.VIEW); the room is centered, everything else is fog.
 *
 * Scaling: all drawing below is in LOGICAL px (tile = T). `fit()` sizes the
 * canvas to the browser window and applies ONE transform (scale × devicePixelRatio),
 * so everything — tiles, sprites, effects, HUD — scales together and stays crisp.
 *
 * Draw order (per design doc): fog → floor → shelves → room outline →
 * transitions → traps/poison → food/items → enemies → mouse.
 *
 * Characters (mouse, enemies, boss, teammate, flies) are drawn at the VISUAL
 * pose an Animator gives (slides, lunges, tints, deaths); objects stay static.
 */
import {
  WildMouse,
  Enemy,
  EnemyKind,
  Fly,
  FoodKind,
  GameState,
  ItemKind,
  Tile,
} from "../core/types.ts";
import { BOSS_EYE_COLOR, Palette, paletteForLevel } from "./palette.ts";
import { ANIM, MIN_WINDOW_SCALE, TILE_SIZE, VIEW } from "../config.ts";
import { Animator } from "./Animator.ts";
import type { WildFace, Pose } from "./Animator.ts";

const T = TILE_SIZE; // logical tile size, px
const VW = VIEW.w;
const VH = VIEW.h;

const ENEMY_COLOR: Record<EnemyKind, string> = {
  cashier: "#39b3c6",
  loader: "#e8873b",
  guard: "#2f3e6e",
  boss: "#9b4dca",
};

export interface DrawOpts {
  /** skip drawing the mouse this frame (used for the damage-blink effect). */
  hideMouse?: boolean;
  /** visual poses of characters; without it everyone stands on their cell. */
  anim?: Animator;
  /** frame time (performance.now / rAF timestamp) for the animations. */
  now?: number;
}

/** Standing still on the cell, no effects. */
const STILL = (x: number, y: number): Pose => ({ x, y, scale: 1, alpha: 1, tint: null, tintA: 0, mop: 0, blink: false, breathY: 1 });

/** Where an enemy's feet are (fraction of T from the tile top) — idle breathing scales about it. */
const enemyFoot = (en: Enemy) => (en.kind === "boss" ? 1.0 : 0.86);

/**
 * The white hero mouse — the single source of truth for its look, in-game and
 * on the title screen. Draws inside a square of side `s` whose top-left is
 * (cx, cy); `tail` sways the tail, `blink` closes the eyes to lines.
 */
export function drawMouse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  tail = 0,
  blink = false,
): void {
  const bx = cx + s * 0.15, by = cy + s * 0.15, bs = s * 0.7;
  ctx.fillStyle = "#f5f6f8";
  ctx.strokeStyle = "#5a5f66";
  ctx.lineWidth = 1;
  for (const ex of [bx + 3, bx + bs - 3]) {
    ctx.beginPath();
    ctx.moveTo(ex, by);
    ctx.lineTo(ex - s * 0.11, by - s * 0.14);
    ctx.lineTo(ex + s * 0.11, by - s * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = "#f5f6f8";
  ctx.fillRect(bx, by, bs, bs);
  ctx.strokeRect(bx + 0.5, by + 0.5, bs - 1, bs - 1);
  if (blink) {
    // eyes squeezed to short lines
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = Math.max(1, s * 0.04);
    for (const ex of [cx + s * 0.37, cx + s * 0.63]) {
      ctx.beginPath();
      ctx.moveTo(ex - s * 0.078, cy + s * 0.44);
      ctx.lineTo(ex + s * 0.078, cy + s * 0.44);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = "#111111";
    ctx.beginPath(); ctx.arc(cx + s * 0.37, cy + s * 0.44, s * 0.06, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + s * 0.63, cy + s * 0.44, s * 0.06, 0, 7); ctx.fill();
  }
  ctx.fillStyle = "#ff9ec4";
  ctx.beginPath(); ctx.arc(cx + s * 0.5, cy + s * 0.62, s * 0.07, 0, 7); ctx.fill();
  // whiskers sweeping out from the nose
  ctx.strokeStyle = "#c9ced4";
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.46, cy + s * 0.62); ctx.lineTo(cx + s * 0.28, cy + s * 0.58);
  ctx.moveTo(cx + s * 0.46, cy + s * 0.64); ctx.lineTo(cx + s * 0.29, cy + s * 0.66);
  ctx.moveTo(cx + s * 0.54, cy + s * 0.62); ctx.lineTo(cx + s * 0.72, cy + s * 0.58);
  ctx.moveTo(cx + s * 0.54, cy + s * 0.64); ctx.lineTo(cx + s * 0.71, cy + s * 0.66);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#ff9ec4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx + bs, cy + s * 0.7);
  ctx.quadraticCurveTo(cx + s * 1.02, cy + s * (0.7 + tail), cx + s * (0.98 + tail), cy + s * 0.4);
  ctx.stroke();
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  /** Current window scale (logical px → CSS px). */
  scale = 1;
  /** device px per logical px (for the offscreen tint buffer). */
  private devScale = 1;
  /** small offscreen buffer: a sprite is drawn here, tinted, then blitted back. */
  private fx = document.createElement("canvas");
  private fxCtx: CanvasRenderingContext2D;
  /** catalog icons that animate themselves on one shared rAF loop. */
  private iconAnim = new Animator();
  private icons: { canvas: HTMLCanvasElement; kind: string; box: number }[] = [];
  private iconLoop = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    const fxCtx = this.fx.getContext("2d");
    if (!ctx || !fxCtx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.fxCtx = fxCtx;
    this.fit(VW * T, VH * T);
  }

  /**
   * Scale the canvas to the largest size that fits `availW × availH` CSS px,
   * keeping the aspect ratio. The scale is snapped so a tile covers a whole
   * number of device pixels — no blur, no seams between floor tiles.
   * Call again on window resize, then redraw.
   */
  fit(availW: number, availH: number): number {
    const dpr = window.devicePixelRatio || 1;
    const raw = Math.max(MIN_WINDOW_SCALE, Math.min(availW / (VW * T), availH / (VH * T)));
    const devTile = Math.max(1, Math.floor(T * raw * dpr)); // device px per tile
    const scale = devTile / (T * dpr);

    const c = this.canvas;
    c.width = VW * devTile;
    c.height = VH * devTile;
    c.style.width = `${(VW * devTile) / dpr}px`;
    c.style.height = `${(VH * devTile) / dpr}px`;

    // Resizing the canvas resets context state — set the one transform again.
    this.ctx.setTransform(devTile / T, 0, 0, devTile / T, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.scale = scale;
    this.devScale = devTile / T;
    return scale;
  }

  /** Wipe the canvas to black — used when leaving a run so no frozen room shows behind the menu. */
  clear(): void {
    this.ctx.clearRect(0, 0, VW * T, VH * T);
  }

  draw(state: GameState, opts: DrawOpts = {}): void {
    const p = paletteForLevel(state.level);
    const r = state.room;
    const ox = Math.floor((VW - r.w) / 2);
    const oy = Math.floor((VH - r.h) / 2);
    const px = (x: number) => (ox + x) * T;
    const py = (y: number) => (oy + y) * T;

    const ctx = this.ctx;
    ctx.fillStyle = p.fog;
    ctx.fillRect(0, 0, VW * T, VH * T);

    // floor + shelves (walls stay fog)
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        const t = r.tiles[y * r.w + x];
        if (t === Tile.Floor) this.floorTile(px(x), py(y), p);
        else if (t === Tile.Shelf) this.shelf(px(x), py(y), p);
      }
    }

    // room outline — alternates colour per room in the chain
    ctx.strokeStyle = state.roomIndex % 2 === 0 ? p.b1 : p.b2;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox * T + 1, oy * T + 1, r.w * T - 2, r.h * T - 2);

    for (const e of r.exits) this.exit(px(e.pos.x), py(e.pos.y), e.kind, e.dir);
    for (const t of r.traps) this.trap(px(t.pos.x), py(t.pos.y));
    for (const c of state.clouds) this.poisonCloud(px(c.x), py(c.y), (c as any).active ?? true);
    for (const f of r.food) this.food(px(f.pos.x), py(f.pos.y), f.kind);
    // --- characters, at their visual poses ---
    const anim = opts.anim;
    const now = opts.now ?? 0;
    const poseOf = (obj: object, x: number, y: number) => anim?.pose(obj, now) ?? STILL(x, y);
    const wing = anim ? anim.wingWidth(now) : 0.14;
    const ghosts = anim ? anim.ghostPoses(now) : [];

    // items stay static — except maggots, which wiggle (and shrink away when picked up)
    for (const it of r.items) {
      const wiggle = it.kind === "maggot" && anim ? now + anim.maggotPhase(it) : 0;
      this.item(px(it.pos.x), py(it.pos.y), it.kind, wiggle);
    }
    for (const { ghost, pose } of ghosts) {
      if (ghost.kind === "maggot") this.actor(px(pose.x), py(pose.y), pose, (cx, cy) => this.item(cx, cy, "maggot", now));
    }

    for (const { ghost, pose } of ghosts) {
      if (ghost.kind === "enemy") {
        const en = ghost.obj as Enemy;
        this.actor(px(pose.x), py(pose.y), pose, (cx, cy) => this.enemy(cx, cy, en, 0, false));
      } else if (ghost.kind === "wild") {
        const dm = ghost.obj as WildMouse;
        const face = anim?.wildFace(now);
        this.actor(px(pose.x), py(pose.y), pose, (cx, cy) => this.wildMouse(cx, cy, dm, face, false));
      }
    }

    for (const en of r.enemies) {
      const pose = poseOf(en, en.pos.x, en.pos.y);
      const cx = px(pose.x), cy = py(pose.y);
      this.actor(cx, cy, pose, (x, y) => this.enemy(x, y, en, pose.mop, pose.blink), cy + T * enemyFoot(en));
      this.enemyBar(cx, cy, en); // drawn apart from the sprite → it doesn't breathe
    }
    const dm = r.wildMouse;
    if (dm && dm.hp > 0) {
      const pose = poseOf(dm, dm.pos.x, dm.pos.y);
      const face = anim?.wildFace(now);
      const cx = px(pose.x), cy = py(pose.y);
      this.actor(cx, cy, pose, (x, y) => this.wildMouse(x, y, dm, face, pose.blink));
      // teammate bar: like the enemies' but green, so he never reads as a foe
      this.healthBar(cx + T * 0.15, cy - T * 0.05, T * 0.7, dm.hp, dm.maxHp, "#44dd66");
    }
    if (!opts.hideMouse) {
      const pl = state.player;
      const pose = poseOf(pl, pl.pos.x, pl.pos.y);
      const tail = anim ? anim.tailSway(now) : 0;
      this.actor(px(pose.x), py(pose.y), pose, (x, y) => this.mouse(x, y, tail, pose.blink));
    }
    for (const { ghost, pose } of ghosts) {
      if (ghost.kind === "fly") this.actor(px(pose.x), py(pose.y), pose, (x, y) => this.fly(x, y, ghost.obj as Fly, wing));
    }
    for (const fly of state.flies) {
      const pose = anim?.flyPose(fly, state, now) ?? STILL(fly.pos.x, fly.pos.y);
      this.actor(px(pose.x), py(pose.y), pose, (x, y) => this.fly(x, y, fly, wing));
    }
  }

  /**
   * Draw one character sprite at (cx, cy) with its pose: scale about the
   * tile centre, idle breathing (vertical, about `footY`), fade, and an
   * optional colour tint over its exact silhouette.
   */
  private actor(cx: number, cy: number, pose: Pose, sprite: (cx: number, cy: number) => void, footY = cy + T) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha *= pose.alpha;
    if (pose.scale !== 1) {
      const mx = cx + T / 2, my = cy + T / 2;
      ctx.translate(mx, my);
      ctx.scale(pose.scale, pose.scale);
      ctx.translate(-mx, -my);
    }
    if (pose.breathY !== 1) {
      ctx.translate(0, footY);
      ctx.scale(1, pose.breathY);
      ctx.translate(0, -footY);
    }
    if (pose.tint && pose.tintA > 0) this.tinted(cx, cy, sprite, pose.tint, pose.tintA);
    else sprite(cx, cy);
    ctx.restore();
  }

  /** Render a sprite offscreen, wash it with `color` (source-atop), blit it back. */
  private tinted(cx: number, cy: number, sprite: (cx: number, cy: number) => void, color: string, alpha: number) {
    const s = this.devScale;
    const size = Math.ceil(3 * T * s); // a 3×3-tile window around the sprite's tile
    if (this.fx.width !== size) {
      this.fx.width = size;
      this.fx.height = size;
    }
    const o = this.fxCtx;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = "source-over";
    o.globalAlpha = 1;
    o.clearRect(0, 0, size, size);
    o.setTransform(s, 0, 0, s, -(cx - T) * s, -(cy - T) * s);

    const main = this.ctx;
    this.ctx = o; // sprite functions draw on this.ctx
    try {
      sprite(cx, cy);
    } finally {
      this.ctx = main;
    }

    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = "source-atop";
    o.globalAlpha = alpha;
    o.fillStyle = color;
    o.fillRect(0, 0, size, size);
    o.globalCompositeOperation = "source-over";
    o.globalAlpha = 1;
    main.drawImage(this.fx, cx - T, cy - T, 3 * T, 3 * T);
  }

  /** A closed eye: a thin horizontal line of the eye's own colour. */
  private eyeLine(x: number, y: number, r: number, color: string) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, T * 0.04);
    ctx.beginPath();
    ctx.moveTo(x - r * 1.3, y);
    ctx.lineTo(x + r * 1.3, y);
    ctx.stroke();
  }

  /** Translucent full-screen flash (red = took damage, white = landed a bite). */
  flash(alpha: number, color = "#e2231a"): void {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(alpha, 0.6);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, VW * T, VH * T);
    ctx.restore();
  }

  // --- tiles ---
  private floorTile(cx: number, cy: number, p: Palette) {
    this.ctx.fillStyle = p.floor;
    this.ctx.fillRect(cx, cy, T, T);
    this.ctx.fillStyle = p.dot;
    this.ctx.fillRect(cx + T / 2 - 1, cy + T / 2 - 1, 2, 2);
  }
  private shelf(cx: number, cy: number, p: Palette) {
    this.ctx.fillStyle = p.shelf;
    this.ctx.fillRect(cx + 2, cy + 2, T - 4, T - 4);
    this.ctx.strokeStyle = "rgba(0,0,0,.25)";
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(cx + 2.5, cy + 2.5, T - 5, T - 5);
  }

  /**
   * A catalog icon: a standalone canvas that draws the EXACT in-game sprite
   * (same private methods) and animates itself — idle breathing, blinking,
   * tail sway, buzzing wings, the wild one's twitches. It drives its own
   * shared rAF loop and stops automatically once it leaves the DOM.
   */
  makeIcon(kind: string): HTMLCanvasElement {
    const box = Math.round(T * 1.9); // tile + margin for ears / tail / mop
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width = box * dpr;
    canvas.height = box * dpr;
    canvas.style.width = `${box}px`;
    canvas.style.height = `${box}px`;
    this.drawIconFrame(canvas, kind, box, 0); // first frame, before it's in the DOM
    this.icons.push({ canvas, kind, box });
    this.ensureIconLoop();
    return canvas;
  }

  /** Redraw every live icon each frame; drop ones removed from the DOM; stop when none remain. */
  private ensureIconLoop(): void {
    if (this.iconLoop) return;
    const tick = (now: number) => {
      this.icons = this.icons.filter((ic) => ic.canvas.isConnected);
      for (const ic of this.icons) this.drawIconFrame(ic.canvas, ic.kind, ic.box, now);
      this.iconLoop = this.icons.length ? requestAnimationFrame(tick) : 0;
    };
    this.iconLoop = requestAnimationFrame(tick);
  }

  /** Clear an icon canvas and draw its animated sprite for time `now` (ms). */
  private drawIconFrame(canvas: HTMLCanvasElement, kind: string, box: number, now: number): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box, box);
    this.drawIconOn(ctx, kind, box, now);
  }

  /** Draw `kind` centered into `target` by temporarily borrowing the sprite methods. */
  private drawIconOn(target: CanvasRenderingContext2D, kind: string, box: number, now = 0): void {
    const saved = this.ctx;
    this.ctx = target;
    const off = (box - T) / 2; // tile top-left so the sprite lands centered
    const pos = { x: 0, y: 0 };
    const a = this.iconAnim;
    const blink = this.iconBlink(kind, now);

    // idle breathing — gentle vertical scale about the feet (as in draw())
    const footY = off + T * (kind === "boss" ? 1.0 : 0.9);
    const breathY = 1 + ANIM.breath * (0.5 - 0.5 * Math.cos((2 * Math.PI * now) / ANIM.breathMs));
    target.save();
    target.translate(0, footY);
    target.scale(1, breathY);
    target.translate(0, -footY);
    switch (kind) {
      case "mouse":
        this.mouse(off, off, a.tailSway(now), blink);
        break;
      case "fly":
        this.fly(off, off, { pos, hp: 1, maxHp: 1 }, a.wingWidth(now));
        break;
      case "wild":
        this.wildMouse(off, off, { pos, hp: 1, maxHp: 1 }, a.wildFace(now), blink);
        break;
      case "cashier":
      case "loader":
      case "guard":
      case "boss":
        // hp:1 — enemy() no longer draws its own bar, so the icon stays clean
        this.enemy(off, off, { kind: kind as EnemyKind, pos, hp: 1, maxHp: 1, fast: false }, this.iconMop(kind, now), blink);
        break;
    }
    target.restore();
    this.ctx = saved;
  }

  /** Periodic blink for catalog icons; the wild one blinks more, and kinds desync by phase. */
  private iconBlink(kind: string, now: number): boolean {
    const cycle = kind === "wild" ? 2200 : 3600;
    const phase = kind.length * 500; // so they don't all blink in lockstep (or at t=0)
    return (now + phase) % cycle < ANIM.blinkMs;
  }

  /** Gentle mop swing for the boss icon (radians). */
  private iconMop(kind: string, now: number): number {
    return kind === "boss" ? Math.sin((2 * Math.PI * now) / 1400) * 0.25 : 0;
  }

  private mouse(cx: number, cy: number, tail = 0, blink = false) {
    drawMouse(this.ctx, cx, cy, T, tail, blink);
  }

  // --- enemies ---
  private enemy(cx: number, cy: number, en: Enemy, mop = 0, blink = false) {
    const ctx = this.ctx;
    const kind = en.kind;
    const boss = kind === "boss";
    const w = T * (boss ? 0.7 : 0.5);
    const h = T * (boss ? 1.0 : 0.72);
    const ex = cx + (T - w) / 2;
    const ey = cy + (T - h) / 2;
    ctx.fillStyle = ENEMY_COLOR[kind];
    ctx.beginPath();
    ctx.roundRect(ex, ey, w, h, [T * 0.18, T * 0.18, T * 0.06, T * 0.06]);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // eyes — the Cleaning Lady's are always red (blink lines too)
    const eye = boss ? BOSS_EYE_COLOR : "#111111";
    if (blink) {
      this.eyeLine(cx + T * 0.42, ey + h * 0.26, T * 0.05, eye);
      this.eyeLine(cx + T * 0.58, ey + h * 0.26, T * 0.05, eye);
    } else {
      ctx.fillStyle = eye;
      ctx.beginPath(); ctx.arc(cx + T * 0.42, ey + h * 0.26, T * 0.05, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + T * 0.58, ey + h * 0.26, T * 0.05, 0, 7); ctx.fill();
    }
    if (kind === "cashier") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx + T * 0.33, ey + h * 0.62, T * 0.34, T * 0.14);
    } else if (kind === "loader") {
      // cardboard box on the head with packing tape
      const boxX = cx + T * 0.4, boxY = ey - T * 0.14, boxW = T * 0.2, boxH = T * 0.16;
      ctx.fillStyle = "#7a4a24";
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = "#5c3415"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(boxX + boxW / 2, boxY); ctx.lineTo(boxX + boxW / 2, boxY + boxH);
      ctx.moveTo(boxX, boxY + boxH / 2); ctx.lineTo(boxX + boxW, boxY + boxH / 2);
      ctx.stroke();
    } else if (kind === "guard") {
      // Police badge: a gold five-point star pinned to one side of the chest
      const bcx = cx + T * 0.37, bcy = ey + h * 0.5, br = T * 0.095;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? br : br * 0.45;
        const px2 = bcx + Math.cos(ang) * rr, py2 = bcy + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
      }
      ctx.closePath();
      ctx.fillStyle = "#f2c94c"; ctx.fill();
      ctx.strokeStyle = "#a9801f"; ctx.lineWidth = Math.max(1, T * 0.02); ctx.stroke();
      ctx.fillStyle = "#fff0b8"; // center stud
      ctx.beginPath(); ctx.arc(bcx, bcy, br * 0.22, 0, 7); ctx.fill();
    } else {
      ctx.strokeStyle = "#9aa0a6"; // boss mop — swings by rotating about its top end
      ctx.lineWidth = 2;
      const mx = T * 0.12, my = h - 2;
      const endX = ex + w + mx * Math.cos(mop) - my * Math.sin(mop);
      const endY = ey + 2 + mx * Math.sin(mop) + my * Math.cos(mop);
      ctx.beginPath();
      ctx.moveTo(ex + w, ey + 2);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      // frayed mop head at the far end
      ctx.fillStyle = "#cfd3d7";
      ctx.beginPath(); ctx.ellipse(endX, endY, T * 0.1, T * 0.06, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#b8bcc0"; ctx.lineWidth = 1; ctx.lineCap = "round";
      ctx.beginPath();
      for (const o of [-0.07, -0.025, 0.025, 0.07]) { ctx.moveTo(endX + o * T, endY); ctx.lineTo(endX + o * T, endY + T * 0.12); }
      ctx.stroke(); ctx.lineCap = "butt";
    }
  }

  /** Health bar over an enemy's head (above the loader's box), as wide as the body. */
  private enemyBar(cx: number, cy: number, en: Enemy) {
    const boss = en.kind === "boss";
    const w = T * (boss ? 0.7 : 0.5);
    const h = T * (boss ? 1.0 : 0.72);
    const ex = cx + (T - w) / 2;
    const ey = cy + (T - h) / 2;
    const headTop = en.kind === "loader" ? ey - T * 0.14 : ey;
    this.healthBar(ex, headTop - T * 0.06, w, en.hp, en.maxHp);
  }

  /**
   * Thin HP bar; (x, bottom) is its bottom-left corner. Logical px — the
   * canvas transform scales it with the rest of the game.
   */
  private healthBar(x: number, bottom: number, w: number, hp: number, maxHp: number, color = "#e2231a") {
    if (hp <= 0 || maxHp <= 0) return;
    const ctx = this.ctx;
    const h = T * 0.12; // ≈3.4 px at scale 1
    const y = bottom - h;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.min(1, hp / maxHp), h);
  }

  // --- food (all 10 kinds) ---
  private food(cx: number, cy: number, kind: FoodKind) {
    const ctx = this.ctx;
    const X = cx + T / 2, Y = cy + T / 2;
    switch (kind) {
      case "cheese": {
        // Wedge of Swiss: golden body, baked rind along the crust, shaded holes
        const ax = cx + T * 0.26, ay = cy + T * 0.66; // bottom-left
        const bx = cx + T * 0.74, by = cy + T * 0.66; // bottom-right
        const tx = cx + T * 0.5, ty = cy + T * 0.3;   // top point
        ctx.fillStyle = "#f2c84b";
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(tx, ty); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#c8991f"; ctx.lineWidth = Math.max(1, T * 0.028); ctx.stroke();
        // darker rind along the bottom crust
        ctx.strokeStyle = "#e0a92a"; ctx.lineWidth = Math.max(1.5, T * 0.055); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        // bright top edge highlight
        ctx.strokeStyle = "#ffe9a6"; ctx.lineWidth = Math.max(1, T * 0.03);
        ctx.beginPath(); ctx.moveTo(ax + T * 0.02, ay - T * 0.03); ctx.lineTo(tx, ty + T * 0.02); ctx.stroke();
        ctx.lineCap = "butt";
        // holes with inner shadow
        for (const [hx, hy, r] of [[0.46, 0.55, 0.05], [0.58, 0.49, 0.034], [0.5, 0.44, 0.026]]) {
          ctx.fillStyle = "#d9a92a";
          ctx.beginPath(); ctx.arc(cx + hx * T, cy + hy * T, T * r, 0, 7); ctx.fill();
          ctx.fillStyle = "#c08d1e";
          ctx.beginPath(); ctx.arc(cx + hx * T + T * 0.008, cy + hy * T + T * 0.008, T * r * 0.55, 0, 7); ctx.fill();
        }
        break;
      }
      case "croissant": {
        // Flaky crescent: rolled segments along a curved spine (horns up, fat belly),
        // drawn as overlapping humps with a sticker-outline, baked shading & glaze.
        const bumps: [number, number, number][] = [
          [X - T * 0.27, Y - T * 0.01, T * 0.062], // left horn (tapered)
          [X - T * 0.14, Y + T * 0.07, T * 0.115],
          [X,            Y + T * 0.11, T * 0.13],   // center belly
          [X + T * 0.14, Y + T * 0.07, T * 0.115],
          [X + T * 0.27, Y - T * 0.01, T * 0.062], // right horn (tapered)
        ];
        // dark sticker-outline underneath gives the blob a clean silhouette
        ctx.fillStyle = "#a9761f";
        for (const [mx, my, r] of bumps) { ctx.beginPath(); ctx.arc(mx, my, r + Math.max(1, T * 0.03), 0, 7); ctx.fill(); }
        // golden body
        ctx.fillStyle = "#e3a94a";
        for (const [mx, my, r] of bumps) { ctx.beginPath(); ctx.arc(mx, my, r, 0, 7); ctx.fill(); }
        // soft baked shadow along each segment's underside
        ctx.strokeStyle = "#cf9036"; ctx.lineWidth = Math.max(1.5, T * 0.05); ctx.lineCap = "round";
        for (const [mx, my, r] of bumps) { ctx.beginPath(); ctx.arc(mx, my, r * 0.72, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke(); }
        // glossy highlights on the upper side of each roll
        ctx.fillStyle = "#f6cd82";
        for (const [mx, my, r] of bumps) { ctx.beginPath(); ctx.arc(mx - r * 0.18, my - r * 0.34, r * 0.42, 0, 7); ctx.fill(); }
        // seams where the rolled segments meet
        ctx.strokeStyle = "#b5832f"; ctx.lineWidth = Math.max(1, T * 0.022);
        ctx.beginPath();
        for (let i = 0; i < bumps.length - 1; i++) {
          const mxp = (bumps[i][0] + bumps[i + 1][0]) / 2, myp = (bumps[i][1] + bumps[i + 1][1]) / 2;
          ctx.moveTo(mxp, myp - T * 0.05); ctx.lineTo(mxp, myp + T * 0.055);
        }
        ctx.stroke();
        ctx.lineCap = "butt";
        break;
      }
      case "cookie":
        // Chocolate-chip cookie: baked dough disc, darker rim, shaded chips
        ctx.fillStyle = "#c08a4a"; ctx.beginPath(); ctx.arc(X, Y, T * 0.19, 0, 7); ctx.fill();
        ctx.strokeStyle = "#9c6a33"; ctx.lineWidth = Math.max(1, T * 0.025);
        ctx.beginPath(); ctx.arc(X, Y, T * 0.19, 0, 7); ctx.stroke();
        for (const [dx, dy, r] of [[-0.07, -0.04, 0.03], [0.05, -0.06, 0.025], [0.08, 0.04, 0.03], [-0.03, 0.08, 0.026], [-0.09, 0.04, 0.02], [0.0, -0.01, 0.022]]) {
          ctx.fillStyle = "#4a2d17";
          ctx.beginPath(); ctx.arc(X + dx * T, Y + dy * T, T * r, 0, 7); ctx.fill();
          ctx.fillStyle = "#6b4426"; // tiny glint on each chip
          ctx.beginPath(); ctx.arc(X + dx * T - T * 0.008, Y + dy * T - T * 0.008, T * r * 0.4, 0, 7); ctx.fill();
        }
        break;
      case "bread": {
        // Crusty loaf: domed top, golden crust outline, diagonal score slashes
        const lx = cx + T * 0.24, ly = cy + T * 0.4, lw = T * 0.52, lh = T * 0.26;
        ctx.fillStyle = "#c9975b";
        ctx.beginPath(); ctx.roundRect(lx, ly, lw, lh, [T * 0.15, T * 0.15, T * 0.08, T * 0.08]); ctx.fill();
        ctx.strokeStyle = "#9c6f3a"; ctx.lineWidth = Math.max(1, T * 0.03); ctx.stroke();
        // soft top highlight
        ctx.strokeStyle = "#e4bd84"; ctx.lineWidth = Math.max(1, T * 0.035); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(lx + T * 0.06, ly + T * 0.06); ctx.quadraticCurveTo(X, ly - T * 0.01, lx + lw - T * 0.06, ly + T * 0.06); ctx.stroke();
        // score slashes
        ctx.strokeStyle = "#8a5f30"; ctx.lineWidth = Math.max(1, T * 0.028);
        ctx.beginPath();
        for (const sx of [0.41, 0.52, 0.63]) { ctx.moveTo(cx + sx * T, ly + T * 0.07); ctx.lineTo(cx + (sx - 0.05) * T, ly + lh - T * 0.06); }
        ctx.stroke();
        ctx.lineCap = "butt";
        break;
      }
      case "sausage": {
        // Plump link: glossy pink body, pinched ends, marbled fat specks
        const sx = cx + T * 0.24, sy = cy + T * 0.42, sw = T * 0.52, sh = T * 0.2;
        ctx.fillStyle = "#d9798a";
        ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, sh / 2); ctx.fill();
        ctx.strokeStyle = "#b45a6b"; ctx.lineWidth = Math.max(1, T * 0.025); ctx.stroke();
        // top gloss highlight
        ctx.strokeStyle = "#f0b8c3"; ctx.lineWidth = Math.max(1, T * 0.035); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(sx + T * 0.07, sy + T * 0.05); ctx.lineTo(sx + sw - T * 0.07, sy + T * 0.05); ctx.stroke();
        // pinched ends
        ctx.strokeStyle = "#b45a6b"; ctx.lineWidth = Math.max(1, T * 0.03);
        ctx.beginPath();
        ctx.moveTo(sx + T * 0.03, sy + T * 0.03); ctx.lineTo(sx + T * 0.03, sy + sh - T * 0.03);
        ctx.moveTo(sx + sw - T * 0.03, sy + T * 0.03); ctx.lineTo(sx + sw - T * 0.03, sy + sh - T * 0.03);
        ctx.stroke();
        ctx.lineCap = "butt";
        ctx.fillStyle = "#f5eef0"; // white fat specks
        for (const d of [[0.37, 0.5], [0.5, 0.53], [0.63, 0.49]]) {
          ctx.beginPath(); ctx.arc(cx + d[0] * T, cy + d[1] * T, T * 0.022, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case "cake": {
        // Layered slice (side view): sponge wedge, cream stripe, pink frosting crown, cherry
        ctx.beginPath();
        ctx.moveTo(cx + 0.3 * T, cy + 0.34 * T); // back-top
        ctx.lineTo(cx + 0.3 * T, cy + 0.7 * T);  // back-bottom
        ctx.lineTo(cx + 0.74 * T, cy + 0.6 * T); // front tip
        ctx.closePath();
        ctx.fillStyle = "#f3d9b8"; ctx.fill();
        ctx.strokeStyle = "#d8b483"; ctx.lineWidth = Math.max(1, T * 0.025); ctx.stroke();
        // cream filling stripe
        ctx.strokeStyle = "#fff4e8"; ctx.lineWidth = Math.max(1.5, T * 0.045); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(cx + 0.31 * T, cy + 0.52 * T); ctx.lineTo(cx + 0.7 * T, cy + 0.56 * T); ctx.stroke();
        // frosting along the top slope
        ctx.strokeStyle = "#f6a5c0"; ctx.lineWidth = Math.max(1.5, T * 0.05);
        ctx.beginPath(); ctx.moveTo(cx + 0.3 * T, cy + 0.34 * T); ctx.lineTo(cx + 0.74 * T, cy + 0.6 * T); ctx.stroke();
        ctx.lineCap = "butt";
        // cherry on top
        ctx.fillStyle = "#e2231a"; ctx.beginPath(); ctx.arc(cx + 0.36 * T, cy + 0.33 * T, T * 0.05, 0, 7); ctx.fill();
        ctx.fillStyle = "#ff6a5e"; ctx.beginPath(); ctx.arc(cx + 0.345 * T, cy + 0.315 * T, T * 0.017, 0, 7); ctx.fill();
        break;
      }
      case "sushi": {
        // Nigiri: rice bed, salmon fillet with marbling, nori band around the middle
        const rx = cx + 0.26 * T, ry = cy + 0.46 * T, rw = T * 0.48, rh = T * 0.2;
        ctx.fillStyle = "#f5f5f0"; ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, T * 0.1); ctx.fill();
        ctx.strokeStyle = "#dcdcd2"; ctx.lineWidth = 1; ctx.stroke();
        // salmon slice draped on top
        ctx.fillStyle = "#ff8c66"; ctx.beginPath(); ctx.roundRect(rx, cy + 0.39 * T, rw, T * 0.13, [T * 0.1, T * 0.1, T * 0.02, T * 0.02]); ctx.fill();
        // salmon marbling
        ctx.strokeStyle = "#ffd0bd"; ctx.lineWidth = Math.max(1, T * 0.025); ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(rx + T * 0.07, cy + 0.45 * T); ctx.lineTo(rx + T * 0.17, cy + 0.43 * T);
        ctx.moveTo(rx + T * 0.24, cy + 0.46 * T); ctx.lineTo(rx + T * 0.35, cy + 0.44 * T);
        ctx.stroke(); ctx.lineCap = "butt";
        // nori wrap
        ctx.fillStyle = "#2f4a3a"; ctx.fillRect(X - T * 0.05, cy + 0.39 * T, T * 0.1, T * 0.27);
        break;
      }
      case "shrimp": {
        // Cooked prawn: hooked pink-coral body, segmented shell bands, fan tail & antennae
        const tailX = X + T * 0.09, tailY = Y + T * 0.17;

        // Antennae (curved whiskers sweeping back over the head)
        ctx.strokeStyle = "#ff8066";
        ctx.lineWidth = Math.max(1, T * 0.035);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(X + T * 0.14, Y - T * 0.16);
        ctx.quadraticCurveTo(X + T * 0.38, Y - T * 0.28, X + T * 0.32, Y + T * 0.04);
        ctx.moveTo(X + T * 0.12, Y - T * 0.18);
        ctx.quadraticCurveTo(X + T * 0.32, Y - T * 0.38, X + T * 0.38, Y - T * 0.08);
        ctx.stroke();

        // Tail fan flukes (telson & uropods)
        ctx.fillStyle = "#c93318";
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(tailX + T * 0.13, tailY + T * 0.09);
        ctx.lineTo(tailX + T * 0.05, tailY + T * 0.14);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#e63e20";
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(tailX + T * 0.16, tailY + T * 0.03);
        ctx.lineTo(tailX + T * 0.14, tailY + T * 0.11);
        ctx.closePath();
        ctx.fill();

        // Swimmerets (little legs along inner belly)
        ctx.strokeStyle = "#ff7b61";
        ctx.lineWidth = Math.max(1, T * 0.035);
        ctx.beginPath();
        ctx.moveTo(X - T * 0.04, Y + T * 0.04); ctx.lineTo(X - T * 0.01, Y + T * 0.09);
        ctx.moveTo(X + T * 0.01, Y - T * 0.03); ctx.lineTo(X + T * 0.05, Y - T * 0.01);
        ctx.moveTo(X + T * 0.05, Y - T * 0.09); ctx.lineTo(X + T * 0.1, Y - T * 0.13);
        ctx.stroke();

        // Main curled body
        ctx.beginPath();
        ctx.moveTo(X + T * 0.22, Y - T * 0.15); // rostrum tip
        ctx.bezierCurveTo(X + T * 0.18, Y - T * 0.25, X + T * 0.04, Y - T * 0.26, X - T * 0.12, Y - T * 0.2);
        ctx.bezierCurveTo(X - T * 0.28, Y - T * 0.12, X - T * 0.28, Y + T * 0.14, X - T * 0.1, Y + T * 0.22);
        ctx.bezierCurveTo(X - T * 0.02, Y + T * 0.24, X + T * 0.06, Y + T * 0.21, tailX, tailY);
        ctx.bezierCurveTo(X - T * 0.02, Y + T * 0.14, X - T * 0.12, Y + T * 0.08, X - T * 0.12, Y - T * 0.04);
        ctx.bezierCurveTo(X - T * 0.12, Y - T * 0.12, X + T * 0.02, Y - T * 0.14, X + T * 0.13, Y - T * 0.08);
        ctx.closePath();

        ctx.fillStyle = "#ff6243";
        ctx.fill();
        ctx.strokeStyle = "#c93318";
        ctx.lineWidth = Math.max(1, T * 0.032);
        ctx.stroke();

        // Segment stripes across the back shell
        ctx.strokeStyle = "#ffe6df";
        ctx.lineWidth = Math.max(1, T * 0.045);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(X + T * 0.03, Y - T * 0.24); ctx.lineTo(X + T * 0.07, Y - T * 0.11);
        ctx.moveTo(X - T * 0.15, Y - T * 0.18); ctx.lineTo(X - T * 0.08, Y - T * 0.06);
        ctx.moveTo(X - T * 0.22, Y - T * 0.01); ctx.lineTo(X - T * 0.12, Y + T * 0.02);
        ctx.moveTo(X - T * 0.17, Y + T * 0.15); ctx.lineTo(X - T * 0.06, Y + T * 0.15);
        ctx.stroke();
        ctx.lineCap = "butt";

        // Eye dot
        ctx.fillStyle = "#1a1614";
        ctx.beginPath();
        ctx.arc(X + T * 0.14, Y - T * 0.16, Math.max(1.2, T * 0.035), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "steak": {
        // Grilled cut: seared body, pale fat rim, rosy centre, grill marks & bone nub
        const stx = cx + 0.24 * T, sty = cy + 0.35 * T, stw = T * 0.5, sth = T * 0.32;
        ctx.fillStyle = "#8a4a33";
        ctx.beginPath(); ctx.roundRect(stx, sty, stw, sth, T * 0.13); ctx.fill();
        ctx.strokeStyle = "#e3c39f"; ctx.lineWidth = Math.max(1.5, T * 0.045); ctx.stroke(); // fat rim
        // rosy inner doneness
        ctx.fillStyle = "#b35b45"; ctx.beginPath(); ctx.ellipse(X + T * 0.02, Y, T * 0.15, T * 0.09, 0, 0, 7); ctx.fill();
        // diagonal grill marks
        ctx.strokeStyle = "#4e2a1d"; ctx.lineWidth = Math.max(1, T * 0.026); ctx.lineCap = "round";
        ctx.beginPath();
        for (const o of [-0.1, 0, 0.1]) { ctx.moveTo(X + o * T - T * 0.05, sty + T * 0.06); ctx.lineTo(X + o * T + T * 0.05, sty + sth - T * 0.06); }
        ctx.stroke(); ctx.lineCap = "butt";
        // bone nub
        ctx.fillStyle = "#f3ead8"; ctx.beginPath(); ctx.arc(stx + T * 0.03, Y, T * 0.045, 0, 7); ctx.fill();
        break;
      }
      case "chocolate": {
        // Chocolate bar: dark slab with a 3×2 grid of embossed, glossy squares
        const bx = cx + 0.28 * T, by = cy + 0.32 * T, bw = T * 0.44, bh = T * 0.4;
        ctx.fillStyle = "#3a2416"; // base/shadow slab shows between squares
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, T * 0.03); ctx.fill();
        const cols = 3, rows = 2, gap = T * 0.022;
        const cw = (bw - gap * (cols + 1)) / cols, ch = (bh - gap * (rows + 1)) / rows;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const qx = bx + gap + i * (cw + gap), qy = by + gap + j * (ch + gap);
          ctx.fillStyle = "#5a3a24"; ctx.beginPath(); ctx.roundRect(qx, qy, cw, ch, T * 0.02); ctx.fill();
          // top-left bevel highlight
          ctx.fillStyle = "#71492d";
          ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx + cw, qy); ctx.lineTo(qx, qy + ch); ctx.closePath(); ctx.fill();
          // inner square face
          ctx.fillStyle = "#5a3a24"; ctx.beginPath(); ctx.roundRect(qx + cw * 0.18, qy + ch * 0.18, cw * 0.72, ch * 0.72, T * 0.015); ctx.fill();
        }
        break;
      }
    }
  }

  // --- items ---
  /** `wiggle` (ms, maggot only): time + its own phase — a wave runs along its body. */
  private item(cx: number, cy: number, kind: ItemKind, wiggle = 0) {
    const ctx = this.ctx;
    const X = cx + T / 2, Y = cy + T / 2;
    if (kind === "toothpick") {
      ctx.strokeStyle = "#b98a5a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + T * 0.3, cy + T * 0.7); ctx.lineTo(cx + T * 0.7, cy + T * 0.3); ctx.stroke();
    } else if (kind === "maggot") {
      // 4 segments, tail → head; each lags the next by a phase step → a crawling wave
      const segs = 4;
      const w = (2 * Math.PI * wiggle) / ANIM.maggotWiggleMs;
      ctx.strokeStyle = "#5a5240";
      ctx.lineWidth = 1;
      let hx = X, hy = Y;
      for (let i = 0; i < segs; i++) {
        const sx = X + T * (0.15 - 0.1 * i);
        const sy = Y + T * ANIM.maggotWiggle * Math.sin(w - i * 0.9);
        const r = T * (0.075 + 0.012 * i);
        ctx.fillStyle = i % 2 === 0 ? "#ede7d5" : "#e2dbc6";
        ctx.beginPath();
        ctx.ellipse(sx, sy, r * 1.1, r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        hx = sx; hy = sy;
      }
      ctx.fillStyle = "#665742"; // head dot on the last (front) segment
      ctx.beginPath();
      ctx.arc(hx - T * 0.04, hy + 0.5, 1.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "energy") {
      ctx.strokeStyle = "#ffd84d"; ctx.lineWidth = 2; ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(cx + T * 0.55, cy + T * 0.28); ctx.lineTo(cx + T * 0.4, cy + T * 0.52);
      ctx.lineTo(cx + T * 0.55, cy + T * 0.52); ctx.lineTo(cx + T * 0.42, cy + T * 0.72);
      ctx.stroke();
    } else {
      // bigcheese (goal) — bigger golden wedge with holes
      ctx.fillStyle = "#f2b705";
      ctx.beginPath(); ctx.moveTo(cx + T * 0.22, cy + T * 0.7); ctx.lineTo(cx + T * 0.78, cy + T * 0.7); ctx.lineTo(cx + T * 0.5, cy + T * 0.24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#b5850a";
      ctx.beginPath(); ctx.arc(X - 4, Y + 6, 2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(X + 4, Y + 3, 2, 0, 7); ctx.fill();
    }
  }

  // --- hazards & exits ---
  private trap(cx: number, cy: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "#7a5230";
    ctx.fillRect(cx + T * 0.28, cy + T * 0.28, T * 0.44, T * 0.44);
    ctx.fillStyle = "#e2231a";
    ctx.beginPath(); ctx.moveTo(cx + T * 0.5, cy + T * 0.34); ctx.lineTo(cx + T * 0.64, cy + T * 0.62); ctx.lineTo(cx + T * 0.36, cy + T * 0.62); ctx.closePath(); ctx.fill();
  }

  private poisonCloud(cx: number, cy: number, active = true) {
    const ctx = this.ctx;
    const X = cx + T / 2;
    const Y = cy + T / 2;
    if (!active) {
      // Telegraph / warning (turn 0-1): arsenic dust cloud settling
      ctx.fillStyle = "rgba(180, 225, 70, 0.26)";
      ctx.beginPath();
      ctx.arc(X, Y, T * 0.46, 0, Math.PI * 2);
      ctx.fill();

      // Faint warning perimeter
      ctx.strokeStyle = "rgba(190, 235, 60, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(X, Y, T * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    // Active toxic cloud (turn 2+): thick billowing poisonous green mist
    ctx.fillStyle = "rgba(50, 190, 70, 0.38)";
    ctx.beginPath();
    ctx.arc(X, Y, T * 0.52, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(70, 210, 80, 0.52)";
    ctx.beginPath();
    ctx.arc(X, Y, T * 0.36, 0, Math.PI * 2);
    ctx.fill();

    // Toxic droplet highlight
    ctx.fillStyle = "rgba(150, 245, 90, 0.4)";
    ctx.beginPath();
    ctx.arc(X - T * 0.08, Y - T * 0.08, T * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- fly companion (weapon: "муха") ---
  private fly(cx: number, cy: number, fly: Fly, wing = 0.14) {
    const ctx = this.ctx;
    const X = cx + T / 2;
    const Y = cy + T / 2;

    // Translucent buzzing wings
    ctx.fillStyle = "rgba(180, 225, 255, 0.75)";
    ctx.strokeStyle = "rgba(100, 150, 200, 0.8)";
    ctx.lineWidth = 1;

    // Left wing
    ctx.beginPath();
    ctx.ellipse(X - T * 0.1, Y - T * 0.12, T * wing, T * 0.07, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Right wing
    ctx.beginPath();
    ctx.ellipse(X + T * 0.1, Y - T * 0.12, T * wing, T * 0.07, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Fly body (dark oval)
    ctx.fillStyle = "#1e2024";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(X, Y, T * 0.14, T * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Red compound eyes
    ctx.fillStyle = "#e2231a";
    ctx.beginPath(); ctx.arc(X - 2.5, Y - 2, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(X + 2.5, Y - 2, 1.2, 0, Math.PI * 2); ctx.fill();

    // Health bar if damaged
    if (fly.hp < fly.maxHp) {
      const bw = T * 0.4;
      const bx = X - bw / 2;
      const by = Y - T * 0.28;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
      ctx.fillStyle = "#2ecc71";
      ctx.fillRect(bx, by, bw * (fly.hp / fly.maxHp), 2);
    }
  }

  private exit(cx: number, cy: number, kind: "nora" | "luk", dir: "fwd" | "back") {
    const ctx = this.ctx;
    const X = cx + T / 2, Y = cy + T / 2;
    if (kind === "luk") {
      // manhole — plain, no direction highlight
      ctx.fillStyle = "#3a3f45";
      ctx.beginPath(); ctx.arc(X, Y, T * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#6b7177"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(X, Y, T * 0.27, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(X, Y, T * 0.14, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    // нора — highlighted by direction: fwd (deeper, toward goal) = gold,
    // back (toward start) = blue; arrow ▼ in / ▲ out.
    const accent = dir === "fwd" ? "#f2c84b" : "#5aa0ff";
    ctx.fillStyle = "#000000";
    ctx.beginPath(); ctx.ellipse(X, Y, T * 0.34, T * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    if (dir === "fwd") {
      ctx.moveTo(X - 3.2, Y - 2.4); ctx.lineTo(X + 3.2, Y - 2.4); ctx.lineTo(X, Y + 2.8);
    } else {
      ctx.moveTo(X - 3.2, Y + 2.4); ctx.lineTo(X + 3.2, Y + 2.4); ctx.lineTo(X, Y - 2.8);
    }
    ctx.closePath();
    ctx.fill();
  }

  // --- wild teammate ("Дика миша") ---
  private wildMouse(cx: number, cy: number, _mouse: WildMouse, face?: WildFace, blink = false) {
    const ctx = this.ctx;
    const hj = (i: number) => face?.hair[i] ?? { x: 0, y: 0 };
    const pu = face?.pupil ?? { x: 0, y: 0 };
    const bx = cx + T * 0.15;
    const by = cy + T * 0.15;
    const bs = T * 0.7;

    ctx.save();

    // 1. Sticking tufts of hair (spiky wild hairs)
    ctx.strokeStyle = "#3a200e";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // tips tremble (face.hair jitter), roots stay put
    ctx.moveTo(bx + bs * 0.35, by);
    ctx.lineTo(bx + bs * 0.3 + T * hj(0).x, by - T * 0.15 + T * hj(0).y);
    ctx.moveTo(bx + bs * 0.5, by);
    ctx.lineTo(bx + bs * 0.52 + T * hj(1).x, by - T * 0.18 + T * hj(1).y);
    ctx.moveTo(bx + bs * 0.65, by);
    ctx.lineTo(bx + bs * 0.75 + T * hj(2).x, by - T * 0.13 + T * hj(2).y);
    ctx.moveTo(bx, by + bs * 0.4);
    ctx.lineTo(bx - T * 0.1 + T * hj(3).x, by + bs * 0.35 + T * hj(3).y);
    ctx.stroke();

    // 2. Ears
    // Left ear (intact)
    ctx.fillStyle = "#8a5832";
    ctx.strokeStyle = "#4a2c14";
    ctx.lineWidth = 1;
    const lx = bx + 3;
    ctx.beginPath();
    ctx.moveTo(lx, by);
    ctx.lineTo(lx - T * 0.11, by - T * 0.14);
    ctx.lineTo(lx + T * 0.11, by - T * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right ear (bitten notch!)
    const rx = bx + bs - 3;
    ctx.beginPath();
    ctx.moveTo(rx, by);
    ctx.lineTo(rx + T * 0.11, by - T * 0.12);
    ctx.lineTo(rx + T * 0.04, by - T * 0.08); // bitten notch inward
    ctx.lineTo(rx + T * 0.01, by - T * 0.15); // jagged edge
    ctx.lineTo(rx - T * 0.08, by - T * 0.10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner ear
    ctx.fillStyle = "#d47a6a";
    ctx.beginPath();
    ctx.arc(lx, by - T * 0.05, T * 0.04, 0, Math.PI * 2);
    ctx.fill();

    // 3. Body (Brown mouse)
    ctx.fillStyle = "#8a5832";
    ctx.fillRect(bx, by, bs, bs);
    ctx.strokeStyle = "#4a2c14";
    ctx.strokeRect(bx + 0.5, by + 0.5, bs - 1, bs - 1);

    // 4. Tail (crooked / twitchy)
    ctx.strokeStyle = "#d48a60";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + bs, cy + T * 0.7);
    ctx.lineTo(cx + T * 0.95, cy + T * 0.75);
    ctx.lineTo(cx + T * 1.05, cy + T * 0.65);
    ctx.lineTo(cx + T * 1.0, cy + T * 0.5);
    ctx.stroke();

    // 5. Enlarged crazy / asymmetric eyes (closed → thin lines, no pupils)
    const leyex = cx + T * 0.35;
    const leyey = cy + T * 0.42;
    const reyex = cx + T * 0.65;
    const reyey = cy + T * 0.40;
    if (blink) {
      this.eyeLine(leyex, leyey, T * 0.1, "#221105");
      this.eyeLine(reyex, reyey, T * 0.07, "#221105");
    } else {
      // Left eye (huge sclera)
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#221105";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(leyex, leyey, T * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Left pupil (derpy, looking up-left) — wanders around (face.pupil)
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(leyex - T * 0.04 + T * pu.x, leyey - T * 0.03 + T * pu.y, T * 0.045, 0, Math.PI * 2);
      ctx.fill();

      // Right eye (smaller, looking down-right)
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(reyex, reyey, T * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Right pupil — wanders a different way, so the eyes never agree
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(reyex + T * 0.02 - T * pu.y * 0.8, reyey + T * 0.03 + T * pu.x * 0.8, T * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Snout / Nose
    ctx.fillStyle = "#e07a6a";
    ctx.beginPath();
    ctx.arc(cx + T * 0.5, cy + T * 0.60, T * 0.06, 0, Math.PI * 2);
    ctx.fill();

    // 7. Single white tooth sticking out
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 0.8;
    const toothX = cx + T * 0.46;
    const toothY = cy + T * 0.65;
    ctx.beginPath();
    ctx.rect(toothX, toothY, T * 0.08, T * 0.12);
    ctx.fill();
    ctx.stroke();

    // 8. Drool drop hanging from mouth
    ctx.fillStyle = "rgba(100, 210, 255, 0.85)";
    ctx.strokeStyle = "rgba(40, 160, 230, 0.9)";
    ctx.lineWidth = 0.8;
    const droolX = cx + T * 0.56;
    const droolY = cy + T * 0.67;
    // cycle: stretches down for 70 %, then the drop breaks off, falls and fades
    const ph = face?.drool ?? 0.4;
    if (ph < 0.7) {
      const len = T * (0.04 + (ANIM.droolLen - 0.04) * (ph / 0.7));
      ctx.beginPath();
      ctx.moveTo(droolX, droolY);
      ctx.lineTo(droolX, droolY + len);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(droolX, droolY + len + T * 0.01, T * 0.04, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const k = (ph - 0.7) / 0.3;
      ctx.globalAlpha *= 1 - k;
      ctx.beginPath();
      ctx.arc(droolX, droolY + T * (ANIM.droolLen + 0.25 * k), T * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }

    // (health bar is drawn by draw(), so it follows the pose but isn't tinted)

    ctx.restore();
  }

}

export { T as TILE_SIZE, VW as VIEW_W, VH as VIEW_H };
