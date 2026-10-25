// Arrow navigation only moves between controls when the keyboard isn't editing a field.
export function installFocusNavigation(keyboardVisible: () => boolean, back: () => void): void {
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
