import https from 'node:https';
import { Parser } from 'htmlparser2';
import { AppError, type GuideDay, type Programme } from '../shared/types';
import { guideDate, shiftDate } from '../shared/programmes';

export const GUIDE_CHANNELS: Record<string, [string, string, string]> = {
  m4: ['30', 'm4', 'M4 Sport'], m1: ['1', 'm1', 'M1'], m2: ['2', 'm2', 'M2'],
  m4plus: ['34', 'm4p', 'M4 Sport +'], m5: ['33', 'm5', 'M5'], duna: ['3', 'dn', 'Duna'], dunaworld: ['4', 'dw', 'Duna World'],
};
const endpoint = 'https://mediaklikk.hu/wp-content/plugins/hms-global-widgets/widgets/programGuide/programGuideInterface.php';
export function programmeInstant(raw: string): number {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{4}$/.test(raw)) return NaN;
  return Date.parse(raw.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
}

/** Extract plain data only. Remote markup and actions never reach the TV DOM. */
export function parseGuide(html: string): Programme[] {
  const rows: Programme[] = [];
  const ids = new Map(Object.entries(GUIDE_CHANNELS).map(([id, value]) => [value[0], id]));
  let channel = '', row: Programme | undefined, entryDepth = 0;
  const stack: { field: 'title' | 'subtitle' | 'description' | ''; skip: boolean }[] = [];
  const parser = new Parser({
    onopentag(tag, attrs) {
      if (attrs['data-channelid']) channel = ids.get(attrs['data-channelid']) ?? '';
      const parent = stack[stack.length - 1];
      const classes = (attrs.class ?? '').split(/\s+/);
      let field = parent?.field ?? '';
      if (tag === 'li' && attrs['data-from']) {
        row = { channel, title: '', start: programmeInstant(attrs['data-from']), end: programmeInstant(attrs['data-till'] ?? '') };
        entryDepth = stack.length + 1;
      }
      if (row) {
        if (tag === 'h1') field = 'title';
        else if (classes.includes('program_description')) field = 'description';
        else if (tag === 'p' && !field && attrs.id?.endsWith('p')) field = 'subtitle';
      }
      stack.push({ field, skip: Boolean(parent?.skip || classes.includes('hms-sr-only') || ['script', 'style'].includes(tag)) });
    },
    ontext(text) {
      const frame = stack[stack.length - 1];
      if (row && frame?.field && !frame.skip) row[frame.field] = (row[frame.field] ?? '') + text;
    },
    onclosetag() {
      if (row && stack.length === entryDepth) {
        for (const field of ['title', 'subtitle', 'description'] as const) row[field] = row[field]?.replace(/\s+/g, ' ').trim().slice(0, field === 'description' ? 4000 : 300) ?? '';
        if (row.channel && row.title && Number.isFinite(row.start) && row.end > row.start) rows.push(row);
        row = undefined;
      }
      stack.pop();
    },
  }, { decodeEntities: true });
  parser.end(html);
  const unique = new Map(rows.map(row => [`${row.channel}:${row.start}:${row.title}`, row]));
  return [...unique.values()].sort((a, b) => a.start - b.start);
}

function fetchDay(date: string): Promise<string> {
  const channels = Object.values(GUIDE_CHANNELS);
  const body = new URLSearchParams({ ChannelIds: channels.map(c => c[0]).join(',') + ',', ShortCodes: channels.map(c => c[1]).join(',') + ',', Names: channels.map(c => c[2]).join(',') + ',', Date: date, Type: '0', newDesign: '1' }).toString();
  return new Promise((resolve, reject) => {
    // Fixed public metadata endpoint. No account cookies, arbitrary URL or redirect following.
    const request = https.request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), 'Accept-Encoding': 'identity' } }, response => {
      const chunks: Buffer[] = []; let bytes = 0;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 4 * 1024 * 1024) request.destroy(new AppError('PROVIDER_CHANGED'));
        else chunks.push(chunk);
      });
      response.on('error', () => reject(new AppError('NETWORK')));
      response.on('end', () => response.statusCode === 200 ? resolve(Buffer.concat(chunks).toString()) : reject(new AppError('NETWORK')));
    });
    const timer = setTimeout(() => request.destroy(new AppError('NETWORK')), 15000);
    request.on('error', () => reject(new AppError('NETWORK')));
    request.on('close', () => clearTimeout(timer));
    request.end(body);
  });
}

export class ProgrammeGuide {
  private cache = new Map<string, GuideDay>();
  private pending = new Map<string, Promise<GuideDay>>();
  constructor(private fetch = fetchDay) {}
  async day(date: string): Promise<GuideDay> {
    const today = guideDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || date < shiftDate(today, -1) || date > shiftDate(today, 14) || shiftDate(date, 0) !== date) throw new AppError('INVALID_REQUEST');
    const cached = this.cache.get(date);
    if (cached && Date.now() - cached.updatedAt < 300000) return cached;
    if (this.pending.has(date)) return this.pending.get(date)!;
    const task = this.fetch(date).then(html => {
      if (!html.includes('channel_body')) throw new AppError('PROVIDER_CHANGED');
      const day = { date, programmes: parseGuide(html), updatedAt: Date.now() };
      this.cache.delete(date); this.cache.set(date, day);
      while (this.cache.size > 10) this.cache.delete(this.cache.keys().next().value!);
      return day;
    }).catch(error => {
      if (cached) return { ...cached, stale: true };
      throw error;
    }).then(day => { this.pending.delete(date); return day; }, error => { this.pending.delete(date); throw error; });
    this.pending.set(date, task);
    return task;
  }
}
