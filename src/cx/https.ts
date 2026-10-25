import https from 'https';
import { parse } from 'url';
import { AppError } from '../shared/types';

// Node 8 accepts a single options object and has no native request signal support.
export default {
  request(url: string, options: https.RequestOptions & { signal?: AbortSignal }, listener: (response: import('http').IncomingMessage) => void) {
    const { signal, ...settings } = options;
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const request = https.request({ ...parse(url), ...settings }, response => {
      response.once('end', cleanup);
      response.once('close', cleanup);
      listener(response);
    });
    const abort = () => request.destroy(new AppError('CANCELLED'));
    if (signal) {
      signal.addEventListener('abort', abort);
      request.once('close', cleanup);
      request.once('error', cleanup);
      // Defer so the caller can install its error listener before destroy emits.
      if (signal.aborted) process.nextTick(abort);
    }
    return request;
  },
};
