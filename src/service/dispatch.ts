import { AppError, publicError, validateCredentials, type Backend } from '../shared/types';

export async function dispatch(provider: Backend, method: string, payload: unknown): Promise<object> {
  try {
    let data: unknown;
    switch (method) {
      case 'status': data = await provider.status(); break;
      case 'login': data = await provider.login(validateCredentials(payload)); break;
      case 'channels': data = await provider.channels(); break;
      case 'resolve': {
        const id = (payload as { id?: unknown })?.id;
        if (typeof id !== 'string') throw new AppError('INVALID_REQUEST');
        data = await provider.resolve(id); break;
      }
      case 'logout': data = await provider.logout(); break;
      case 'stop': await provider.stop?.(); data = {}; break;
      default: throw new AppError('INVALID_REQUEST');
    }
    return { returnValue: true, data };
  } catch (error) {
    // Do not serialize exceptions: their messages may contain credentials or signed URLs.
    return { returnValue: false, code: publicError(error) };
  }
}
