import { AppError, SERVICE_ID, type Backend, type Channel, type Credentials, type ErrorCode, type Playback, type Status } from '../shared/types';

interface Bridge { onservicecallback: (response: string) => void; call(uri: string, args: string): void; cancel(): void }
declare global { interface Window { PalmServiceBridge?: new () => Bridge; PalmSystem?: { platformBack(): void } } }

const ERROR_CODES = new Set<ErrorCode>(['AUTH_REQUIRED', 'INVALID_CREDENTIALS', 'CHALLENGE_REQUIRED', 'NETWORK', 'PROVIDER_CHANGED', 'CAPACITY', 'UNSUPPORTED_MEDIA', 'STORAGE', 'CANCELLED', 'INVALID_REQUEST']);
export const onTV = () => Boolean(window.PalmServiceBridge);

export class AppBackend implements Backend {
  private bridges = new Set<Bridge>();
  private lease?: Bridge;
  private ensureLease(): void {
    if (!window.PalmServiceBridge || this.lease) return;
    const lease = this.lease = new window.PalmServiceBridge();
    lease.onservicecallback = () => {};
    lease.call(`luna://${SERVICE_ID}/lease`, JSON.stringify({ subscribe: true }));
  }
  release(): void { this.lease?.cancel(); this.lease = undefined; }
  private async request<T>(method: string, parameters: object = {}): Promise<T> {
    let response: { returnValue: boolean; data?: T; code?: ErrorCode };
    if (window.PalmServiceBridge) {
      this.ensureLease();
      response = await new Promise((resolve, reject) => {
        const bridge = new window.PalmServiceBridge!();
        this.bridges.add(bridge);
        const timer = setTimeout(() => { bridge.cancel(); this.bridges.delete(bridge); reject(new AppError('NETWORK')); }, 90000);
        bridge.onservicecallback = text => {
          clearTimeout(timer); this.bridges.delete(bridge);
          try { resolve(JSON.parse(text)); } catch { reject(new AppError('NETWORK')); }
        };
        bridge.call(`luna://${SERVICE_ID}/${method}`, JSON.stringify(parameters));
      });
    } else {
      try {
        const result = await fetch(`/api/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parameters), signal: AbortSignal.timeout(90000) });
        response = await result.json();
      } catch { throw new AppError('NETWORK'); }
    }
    if (!response.returnValue) throw new AppError(response.code && ERROR_CODES.has(response.code) ? response.code : 'NETWORK');
    return response.data as T;
  }
  status() { return this.request<Status>('status'); }
  login(c: Credentials) { return this.request<Status>('login', c); }
  channels() { return this.request<Channel[]>('channels'); }
  resolve(id: string) { return this.request<Playback>('resolve', { id }); }
  async stop() { await this.request('stop'); }
  logout() { return this.request<{ remoteConfirmed: boolean }>('logout'); }
}
