# Procedural Roguelike

> Make a world from a seed. Press a button. Get a world no one has seen before.

A top-down procedural roguelike built with **TypeScript + HTML5 Canvas** (Vite).
Every run generates a new dungeon; the same seed always rebuilds the same dungeon.

**▶ Play:** _add your itch.io / GitHub Pages link here_

## Controls

| Key | Action |
| --- | --- |
| `W A S D` / Arrows | Move |
| `>` (step on stairs) | Descend to the next floor |
| `R` | New run with a new seed |

## Run locally

```bash
npm install
npm run dev      # start the dev server (Vite)
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## How generation works

The pipeline, from "press new game" to the first frame:

```
seed ──► Mulberry32 (seeded PRNG) ──► Drunkard's Walk ──► place spawn
     ──► flood-fill reachable tiles ──► stairs on farthest reachable tile ──► render
```

- **`src/rng/Mulberry32.ts`** — the single seeded PRNG. Generation code *never*
  calls `Math.random()`, so a seed fully determines a floor.
- **`src/generation/DrunkardsWalk.ts`** — a walker staggers from the center,
  carving floor. Because it never teleports, the result is always one connected
  region.
- **`src/generation/ConnectivityCheck.ts`** — flood fill used to place the
  staircase only on a tile the player can actually reach (no soft-locks).
- **`src/game/GameState.ts`** — each floor is generated from a *derived* seed
  (`runSeed + floor`), so the whole multi-floor run is reproducible.

## Project structure

```
src/
  main.ts                 # entry: input loop + wiring
  game/
    GameState.ts          # the run: seed, floor, player, descend logic
    Player.ts             # player actor + movement
    Tile.ts, Level.ts     # grid data model
    Enemy.ts, Item.ts, Combat.ts   # Week 2 scaffolds
  generation/
    DrunkardsWalk.ts      # implemented generator
    BSP.ts                # scaffold (side quest)
    ConnectivityCheck.ts  # flood-fill reachability
  render/
    Renderer.ts           # canvas tile renderer
  rng/
    Mulberry32.ts         # seedable PRNG
  fov/
    Shadowcast.ts         # scaffold (fog of war)
  ui/
    HUD.ts, Inventory.ts
```

## Roadmap

- [x] **Basic** — grid render, movement, drunkard's walk, stairs, multi-floor, seeds
- [ ] **Standard** — enemies, bump-to-attack combat, HP, items, win condition
- [ ] **Advanced** — FOV/fog of war, A\* enemies, BSP/WFC, boss, procedural items

## License

MIT (or your choice).
