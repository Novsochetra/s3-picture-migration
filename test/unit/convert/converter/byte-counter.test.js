import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { describe, expect, it } from 'vitest';
import {
  byteCounter,
  LargerThanOriginalError,
} from '../../../../src/convert/converter/byte-counter.js';

const drain = (counter, chunks) =>
  pipeline(
    Readable.from(chunks),
    counter,
    new Writable({ write: (_chunk, _encoding, done) => done() }),
  );

describe('byteCounter', () => {
  it('counts the bytes that pass through', async () => {
    const counter = byteCounter();

    await drain(counter, [Buffer.alloc(3), Buffer.alloc(4)]);

    expect(counter.total()).toBe(7);
  });

  it('fails once the output grows past the limit', async () => {
    await expect(drain(byteCounter(5), [Buffer.alloc(3), Buffer.alloc(4)])).rejects.toBeInstanceOf(
      LargerThanOriginalError,
    );
  });
});
