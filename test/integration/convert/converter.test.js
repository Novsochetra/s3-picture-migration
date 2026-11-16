import { beforeAll, describe, expect, it } from 'vitest';
import { createMemoryBucket } from '../../support/memory-bucket.js';
import { converterFor } from '../../support/converter-context.js';
import { imageSize, makeJpeg } from '../../support/images.js';

let photo;

beforeAll(async () => {
  photo = await makeJpeg(400, 200);
});

describe('the default mode', () => {
  it('writes a smaller WebP next to the original and keeps the original', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/cat.jpg', photo, { ContentType: 'image/jpeg', CacheControl: 'max-age=60' });

    const result = await converterFor(bucket).convert({ key: 'raw/cat.jpg' });
    const webp = await bucket.head('raw/cat.webp');

    expect(result).toMatchObject({
      status: 'done',
      to: 'raw/cat.webp',
      bytesIn: photo.length,
      attempts: 1,
    });
    expect(result.bytesOut).toBeLessThan(result.bytesIn);
    expect(webp).toMatchObject({ ContentType: 'image/webp', CacheControl: 'max-age=60' });
    expect(webp.Metadata['original-key']).toBe('raw%2Fcat.jpg');
    expect(bucket.keys()).toEqual(['raw/cat.jpg', 'raw/cat.webp']);
  });

  it('skips an image whose WebP already exists', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/cat.jpg', photo);
    await converterFor(bucket).convert({ key: 'raw/cat.jpg' });

    expect(await converterFor(bucket).convert({ key: 'raw/cat.jpg' })).toMatchObject({
      status: 'skipped',
      reason: 'webp already exists',
    });
  });

  it('deletes the original only after its WebP is uploaded', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/cat.jpg', photo);
    await converterFor(bucket, { deleteOriginal: true }).convert({ key: 'raw/cat.jpg' });

    expect(bucket.keys()).toEqual(['raw/cat.webp']);
  });

  it('skips an image that is gone', async () => {
    const result = await converterFor(createMemoryBucket()).convert({ key: 'raw/gone.jpg' });

    expect(result).toMatchObject({ status: 'skipped', reason: 'source no longer exists' });
  });
});

describe('sizes', () => {
  it('writes every width, never enlarging past the original', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/cat.jpg', photo);

    const result = await converterFor(bucket, { sizes: [100, 800] }).convert({
      key: 'raw/cat.jpg',
    });

    expect(result.sizes).toEqual([100, 800]);
    expect(await imageSize(bucket.bodyOf('raw/cat-100w.webp'))).toEqual({
      width: 100,
      height: 50,
      format: 'webp',
    });
    expect((await imageSize(bucket.bodyOf('raw/cat-800w.webp'))).width).toBe(400);
  });

  it('adds only the missing sizes to an image already converted', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/cat.jpg', photo);
    await converterFor(bucket, { sizes: [100] }).convert({ key: 'raw/cat.jpg' });

    const result = await converterFor(bucket, { sizes: [100, 200] }).convert({
      key: 'raw/cat.jpg',
    });

    expect(result).toMatchObject({ status: 'done', onlySizes: true, sizes: [200] });
    expect(bucket.keys()).toContain('raw/cat-200w.webp');
  });
});

describe('--replace', () => {
  const replace = { keepExt: true, backupSuffix: '-original' };

  it('backs up the original, then writes the WebP at the same key', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/cat.jpg', photo);

    const result = await converterFor(bucket, replace).convert({ key: 'raw/cat.jpg' });
    const main = await bucket.head('raw/cat.jpg');

    expect(result).toMatchObject({
      status: 'done',
      to: 'raw/cat.jpg',
      backup: 'raw/cat-original.jpg',
    });
    expect(main.ContentType).toBe('image/webp');
    expect(main.Metadata['original-backup']).toBe('raw%2Fcat-original.jpg');
    expect(bucket.bodyOf('raw/cat-original.jpg').equals(photo)).toBe(true);
  });

  it('skips an image already converted', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/cat.jpg', photo);
    await converterFor(bucket, replace).convert({ key: 'raw/cat.jpg' });

    expect(await converterFor(bucket, replace).convert({ key: 'raw/cat.jpg' })).toMatchObject({
      status: 'skipped',
      reason: 'already webp',
    });
  });
});

describe('files that cannot be converted', () => {
  it('marks a corrupt image invalid at once, without retries, and drops its backup', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/broken.jpg', Buffer.from('not an image at all'));

    const settings = { keepExt: true, backupSuffix: '-original' };
    const result = await converterFor(bucket, settings).convert({ key: 'raw/broken.jpg' });

    expect(result).toMatchObject({ status: 'invalid', attempts: 1 });
    expect(bucket.keys()).toEqual(['raw/broken.jpg']);
  });

  it('keeps the original when the WebP would be larger', async () => {
    const bucket = createMemoryBucket();
    // A 1x1 GIF of 34 bytes: no WebP, with its container header, is that small.
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

    bucket.seed('raw/pixel.gif', pixel, { ContentType: 'image/gif' });

    const result = await converterFor(bucket).convert({ key: 'raw/pixel.gif' });

    expect(result).toMatchObject({
      status: 'skipped',
      reason: 'webp would be larger; original kept',
    });
    expect(bucket.keys()).toEqual(['raw/pixel.gif']);
  });
});
