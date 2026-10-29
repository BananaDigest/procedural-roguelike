/**
 * Screens — title / game over / win overlays (DOM, over the canvas).
 * All text is English. Buttons + seed input are real DOM for accessibility.
 */

export class Screens {
  constructor(private el: HTMLElement) {}

  hide(): void {
    this.el.hidden = true;
    this.el.innerHTML = "";
  }

  /** onStart receives the raw seed string ("" = random). */
  title(onStart: (seed: string) => void): void {
    this.panel([
      this.h('«А Тебе?»', "brand"),
      this.p("Mouse in the Market", "sub"),
      this.p("WASD / arrows / numpad — move · M — map · R — new run"),
      this.seedRow(onStart),
    ]);
  }

  gameOver(score: number, onRestart: () => void): void {
    this.panel([
      this.h("You got caught!"),
      this.p(`Cheese collected: ${score}`, "sub"),
      this.button("Press R to restart", onRestart),
    ]);
  }

  win(score: number, level: number, onRestart: () => void): void {
    this.panel([
      this.h("You got the Big Cheese!"),
      this.p(`Level ${level} · Cheese ${score}`, "sub"),
      this.button("Press R to play again", onRestart),
    ]);
  }

  /**
   * DEBUG «go to level» box. `onGo` gets the raw input and returns an error
   * message to show (box stays open), or null on success (caller closes it).
   * Esc is handled by the caller's global key handler.
   */
  levelSelect(current: number, onGo: (raw: string) => string | null): void {
    const error = this.p("", "error");
    error.setAttribute("role", "alert");
    const row = document.createElement("div");
    row.className = "seed-row";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "level 1–10";
    input.inputMode = "numeric";
    input.value = String(current);
    const go = () => {
      error.textContent = onGo(input.value.trim()) ?? "";
      input.select();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
    row.appendChild(input);
    row.appendChild(this.button("Go", go));

    this.panel([
      this.h("Go to level"),
      this.p("Debug · Enter — go · Esc — cancel"),
      row,
      error,
    ]);
    input.focus();
    input.select();
  }

  // --- helpers ---
  private panel(children: HTMLElement[]): void {
    this.el.hidden = false;
    this.el.innerHTML = "";
    const card = document.createElement("div");
    card.className = "screen-card";
    for (const c of children) card.appendChild(c);
    this.el.appendChild(card);
  }

  private h(text: string, cls = ""): HTMLElement {
    const e = document.createElement("h2");
    e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  private p(text: string, cls = ""): HTMLElement {
    const e = document.createElement("p");
    e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  private button(label: string, onClick: () => void): HTMLElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  private seedRow(onStart: (seed: string) => void): HTMLElement {
    const row = document.createElement("div");
    row.className = "seed-row";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "seed (optional)";
    input.inputMode = "numeric";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onStart(input.value.trim());
    });
    const start = this.button("Start", () => onStart(input.value.trim()));
    row.appendChild(input);
    row.appendChild(start);
    return row;
  }
}
