// These fallbacks are shipped only in the opt-in CX bundle.
if (typeof globalThis === 'undefined') Object.defineProperty(window, 'globalThis', { value: window, configurable: true });
if (!Element.prototype.replaceChildren) Object.defineProperty(Element.prototype, 'replaceChildren', {
  configurable: true, writable: true, value: function (this: Element, ...nodes: (Node | string)[]) {
    while (this.firstChild) this.removeChild(this.firstChild);
    this.append(...nodes);
  },
});
if (!Promise.allSettled) Object.defineProperty(Promise, 'allSettled', {
  configurable: true, writable: true, value: (values: unknown[]) => Promise.all(values.map(value => Promise.resolve(value).then(
    value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }),
  ))),
});
if (!('inert' in HTMLElement.prototype)) {
  const saved = new WeakMap<HTMLElement, Map<HTMLElement, string | null>>();
  Object.defineProperty(HTMLElement.prototype, 'inert', {
    configurable: true,
    get(this: HTMLElement) { return this.hasAttribute('inert'); },
    set(this: HTMLElement, hidden: boolean) {
      if (hidden === this.hasAttribute('inert')) return;
      if (hidden) {
        const tabs = new Map<HTMLElement, string | null>();
        for (const control of this.querySelectorAll<HTMLElement>('button, input, a[href], [tabindex]')) {
          tabs.set(control, control.getAttribute('tabindex'));
          control.setAttribute('tabindex', '-1');
        }
        saved.set(this, tabs);
        this.setAttribute('inert', '');
      } else {
        for (const [control, tabindex] of saved.get(this) || []) {
          if (tabindex === null) control.removeAttribute('tabindex');
          else control.setAttribute('tabindex', tabindex);
        }
        saved.delete(this);
        this.removeAttribute('inert');
      }
    },
  });
}
// The desktop preview also runs under Chromium 68; TV requests use the Luna bridge.
if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) Object.defineProperty(AbortSignal, 'timeout', {
  configurable: true, writable: true, value: (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  },
});
