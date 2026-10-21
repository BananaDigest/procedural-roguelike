/**
 * Entry point — wires input + Game + Renderer. Person C owns this.
 *
 * Right now it runs the StubGame (fixture room) so the project is playable
 * end-to-end from day one. Integration later = swap StubGame for B's real Game,
 * and give B's Game the real `generateLevel` from A. The rest stays.
 */
import { StubGame } from "./core/fixtures.ts";
import { Game } from "./core/types.ts";
import { Renderer } from "./render/Renderer.ts";
import { HUD } from "./ui/HUD.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const hud = new HUD(canvas);

// INTEGRATION SEAM: replace with `new GameImpl(generateLevel)` once A & B land.
const game: Game = new StubGame();

function frame(): void {
  renderer.draw(game.state);
  hud.draw(game.state);
}

// Keyed by e.code (physical key) so WASD, arrow keys, and the right-hand numpad
// all work — numpad is layout- and NumLock-independent this way.
const MOVES: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], Numpad8: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1], Numpad2: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], Numpad4: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0], Numpad6: [1, 0],
};

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyR") {
    game.restart();
    frame();
    e.preventDefault();
    return;
  }
  const move = MOVES[e.code];
  if (move) {
    game.movePlayer(move[0], move[1]);
    frame();
    e.preventDefault();
  }
});

frame();
