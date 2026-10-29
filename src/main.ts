/**
 * Entry point — screen flow, input, feedback, and wiring. Person C owns this.
 *
 * Integrated build: real game logic (B's GameImpl) driven by the real world
 * generator (A's generateLevel), rendered by C's Renderer/HUD/Screens.
 */
import { GameImpl } from "./game/GameImpl.ts";
import { generateLevel } from "./generation/LevelChain.ts";
import { Renderer } from "./render/Renderer.ts";
import { HUD } from "./ui/HUD.ts";
import { Minimap } from "./ui/Minimap.ts";
import { Screens } from "./ui/Screens.ts";
import { hashSeed } from "./rng/Mulberry32.ts";
import { DEBUG_LEVEL_SELECT, DEBUG_LEVEL_SELECT_KEY } from "./config.ts";

/** Flip off to disable the G/H keys that preview the game-over / win screens. */
const DEV_PREVIEW = true;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLElement;
const renderer = new Renderer(canvas);
const hud = new HUD(canvas);
const minimapCanvas = document.getElementById("minimap") as HTMLCanvasElement;
const minimap = new Minimap(minimapCanvas); // fixed radar, top-right of the screen
const screens = new Screens(overlay);
const stage = document.getElementById("stage") as HTMLElement;

const game = new GameImpl(generateLevel);
let started = false;
/** DEBUG level-select box is open → game is paused, keys don't move the mouse. */
let levelSelectOpen = false;
let showMap = true;

// --- feedback (damage flash + mouse blink) ---
let flashAlpha = 0;
let flashColor = "#e2231a";
let fxFrame = 0;

function render(): void {
  const blink = flashAlpha > 0 && fxFrame % 2 === 0;
  renderer.draw(game.state, { hideMouse: blink });
  renderer.flash(flashAlpha, flashColor);
  hud.draw(game.state);
  if (showMap) minimap.draw(game.state);
}

function fxTick(): void {
  fxFrame++;
  flashAlpha = Math.max(0, flashAlpha - 0.05);
  render();
  if (flashAlpha > 0) requestAnimationFrame(fxTick);
}

function triggerFlash(color: string): void {
  flashColor = color;
  if (flashAlpha <= 0) {
    flashAlpha = 0.5;
    requestAnimationFrame(fxTick);
  } else {
    flashAlpha = 0.5;
  }
}

// --- seed parsing ---
function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}
function parseSeed(raw: string): number {
  if (!raw) return randomSeed();
  if (/^\d+$/.test(raw)) return parseInt(raw, 10) >>> 0 || 1;
  return hashSeed(raw);
}

// --- window fit: canvas + overlay scale with the browser window ---
const PAD_X = 16; // #app padding in style.css: 24px 16px
const PAD_Y = 24;

function fitToWindow(): void {
  const top = stage.getBoundingClientRect().top + window.scrollY;
  const scale = renderer.fit(window.innerWidth - 2 * PAD_X, window.innerHeight - top - PAD_Y);
  stage.style.setProperty("--ui-scale", String(scale));
  if (started) render();
}

window.addEventListener("resize", fitToWindow);
fitToWindow();

// --- screen flow ---
function showTitle(): void {
  started = false;
  screens.title((seed) => startRun(parseSeed(seed)));
}

function startRun(seed: number): void {
  game.startWithSeed(seed);
  started = true;
  minimapCanvas.hidden = !showMap;
  screens.hide();
  render();
}

function syncPhase(): void {
  const s = game.state;
  if (s.phase === "gameover") screens.gameOver(s.score, () => startRun(randomSeed()));
  else if (s.phase === "win") screens.win(s.score, s.level, () => startRun(randomSeed()));
}

function doMove(dx: number, dy: number): void {
  if (!started || game.state.phase !== "playing") return;
  const prevHp = game.state.player.hp;
  const prevRoom = game.state.room;
  const prevEnemies = prevRoom.enemies.length;
  game.movePlayer(dx, dy);
  const s = game.state;
  if (s.player.hp < prevHp) triggerFlash("#e2231a"); // took damage
  else if (s.room === prevRoom && s.room.enemies.length < prevEnemies) {
    triggerFlash("#ffffff"); // landed a bite (same room → an enemy died)
  }
  render();
  syncPhase();
}

// --- DEBUG: go to level (config.DEBUG_LEVEL_SELECT) ---
function openLevelSelect(): void {
  levelSelectOpen = true;
  screens.levelSelect(game.state.level, (raw) => {
    if (!/^\d+$/.test(raw)) return "Enter a number from 1 to 10";
    const level = Number(raw);
    if (level < 1 || level > 10) return "Level must be 1–10";
    if (!game.jumpToLevel(level)) return "Can't change level right now";
    closeLevelSelect();
    return null;
  });
}

function closeLevelSelect(): void {
  levelSelectOpen = false;
  screens.hide();
  render();
}

// --- input (e.code → works with WASD, arrows, and numpad regardless of NumLock) ---
const MOVES: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], Numpad8: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1], Numpad2: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], Numpad4: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0], Numpad6: [1, 0],
};

window.addEventListener("keydown", (e) => {
  // While the level box is open the game is paused: only Esc reaches us here,
  // everything else (digits, Enter) belongs to the box's input.
  if (levelSelectOpen) {
    if (e.code === "Escape") {
      closeLevelSelect();
      e.preventDefault();
    }
    return;
  }
  if (DEBUG_LEVEL_SELECT && started && game.state.phase === "playing" && e.code === DEBUG_LEVEL_SELECT_KEY) {
    openLevelSelect();
    e.preventDefault(); // don't type ` into the box
    return;
  }
  if (e.code === "KeyR") {
    startRun(randomSeed());
    e.preventDefault();
    return;
  }
  if (started && (e.code === "KeyM" || e.code === "Tab")) {
    showMap = !showMap;
    minimapCanvas.hidden = !showMap;
    if (showMap) minimap.draw(game.state);
    e.preventDefault();
    return;
  }
  if (DEV_PREVIEW && started && e.code === "KeyG") {
    game.state.phase = "gameover"; render(); syncPhase(); return;
  }
  if (DEV_PREVIEW && started && e.code === "KeyH") {
    game.state.phase = "win"; render(); syncPhase(); return;
  }
  const move = MOVES[e.code];
  if (move) {
    doMove(move[0], move[1]);
    e.preventDefault();
  }
});

showTitle();
