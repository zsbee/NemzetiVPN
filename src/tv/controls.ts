/** Transient playback chrome; remote Back remains handled by the app at all times. */
export class PlaybackControls {
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private overlay: HTMLElement, private video: HTMLVideoElement, private active: () => boolean, private hideAfterMs = 3000) {
    document.addEventListener('pointermove', () => { if (this.active()) this.show(); });
    document.addEventListener('mousemove', () => { if (this.active()) this.show(); });
    document.addEventListener('keydown', event => {
      if (!this.active()) return;
      const hidden = this.overlay.inert;
      if (hidden && event.key === 'Enter') {
        event.preventDefault(); event.stopPropagation();
        this.show(); this.overlay.querySelector<HTMLButtonElement>('button')?.focus();
      } else if (!hidden && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)) this.show();
    }, true);
  }

  show(): void {
    if (this.timer) clearTimeout(this.timer);
    this.overlay.inert = false;
    this.overlay.removeAttribute('aria-hidden');
    this.overlay.classList.remove('chrome-hidden');
    this.timer = setTimeout(() => this.hide(), this.hideAfterMs);
  }

  private hide(): void {
    if (!this.active()) return;
    if (this.overlay.contains(document.activeElement)) this.video.focus({ preventScroll: true });
    this.overlay.inert = true;
    this.overlay.setAttribute('aria-hidden', 'true');
    this.overlay.classList.add('chrome-hidden');
  }
}
