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
 */
import {
  Enemy,
  EnemyKind,
  Fly,
  FoodKind,
  GameState,
  ItemKind,
  Tile,
} from "../core/types.ts";
import { Palette, paletteForLevel } from "./palette.ts";
import { MIN_WINDOW_SCALE, TILE_SIZE, VIEW } from "../config.ts";

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
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  /** Current window scale (logical px → CSS px). */
  scale = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
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
    return scale;
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
    for (const c of state.clouds) this.poisonCloud(px(c.x), py(c.y));
    for (const f of r.food) this.food(px(f.pos.x), py(f.pos.y), f.kind);
    for (const it of r.items) this.item(px(it.pos.x), py(it.pos.y), it.kind);
    for (const en of r.enemies) this.enemy(px(en.pos.x), py(en.pos.y), en);
    if (!opts.hideMouse) this.mouse(px(state.player.pos.x), py(state.player.pos.y));
    for (const fly of state.flies) this.fly(px(fly.pos.x), py(fly.pos.y), fly);
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

  // --- hero ---
  private mouse(cx: number, cy: number) {
    const ctx = this.ctx;
    const bx = cx + T * 0.15, by = cy + T * 0.15, bs = T * 0.7;
    ctx.fillStyle = "#f5f6f8";
    ctx.strokeStyle = "#5a5f66";
    ctx.lineWidth = 1;
    for (const ex of [bx + 3, bx + bs - 3]) {
      ctx.beginPath();
      ctx.moveTo(ex, by);
      ctx.lineTo(ex - T * 0.11, by - T * 0.14);
      ctx.lineTo(ex + T * 0.11, by - T * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "#f5f6f8";
    ctx.fillRect(bx, by, bs, bs);
    ctx.strokeRect(bx + 0.5, by + 0.5, bs - 1, bs - 1);
    ctx.fillStyle = "#111111";
    ctx.beginPath(); ctx.arc(cx + T * 0.37, cy + T * 0.44, T * 0.06, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + T * 0.63, cy + T * 0.44, T * 0.06, 0, 7); ctx.fill();
    ctx.fillStyle = "#ff9ec4";
    ctx.beginPath(); ctx.arc(cx + T * 0.5, cy + T * 0.62, T * 0.07, 0, 7); ctx.fill();
    ctx.strokeStyle = "#ff9ec4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + bs, cy + T * 0.7);
    ctx.quadraticCurveTo(cx + T * 1.02, cy + T * 0.7, cx + T * 0.98, cy + T * 0.4);
    ctx.stroke();
  }

  // --- enemies ---
  private enemy(cx: number, cy: number, en: Enemy) {
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
    ctx.fillStyle = "#111111";
    ctx.beginPath(); ctx.arc(cx + T * 0.42, ey + h * 0.26, T * 0.05, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + T * 0.58, ey + h * 0.26, T * 0.05, 0, 7); ctx.fill();
    if (kind === "cashier") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx + T * 0.33, ey + h * 0.62, T * 0.34, T * 0.14);
    } else if (kind === "loader") {
      ctx.fillStyle = "#7a4a24";
      ctx.fillRect(cx + T * 0.4, ey - T * 0.14, T * 0.2, T * 0.16);
    } else if (kind === "guard") {
      ctx.fillStyle = "#d9dde1";
      ctx.beginPath(); ctx.arc(ex + w, cy + T * 0.5, T * 0.05, 0, 7); ctx.fill();
    } else {
      ctx.strokeStyle = "#9aa0a6"; // boss mop
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex + w, ey + 2);
      ctx.lineTo(ex + w + T * 0.12, ey + h);
      ctx.stroke();
    }

    // health bar over the head (above the loader's box), as wide as the body
    const headTop = kind === "loader" ? ey - T * 0.14 : ey;
    this.healthBar(ex, headTop - T * 0.06, w, en.hp, en.maxHp);
  }

  /**
   * Thin HP bar; (x, bottom) is its bottom-left corner. Logical px — the
   * canvas transform scales it with the rest of the game.
   */
  private healthBar(x: number, bottom: number, w: number, hp: number, maxHp: number) {
    if (hp <= 0 || maxHp <= 0) return;
    const ctx = this.ctx;
    const h = T * 0.12; // ≈3.4 px at scale 1
    const y = bottom - h;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#e2231a";
    ctx.fillRect(x, y, w * Math.min(1, hp / maxHp), h);
  }

  // --- food (all 10 kinds) ---
  private food(cx: number, cy: number, kind: FoodKind) {
    const ctx = this.ctx;
    const X = cx + T / 2, Y = cy + T / 2;
    switch (kind) {
      case "cheese":
        ctx.fillStyle = "#f2c84b";
        ctx.beginPath(); ctx.moveTo(cx + T * 0.28, cy + T * 0.66); ctx.lineTo(cx + T * 0.72, cy + T * 0.66); ctx.lineTo(cx + T * 0.5, cy + T * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#d9a92a";
        ctx.beginPath(); ctx.arc(X - 2, Y + 3, 1.8, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(X + 3, Y + 1, 1.5, 0, 7); ctx.fill();
        break;
      case "croissant": {
        // filled crescent: fat in the middle, tapering to pointed horns
        const lx = cx + 0.27 * T, rx = cx + 0.73 * T, hy = cy + 0.4 * T;
        ctx.beginPath();
        ctx.moveTo(lx, hy);
        ctx.quadraticCurveTo(cx + 0.5 * T, cy + 0.82 * T, rx, hy); // outer belly
        ctx.quadraticCurveTo(cx + 0.5 * T, cy + 0.52 * T, lx, hy); // inner curve
        ctx.closePath();
        ctx.fillStyle = "#e3a94a";
        ctx.fill();
        ctx.strokeStyle = "#b5832f";
        ctx.lineWidth = 1;
        ctx.stroke();
        // segment ridges
        ctx.beginPath();
        for (const sx of [0.43, 0.5, 0.57]) {
          ctx.moveTo(cx + sx * T, cy + 0.51 * T);
          ctx.lineTo(cx + sx * T, cy + 0.6 * T);
        }
        ctx.stroke();
        break;
      }
      case "cookie":
        ctx.fillStyle = "#b07a3f"; ctx.beginPath(); ctx.arc(X, Y, T * 0.18, 0, 7); ctx.fill();
        ctx.fillStyle = "#5a3a1a";
        for (const d of [[-3, -2], [3, -1], [-1, 3]]) { ctx.beginPath(); ctx.arc(X + d[0], Y + d[1], 1.4, 0, 7); ctx.fill(); }
        break;
      case "bread":
        ctx.fillStyle = "#c9975b"; ctx.beginPath(); ctx.roundRect(cx + T * 0.28, cy + T * 0.36, T * 0.44, T * 0.3, T * 0.12); ctx.fill();
        break;
      case "sausage":
        ctx.fillStyle = "#e38a9a"; // pink sausage
        ctx.beginPath(); ctx.roundRect(cx + T * 0.26, cy + T * 0.42, T * 0.48, T * 0.18, T * 0.09); ctx.fill();
        ctx.fillStyle = "#f5eef0"; // white fat specks
        for (const d of [[0.37, 0.5], [0.5, 0.52], [0.63, 0.49]]) {
          ctx.beginPath(); ctx.arc(cx + d[0] * T, cy + d[1] * T, T * 0.025, 0, Math.PI * 2); ctx.fill();
        }
        break;
      case "cake":
        ctx.fillStyle = "#f3d9b8"; ctx.beginPath(); ctx.moveTo(cx + T * 0.3, cy + T * 0.68); ctx.lineTo(cx + T * 0.7, cy + T * 0.68); ctx.lineTo(cx + T * 0.5, cy + T * 0.34); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#e2231a"; ctx.beginPath(); ctx.arc(cx + T * 0.5, cy + T * 0.4, 2.2, 0, 7); ctx.fill();
        break;
      case "sushi":
        ctx.fillStyle = "#f5f5f0"; ctx.beginPath(); ctx.roundRect(cx + T * 0.28, cy + T * 0.44, T * 0.44, T * 0.22, T * 0.1); ctx.fill();
        ctx.fillStyle = "#ff8c66"; ctx.beginPath(); ctx.roundRect(cx + T * 0.28, cy + T * 0.4, T * 0.44, T * 0.1, [T * 0.1, T * 0.1, 0, 0]); ctx.fill();
        break;
      case "shrimp":
        ctx.strokeStyle = "#ff8a5c"; ctx.lineWidth = T * 0.08; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(X, Y, T * 0.17, Math.PI * 0.2, Math.PI * 1.4); ctx.stroke();
        ctx.lineCap = "butt";
        break;
      case "steak":
        ctx.fillStyle = "#6e3b2a"; ctx.beginPath(); ctx.roundRect(cx + T * 0.26, cy + T * 0.35, T * 0.48, T * 0.32, T * 0.1); ctx.fill();
        ctx.fillStyle = "#d98a7a"; ctx.beginPath(); ctx.ellipse(X, Y + 1, T * 0.14, T * 0.09, 0, 0, 7); ctx.fill();
        break;
      case "chocolate":
        ctx.fillStyle = "#5a3a24"; ctx.fillRect(cx + T * 0.3, cy + T * 0.33, T * 0.4, T * 0.4);
        ctx.strokeStyle = "#7a4a2e"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X, cy + T * 0.33); ctx.lineTo(X, cy + T * 0.73); ctx.moveTo(cx + T * 0.3, Y); ctx.lineTo(cx + T * 0.7, Y); ctx.stroke();
        break;
    }
  }

  // --- items ---
  private item(cx: number, cy: number, kind: ItemKind) {
    const ctx = this.ctx;
    const X = cx + T / 2, Y = cy + T / 2;
    if (kind === "toothpick") {
      ctx.strokeStyle = "#b98a5a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + T * 0.3, cy + T * 0.7); ctx.lineTo(cx + T * 0.7, cy + T * 0.3); ctx.stroke();
    } else if (kind === "maggot") {
      ctx.fillStyle = "#ede7d5";
      ctx.beginPath();
      ctx.ellipse(X, Y, T * 0.22, T * 0.12, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#5a5240";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = "#c4bca2";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X - 2, Y - 2.5); ctx.lineTo(X - 2, Y + 2.5);
      ctx.moveTo(X + 2, Y - 2.5); ctx.lineTo(X + 2, Y + 2.5);
      ctx.stroke();
      ctx.fillStyle = "#665742";
      ctx.beginPath();
      ctx.arc(X - T * 0.15, Y + 0.5, 1.4, 0, Math.PI * 2);
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

  private poisonCloud(cx: number, cy: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(80,200,80,0.45)";
    ctx.beginPath();
    ctx.arc(cx + T / 2, cy + T / 2, T * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- fly companion (weapon: "муха") ---
  private fly(cx: number, cy: number, fly: Fly) {
    const ctx = this.ctx;
    const X = cx + T / 2;
    const Y = cy + T / 2;

    // Translucent buzzing wings
    ctx.fillStyle = "rgba(180, 225, 255, 0.75)";
    ctx.strokeStyle = "rgba(100, 150, 200, 0.8)";
    ctx.lineWidth = 1;

    // Left wing
    ctx.beginPath();
    ctx.ellipse(X - T * 0.1, Y - T * 0.12, T * 0.14, T * 0.07, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Right wing
    ctx.beginPath();
    ctx.ellipse(X + T * 0.1, Y - T * 0.12, T * 0.14, T * 0.07, 0.4, 0, Math.PI * 2);
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
}

export { T as TILE_SIZE, VW as VIEW_W, VH as VIEW_H };
