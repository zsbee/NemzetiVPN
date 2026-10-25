import crypto from 'node:crypto';
import type { Quality } from '../shared/types';

interface Variant { line: number; uriLine: number; id: string; label: string }
function variants(text: string): Variant[] {
  const lines = text.split(/\r?\n/), result: Variant[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
    let next = i + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    if (!lines[next] || lines[next].startsWith('#')) continue;
    const height = /RESOLUTION=\d+x(\d+)/.exec(lines[i])?.[1];
    const rate = /FRAME-RATE=([\d.]+)/.exec(lines[i])?.[1];
    const bandwidth = /(?:^|[:,])BANDWIDTH=(\d+)/.exec(lines[i])?.[1];
    const label = height ? `${height}p${rate ? ` · ${Math.round(Number(rate))} fps` : ''}` : bandwidth ? `${(Number(bandwidth) / 1e6).toFixed(1)} Mbps` : `Változat ${result.length + 1}`;
    // Exclude expiring URIs from the identifier, so preferences survive source refreshes.
    const id = crypto.createHash('sha256').update(lines[i]).digest('hex').slice(0, 16);
    result.push({ line: i, uriLine: next, id, label });
  }
  return result;
}
export function qualityChoices(text: string): Quality[] {
  const rows = variants(text);
  return rows.filter((row, index) => rows.findIndex(item => item.id === row.id) === index).map(row => ({ id: row.id, label: rows.filter(item => item.label === row.label).length > 1 ? `${row.label} · ${((Number(/(?:^|[:,])BANDWIDTH=(\d+)/.exec(text.split(/\r?\n/)[row.line])?.[1]) || 0) / 1e6).toFixed(1)} Mbps` : row.label }));
}
/** Retain audio/subtitle groups and all other HLS tags; remove only unselected variants. */
export function selectQuality(text: string, id: string): string {
  const rows = variants(text);
  if (!rows.some(row => row.id === id)) return text;
  const remove = new Set(rows.filter(row => row.id !== id).reduce<number[]>((all, row) => all.concat(row.line, row.uriLine), []));
  return text.split(/\r?\n/).filter((_, index) => !remove.has(index)).join('\n');
}
