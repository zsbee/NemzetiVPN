import { AppError, publicError, type Backend, type Credentials, type Playback } from '../shared/types';
import type { Vault } from './vault';
export { AppError } from '../shared/types';

// Coordinates provider sessions and the device vault; a logout invalidates any in-flight recovery.
export class Account {
  private epoch = 0;
  private recovery: Promise<void> | null = null;
  remembered = false;
  email = '';
  authenticated = false;
  storageWarning = false;
  constructor(readonly backend: Backend, private vault: Vault) {}

  async restore(): Promise<boolean> {
    const epoch = this.epoch;
    try {
      const credentials = await this.vault.load();
      if (epoch !== this.epoch) return false;
      if (!credentials) return false;
      this.email = credentials.email;
      this.remembered = true;
      await this.reauthenticate();
      return this.authenticated;
    } catch (error) {
      if (publicError(error) === 'STORAGE') { this.storageWarning = true; return false; }
      throw error;
    }
  }

  async login(credentials: Credentials, remember: boolean): Promise<void> {
    const epoch = ++this.epoch;
    this.authenticated = false;
    this.email = credentials.email;
    // Remove the previous account before making a login attempt for a different account.
    try { await this.vault.clear(); } catch { throw new AppError('STORAGE'); }
    this.remembered = false;
    await this.backend.login(credentials);
    if (epoch !== this.epoch) throw new AppError('CANCELLED');
    if (remember) {
      try { await this.vault.save(credentials); this.remembered = true; this.storageWarning = false; }
      catch { this.storageWarning = true; }
    }
    if (epoch !== this.epoch) throw new AppError('CANCELLED');
    this.authenticated = true;
  }

  private reauthenticate(): Promise<void> {
    if (this.recovery) return this.recovery;
    const epoch = this.epoch;
    this.recovery = (async () => {
      const credentials = await this.vault.load();
      if (epoch !== this.epoch) throw new AppError('CANCELLED');
      if (!credentials) { this.authenticated = false; throw new AppError('AUTH_REQUIRED'); }
      this.email = credentials.email;
      try {
        await this.backend.login(credentials);
        if (epoch !== this.epoch) throw new AppError('CANCELLED');
        this.authenticated = true;
      } catch (error) {
        if (epoch === this.epoch) {
          this.authenticated = false;
          if (publicError(error) === 'INVALID_CREDENTIALS') {
            await this.vault.clear();
            this.remembered = false;
          }
        }
        throw error;
      }
    })().finally(() => { this.recovery = null; });
    return this.recovery;
  }

  async resolve(id: string, quality?: string, current: () => boolean = () => true): Promise<Playback> {
    const epoch = this.epoch;
    try {
      const status = await this.backend.status();
      if (!current() || epoch !== this.epoch) throw new AppError('CANCELLED');
      if (!status.authenticated) throw new AppError('AUTH_REQUIRED');
      return await this.backend.resolve(id, quality);
    } catch (error) {
      if (publicError(error) !== 'AUTH_REQUIRED') throw error;
      if (epoch !== this.epoch || !current()) throw new AppError('CANCELLED');
      await this.reauthenticate();
      if (epoch !== this.epoch || !current()) throw new AppError('CANCELLED');
      return this.backend.resolve(id, quality); // One retry only. Never repeatedly reclaim another device's session.
    }
  }

  async forget(): Promise<void> { await this.vault.clear(); this.remembered = false; }

  async logout(): Promise<{ remoteConfirmed: boolean }> {
    ++this.epoch;
    this.authenticated = false;
    this.remembered = false;
    this.email = '';
    // Vault writes are serialized; clear runs after any pending save.
    const clearing = this.vault.clear();
    const logout = this.backend.logout();
    const [stored, remote] = await Promise.allSettled([clearing, logout]);
    if (stored.status === 'rejected') throw new AppError('STORAGE');
    return remote.status === 'fulfilled' ? remote.value : { remoteConfirmed: false };
  }
}
