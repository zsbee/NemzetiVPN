import { DeviceVault as ModernVault } from '../tv/vault';
import { AppError } from '../shared/types';

// Some older TV origins may lack Web Crypto. Still permit session-only login,
// while removing any earlier saved account before switching users.
export class DeviceVault extends ModernVault {
  clear(): Promise<void> {
    if (window.crypto?.subtle) return super.clear();
    if (!window.indexedDB) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('nemzetivpn-vault');
      request.onsuccess = () => resolve();
      request.onerror = request.onblocked = () => reject(new AppError('STORAGE'));
    });
  }
}
