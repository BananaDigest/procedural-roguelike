# «А Тебе?» — Mouse in the Market

> A tiny mouse sneaks through 10 shops, room by room, chasing the Big Cheese.
> Every seed is a new market.

A turn-based, top-down procedural roguelike written in TypeScript on an HTML5
Canvas. Everything is drawn in code: there are no sprite or image assets.

**▶ Play:** https://bananadigest.github.io/procedural-roguelike/

<!-- TODO: replace with a ~15-second GIF that shows 3 different dungeons (3 different seeds) -->
![Three different runs — GIF placeholder](docs/screenshots/runs.gif)

> **GIF placeholder:** record about 15 seconds that show three runs with
> different seeds, then save the file as `docs/screenshots/runs.gif`.

---

## Gameplay in one minute

- **10 shops (levels).** Each shop is a chain of 4–7 rooms, and you see one room at a time.
- **Exits.** A **нора** (mouse hole) leads to the next room of the same shop. A **люк** (manhole) leads to the next shop.
- **Fighting.** Bump into an enemy to bite it. The enemies are the cashier, the loader and the guard.
- **Pickups.**
  - Food restores HP and adds to your score.
  - A **toothpick** raises your damage.
  - An **energy drink** gives you extra moves.
  - A **maggot** hatches into a fly companion. Flies bite nearby enemies and take hits for you.
- **Hazards.** Traps appear from level 4. From level 7 a **wild mouse** may show up, and it attacks anyone. From level 8 enemies sometimes take two steps in one turn.
- **Boss.** Shop 10 ends with **the Cleaner**, who fights with a mop and throws rat poison. Beat her and the Big Cheese appears.
- **Cheese power.** When you reach the boss for the first time, the food you collected gives a one-time bonus to damage and HP.

## Controls

| Keys | Action |
| --- | --- |
| `W A S D` / arrow keys / numpad `8 4 6 2` | Move one tile; moving into an enemy attacks it |
| `Esc` | Pause menu (press again to resume) |
| `M` / `Tab` | Show or hide the minimap |
| `R` | Start a new run with a random seed |
| Title screen | Type a seed (number or any text) and press **Start**; leave it empty for a random seed |

Debug keys, enabled while `DEBUG_LEVEL_SELECT = true` in `src/config.ts`:

| Keys | Action |
| --- | --- |
| `` ` `` | Jump to any level from 1 to 10 |
| `K` | Kill the boss instantly (level 10 arena only) |
| `G` / `H` | Preview the game-over / win screen |

## How generation works

### Determinism first

All random choices go through **Mulberry32**, a small seedable 32-bit PRNG
(`src/rng/Mulberry32.ts`). Generation code never calls `Math.random()`.
Each room gets its own derived seed:

```
roomSeed = baseSeed + level · 100 + roomIndex
```

So the same seed always produces the same shops, rooms, enemies and loot. That
lets players share a seed, and it makes bugs reproducible. A text seed is
hashed into a number first.

### Pipeline

```mermaid
flowchart TD
    S["Run seed"] --> L["LevelChain<br/>4–7 rooms per level<br/>(level 10: approach room + boss arena)"]
    L --> R["RoomGen (per room, own seed)"]
    R --> A["1. Size + wall frame<br/>(1.25× bigger on levels 6–10)"]
    A --> B["2. Shelving — Wave Function Collapse"]
    B --> C["3. Crates — Poisson-disk sampling (Bridson)"]
    C --> D["4. Exits (нора / люк) + entry<br/>forward exit placed far from the way in"]
    D --> E["5. Spawns from level tables<br/>enemies · food · traps · power-ups · maggots · wild mouse"]
    E --> F{"Flood-fill check:<br/>every exit and spawn<br/>reachable from the entry?"}
    F -- yes --> OK["Room ✔"]
    F -- "no (up to 20 tries)" --> A
    F -- "still failing" --> N["Fallback: same room without shelves<br/>(always connected)"]
```

The same diagram as plain text:

```
seed ─► LevelChain ─► room 0 ⇄нора⇄ room 1 ⇄нора⇄ … ⇄нора⇄ room N-1 ─люк─► next shop
                         │
                         ▼ RoomGen (per room)
          frame ─► WFC shelves ─► Poisson crates ─► exits/entry ─► spawns ─► flood fill ✔/↺
```

### The algorithms and why we picked them

| Part | Algorithm | Why |
| --- | --- | --- |
| Room layout | **Wave Function Collapse** on the room interior (`placeShelvesWFC`) | The setting is a shop, so rooms need straight **shelf aisles**, not caves. WFC builds these rows from local adjacency rules: horizontal runs never stack and vertical runs never sit side by side. That keeps the aisles walkable and still makes every room different. |
| Clutter | **Bridson Poisson-disk sampling** (`placeCratesPoisson`) | Crates should be spread out evenly without clumping. Poisson-disk sampling keeps a minimum distance between points. The crates are 1×1 tiles, pairs or 2×2 stacks. |
| Exit placement | **Farthest-cell selection** (`takeFar`, Manhattan distance) | The forward exit goes as far from the entrance as the room allows, so you actually have to cross the room. |
| Safety net | **Flood fill**, 4-directional (`ConnectivityCheck.ts`) | WFC and the crates can block a path. Every exit and spawn must be reachable from the entry, otherwise the room is regenerated from the next seed. |
| Level structure | **Linear room chain** (`LevelChain.ts`) | Each room is its own screen, with no corridors. A chain fits the "sneak through the shop" fantasy and keeps backtracking simple. |
| Minimap corridors | **Drunkard's Walk** with a target bias (`DrunkardsWalk.ts`) | The radar links the rooms of a shop with winding tunnels that look like mouse paths. The walk is seeded too, so the map stays the same for the whole floor. |
| Boss poison clouds | **Random-walker frontier growth** (`PoisonCloudGen.ts`) | Clouds are irregular, connected blobs between 2×2 and 5×5 tiles, never a plain rectangle or circle. Each throw reads as a fresh puff of poison. |

Difficulty is controlled by spawn tables (`Spawns.ts`, `game/balance.ts`):
- **Enemies:** the mix and count of enemies change per level.
- **Items:** premium food appears from level 6. Toothpicks and maggots get more likely after level 7.
- **Wild mouse:** a 50% chance per room on levels 7–10.
- **Boss arena:** it has no shelves, so the boss has room to move.

To see the generator's output as text:

```bash
npm run gen -- <seed>       # print every room of a run as ASCII art
```

## Tech stack

- **TypeScript** (strict mode) and **HTML5 Canvas 2D**
- **Vite** for the dev server and the build
- **GitHub Actions → GitHub Pages:** every push to `main` is deployed automatically
- **No runtime dependencies:** the PRNG, the generators, the renderer and the animations are all hand-written

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production build → dist/
npm run preview   # serve the production build
```

## Project structure

```
src/
  core/        types.ts — shared contract (Room, GameState, GenerateLevel, Game) · fixtures
  rng/         Mulberry32.ts — seedable PRNG
  generation/  LevelChain · RoomGen (WFC, Poisson) · Spawns · ConnectivityCheck · DrunkardsWalk · debug
  game/        GameImpl (turn loop) · Combat · Enemy · Boss · PoisonCloudGen · Fly · WildMouse · balance
  render/      Renderer · Animator (procedural animation) · palette
  ui/          HUD · Minimap · Screens · Toast
  config.ts    tile size, viewport, room scaling, animation timings, debug flags
  main.ts      input, screen flow, render loop
```

The three parts are kept separate by the `src/core/types.ts` contract, so each
person could work on their part independently against fixtures.

## Side quests and extensions

These go beyond the core "generate a room" task:

- **Seeds you can share:** a number or any text works, and the same seed gives the same run.
- **Several generation algorithms combined:** WFC, Poisson-disk sampling, flood fill, Drunkard's Walk and random-walker clouds.
- **A boss fight with 2 phases.** In phase 2 she throws poison more often, and each cloud gives you one turn to step out before it starts hurting.
- **Fly companions:** maggots hatch into flies that bite enemies and absorb hits.
- **A wild mouse** that attacks enemies and the player.
- **Cheese power:** collected food turns into a one-time power boost before the boss.
- **Procedural animation** on top of the turn-based logic:
  - smooth movement, lunges, hit flashes and death animations;
  - idle breathing, blinking and the boss's mop sway;
  - maggots wiggling on the floor.
  - All of it is purely visual: the game logic doesn't depend on it.
- **A circular minimap** of the current shop.
- **A character catalog** with live animated icons and HP/damage values taken from the balance file.
- **Resolution-independent rendering:** the whole game scales to the window from a single setting.
- **CI/CD:** automatic deploy to GitHub Pages.

## Known limitations and TODOs

- **Keyboard only.** There are no touch controls on mobile.
- **No sound or music.**
- **No save.** A run lasts one session; to replay a run, use its seed.
- **The `npm run gen:check` self-test is out of date.** Some of its invariants don't match the current spawn rules, and running it directly in Node fails on interface imports. It needs updating.
- **The minimap corridors are only decoration.** The real connections between rooms are the нори, not tunnels.
- **Debug keys are on.** Set `DEBUG_LEVEL_SELECT = false` in `src/config.ts` before a release.
- **Balance has only been tested by the team** and still needs tuning, especially for levels 8–10.

## Who did what

| Person | Area | Main files |
| --- | --- | --- |
| **Viktoriia (Person A)** | World generation: room and level generation, WFC shelving, Poisson crates, spawn tables, connectivity checks, room scaling, seeded randomness, debug level select, cheese-power bonus, procedural character animation | `src/generation/`, `src/rng/`, `src/render/Animator.ts`, `src/config.ts` |
| **Sofia (Person B)** | Gameplay: turn loop, enemy AI, combat, items, flies, wild mouse, boss and poison clouds, balance, Drunkard's Walk minimap | `src/game/`, `src/generation/DrunkardsWalk.ts`, `src/ui/Minimap.ts` |
| **Diana (Person C)** | Rendering and UI: renderer, palette, HUD, screens and catalog, input, window scaling, CI/CD deployment | `src/render/`, `src/ui/`, `src/main.ts`, `.github/workflows/` |

## License

MIT.
