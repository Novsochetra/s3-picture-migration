import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/convert/settings/defaults.js';
import { rollback } from '../../src/convert/rollback/rollback.js';
import { captureLog } from '../support/capture-log.js';
import { converterFor } from '../support/converter-context.js';
import { makeJpeg } from '../support/images.js';
import { createMemoryBucket } from '../support/memory-bucket.js';

const REPLACE = { keepExt: true, backupSuffix: '-original' };

let firstUpload;
let newUpload;

beforeAll(async () => {
  firstUpload = await makeJpeg(120);
  newUpload = await makeJpeg(160);
});

// The app keeps serving and replacing images while a --replace run works on them.
describe('an image the app replaces during the run', () => {
  it('is converted from the new version and never lost', async () => {
    let replaced = false;
    const bucket = createMemoryBucket('test-bucket', {
      beforeUpload: (key, target) => {
        if (!replaced && key === 'raw/cat.jpg') {
          replaced = true;
          target.seed('raw/cat.jpg', newUpload);
        }
      },
    });

    bucket.seed('raw/cat.jpg', firstUpload);

    const { convert, log } = converterFor(bucket, REPLACE);
    const result = await convert({ key: 'raw/cat.jpg' });

    expect(result).toMatchObject({ status: 'done', attempts: 2 });
    expect(log.text()).toMatch(/the app replaced it/);
    expect(bucket.bodyOf('raw/cat-original.jpg').equals(newUpload)).toBe(true);
    expect((await bucket.head('raw/cat.jpg')).ContentType).toBe('image/webp');
  });
});

// The backup is the only copy of the original once the WebP is written over it.
describe('a size that fails after the WebP replaced the original', () => {
  it('keeps the backup', async () => {
    const bucket = createMemoryBucket('test-bucket', {
      beforeUpload: (key) => {
        if (key === 'raw/cat-100w.jpg') {
          throw Object.assign(new Error('unsupported image'), { permanent: true });
        }
      },
    });

    bucket.seed('raw/cat.jpg', firstUpload);

    const result = await converterFor(bucket, { ...REPLACE, sizes: [100] }).convert({
      key: 'raw/cat.jpg',
    });

    expect(result).toMatchObject({ status: 'invalid' });
    expect((await bucket.head('raw/cat.jpg')).ContentType).toBe('image/webp');
    expect(bucket.bodyOf('raw/cat-original.jpg').equals(firstUpload)).toBe(true);
  });
});

describe('rollback after the app replaced a converted image', () => {
  it('leaves the new upload alone and keeps the backup', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/cat.jpg', firstUpload);
    await converterFor(bucket, REPLACE).convert({ key: 'raw/cat.jpg' });
    bucket.seed('raw/cat.jpg', newUpload);

    const session = {
      args: { yes: true },
      connection: {},
      limits: { concurrency: 2 },
      log: captureLog(),
      prompt: null,
      bucket,
      prefix: 'raw/',
      settings: { ...DEFAULT_SETTINGS, ...REPLACE },
      jobFiles: { startOver: () => null, save: () => {} },
    };

    await rollback(session);

    expect(bucket.bodyOf('raw/cat.jpg').equals(newUpload)).toBe(true);
    expect(bucket.keys()).toEqual(['raw/cat-original.jpg', 'raw/cat.jpg']);
    expect(session.log.text()).toMatch(/changed after the conversion/);
  });
});
