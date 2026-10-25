import type { AppBackend } from './backend';
import type { GuideDay, Programme } from '../shared/types';
import { guideDate, shiftDate } from '../shared/programmes';

export class GuideStore {
  private days = new Map<string, GuideDay>();
  private pending = new Map<string, Promise<GuideDay>>();
  private listeners = new Set<() => void>();
  constructor(private backend: AppBackend) {}
  subscribe(listener: () => void): void { this.listeners.add(listener); }
  peek(date: string): GuideDay | undefined { return this.days.get(date); }
  get programmes(): Programme[] { return [...this.days.values()].reduce<Programme[]>((all, day) => all.concat(day.programmes), []); }
  async load(date: string): Promise<GuideDay> {
    const cached = this.days.get(date);
    if (cached && !cached.stale && Date.now() - cached.updatedAt < 300000) return cached;
    if (this.pending.has(date)) return this.pending.get(date)!;
    const task = this.backend.guide(date).then(day => {
      if (day?.date !== date || !Array.isArray(day.programmes) || !Number.isFinite(day.updatedAt)) throw new Error('guide');
      this.days.delete(date); this.days.set(date, day);
      while (this.days.size > 10) this.days.delete(this.days.keys().next().value!);
      this.listeners.forEach(listener => listener());
      return day;
    }).catch(error => {
      if (cached) { const stale = { ...cached, stale: true }; this.days.set(date, stale); return stale; }
      throw error;
    }).finally(() => this.pending.delete(date));
    this.pending.set(date, task);
    return task;
  }
  refresh(): void {
    const today = guideDate();
    void this.load(today).then(() => {
      void this.load(shiftDate(today, 1)).catch(() => {});
      void this.load(shiftDate(today, -1)).catch(() => {});
    }).catch(() => {});
  }
}
