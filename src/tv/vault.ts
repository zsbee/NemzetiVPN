import { AppError, validateCredentials, type Credentials } from '../shared/types';

export interface Vault { load(): Promise<Credentials | null>; save(credentials: Credentials): Promise<void>; clear(): Promise<void> }
const DATABASE = 'nemzetivpn-vault';
const AAD = new TextEncoder().encode('hu.nemzetivpn.tv/credentials/v1');
interface Sealed { version: 1; key: CryptoKey; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer }

export class DeviceVault implements Vault {
  private queue: Promise<unknown> = Promise.resolve();
  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => {});
    return next;
  }

  private async db(): Promise<IDBDatabase> {
    if (!globalThis.crypto?.subtle || !globalThis.indexedDB) throw new AppError('STORAGE');
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('private');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new AppError('STORAGE'));
      request.onblocked = () => reject(new AppError('STORAGE'));
    });
  }

  private async record(mode: IDBTransactionMode, value?: Sealed | null): Promise<Sealed | null> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('private', mode);
      const store = transaction.objectStore('private');
      const request = mode === 'readonly' ? store.get('account') : value ? store.put(value, 'account') : store.delete('account');
      transaction.oncomplete = () => { db.close(); resolve(mode === 'readonly' ? request.result ?? null : null); };
      transaction.onabort = transaction.onerror = () => { db.close(); reject(new AppError('STORAGE')); };
    });
  }

  load(): Promise<Credentials | null> {
    return this.run(async () => {
      try {
        const record = await this.record('readonly');
        if (!record) return null;
        if (record.version !== 1 || record.key.extractable || record.key.algorithm.name !== 'AES-GCM') throw new AppError('STORAGE');
        const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv, additionalData: AAD }, record.key, record.ciphertext);
        return validateCredentials(JSON.parse(new TextDecoder().decode(bytes)));
      } catch { throw new AppError('STORAGE'); }
    });
  }

  save(credentials: Credentials): Promise<void> {
    return this.run(async () => {
      try {
        const valid = validateCredentials(credentials);
        if (!globalThis.crypto?.subtle) throw new AppError('STORAGE');
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const plaintext = new TextEncoder().encode(JSON.stringify(valid));
        let ciphertext: ArrayBuffer;
        try { ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, plaintext); }
        finally { plaintext.fill(0); }
        await this.record('readwrite', { version: 1, key, iv, ciphertext });
        // Check structured-cloned CryptoKey support instead of claiming persistence after just a write.
        const restored = await this.record('readonly');
        if (!restored || restored.key.extractable) throw new AppError('STORAGE');
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv: restored.iv, additionalData: AAD }, restored.key, restored.ciphertext);
      } catch {
        try { await this.record('readwrite', null); } catch { /* Never fall back to plaintext storage. */ }
        throw new AppError('STORAGE');
      }
    });
  }

  clear(): Promise<void> { return this.run(async () => { await this.record('readwrite', null); }); }
}
