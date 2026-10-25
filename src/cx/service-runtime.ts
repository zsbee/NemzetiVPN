// Loaded only by the CX service entry point. webOS 5/6 use Node 8.12.
import { URL, URLSearchParams } from 'url';

class CancellationSignal {
  aborted = false;
  private listeners = new Set<() => void>();
  addEventListener(_event: string, callback: () => void): void { this.listeners.add(callback); }
  removeEventListener(_event: string, callback: () => void): void { this.listeners.delete(callback); }
  cancel(): void {
    if (this.aborted) return;
    this.aborted = true;
    for (const callback of this.listeners) callback();
    this.listeners.clear();
  }
}
class CancellationController {
  readonly signal = new CancellationSignal();
  abort(): void { this.signal.cancel(); }
}
const runtime = global as unknown as Record<string, unknown>;
if (!runtime.URL) runtime.URL = URL;
if (!runtime.URLSearchParams) runtime.URLSearchParams = URLSearchParams;
if (!runtime.AbortController) runtime.AbortController = CancellationController;
if (!String.prototype.trimStart) Object.defineProperty(String.prototype, 'trimStart', {
  configurable: true, writable: true, value: function (this: string) { return this.replace(/^\s+/, ''); },
});
if (!String.prototype.matchAll) Object.defineProperty(String.prototype, 'matchAll', {
  configurable: true, writable: true, value: function (this: string, pattern: RegExp) {
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    regex.lastIndex = pattern.lastIndex;
    const matches = [];
    let match;
    while ((match = regex.exec(String(this)))) {
      matches.push(match);
      if (!match[0]) regex.lastIndex++;
    }
    return matches;
  },
});
