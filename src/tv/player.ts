import Hls from 'hls.js';
import { AppError } from '../shared/types';

/** Native HLS first, bounded startup and a MediaSource fallback on compatible TVs. */
export class TvPlayer {
  private hls: Hls | null = null;
  private cleanup?: () => void;
  private cancelStartup?: () => void;
  private epoch = 0;
  mode: 'native' | 'mse' | 'stopped' = 'stopped';
  constructor(private video: HTMLVideoElement, private onFatal: () => void, private startupMs = 15000) {}

  stop(): void {
    ++this.epoch;
    this.cancelStartup?.(); this.cancelStartup = undefined;
    this.cleanup?.(); this.cleanup = undefined;
    this.hls?.destroy(); this.hls = null;
    this.video.pause(); this.video.removeAttribute('src'); this.video.replaceChildren(); this.video.load();
    this.mode = 'stopped';
  }

  async start(url: string, mime: string): Promise<void> {
    this.stop();
    const epoch = this.epoch;
    if (this.video.canPlayType(mime)) {
      try { await this.begin(url, mime, 'native', epoch); return; }
      catch (error) {
        if (epoch !== this.epoch) throw new AppError('CANCELLED');
        if (!Hls.isSupported()) throw error;
      }
    }
    if (epoch !== this.epoch) throw new AppError('CANCELLED');
    if (!Hls.isSupported()) throw new AppError('UNSUPPORTED_MEDIA');
    await this.begin(url, mime, 'mse', epoch);
  }

  private begin(url: string, mime: string, mode: 'native' | 'mse', epoch: number): Promise<void> {
    this.cleanup?.(); this.hls?.destroy(); this.hls = null;
    this.video.pause(); this.video.removeAttribute('src'); this.video.replaceChildren(); this.video.load();
    this.mode = mode;
    return new Promise((resolve, reject) => {
      let started = false, failed = false;
      const timer = setTimeout(() => fail(), this.startupMs);
      const fail = () => {
        if (epoch !== this.epoch || failed) return;
        failed = true; clearTimeout(timer);
        if (started) this.onFatal();
        else { this.cleanup?.(); reject(new AppError('PLAYBACK')); }
      };
      const playing = () => {
        if (epoch !== this.epoch || failed) return;
        started = true; clearTimeout(timer); this.cancelStartup = undefined; resolve();
      };
      this.cancelStartup = () => { clearTimeout(timer); reject(new AppError('CANCELLED')); };
      this.video.addEventListener('playing', playing);
      this.video.addEventListener('error', fail);
      let source: HTMLSourceElement | undefined;
      this.cleanup = () => {
        clearTimeout(timer);
        this.video.removeEventListener('playing', playing);
        this.video.removeEventListener('error', fail);
        source?.removeEventListener('error', fail);
      };
      if (mode === 'native') {
        source = document.createElement('source');
        source.src = url;
        source.type = `${mime};mediaOption=${encodeURI(JSON.stringify({ mediaTransportType: 'HLS' }))}`;
        source.addEventListener('error', fail);
        this.video.append(source); this.video.load();
        void this.video.play().catch(fail);
      } else {
        const hls = this.hls = new Hls({ enableWorker: false, maxBufferLength: 20, maxMaxBufferLength: 40 });
        hls.on(Hls.Events.MANIFEST_PARSED, () => { if (epoch === this.epoch) void this.video.play().catch(fail); });
        hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) fail(); });
        hls.loadSource(url); hls.attachMedia(this.video);
      }
    });
  }
}
