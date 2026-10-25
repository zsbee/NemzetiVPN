import type { Programme } from './types';

const zone = 'Europe/Budapest';
export function guideDate(time = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time);
  const value = (name: string) => parts.find(part => part.type === name)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
export const programmeTime = (time: number) => new Intl.DateTimeFormat('hu-HU', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(time);
export function nowNext(programmes: Programme[], channel: string, now = Date.now()): { current?: Programme; next?: Programme } {
  const rows = programmes.filter(item => item.channel === channel).sort((a, b) => a.start - b.start);
  const current = rows.filter(item => item.start <= now && item.end > now).pop();
  return { current, next: rows.find(item => item.start > now && (!current || item.start >= current.end)) };
}
