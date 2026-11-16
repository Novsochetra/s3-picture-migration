import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runConvert } from '../../../src/convert/main.js';
import { captureLog } from '../../support/capture-log.js';
import { createMemoryBucket } from '../../support/memory-bucket.js';

let output;

beforeEach(() => {
  output = [];
  vi.spyOn(console, 'log').mockImplementation((line) => output.push(line));
});

function ls(bucket, ...flags) {
  const connect = async () => ({ bucket, region: 'test-region-1' });

  return runConvert(['--ls', '--bucket', bucket.name, ...flags], { connect, log: captureLog() });
}

describe('--ls', () => {
  it('lists one level of a folder', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/cat.jpg', 'cat');
    bucket.seed('raw/2024/dog.jpg', 'dog');

    expect(await ls(bucket, '--prefix', 'raw')).toBe(0);
    expect(output[0]).toBe('s3://test-bucket/raw/\n');
    expect(output.slice(1, 3)).toEqual([
      expect.stringMatching(/DIR {2}2024\/$/),
      expect.stringMatching(/3 B {2}cat\.jpg$/),
    ]);
    expect(output.at(-1)).toMatch(/1 file\(s\), 3 B · 1 folder\(s\)/);
  });

  it('lists everything inside with --recursive', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/cat.jpg', 'cat');
    bucket.seed('raw/2024/dog.jpg', 'dog');

    await ls(bucket, '--prefix', 'raw', '--recursive');

    expect(output[0]).toBe('s3://test-bucket/raw/   (recursive)\n');
    expect(output.at(-1)).toBe('\n2 file(s), 6 B');
  });
});
