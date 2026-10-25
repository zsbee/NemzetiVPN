import { AppError, publicError, validateCredentials, type Backend } from '../shared/types';

export async function dispatch(provider: Backend, method: string, payload: unknown): Promise<object> {
  try {
    let data: unknown;
    switch (method) {
      case 'status': data = await provider.status(); break;
      case 'login': data = await provider.login(validateCredentials(payload)); break;
      case 'channels': data = await provider.channels(); break;
      case 'guide': {
        const date = (payload as { date?: unknown })?.date;
        if (typeof date !== 'string' || !provider.guide) throw new AppError('INVALID_REQUEST');
        data = await provider.guide(date); break;
      }
      case 'resolve': {
        const id = (payload as { id?: unknown })?.id;
        const quality = (payload as { quality?: unknown })?.quality;
        if (typeof id !== 'string' || (quality !== undefined && (typeof quality !== 'string' || !/^(auto|[a-f0-9]{16})$/.test(quality)))) throw new AppError('INVALID_REQUEST');
        data = await provider.resolve(id, quality as string | undefined); break;
      }
      case 'logout': data = await provider.logout(); break;
      case 'stop': await provider.stop?.(); data = {}; break;
      case 'diagnostics': data = await provider.diagnostics?.() ?? {}; break;
      default: throw new AppError('INVALID_REQUEST');
    }
    return { returnValue: true, data };
  } catch (error) {
    // Do not serialize exceptions: their messages may contain credentials or signed URLs.
    return { returnValue: false, code: publicError(error) };
  }
}
