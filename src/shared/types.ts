export type ErrorCode = 'AUTH_REQUIRED' | 'INVALID_CREDENTIALS' | 'CHALLENGE_REQUIRED' |
  'NETWORK' | 'PROVIDER_CHANGED' | 'CAPACITY' | 'UNSUPPORTED_MEDIA' | 'PLAYBACK' | 'STORAGE' | 'CANCELLED' | 'INVALID_REQUEST';

export class AppError extends Error {
  constructor(public readonly code: ErrorCode, public readonly diagnosticHost?: string) { super(code); }
}

export interface Credentials { email: string; password: string }
export interface Channel { id: string; name: string; description: string }
export interface Status { authenticated: boolean }
export interface Quality { id: string; label: string }
export interface Playback { url: string; mime: string; qualities?: Quality[]; quality?: string }
export interface Programme { channel: string; title: string; subtitle?: string; description?: string; start: number; end: number }
export interface GuideDay { date: string; programmes: Programme[]; updatedAt: number; stale?: boolean }
export interface Backend {
  status(): Promise<Status>;
  login(credentials: Credentials): Promise<Status>;
  channels(): Promise<Channel[]>;
  resolve(id: string, quality?: string): Promise<Playback>;
  guide?(date: string): Promise<GuideDay>;
  stop?(): Promise<void>;
  diagnostics?(): Promise<object>;
  logout(): Promise<{ remoteConfirmed: boolean }>;
}

export const M4: Channel = { id: 'm4', name: 'M4 Sport', description: 'Élő sportközvetítés' };
export const CHANNELS: (Channel & { streamId: string })[] = [
  { ...M4, streamId: 'mtv4live' },
  { id: 'm1', name: 'M1', description: 'Hírek és közélet', streamId: 'mtv1live' },
  { id: 'm2', name: 'M2 / Petőfi TV', description: 'Gyermekműsorok és kultúra', streamId: 'mtv2live' },
  { id: 'm4plus', name: 'M4 Sport +', description: 'További sportközvetítések', streamId: 'mtv4plus' },
  { id: 'm5', name: 'M5', description: 'Kultúra és ismeretterjesztés', streamId: 'mtv5live' },
  { id: 'duna', name: 'Duna', description: 'Magyar műsorok és történetek', streamId: 'dunalive' },
  { id: 'dunaworld', name: 'Duna World', description: 'Magyarország a világban', streamId: 'dunaworldlive' },
];
export const EVENT_CHANNELS = Array.from({ length: 5 }, (_, index) => ({
  id: `m4sport${index + 1}`, streamId: `m4sport${index + 1}`, name: `M4 Sport ${index + 1}`, description: 'Eseményközvetítés',
}));
export const SERVICE_ID = 'hu.nemzetivpn.tv.service';
export const APP_ID = 'hu.nemzetivpn.tv';

export function publicError(error: unknown): ErrorCode {
  return error instanceof AppError ? error.code : 'NETWORK';
}

export function validateCredentials(value: unknown): Credentials {
  const c = value as Partial<Credentials> | null;
  if (!c || typeof c.email !== 'string' || typeof c.password !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim()) || c.email.length > 254 ||
    c.password.length < 1 || c.password.length > 1024) throw new AppError('INVALID_REQUEST');
  return { email: c.email.trim(), password: c.password };
}
