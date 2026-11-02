/**
 * Screens — title / game over / win overlays (DOM, over the canvas).
 * All text is English. Buttons + seed input are real DOM for accessibility.
 */
import {
  PLAYER_MAX_HP, PLAYER_BASE_ATTACK,
  CASHIER_HP, CASHIER_DAMAGE,
  LOADER_HP, LOADER_DAMAGE,
  GUARD_HP, GUARD_DAMAGE,
  BOSS_HP, BOSS_DAMAGE,
  FLY_HP, FLY_DAMAGE,
  WILD_MOUSE_HP, WILD_MOUSE_DAMAGE,
} from "../game/balance.ts";
import { drawMouse } from "../render/Renderer.ts";

/** Characters shown in the catalog (icon, name, funny blurb, live HP/DMG from balance). */
const ROSTER: { kind: string; name: string; desc: string; hp: number; dmg: number }[] = [
  { kind: "mouse", name: "The Mouse (you)", desc: "Small, hungry, and far too brave for a rodent. Will cross ten shops for one wheel of cheese.", hp: PLAYER_MAX_HP, dmg: PLAYER_BASE_ATTACK },
  { kind: "cashier", name: "Cashier", desc: "Beeps at everything. Drifts down the aisles hunting a barcode that was never there.", hp: CASHIER_HP, dmg: CASHIER_DAMAGE },
  { kind: "loader", name: "Loader", desc: "Married to his box. Won't chase you — shelf 7 isn't going to restock itself.", hp: LOADER_HP, dmg: LOADER_DAMAGE },
  { kind: "guard", name: "Guard", desc: "Takes 'loss prevention' personally. Will pursue one (1) mouse across the entire store.", hp: GUARD_HP, dmg: GUARD_DAMAGE },
  { kind: "boss", name: "The Cleaner", desc: "Final boss. Mops first, asks questions never. Flings rat poison the instant you corner her.", hp: BOSS_HP, dmg: BOSS_DAMAGE },
  { kind: "fly", name: "Fly", desc: "Your buzzing little sidekick. Bites enemies so your paws stay clean.", hp: FLY_HP, dmg: FLY_DAMAGE },
  { kind: "wild", name: "Wild Mouse", desc: "A mouse that lost the plot. Shuffles in circles muttering about expired yogurt.", hp: WILD_MOUSE_HP, dmg: WILD_MOUSE_DAMAGE },
];

export class Screens {
  constructor(private el: HTMLElement) {}

  hide(): void {
    this.el.hidden = true;
    this.el.innerHTML = "";
    document.body.classList.remove("modal-open");
  }

  /** onStart receives the raw seed string ("" = random). */
  title(onStart: (seed: string) => void, onCatalog: () => void): void {
    this.panel([
      this.titleArt(),
      this.h('«А Тебе?»', "brand"),
      this.controls(),
      this.divider(),
      this.seedRow(onStart),
      this.button("Catalog", onCatalog, "secondary"),
      this.p("Same seed → same market", "hint"),
    ]);
  }

  /**
   * Character catalog — left icon (1/3), right name + blurb (2/3).
   * `makeIcon` draws the REAL in-game sprite so the catalog always matches
   * what the player sees in the market.
   */
  catalog(onBack: () => void, makeIcon: (kind: string) => HTMLCanvasElement): void {
    const list = document.createElement("div");
    list.className = "catalog-list";
    for (const c of ROSTER) {
      const row = document.createElement("div");
      row.className = "catalog-row";
      const icon = makeIcon(c.kind);
      icon.classList.add("cat-icon");
      const txt = document.createElement("div");
      txt.className = "cat-text";
      // header: name with the HP / DMG tags right beside it
      const head = document.createElement("div");
      head.className = "cat-head";
      const name = document.createElement("strong");
      name.textContent = c.name;
      const stats = document.createElement("div");
      stats.className = "cat-stats";
      const hp = document.createElement("span");
      hp.className = "stat hp";
      hp.textContent = `HP ${c.hp}`;
      const dmg = document.createElement("span");
      dmg.className = "stat dmg";
      dmg.textContent = `DMG ${c.dmg}`;
      stats.append(hp, dmg);
      head.append(name, stats);
      const desc = document.createElement("p");
      desc.textContent = c.desc;
      txt.append(head, desc);
      row.append(icon, txt);
      list.appendChild(row);
    }
    this.panel([this.h("Catalog"), list, this.button("Back", onBack, "secondary")], "wide");
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

    // trail of dots from the mouse toward the cheese
    ctx.fillStyle = "rgba(245,246,248,0.5)";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(92 + i * 15, Hh * 0.52, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // The REAL in-game mouse sprite (single source of truth), centred at (46, Y).
    const ms = 48;
    drawMouse(ctx, 46 - ms / 2, Hh * 0.52 - ms / 2, ms);
    this.artCheese(ctx, 196, Hh * 0.5);
    return c;
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

  /** Pause modal — shown over the frozen game: open the catalog, or leave the run. */
  pause(onExit: () => void, onCatalog: () => void): void {
    this.panel([
      this.h("Paused"),
      this.button("Return to main menu", onExit),
      this.button("Catalog", onCatalog, "secondary"),
      this.p("Esc — resume", "hint"),
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
  private panel(children: HTMLElement[], extraClass = ""): void {
    this.el.hidden = false;
    this.el.innerHTML = "";
    document.body.classList.add("modal-open"); // lock background scroll while open
    const card = document.createElement("div");
    card.className = extraClass ? `screen-card ${extraClass}` : "screen-card";
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

  private button(label: string, onClick: () => void, cls = ""): HTMLElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (cls) b.className = cls;
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
