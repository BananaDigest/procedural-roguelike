import { GameState } from "../game/GameState.ts";

/** Syncs the DOM header with the current run state. */
export class HUD {
  private floorEl: HTMLElement;
  private seedEl: HTMLElement;

  constructor() {
    this.floorEl = document.getElementById("hud-floor")!;
    this.seedEl = document.getElementById("hud-seed")!;
  }

  update(state: GameState): void {
    this.floorEl.textContent = `Floor ${state.floorNumber}`;
    this.seedEl.textContent = `Seed ${state.seed}`;
  }
}
