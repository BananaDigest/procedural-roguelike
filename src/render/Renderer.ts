import { Level } from "../game/Level.ts";
import { Player } from "../game/Player.ts";
import { Tile } from "../game/Tile.ts";

const COLORS = {
  wall: "#20262e",
  wallEdge: "#2b333d",
  floor: "#11161b",
  floorDot: "#1c242c",
  stairs: "#f4c969",
  player: "#6cc3ff",
};

/**
 * Draws a Level + Player to a canvas on a fixed tile grid. The canvas is
 * sized to the level so there's no camera to manage yet — add one when
 * maps grow past a screen.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  readonly tileSize: number;

  constructor(
    private canvas: HTMLCanvasElement,
    tileSize = 16,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.tileSize = tileSize;
  }

  /** Resize the canvas backing store to match the level dimensions. */
  fit(level: Level): void {
    this.canvas.width = level.width * this.tileSize;
    this.canvas.height = level.height * this.tileSize;
  }

  draw(level: Level, player: Player): void {
    const t = this.tileSize;
    const ctx = this.ctx;

    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const px = x * t;
        const py = y * t;
        const tile = level.get(x, y);

        switch (tile) {
          case Tile.Wall:
            ctx.fillStyle = COLORS.wall;
            ctx.fillRect(px, py, t, t);
            ctx.fillStyle = COLORS.wallEdge;
            ctx.fillRect(px, py, t, 2);
            break;
          case Tile.Floor:
            ctx.fillStyle = COLORS.floorDot;
            ctx.fillRect(px + t / 2 - 1, py + t / 2 - 1, 2, 2);
            break;
          case Tile.StairsDown:
            ctx.fillStyle = COLORS.stairs;
            ctx.font = `${t}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(">", px + t / 2, py + t / 2 + 1);
            break;
        }
      }
    }

    // Player as a filled circle.
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(player.x * t + t / 2, player.y * t + t / 2, t * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}
