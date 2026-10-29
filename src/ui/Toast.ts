/**
 * Toast — a short message over the top of the game (e.g. «Cheese power!»).
 * DOM, styled like the screen cards; scales with --ui-scale; fades out by itself.
 */
export class Toast {
  private el: HTMLElement;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "toast";
    this.el.setAttribute("role", "status");
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  show(title: string, detail: string, ms = 2600): void {
    this.el.innerHTML = "";
    const t = document.createElement("strong");
    t.textContent = title;
    const d = document.createElement("span");
    d.textContent = detail;
    this.el.append(t, d);

    // restart the enter animation even if a toast is already showing
    this.el.hidden = true;
    void this.el.offsetWidth;
    this.el.hidden = false;

    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => (this.el.hidden = true), ms);
  }
}
