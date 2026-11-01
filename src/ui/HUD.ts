/**
 * HUD — a slim status bar drawn on top of the canvas. Reads GameState only.
 * All on-screen text is English. Drawn in LOGICAL px (the Renderer's canvas
 * transform scales it with everything else).
 */
import { GameState } from "../core/types.ts";
import { paletteForLevel } from "../render/palette.ts";
import { TILE_SIZE, VIEW } from "../config.ts";
import { TOTAL_LEVELS } from "../game/balance.ts";

const H = 24; // bar height, logical px
const PAD = 8;
const FONT = "11px ui-monospace, Menlo, Consolas, monospace";

export class HUD {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  draw(state: GameState): void {
    const ctx = this.ctx;
    const W = VIEW.w * TILE_SIZE;
    const pal = paletteForLevel(state.level);
    const ink = pal.hudText;
    const muted = "rgba(230,235,240,0.5)";
    const cy = H / 2;

    ctx.save();
    ctx.font = FONT;
    ctx.textBaseline = "middle";

    // bar background + accent hairline
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(14,16,22,0.92)");
    g.addColorStop(1, "rgba(9,11,15,0.78)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = pal.b1;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, H - 1, W, 1);
    ctx.globalAlpha = 1;

    // --- left-to-right segments ---
    ctx.textAlign = "left";
    let x = PAD;

    // level + room — labelled for clarity
    x = this.text("Level", x, cy, muted) + 5;
    x = this.text(`${state.level}/${TOTAL_LEVELS}`, x, cy, ink) + 12;
    x = this.text("Room", x, cy, muted) + 5;
    x = this.text(`${state.roomIndex + 1}/${state.roomCount}`, x, cy, ink) + 14;

    // HP label + bar + number
    x = this.text("HP", x, cy, muted) + 5;
    const frac = Math.max(0, Math.min(1, state.player.hp / state.player.maxHp));
    const barW = 54, barH = 7;
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    this.roundRect(x, cy - barH / 2, barW, barH, 3);
    ctx.fillStyle = frac > 0.5 ? "#4caf50" : frac > 0.25 ? "#e0a81e" : "#e2231a";
    this.roundRect(x, cy - barH / 2, Math.max(2, barW * frac), barH, 3);
    x += barW + 5;
    x = this.text(`${state.player.hp}/${state.player.maxHp}`, x, cy, ink) + 14;

    // damage
    x = this.text("DMG", x, cy, muted) + 5;
    x = this.text(String(state.player.attack), x, cy, ink) + 14;

    // cheese (score)
    this.cheeseIcon(x, cy);
    x += 12;
    x = this.text(`x${state.score}`, x, cy, ink) + 14;

    // flies (only if the player has any)
    if (state.flies?.length) {
      this.flyIcon(x, cy);
      x += 10;
      x = this.text(`x${state.flies.length}`, x, cy, ink) + 14;
    }

    // seed — right-aligned, muted
    ctx.textAlign = "right";
    ctx.fillStyle = muted;
    ctx.fillText(`seed ${state.seed}`, W - PAD, cy);

    ctx.restore();
  }

  /** Draw left-aligned text; returns the x after it. */
  private text(s: string, x: number, y: number, color: string): number {
    this.ctx.fillStyle = color;
    this.ctx.fillText(s, x, y);
    return x + this.ctx.measureText(s).width;
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, w, h, r);
    this.ctx.fill();
  }

  private cheeseIcon(x: number, cy: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#f2c84b";
    ctx.beginPath();
    ctx.moveTo(x, cy + 4); ctx.lineTo(x + 9, cy + 4); ctx.lineTo(x + 4.5, cy - 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d9a92a";
    ctx.beginPath(); ctx.arc(x + 4, cy + 1.5, 1, 0, Math.PI * 2); ctx.fill();
  }

  private flyIcon(x: number, cy: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(230,235,240,0.75)"; // wings
    ctx.beginPath(); ctx.ellipse(x + 1, cy - 1, 2.4, 1.4, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 5, cy - 1, 2.4, 1.4, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2a2f38"; // body
    ctx.beginPath(); ctx.ellipse(x + 3, cy + 1, 1.8, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  }
}
