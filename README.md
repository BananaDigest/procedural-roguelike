# «А Тебе?» — Mouse in the Market

> A tiny mouse sneaks through 10 shops, room by room, chasing the Big Cheese.
> Every run is a new market.

A turn-based, top-down procedural roguelike. TypeScript + HTML5 Canvas (Vite),
everything drawn in code — no sprite assets.

**▶ Play:** https://bananadigest.github.io/procedural-roguelike/

![3 different runs](docs/screenshots/runs.gif)

## Controls

| Keys | Action |
| --- | --- |
| `WASD` / arrows / numpad | Move (one tile per press) |
| `R` | New run |
| On the title screen | Type a seed (optional) → **Start** |

Bump into an enemy to bite it. Grab snacks for HP + score. Find the нора (hole)
to the next room, the люк (manhole) to the next shop. Beat the boss on shop 10.

## How generation works

Each room is built from a seeded PRNG (`Mulberry32`) — same seed, same run. A level
is a chain of 3–7 rooms; you see only the current room (the rest is fog). Full
write-up and the algorithm diagram: **[docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)**.

## Tech stack

TypeScript · HTML5 Canvas · Vite. No external runtime deps.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview the build
```

## Project structure

```
src/
  core/      types.ts (shared contract) · fixtures.ts (sample data)
  generation/  room & level generation            — Person A
  game/        turn loop, enemies, combat, boss    — Person B
  render/      Renderer.ts · palette.ts            — Person C
  ui/          HUD.ts · Screens.ts                 — Person C
  rng/         Mulberry32.ts (seedable PRNG)
  main.ts      input + screen flow + wiring        — Person C
docs/GAME_DESIGN.md   full design (source of truth)
```

The three systems are decoupled by the `src/core/types.ts` contract
(`Room`, `GameState`, `GenerateLevel`, `Game`), so each part is developed
independently against fixtures.

## Who did what

- **Person A** — world generation (rooms, levels, spawns, connectivity)
- **Person B** — gameplay (turn loop, enemy AI, combat, items, boss)
- **Person C (Diana)** — rendering, UI/screens, input, delivery

## License

MIT.
