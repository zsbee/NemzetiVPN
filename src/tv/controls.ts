/** Transient playback chrome. Panels pin it; hidden controls never receive focus. */
export class PlaybackControls {
  private timer?: ReturnType<typeof setTimeout>;
  private pinned = false;
  private hovered = false;
  constructor(private overlay: HTMLElement, private video: HTMLVideoElement, private active: () => boolean, private hideAfterMs = 5000) {
    // Initialize the legacy inert adapter even when the HTML already has inert.
    overlay.inert = false;
    this.hide();
    overlay.addEventListener('pointerenter', () => { this.hovered = true; this.show(); });
    overlay.addEventListener('pointerleave', () => { this.hovered = false; if (!this.pinned) this.show(); });
  }
  get visible(): boolean { return !this.overlay.inert; }
  pin(value: boolean): void { this.pinned = value; if (value) clearTimeout(this.timer); else if (this.visible) this.show(); }
  show(focus = false): void {
    if (!this.active()) return;
    clearTimeout(this.timer);
    this.overlay.inert = false;
    this.overlay.removeAttribute('aria-hidden');
    this.overlay.classList.remove('chrome-hidden');
    if (focus) this.overlay.querySelector<HTMLButtonElement>('button')?.focus();
    if (!this.pinned && !this.hovered) this.timer = setTimeout(() => this.hide(), this.hideAfterMs);
  }
  hide(): void {
    clearTimeout(this.timer);
    this.hovered = false;
    if (this.overlay.contains(document.activeElement)) this.video.focus({ preventScroll: true });
    this.overlay.inert = true;
    this.overlay.setAttribute('aria-hidden', 'true');
    this.overlay.classList.add('chrome-hidden');
  }
}
