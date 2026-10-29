/**
 * HUD — status line drawn on top of the canvas. Reads GameState only.
 * All on-screen text is English.
 */
import { GameState } from "../core/types.ts";
import { paletteForLevel } from "../render/palette.ts";
import { TILE_SIZE, VIEW } from "../config.ts";

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
    ctx.fillStyle = "rgba(0,0,0,.5)";
    // logical px — the Renderer's canvas transform scales it with everything else
    ctx.fillRect(0, 0, VIEW.w * TILE_SIZE, 20);
    ctx.fillStyle = paletteForLevel(state.level).hudText;
    ctx.fillText(text, 8, 5);
    ctx.restore();
  }
}
