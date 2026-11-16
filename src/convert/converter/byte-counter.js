import { Transform } from 'node:stream';

export class LargerThanOriginalError extends Error {}

export function byteCounter(limit = null) {
  let total = 0;

  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;

      if (limit && total > limit) {
        callback(new LargerThanOriginalError('webp larger than original'));

        return;
      }

      callback(null, chunk);
    },
  });

  counter.total = () => total;

  return counter;
}
