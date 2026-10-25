/** Logo accents also cover the temporary M4 event channels. */
const accents: Record<string, string> = {
  m1: '#414b96', m2: '#70af35', m4: '#cf2944', m4plus: '#cf2944',
  m5: '#dd792b', duna: '#169ede', dunaworld: '#169ede',
};

export function setChannelAmbient(id?: string): void {
  const color = id ? accents[id.startsWith('m4sport') ? 'm4' : id] : undefined;
  document.body.style.setProperty('--channel-ambient', color ?? '#28384b');
}

/** Pointer effects never move focus or interfere with remote navigation. */
export function installChannelAppearance(grid: HTMLElement): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let tilted: HTMLElement | undefined;
  let frame = 0;
  let lastX = -1, lastY = -1;
  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    if (tilted) {
      tilted.classList.remove('pointer-active');
      for (const property of ['--tilt-x', '--tilt-y', '--shine-x', '--shine-y']) tilted.style.removeProperty(property);
      tilted = undefined;
    }
  };
  const focusedAmbient = () => {
    const tile = grid.querySelector<HTMLElement>(':focus');
    if (tile) setChannelAmbient(tile.dataset.channel);
  };
  grid.addEventListener('focusin', event => setChannelAmbient((event.target as HTMLElement).closest<HTMLElement>('.channel-card')?.dataset.channel));
  const move = (event: MouseEvent | PointerEvent) => {
    if ('pointerType' in event && event.pointerType === 'touch') return;
    if (event.clientX === lastX && event.clientY === lastY) return;
    lastX = event.clientX; lastY = event.clientY;
    const tile = (event.target as HTMLElement).closest<HTMLElement>('.channel-card');
    if (!tile) { reset(); focusedAmbient(); return; }
    setChannelAmbient(tile.dataset.channel);
    if (reducedMotion.matches) return;
    if (tilted !== tile) { reset(); tilted = tile; }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      const rect = tile.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      tile.style.setProperty('--tilt-x', `${(0.5 - y) * 7}deg`);
      tile.style.setProperty('--tilt-y', `${(x - 0.5) * 7}deg`);
      tile.style.setProperty('--shine-x', `${x * 100}%`);
      tile.style.setProperty('--shine-y', `${y * 100}%`);
      tile.classList.add('pointer-active');
    });
  };
  grid.addEventListener(window.PointerEvent ? 'pointermove' : 'mousemove', move as EventListener);
  grid.addEventListener(window.PointerEvent ? 'pointerleave' : 'mouseleave', () => { reset(); focusedAmbient(); });
  document.addEventListener('keydown', () => { reset(); focusedAmbient(); }, true);
  document.addEventListener('visibilitychange', reset);
  window.addEventListener('blur', reset);
  // addListener is supported by older webOS browsers as well.
  reducedMotion.addListener(reset);
}
