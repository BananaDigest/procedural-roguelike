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
      this.titleArt(),
      this.h('«А Тебе?»', "brand"),
      this.p("Mouse in the Market — a new market every run", "sub"),
      this.controls(),
      this.divider(),
      this.seedRow(onStart),
      this.p("Same seed → same market", "hint"),
    ]);
  }

  // --- title decoration ---
  private titleArt(): HTMLCanvasElement {
    const W = 248, Hh = 92;
    const c = document.createElement("canvas");
    c.className = "title-art";
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = Hh * dpr;
    c.style.width = `${W}px`;
    c.style.height = `${Hh}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return c;
    ctx.scale(dpr, dpr);

    // faint floor dots
    ctx.fillStyle = "rgba(230,235,240,0.16)";
    for (let i = 0; i < 9; i++) ctx.fillRect(26 + i * 25, Hh - 18, 2, 2);
    // trail of dots from the mouse toward the cheese
    ctx.fillStyle = "rgba(245,246,248,0.5)";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(92 + i * 15, Hh * 0.52, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    this.artMouse(ctx, 46, Hh * 0.52);
    this.artCheese(ctx, 196, Hh * 0.5);
    return c;
  }

  private artMouse(ctx: CanvasRenderingContext2D, X: number, Y: number): void {
    const s = 34, bx = X - s / 2, by = Y - s / 2;
    ctx.fillStyle = "#f5f6f8";
    ctx.strokeStyle = "#5a5f66";
    ctx.lineWidth = 1.5;
    for (const ex of [bx + 7, bx + s - 7]) {
      ctx.beginPath();
      ctx.moveTo(ex, by + 2); ctx.lineTo(ex - 6, by - 6); ctx.lineTo(ex + 6, by - 5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.roundRect(bx, by, s, s, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#111111";
    ctx.beginPath(); ctx.arc(X - 6, Y - 2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(X + 6, Y - 2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff9ec4";
    ctx.beginPath(); ctx.arc(X, Y + 5, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ff9ec4"; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(bx + s, Y + 6);
    ctx.quadraticCurveTo(X + s * 0.85, Y + 6, X + s * 0.72, Y - 9);
    ctx.stroke();
  }

  private artCheese(ctx: CanvasRenderingContext2D, X: number, Y: number): void {
    const s = 48;
    const ax = X, ay = Y - s * 0.44; // apex (top)
    const blx = X - s * 0.5, bly = Y + s * 0.34; // bottom-left
    const brx = X + s * 0.5, bry = Y + s * 0.34; // bottom-right
    const wedge = () => {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(brx, bry);
      ctx.lineTo(blx, bly);
      ctx.closePath();
    };
    // body: vertical gradient + soft golden glow
    ctx.save();
    ctx.shadowColor = "rgba(242,183,5,0.5)";
    ctx.shadowBlur = 16;
    const grad = ctx.createLinearGradient(0, ay, 0, bly);
    grad.addColorStop(0, "#ffd96b");
    grad.addColorStop(1, "#e8a606");
    ctx.fillStyle = grad;
    ctx.lineJoin = "round";
    wedge(); ctx.fill();
    ctx.restore();
    // rind outline
    ctx.strokeStyle = "#a9790a"; ctx.lineWidth = 1.5; ctx.lineJoin = "round";
    wedge(); ctx.stroke();
    // left-edge highlight
    ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ax + 1, ay + 4); ctx.lineTo(blx + 3, bly - 3); ctx.stroke();
    // holes with depth (shadow body + small highlight)
    const holes: [number, number, number][] = [
      [-0.12, 0.14, 0.085], [0.11, 0.07, 0.06], [-0.02, -0.06, 0.045], [0.17, 0.2, 0.045],
    ];
    for (const [hx, hy, hr] of holes) {
      const cxh = X + hx * s, cyh = Y + hy * s, r = hr * s;
      ctx.fillStyle = "#c6880a";
      ctx.beginPath(); ctx.arc(cxh, cyh, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.arc(cxh - r * 0.3, cyh - r * 0.3, r * 0.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  private controls(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "keys";
    const items: [string, string][] = [["WASD", "move"], ["M", "map"], ["R", "new run"]];
    for (const [k, label] of items) {
      const chip = document.createElement("span");
      chip.className = "key-chip";
      const kbd = document.createElement("kbd");
      kbd.textContent = k;
      const lab = document.createElement("span");
      lab.className = "key-label";
      lab.textContent = label;
      chip.append(kbd, lab);
      wrap.appendChild(chip);
    }
    return wrap;
  }

  private divider(): HTMLElement {
    const d = document.createElement("div");
    d.className = "divider";
    return d;
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
    input.placeholder = "seed — empty = random";
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
