/**
 * Minimap — a circular radar (CS2-style) on its OWN canvas, fixed to the
 * top-right of the screen (positioned via CSS, independent of the game canvas).
 *
 * Rooms for the current level are arranged in a bounded area inside the radar,
 * and connected by organic Drunkard's Walk corridors (Lab 26 requirement).
 * The current room is highlighted, and the player marker indicates current position.
 */
import { GameState, Vec2 } from "../core/types.ts";
import { Mulberry32 } from "../rng/Mulberry32.ts";
import { generateDrunkardCorridor } from "../generation/DrunkardsWalk.ts";

const R = 80; // radar radius, px
const PAD = 6; // breathing room so the ring/glow isn't clipped
const ROOM_W = 16; // minimap room width, px (compact so corridors have space to shine)
const ROOM_H = 14; // minimap room height, px

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private size: number;

  /** Cache layout per (seed, level, roomCount) so it stays stable throughout the floor. */
  private cacheKey = "";
  private cachedPositions: Vec2[] = [];
  private cachedCorridors: Vec2[][] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.size = (R + PAD) * 2;
    canvas.width = this.size;
    canvas.height = this.size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  /**
   * Synchronize the canvas backing store with its CSS display size and devicePixelRatio.
   * Ensures crisp, sharp rendering across any window scale or display DPI.
   */
  fit(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const cssSize = rect.width > 0 ? rect.width : this.size;
    const devPx = Math.max(1, Math.round(cssSize * dpr));
    if (this.canvas.width !== devPx || this.canvas.height !== devPx) {
      this.canvas.width = devPx;
      this.canvas.height = devPx;
    }
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.cacheKey = "";
  }

  draw(state: GameState): void {
    this.fit();
    const ctx = this.ctx;
    const scale = this.canvas.width / this.size;

    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);

    const n = Math.max(1, state.roomCount);
    const cur = Math.max(0, Math.min(n - 1, state.roomIndex));
    const cx = this.size / 2;
    const cy = this.size / 2;

    // 1. Compute or retrieve cached room layout & Drunkard's Walk corridors
    const key = `${state.seed}-${state.level}-${n}`;
    if (this.cacheKey !== key) {
      this.cacheKey = key;
      this.cachedPositions = this.generateBoundedRoomPositions(
        n,
        state.seed,
        state.level,
        cx,
        cy,
      );

      // Generate Drunkard's Walk corridor between each consecutive room pair
      this.cachedCorridors = [];
      const baseSeed = (state.seed ^ Math.imul(state.level, 0x9e3779b1)) >>> 0;
      for (let i = 0; i < n - 1; i++) {
        const corridorRng = new Mulberry32(
          (baseSeed ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0,
        );
        const path = generateDrunkardCorridor(
          this.cachedPositions[i],
          this.cachedPositions[i + 1],
          corridorRng,
          { stepSize: 4, biasTowardsTarget: 0.52 },
        );
        this.cachedCorridors.push(path);
      }
    }

    const pos = this.cachedPositions;

    ctx.save();

    // 2. Circular backdrop + clip
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(6, 7, 10, 0.82)";
    ctx.fill();
    ctx.clip();

    // 3. Faint crosshair + inner radar ring
    ctx.strokeStyle = "rgba(150, 160, 175, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Drunkard's Walk corridors connecting consecutive rooms (thin 1.2px, crisp, showing all crooked turns)
    ctx.strokeStyle = "#d4dce8";
    ctx.lineWidth = 1.2;
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";
    for (const corridor of this.cachedCorridors) {
      if (corridor.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(corridor[0].x, corridor[0].y);
      for (let j = 1; j < corridor.length; j++) {
        ctx.lineTo(corridor[j].x, corridor[j].y);
      }
      ctx.stroke();
    }

    // 5. Rooms inside the bounded field
    for (let i = 0; i < n; i++) {
      const p = pos[i];
      const isCurrent = i === cur;
      const isStart = i === 0;
      const isExit = i === n - 1;

      // Fill
      ctx.fillStyle = isCurrent ? "#3d495c" : "#242932";
      ctx.fillRect(p.x - ROOM_W / 2, p.y - ROOM_H / 2, ROOM_W, ROOM_H);

      // Stroke
      if (isCurrent) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.0;
      } else if (isExit) {
        ctx.strokeStyle = "#f2c84b"; // gold accent for the exit room / boss arena
        ctx.lineWidth = 1.8;
      } else if (isStart) {
        ctx.strokeStyle = "#5aa0ff"; // blue accent for level entrance
        ctx.lineWidth = 1.6;
      } else {
        ctx.strokeStyle = "#6a7079";
        ctx.lineWidth = 1.2;
      }
      ctx.strokeRect(p.x - ROOM_W / 2 + 0.5, p.y - ROOM_H / 2 + 0.5, ROOM_W - 1, ROOM_H - 1);
    }

    ctx.restore(); // Drop the circular clip

    // 6. Outer radar ring
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(150, 160, 175, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 7. "You" marker placed directly on the current room
    if (pos[cur]) {
      ctx.save();
      ctx.shadowColor = "rgba(255, 255, 255, 0.95)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(pos[cur].x, pos[cur].y, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore(); // Drop the outer scale transform
  }

  /**
   * Deterministically arrange n rooms inside a bounded radius within the radar circle.
   */
  private generateBoundedRoomPositions(
    n: number,
    baseSeed: number,
    level: number,
    cx: number,
    cy: number,
  ): Vec2[] {
    const seed = (baseSeed ^ Math.imul(level, 0x9e3779b1)) >>> 0;
    const rng = new Mulberry32(seed);
    const maxRadius = 58;

    let bestPositions: Vec2[] | null = null;

    for (let attempt = 0; attempt < 80; attempt++) {
      const pos: Vec2[] = [];
      const startAngle = rng.next() * Math.PI * 2;
      const startR = 10 + rng.next() * 16;
      pos.push({
        x: Math.cos(startAngle) * startR,
        y: Math.sin(startAngle) * startR,
      });

      let success = true;
      for (let i = 1; i < n; i++) {
        const prev = pos[i - 1];
        const candidates: Vec2[] = [];

        for (let a = 0; a < 16; a++) {
          const angle = (a / 16) * Math.PI * 2;
          const dist = 40 + rng.next() * 12;
          const cand = {
            x: prev.x + Math.cos(angle) * dist,
            y: prev.y + Math.sin(angle) * dist,
          };

          if (Math.hypot(cand.x, cand.y) > maxRadius) continue;

          let overlap = false;
          for (let j = 0; j < i; j++) {
            if (Math.hypot(cand.x - pos[j].x, cand.y - pos[j].y) < 26) {
              overlap = true;
              break;
            }
          }
          if (!overlap) {
            candidates.push(cand);
          }
        }

        if (candidates.length === 0) {
          success = false;
          break;
        }

        pos.push(rng.pick(candidates));
      }

      if (success) {
        bestPositions = pos;
        break;
      }
    }

    if (!bestPositions) {
      // Deterministic fallback arc
      const pos: Vec2[] = [];
      const arcSpan = Math.min(Math.PI * 1.6, n * 0.7);
      const r = 44;
      for (let i = 0; i < n; i++) {
        const angle = (i / Math.max(1, n - 1)) * arcSpan - arcSpan / 2;
        pos.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      }
      bestPositions = pos;
    }

    // Center the layout around (cx, cy) and auto-scale to comfortably fill the radar
    let sumX = 0;
    let sumY = 0;
    for (const p of bestPositions) {
      sumX += p.x;
      sumY += p.y;
    }
    const avgX = sumX / n;
    const avgY = sumY / n;
    const centered = bestPositions.map((p) => ({
      x: p.x - avgX,
      y: p.y - avgY,
    }));

    let maxDist = 0;
    for (const p of centered) {
      const d = Math.hypot(p.x, p.y);
      if (d > maxDist) maxDist = d;
    }
    const targetRadius = 52;
    const scale =
      maxDist > 0 && maxDist < targetRadius
        ? Math.min(1.35, targetRadius / maxDist)
        : 1.0;

    return centered.map((p) => ({
      x: Math.round(cx + p.x * scale),
      y: Math.round(cy + p.y * scale),
    }));
  }
}
