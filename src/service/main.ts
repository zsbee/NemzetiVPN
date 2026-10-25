import { MediaBackend } from '../provider/relay';
import { APP_ID, SERVICE_ID } from '../shared/types';
import { dispatch } from './dispatch';

interface Message { sender: string; payload: unknown; uniqueToken: string; isSubscription: boolean; respond(value: object): void }
interface Service {
  register(name: string, callback: (message: Message) => void, cancel?: (message: Message) => void): void;
}
const ServiceConstructor = require('webos-service') as new (id: string) => Service;
const service = new ServiceConstructor(SERVICE_ID);
const provider = new MediaBackend();
const leases = new Set<string>();
const allowed = (message: Message) => typeof message.sender === 'string' && message.sender.split(' ')[0] === APP_ID;

service.register('lease', message => {
  if (!allowed(message) || !message.isSubscription) { message.respond({ returnValue: false, code: 'INVALID_REQUEST' }); return; }
  leases.add(message.uniqueToken);
  message.respond({ returnValue: true, subscribed: true });
}, message => {
  leases.delete(message.uniqueToken);
  if (!leases.size) void provider.logout();
});
for (const method of ['status', 'login', 'channels', 'resolve', 'logout', 'stop', 'diagnostics']) {
  service.register(method, message => {
    if (!allowed(message)) { message.respond({ returnValue: false, code: 'INVALID_REQUEST' }); return; }
    void dispatch(provider, method, message.payload).then(result => message.respond(result));
  });
}
