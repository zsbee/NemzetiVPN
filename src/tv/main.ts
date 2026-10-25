import { M4, CHANNELS, publicError, type Channel } from '../shared/types';
import { Account } from './account';
import { AppBackend, onTV } from './backend';
import { DeviceVault } from './vault';
import { installFocusNavigation } from './focus';
import { hu, errors } from './strings';
import { TvPlayer } from './player';
import { PlaybackControls } from './controls';

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

for (const element of document.querySelectorAll<HTMLElement>('[data-text]')) {
  element.textContent = hu[element.dataset.text as keyof typeof hu];
}
const email = $<HTMLInputElement>('email');
const password = $<HTMLInputElement>('password');
const remember = $<HTMLInputElement>('remember');
const video = $<HTMLVideoElement>('video');
const player = new TvPlayer(video, () => { void playbackFailed(); });
const controls = new PlaybackControls($('player-overlay'), video, () => screen === 'player');

function announce(message = '', error = false): void {
  const target = screen === 'login' ? $('login-message') : $('app-message');
  target.textContent = message;
  target.classList.toggle('error', error);
}
function show(next: typeof screen): void {
  screen = next;
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
  $('login-form').setAttribute('aria-busy', String(value));
  $('sign-in').textContent = value ? hu.signingIn : hu.signIn;
  for (const e of document.querySelectorAll<HTMLInputElement | HTMLButtonElement>('#login-form input, #login-form button')) e.disabled = value;
}
function updateAccount(): void {
  $('account-email').textContent = account.email;
  $('account-saved').textContent = account.remembered ? hu.saved : hu.sessionOnly;
  $('forget').hidden = !account.remembered;
}
function showChannels(): void {
  show('channels'); updateAccount();
  renderChannels();
  announce(account.storageWarning ? hu.storageWarning : '');
  ($(selectedChannel.id === 'm4' ? 'watch' : `watch-${selectedChannel.id}`) ?? $('watch'))?.focus();
}
function renderChannels(): void {
  const grid = $('channel-grid');
  grid.replaceChildren();
  for (const channel of channels) {
    const button = document.createElement('button');
    button.id = channel.id === 'm4' ? 'watch' : `watch-${channel.id}`;
    button.className = 'channel-card';
    button.setAttribute('aria-label', channel.id === 'm4' ? hu.watch : `${channel.name} élő adás`);
    const live = document.createElement('span'); live.className = 'live-dot'; live.textContent = 'ÉLŐ';
    const name = document.createElement('span'); name.className = 'channel-logo'; name.textContent = channel.name;
    const bottom = document.createElement('span'); bottom.className = 'channel-bottom';
    const description = document.createElement('span'); description.className = 'programme'; description.textContent = channel.description;
    const watch = document.createElement('span'); watch.className = 'watch-label'; watch.textContent = hu.watch;
    bottom.append(description, watch); button.append(live, name, bottom);
    button.addEventListener('click', () => { selectedChannel = channel; void play(); });
    grid.append(button);
  }
}
async function loadChannels(): Promise<void> {
  try {
    const loaded = await backend.channels();
    if (Array.isArray(loaded) && loaded.length) channels = loaded;
  } catch { channels = CHANNELS; }
}
function stopPlayback(stopService = false): void {
  player.stop();
  if (stopService) void backend.stop().catch(() => {});
}
function errorText(error: unknown): string { return errors[publicError(error)] ?? errors.NETWORK; }

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

async function play(resetRecovery = true): Promise<void> {
  if (resetRecovery) mediaRecoveryAttempted = false;
  const epoch = ++viewEpoch;
  stopPlayback();
  show('player'); $('player-title').textContent = selectedChannel.name;
  controls.show();
  $('player-status').textContent = hu.loading;
  $('retry-playback').hidden = true;
  $('back-player').focus();
  try {
    const playback = await account.resolve(selectedChannel.id);
    if (epoch !== viewEpoch) return;
    await player.start(playback.url, playback.mime);
  } catch (error) {
    if (epoch !== viewEpoch) return;
    const code = publicError(error);
    if (code === 'PLAYBACK') { await playbackFailed(); return; }
    if (['AUTH_REQUIRED', 'INVALID_CREDENTIALS', 'CHALLENGE_REQUIRED'].includes(code)) {
      stopPlayback(); show('login'); email.value = account.email;
      announce(errorText(error), true); $('sign-in').focus();
    } else {
      $('player-status').textContent = errorText(error);
      $('retry-playback').hidden = code === 'UNSUPPORTED_MEDIA';
    }
  }
}
$('retry-playback').addEventListener('click', () => { void play(); });
$('back-player').addEventListener('click', () => { ++viewEpoch; stopPlayback(true); showChannels(); });
video.addEventListener('playing', () => { $('player-status').textContent = ''; });
async function playbackFailed(): Promise<void> {
  if (screen !== 'player' || player.mode === 'stopped') return;
  const epoch = viewEpoch;
  if (!mediaRecoveryAttempted) {
    mediaRecoveryAttempted = true;
    try {
      if (!(await backend.status()).authenticated && epoch === viewEpoch) { await play(false); return; }
    } catch { /* Surface one recoverable failure without starting another retry loop. */ }
  }
  if (epoch !== viewEpoch) return;
  $('player-status').textContent = hu.playFailed;
  $('retry-playback').hidden = false;
}

$('forget').addEventListener('click', async () => {
  try { await account.forget(); updateAccount(); announce('A mentett belépési adatokat töröltük.'); }
  catch (error) { announce(errorText(error), true); }
});
$('logout').addEventListener('click', async () => {
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
  if (screen === 'player') { ++viewEpoch; stopPlayback(true); showChannels(); }
  else if (onTV()) window.PalmSystem?.platformBack();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    maskPassword();
    if (screen === 'player') { ++viewEpoch; stopPlayback(); showChannels(); }
    backend.release();
  }
});
window.addEventListener('pagehide', () => { stopPlayback(); backend.release(); });

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
