import zlib from 'zlib';

// maxOutputLength is newer than Node 8. Bound decoded bytes while streaming.
function decode(create: () => zlib.Gunzip | zlib.Inflate, input: Buffer, options: { maxOutputLength: number }, callback: (error: Error | null, output?: Buffer) => void): void {
  const stream = create();
  const chunks: Buffer[] = [];
  let size = 0, done = false;
  const finish = (error: Error | null, output?: Buffer) => {
    if (done) return;
    done = true;
    callback(error, output);
  };
  stream.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > options.maxOutputLength) {
      finish(new Error('Decoded response too large'));
      stream.destroy();
    } else chunks.push(chunk);
  });
  stream.on('error', error => finish(error));
  stream.on('end', () => finish(null, Buffer.concat(chunks)));
  stream.end(input);
}
export default {
  gunzip(input: Buffer, options: { maxOutputLength: number }, callback: (error: Error | null, output?: Buffer) => void) { decode(() => zlib.createGunzip(), input, options, callback); },
  inflate(input: Buffer, options: { maxOutputLength: number }, callback: (error: Error | null, output?: Buffer) => void) { decode(() => zlib.createInflate(), input, options, callback); },
};
