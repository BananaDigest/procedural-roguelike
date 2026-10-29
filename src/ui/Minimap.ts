/**
 * Minimap — a circular radar (CS2-style) on its OWN canvas, fixed to the
 * top-right of the screen (positioned via CSS, independent of the game canvas).
 *
 * The CURRENT room sits at the centre; neighbouring rooms fan out along the
 * chain and are clipped to the circle, so only the rooms that fit are shown.
 * Layout jitter is DETERMINISTIC per (seed, level). Built from
 * GameState.roomCount + roomIndex only.
 */
import { GameState } from "../core/types.ts";

const R = 74; // radar radius, px
const PAD = 7; // breathing room so the ring/glow isn't clipped
const SPACING = 46; // distance between consecutive rooms along the chain
const BOX = 24; // base room box size

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private size: number;

  constructor(canvas: HTMLCanvasElement) {
    this.size = (R + PAD) * 2;
    canvas.width = this.size;
    canvas.height = this.size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.size, this.size);
  }

  draw(state: GameState): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);

    const n = Math.max(1, state.roomCount);
    const cur = state.roomIndex;
    const base = (state.seed ^ (state.level * 0x9e3779b1)) >>> 0;
    const cx = this.size / 2;
    const cy = this.size / 2;

    const jit = (i: number, salt: number, r: number) => {
      const h = Math.imul((base ^ Math.imul(i + 1, 2654435761) ^ (salt * 40503)) >>> 0, 0x9e3779b1) >>> 0;
      return ((h % 1000) / 1000) * 2 * r - r;
    };

    // Winding 2D path: current room at the centre, the chain meanders outward
    // in both directions (each step turns by a deterministic angle).
    const pos: { x: number; y: number }[] = new Array(n);
    pos[cur] = { x: cx, y: cy };
    const a0 = jit(0, 7, Math.PI); // base heading for this level
    let fx = cx, fy = cy, fa = a0;
    for (let i = cur; i < n - 1; i++) {
      fa += jit(i, 8, 0.9); // turn
      fx += SPACING * Math.cos(fa);
      fy += SPACING * Math.sin(fa);
      pos[i + 1] = { x: fx, y: fy };
    }
    let bx = cx, by = cy, ba = a0 + Math.PI; // past rooms head the other way
    for (let i = cur; i > 0; i--) {
      ba += jit(i, 9, 0.9);
      bx += SPACING * Math.cos(ba);
      by += SPACING * Math.sin(ba);
      pos[i - 1] = { x: bx, y: by };
    }
    const rc = (i: number) => pos[i];

    ctx.save();

    // circular backdrop + clip
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(6,7,10,0.82)";
    ctx.fill();
    ctx.clip();

    // faint crosshair + inner ring
    ctx.strokeStyle = "rgba(150,160,175,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // curved corridors between consecutive rooms (jittered control point)
    ctx.strokeStyle = "#6a7079";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < n - 1; i++) {
      const a = rc(i);
      const b = rc(i + 1);
      const mx = (a.x + b.x) / 2 + jit(i, 5, 9);
      const my = (a.y + b.y) / 2 + jit(i, 6, 9);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
    }

    // rooms — all grey
    for (let i = 0; i < n; i++) {
      const c = rc(i);
      const w = BOX + jit(i, 3, 4);
      const h = BOX - 2 + jit(i, 4, 3);
      ctx.fillStyle = "#2a2f38";
      ctx.fillRect(c.x - w / 2, c.y - h / 2, w, h);
      ctx.strokeStyle = "#6a7079";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(c.x - w / 2 + 0.75, c.y - h / 2 + 0.75, w - 1.5, h - 1.5);
    }

    ctx.restore(); // drop the circular clip

    // radar ring
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(150,160,175,0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // "you" marker at the centre
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.8)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#f5f6f8";
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
