// Arrow navigation only moves between controls when the keyboard isn't editing a field.
export function installFocusNavigation(keyboardVisible: () => boolean, back: () => void): void {
  const wheel = (event: WheelEvent | Event): void => {
    if (keyboardVisible() || document.body.classList.contains('playing') || event.defaultPrevented) return;
    if ((event.target as HTMLElement)?.closest('input, textarea, select')) return;
    const modern = event as WheelEvent;
    const legacy = event as Event & { wheelDelta?: number };
    const delta = modern.deltaY || -(legacy.wheelDelta ?? 0);
    if (!delta || modern.ctrlKey) return;
    const unit = modern.deltaMode === 1 ? 40 : modern.deltaMode === 2 ? window.innerHeight : 1;
    const distance = Math.sign(delta) * Math.min(window.innerHeight * .75, Math.max(80, Math.abs(delta * unit)));
    event.preventDefault();
    window.scrollBy({ top: distance, behavior: 'instant' });
  };
  document.addEventListener('wheel', wheel, { passive: false });
  document.addEventListener('mousewheel', event => { if (!('onwheel' in document)) wheel(event); }, { passive: false });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' || event.keyCode === 461) {
      if (keyboardVisible()) return; // Let webOS dismiss its keyboard first.
      event.preventDefault(); back(); return;
    }
    const current = document.activeElement as HTMLElement | null;
    if (keyboardVisible() || (!window.PalmServiceBridge && current?.matches('input:not([type=checkbox])'))) return;
    const keys: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const direction = keys[event.key];
    if (!direction) return;
    const controls = [...document.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]')]
      .filter(node => node.getClientRects().length && !node.closest('[hidden], [inert]'));
    if (!current || !controls.includes(current)) { controls[0]?.focus(); return; }
    const origin = current.getBoundingClientRect();
    const ox = origin.x + origin.width / 2, oy = origin.y + origin.height / 2;
    const candidates = controls.filter(node => node !== current).map(node => {
      const r = node.getBoundingClientRect();
      const dx = r.x + r.width / 2 - ox, dy = r.y + r.height / 2 - oy;
      const forward = dx * direction[0] + dy * direction[1];
      const sideways = Math.abs(dx * direction[1] - dy * direction[0]);
      return { node, forward, score: forward + sideways * 3 };
    }).filter(item => item.forward > 8).sort((a, b) => a.score - b.score);
    if (candidates[0]) { event.preventDefault(); candidates[0].node.focus(); }
  });
}
