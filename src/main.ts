import { GameState } from "./game/GameState.ts";
import { Renderer } from "./render/Renderer.ts";
import { HUD } from "./ui/HUD.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas, 16);
const hud = new HUD();

// A readable starting seed (you can share it). Replace with a URL param later.
let state = new GameState(randomSeed());

function randomSeed(): number {
  // Only used to START a run, never inside generation — generation is seeded.
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

function sync(): void {
  renderer.fit(state.level);
  renderer.draw(state.level, state.player);
  hud.update(state);
}

// --- Input ------------------------------------------------------------------

const MOVES: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

window.addEventListener("keydown", (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (key === "r") {
    state.newRun(randomSeed());
    sync();
    e.preventDefault();
    return;
  }

  const move = MOVES[key];
  if (move) {
    state.movePlayer(move[0], move[1]);
    sync();
    e.preventDefault();
  }
});

sync();
