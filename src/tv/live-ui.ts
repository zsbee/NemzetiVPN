import type { Channel, Playback, Programme } from '../shared/types';
import { guideDate, nowNext, programmeTime, shiftDate } from '../shared/programmes';
import { PlaybackControls } from './controls';
import { GuideStore } from './guide';
import { onTV } from './backend';

const $ = (id: string) => document.getElementById(id)!;
const text = (id: string, value: string) => { $(id).textContent = value; };

export class LiveUI {
  private controls: PlaybackControls;
  private panel: 'guide' | 'quality' | null = null;
  private directGuide = false;
  private date = guideDate();
  private guideChannel = '';
  private request = 0;
  private detail?: Programme;
  private detailLauncher?: HTMLElement;
  private playback?: Playback;
  private preferred = 'auto';
  private guideRows: { button: HTMLButtonElement; programme: Programme }[] = [];
  private loadingGuide = false;
  constructor(private video: HTMLVideoElement, private store: GuideStore, private active: () => boolean,
    private channels: () => Channel[], private selected: () => Channel,
    private switchChannel: (id: string) => void, private qualityChange: (id: string) => void) {
    this.controls = new PlaybackControls($('player-overlay'), video, active);
    $('open-guide').addEventListener('click', () => this.openGuide());
    $('open-quality').addEventListener('click', () => this.openQuality());
    $('close-guide').addEventListener('click', () => this.closePanel());
    $('close-quality').addEventListener('click', () => this.closePanel());
    $('detail-back').addEventListener('click', () => this.closeDetail());
    $('guide-watch').addEventListener('click', () => {
      const id = this.detail?.channel;
      if (id) { this.reset(); this.switchChannel(id); }
    });
    for (const [id, delta] of [['guide-channel-prev', -1], ['guide-channel-next', 1]] as const) {
      $(id).addEventListener('click', () => {
        const list = this.channels(); const index = list.findIndex(c => c.id === this.guideChannel);
        this.guideChannel = list[(index + delta + list.length) % list.length].id; void this.renderGuide();
      });
    }
    for (const [id, delta] of [['guide-day-prev', -1], ['guide-day-next', 1]] as const) {
      $(id).addEventListener('click', () => {
        if ($(id).getAttribute('aria-disabled') === 'true') return;
        this.date = shiftDate(this.date, delta); void this.renderGuide();
      });
    }
    const pointer = () => { if (this.active() && !this.panel) this.controls.show(); };
    document.addEventListener('pointermove', pointer);
    document.addEventListener('mousemove', pointer);
    document.addEventListener('keydown', event => this.key(event), true);
    store.subscribe(() => {
      this.renderNow();
      if (this.panel === 'guide' && !this.loadingGuide && !this.detail) void this.renderGuide(false, true);
    });
    $('desktop-fullscreen').hidden = onTV() || !document.documentElement.requestFullscreen;
    $('desktop-fullscreen').addEventListener('click', () => {
      const task = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      void task.catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => $('desktop-fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'));
  }
  get quality(): string { return this.preferred; }
  get navigationRoot(): HTMLElement | undefined { return this.panel ? $(this.panel === 'guide' ? this.detail ? 'programme-detail' : 'guide-panel' : 'quality-panel') : undefined; }
  reset(): void {
    ++this.request; this.panel = null; this.detail = undefined; this.loadingGuide = false;
    $('guide-panel').hidden = $('quality-panel').hidden = true;
    $('open-guide').setAttribute('aria-expanded', 'false'); $('open-quality').setAttribute('aria-expanded', 'false');
    this.controls.pin(false); this.controls.hide();
  }
  channelChanged(): void { this.reset(); this.playback = undefined; this.renderNow(); text('quality-label', 'Minőség · Auto'); }
  setPlayback(playback: Playback): void {
    this.playback = playback; this.preferred = playback.quality ?? 'auto';
    const label = playback.qualities?.find(item => item.id === this.preferred)?.label ?? 'Auto';
    text('quality-label', `Minőség · ${label}`);
    $('open-quality').setAttribute('aria-label', `Minőség: ${label}`);
  }
  useAuto(): void { this.preferred = 'auto'; }
  renderNow(): void {
    const channel = this.selected(); const { current, next } = nowNext(this.store.programmes, channel.id);
    text('player-title', channel.name);
    text('player-programme', current?.title ?? channel.description);
    text('player-next', `${current ? `${programmeTime(current.start)}–${programmeTime(current.end)}` : ''}${next ? `${current ? ' · ' : ''}Következik ${programmeTime(next.start)} · ${next.title}` : ''}`);
    for (const { button, programme } of this.guideRows) {
      const onAir = programme.start <= Date.now() && programme.end > Date.now();
      button.classList.toggle('is-current', onAir);
      button.querySelector('.guide-subtitle')!.textContent = onAir ? 'MOST MŰSORON' : programme.subtitle ?? '';
    }
    if (this.detail) $('guide-watch').hidden = this.detail.channel === channel.id || this.detail.start > Date.now() || this.detail.end <= Date.now();
  }
  private key(event: KeyboardEvent): void {
    if (!this.active() || event.defaultPrevented) return;
    const key = event.key || ({ 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 13: 'Enter' } as Record<number, string>)[event.keyCode];
    if (key === 'Tab' && this.panel) {
      const buttons = [...this.navigationRoot!.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')].filter(b => b.getClientRects().length);
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus(); return;
    }
    if (this.panel) return;
    if (this.controls.visible) {
      if (key === 'ArrowUp') { event.preventDefault(); event.stopImmediatePropagation(); this.openGuide(); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Enter'].includes(key)) this.controls.show();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(key)) return;
    if (key === 'Enter' && document.activeElement === $('retry-playback') && !$('retry-playback').hidden) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.repeat) return;
    if (key === 'ArrowUp') this.openGuide(true);
    else if (key === 'ArrowDown' || key === 'Enter') this.controls.show(true);
    else {
      const list = this.channels(); if (list.length < 2) return;
      const index = list.findIndex(c => c.id === this.selected().id);
      this.switchChannel(list[(index + (key === 'ArrowRight' ? 1 : -1) + list.length) % list.length].id);
    }
  }
  /** Return true when Back was consumed by an open interface. */
  back(): boolean {
    if (this.panel) { if (this.detail) this.closeDetail(); else this.closePanel(); return true; }
    if (this.controls.visible) { this.controls.hide(); return true; }
    return false;
  }
  private openGuide(direct = false): void {
    this.reset(); this.panel = 'guide'; this.directGuide = direct;
    this.guideChannel = this.selected().id; this.date = guideDate();
    if (!direct) this.controls.show();
    this.controls.pin(true); $('player-overlay').inert = true;
    $('open-guide').setAttribute('aria-expanded', 'true');
    $('guide-panel').hidden = false; $('programme-detail').hidden = true; $('guide-content').hidden = false;
    $('close-guide').focus(); void this.renderGuide(true);
  }
  private async renderGuide(initialFocus = false, preserve = false): Promise<void> {
    const epoch = ++this.request;
    this.loadingGuide = true;
    const focused = this.guideRows.find(row => row.button === document.activeElement)?.programme;
    const scroll = $('guide-list').scrollTop;
    this.detail = undefined; $('programme-detail').hidden = true; $('guide-content').hidden = false;
    text('guide-channel', this.channels().find(c => c.id === this.guideChannel)?.name ?? this.guideChannel);
    const today = guideDate();
    text('guide-date', this.date === today ? 'Ma' : this.date === shiftDate(today, 1) ? 'Holnap' : new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', month: 'long', day: 'numeric', weekday: 'short' }).format(Date.parse(`${this.date}T12:00:00Z`)));
    // Keep boundary controls focusable so a date refresh never strands remote focus.
    $('guide-day-prev').setAttribute('aria-disabled', String(this.date <= today));
    $('guide-day-next').setAttribute('aria-disabled', String(this.date >= shiftDate(today, 14)));
    if (!preserve) { text('guide-message', 'Műsorújság betöltése…'); $('guide-list').replaceChildren(); this.guideRows = []; }
    try {
      const day = await this.store.load(this.date);
      if (epoch !== this.request || this.panel !== 'guide') return;
      const overnight = this.date === today ? this.store.programmes.filter(item => item.channel === this.guideChannel && guideDate(item.start) < this.date && item.end > Date.now() && item.start <= Date.now()) : [];
      const combined = overnight.concat(day.programmes.filter(item => item.channel === this.guideChannel));
      const rows = [...new Map(combined.map(item => [`${item.start}:${item.title}`, item])).values()].sort((a, b) => a.start - b.start);
      $('guide-list').replaceChildren(); this.guideRows = [];
      text('guide-message', rows.length ? (day.stale ? `Mentett műsoradatok · Frissítve: ${programmeTime(day.updatedAt)}` : 'Az időpontok a magyar műsorrendet követik.') : 'Erre a napra nincs elérhető műsoradat.');
      let first: HTMLButtonElement | undefined;
      for (const item of rows) {
        const button = document.createElement('button'); button.className = 'guide-row';
        const current = item.start <= Date.now() && item.end > Date.now();
        if (current) button.classList.add('is-current');
        const time = document.createElement('span'); time.className = 'guide-time'; time.textContent = `${programmeTime(item.start)}–${programmeTime(item.end)}`;
        const title = document.createElement('span'); title.className = 'guide-row-title'; title.textContent = item.title;
        const subtitle = document.createElement('span'); subtitle.className = 'guide-subtitle'; subtitle.textContent = current ? 'MOST MŰSORON' : item.subtitle ?? '';
        button.append(time, title, subtitle); button.addEventListener('click', () => this.openDetail(item, button));
        $('guide-list').append(button);
        this.guideRows.push({ button, programme: item });
        if (!first && item.end > Date.now()) first = button;
      }
      if (initialFocus && document.activeElement === $('close-guide')) (first ?? $('close-guide')).focus();
      if (preserve) {
        if (focused) (this.guideRows.find(row => row.programme.start === focused.start && row.programme.title === focused.title)?.button ?? first ?? $('close-guide')).focus({ preventScroll: true });
        $('guide-list').scrollTop = scroll;
      }
    } catch { if (epoch === this.request) text('guide-message', 'Műsoradatok nem érhetők el. Próbálj másik napot, vagy nyisd meg később.'); }
    finally { if (epoch === this.request) this.loadingGuide = false; }
  }
  private openDetail(item: Programme, launcher: HTMLElement): void {
    this.detail = item; this.detailLauncher = launcher;
    $('guide-content').hidden = true; $('programme-detail').hidden = false;
    text('detail-title', item.title); text('detail-time', `${programmeTime(item.start)}–${programmeTime(item.end)}`);
    text('detail-subtitle', item.subtitle ?? ''); text('detail-description', item.description || 'További műsorleírás nem érhető el.');
    $('guide-watch').hidden = item.channel === this.selected().id || item.start > Date.now() || item.end <= Date.now();
    $('detail-back').focus();
  }
  private closeDetail(): void { this.detail = undefined; $('programme-detail').hidden = true; $('guide-content').hidden = false; this.detailLauncher?.focus(); void this.renderGuide(false, true); }
  private openQuality(): void {
    this.reset(); this.panel = 'quality'; this.controls.show(); this.controls.pin(true); $('player-overlay').inert = true;
    $('open-quality').setAttribute('aria-expanded', 'true'); $('quality-panel').hidden = false;
    const choices = this.playback?.qualities ?? [];
    $('quality-list').replaceChildren();
    text('quality-message', choices.length > 1 ? 'Az Auto a kapcsolatodhoz igazítja a minőséget.' : choices.length === 1 ? `Elérhető: ${choices[0].label}` : 'Automatikus lejátszás. További minőségi változat nem érhető el.');
    for (const choice of [{ id: 'auto', label: 'Auto' }, ...(choices.length > 1 ? choices : [])]) {
      const button = document.createElement('button'); button.className = 'quality-choice'; button.textContent = choice.label;
      button.setAttribute('aria-pressed', String(choice.id === this.preferred));
      button.addEventListener('click', () => {
        const changed = this.preferred !== choice.id; this.preferred = choice.id; this.closePanel();
        if (changed) this.qualityChange(choice.id);
      });
      $('quality-list').append(button);
    }
    ($('quality-list').querySelector<HTMLElement>('[aria-pressed="true"]') ?? $('close-quality')).focus();
  }
  private closePanel(): void {
    const panel = this.panel, hidden = panel === 'guide' && this.directGuide;
    this.reset();
    if (!hidden) { this.controls.show(); $(panel === 'guide' ? 'open-guide' : 'open-quality').focus(); }
    else this.video.focus({ preventScroll: true });
  }
}
