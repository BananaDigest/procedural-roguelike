/**
 * HUD — status line drawn on top of the canvas. Person C extends this.
 * Reads GameState only.
 */
import { GameState } from "../core/types.ts";

export class HUD {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  draw(state: GameState): void {
    const text =
      `Level ${state.level} · Room ${state.roomIndex + 1}/${state.roomCount}` +
      `    HP ${state.player.hp}/${state.player.maxHp}` +
      `    Cheese x${state.score}` +
      `    Seed ${state.seed}`;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(0, 0, ctx.canvas.width, 20);
    ctx.fillStyle = state.level <= 5 ? "#dfe3e9" : "#f2f3f5";
    ctx.fillText(text, 8, 5);
    ctx.restore();
  }
}
