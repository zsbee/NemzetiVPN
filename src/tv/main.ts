import { M4, CHANNELS, publicError, type Channel } from '../shared/types';
import { Account } from './account';
import { AppBackend, onTV } from './backend';
import { DeviceVault } from './vault';
import { installFocusNavigation } from './focus';
import { hu, errors } from './strings';
import { TvPlayer } from './player';
import { GuideStore } from './guide';
import { LiveUI } from './live-ui';
import { nowNext, programmeTime } from '../shared/programmes';
import { installChannelAppearance, setChannelAmbient } from './appearance';

installChannelAppearance(document.getElementById('channel-grid')!);
const backend = new AppBackend();
const account = new Account(backend, new DeviceVault());
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let screen: 'login' | 'channels' | 'player' = 'login';
let keyboard = false;
let busy = false;
let viewEpoch = 0;
let mediaRecoveryAttempted = false;
let selectedChannel: Channel = M4;
let channels: Channel[] = CHANNELS;
const PROGRAMME_REFRESH_MS = 60_000;
let programmeTimer: ReturnType<typeof setTimeout> | undefined;
let catalogueRequest = 0;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

for (const element of document.querySelectorAll<HTMLElement>('[data-text]')) {
  element.textContent = hu[element.dataset.text as keyof typeof hu];
}
const email = $<HTMLInputElement>('email');
const password = $<HTMLInputElement>('password');
const remember = $<HTMLInputElement>('remember');
const video = $<HTMLVideoElement>('video');
const player = new TvPlayer(video, () => { void playbackFailed(); });
const guide = new GuideStore(backend);
const live = new LiveUI(video, guide, () => screen === 'player', () => channels, () => selectedChannel, id => {
  const next = channels.find(channel => channel.id === id);
  if (next) { selectedChannel = next; void play(); }
}, () => { void play(true, true); });
guide.subscribe(() => { if (screen === 'channels') renderChannels(); });
const metadataTimer = setInterval(() => {
  if (screen === 'login' || document.hidden) return;
  guide.refresh(); live.renderNow();
  if (screen === 'channels') renderChannels();
}, 60_000);

function announce(message = '', error = false): void {
  const target = screen === 'login' ? $('login-message') : $('app-message');
  target.textContent = message;
  target.classList.toggle('error', error);
  target.classList.toggle('is-loading', busy && !error && screen === 'login');
}
function show(next: typeof screen): void {
  clearTimeout(programmeTimer);
  ++catalogueRequest;
  if (next !== 'player') live.reset();
  if (next !== 'player') { clearTimeout(noticeTimer); $('player-notice').textContent = ''; }
  screen = next;
  setChannelAmbient(next === 'login' ? undefined : selectedChannel.id);
  $('login-screen').hidden = next !== 'login';
  $('channels-screen').hidden = next !== 'channels';
  $('player-screen').hidden = next !== 'player';
  document.body.classList.toggle('playing', next === 'player');
  if (next !== 'login') { password.value = ''; maskPassword(); }
}
function maskPassword(): void {
  password.type = 'password'; $('show-password').textContent = hu.show;
  $('show-password').setAttribute('aria-pressed', 'false');
}
function setBusy(value: boolean): void {
  busy = value;
  if (!value) $('login-message').classList.remove('is-loading');
  $('login-form').setAttribute('aria-busy', String(value));
  $('sign-in').textContent = value ? hu.signingIn : hu.signIn;
  for (const e of document.querySelectorAll<HTMLInputElement | HTMLButtonElement>('#login-form input, #login-form button')) e.disabled = value;
}
function updateAccount(): void {
  $('account-email').textContent = account.email;
  $('account-saved').textContent = account.remembered ? hu.saved : hu.sessionOnly;
  $('forget').hidden = !account.remembered;
}
function showChannels(refresh = false): void {
  show('channels'); updateAccount();
  renderChannels();
  guide.refresh();
  announce(account.storageWarning ? hu.storageWarning : '');
  if (refresh) void refreshProgrammes();
  else scheduleProgrammeRefresh();
  ($(selectedChannel.id === 'm4' ? 'watch' : `watch-${selectedChannel.id}`) ?? $('watch'))?.focus();
}
function renderChannels(): void {
  const grid = $('channel-grid');
  const active = document.activeElement;
  const focusedId = active?.closest('.channel-card')?.id;
  for (const channel of channels) {
    const id = channel.id === 'm4' ? 'watch' : `watch-${channel.id}`;
    let button = document.getElementById(id) as HTMLButtonElement | null;
    if (!button) {
      button = document.createElement('button');
      button.id = id;
      button.className = 'channel-card';
      button.dataset.channel = channel.id;
      const live = document.createElement('span'); live.className = 'live-dot'; live.textContent = 'ÉLŐ';
      const identity = document.createElement('span'); identity.className = 'channel-identity';
      const logo = document.createElement('img'); logo.className = 'channel-logo'; logo.alt = '';
      const logoId = channel.id.startsWith('m4sport') ? 'm4' : channel.id;
      if (CHANNELS.some(item => item.id === logoId)) logo.src = `assets/logos/${logoId}.png`;
      else logo.hidden = true;
      logo.addEventListener('error', () => { logo.hidden = true; });
      const name = document.createElement('span'); name.className = 'channel-name';
      identity.append(logo, name);
      const bottom = document.createElement('span'); bottom.className = 'channel-bottom';
      const description = document.createElement('span'); description.className = 'programme';
      const watch = document.createElement('span'); watch.className = 'watch-label'; watch.textContent = hu.watch;
      const next = document.createElement('span'); next.className = 'next-programme';
      const programmes = document.createElement('span'); programmes.className = 'card-programmes'; programmes.append(description, next);
      bottom.append(programmes, watch); button.append(live, identity, bottom);
      const channelId = channel.id;
      button.addEventListener('click', () => {
        selectedChannel = channels.find(item => item.id === channelId)!; void play();
      });
    }
    button.setAttribute('aria-label', channel.id === 'm4' ? hu.watch : `${channel.name} élő adás`);
    button.querySelector('.channel-name')!.textContent = channel.name;
    const { current, next } = nowNext(guide.programmes, channel.id);
    button.querySelector('.programme')!.textContent = current ? `Most · ${current.title}` : channel.description;
    button.querySelector('.next-programme')!.textContent = next ? `${programmeTime(next.start)} · ${next.title}` : '';
    // Existing tiles stay in place so refreshes preserve focus, hover, and scroll.
    if (grid.children[channels.indexOf(channel)] !== button) grid.insertBefore(button, grid.children[channels.indexOf(channel)] ?? null);
  }
  const ids = new Set(channels.map(channel => channel.id === 'm4' ? 'watch' : `watch-${channel.id}`));
  for (const button of [...grid.children]) if (!ids.has(button.id)) button.remove();
  if (focusedId && !document.getElementById(focusedId)) $('watch')?.focus({ preventScroll: true });
}
async function loadChannels(): Promise<void> {
  const request = ++catalogueRequest;
  try {
    const loaded = await backend.channels();
    if (request === catalogueRequest && Array.isArray(loaded) && loaded.length) channels = loaded;
  } catch { /* Keep the last programme information during a temporary outage. */ }
}
function scheduleProgrammeRefresh(): void {
  clearTimeout(programmeTimer);
  if (screen === 'channels' && !document.hidden) programmeTimer = setTimeout(() => { void refreshProgrammes(); }, PROGRAMME_REFRESH_MS);
}
async function refreshProgrammes(): Promise<void> {
  clearTimeout(programmeTimer);
  if (screen !== 'channels' || document.hidden) return;
  const epoch = viewEpoch;
  await loadChannels();
  if (epoch !== viewEpoch || screen !== 'channels' || document.hidden) return;
  renderChannels();
  scheduleProgrammeRefresh();
}
function stopPlayback(stopService = false): void {
  player.stop();
  if (stopService) void backend.stop().catch(() => {});
}
function errorText(error: unknown): string { return errors[publicError(error)] ?? errors.NETWORK; }
function qualityFallback(): void {
  live.useAuto();
  clearTimeout(noticeTimer);
  $('player-notice').textContent = hu.qualityFallback;
  noticeTimer = setTimeout(() => { $('player-notice').textContent = ''; }, 6000);
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const epoch = ++viewEpoch;
  setBusy(true); announce(hu.signingIn);
  try {
    await account.login({ email: email.value.trim(), password: password.value }, remember.checked);
    password.value = '';
    await loadChannels();
    if (epoch === viewEpoch) showChannels();
  } catch (error) {
    if (epoch !== viewEpoch) return;
    password.value = '';
    announce(errorText(error), true);
  } finally {
    if (epoch === viewEpoch) { setBusy(false); if (screen === 'login') $('sign-in').focus(); }
  }
});

$('show-password').addEventListener('click', () => {
  const revealing = password.type === 'password';
  password.type = revealing ? 'text' : 'password';
  $('show-password').textContent = revealing ? hu.hide : hu.show;
  $('show-password').setAttribute('aria-pressed', String(revealing));
});
email.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); password.focus(); }
});
password.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); password.blur(); $('sign-in').focus(); }
});

async function play(resetRecovery = true, changingQuality = false): Promise<void> {
  if (resetRecovery) mediaRecoveryAttempted = false;
  const epoch = ++viewEpoch;
  stopPlayback();
  show('player'); live.channelChanged();
  guide.refresh();
  playerStatus(hu.loading, true);
  $('retry-playback').hidden = true;
  video.focus({ preventScroll: true });
  try {
    const playback = await account.resolve(selectedChannel.id, live.quality, () => epoch === viewEpoch);
    if (epoch !== viewEpoch) return;
    live.setPlayback(playback);
    await player.start(playback.url, playback.mime);
    if (epoch === viewEpoch && changingQuality) $('player-notice').textContent = '';
  } catch (error) {
    if (epoch !== viewEpoch) return;
    const code = publicError(error);
    if (changingQuality && live.quality !== 'auto' && !['AUTH_REQUIRED', 'INVALID_CREDENTIALS', 'CHALLENGE_REQUIRED'].includes(code)) {
      qualityFallback();
      await play(false); return;
    }
    if (code === 'PLAYBACK') { await playbackFailed(); return; }
    if (['AUTH_REQUIRED', 'INVALID_CREDENTIALS', 'CHALLENGE_REQUIRED'].includes(code)) {
      stopPlayback(); show('login'); email.value = account.email;
      announce(errorText(error), true); $('sign-in').focus();
    } else {
      playerStatus(errorText(error));
      $('retry-playback').hidden = code === 'UNSUPPORTED_MEDIA';
    }
  }
}
$('retry-playback').addEventListener('click', () => { void play(); });
$('back-player').addEventListener('click', () => { ++viewEpoch; stopPlayback(true); showChannels(true); });
function playerStatus(message: string, loading = false): void {
  $('player-status').textContent = message;
  $('player-status').classList.toggle('is-loading', loading);
}
video.addEventListener('playing', () => { playerStatus(''); });
async function playbackFailed(): Promise<void> {
  if (screen !== 'player') return;
  const epoch = viewEpoch;
  if (live.quality !== 'auto') {
    qualityFallback();
    await play(false); return;
  }
  if (!mediaRecoveryAttempted) {
    mediaRecoveryAttempted = true;
    try {
      if (!(await backend.status()).authenticated && epoch === viewEpoch) { await play(false); return; }
    } catch { /* Surface one recoverable failure without starting another retry loop. */ }
  }
  if (epoch !== viewEpoch) return;
  playerStatus(hu.playFailed);
  $('retry-playback').hidden = false;
}

$('forget').addEventListener('click', async () => {
  try { await account.forget(); updateAccount(); announce('A mentett belépési adatokat töröltük.'); }
  catch (error) { announce(errorText(error), true); }
});
$('logout').addEventListener('click', async () => {
  clearTimeout(programmeTimer);
  ++catalogueRequest;
  ++viewEpoch; stopPlayback();
  try {
    const result = await account.logout();
    show('login'); email.value = password.value = ''; remember.checked = true;
    announce(result.remoteConfirmed ? hu.loggedOut : hu.remoteLogout);
  } catch (error) { show('login'); email.value = password.value = ''; announce(errorText(error), true); }
  $('sign-in').focus();
});

window.addEventListener('keyboardStateChange', event => {
  keyboard = Boolean((event as CustomEvent<{ visibility: boolean }>).detail?.visibility);
});
installFocusNavigation(() => keyboard, () => {
  if (!onTV() && document.activeElement?.matches('input')) { (document.activeElement as HTMLElement).blur(); $('sign-in').focus(); return; }
  if (screen === 'player') { if (live.back()) return; ++viewEpoch; stopPlayback(true); showChannels(true); }
  else if (onTV()) window.PalmSystem?.platformBack();
}, () => live.navigationRoot);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(programmeTimer);
    ++catalogueRequest;
    maskPassword();
    if (screen === 'player') { ++viewEpoch; stopPlayback(); showChannels(); }
    backend.release();
  } else if (screen === 'channels') void refreshProgrammes();
});
window.addEventListener('pagehide', () => { clearInterval(metadataTimer); clearTimeout(programmeTimer); ++catalogueRequest; stopPlayback(); backend.release(); });

async function init(): Promise<void> {
  setBusy(true); announce(hu.restoring);
  try {
    if (await account.restore()) { await loadChannels(); showChannels(); return; }
    announce(account.storageWarning ? hu.storageWarning : '');
  } catch (error) { email.value = account.email; announce(errorText(error), true); }
  finally { setBusy(false); }
  $('sign-in').focus();
}
void init();
