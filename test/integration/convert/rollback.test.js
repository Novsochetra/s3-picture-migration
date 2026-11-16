import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../src/convert/settings/defaults.js';
import { rollback } from '../../../src/convert/rollback/rollback.js';
import { captureLog } from '../../support/capture-log.js';
import { converterFor } from '../../support/converter-context.js';
import { makeJpeg } from '../../support/images.js';
import { createMemoryBucket } from '../../support/memory-bucket.js';

const REPLACE = { keepExt: true, backupSuffix: '-original', sizes: [100] };

let photo;

beforeAll(async () => {
  photo = await makeJpeg(300);
});

function sessionFor(bucket, settings) {
  return {
    args: { yes: true },
    connection: {},
    limits: { concurrency: 4 },
    log: captureLog(),
    prompt: null,
    bucket,
    prefix: 'raw/',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    jobFiles: { startOver: () => null, save: () => {} },
  };
}

async function convertAll(bucket, settings, keys) {
  const { convert } = converterFor(bucket, settings);

  for (const key of keys) {
    await convert({ key });
  }
}

describe('rollback', () => {
  it('restores each replaced image byte for byte and removes everything the run made', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/cat.jpg', photo);
    bucket.seed('raw/dog.jpg', photo);
    bucket.seed('raw/notes.txt', 'keep me', { ContentType: 'text/plain' });
    await convertAll(bucket, REPLACE, ['raw/cat.jpg', 'raw/dog.jpg']);

    const session = sessionFor(bucket, REPLACE);

    expect(await rollback(session)).toBe(0);
    expect(bucket.keys()).toEqual(['raw/cat.jpg', 'raw/dog.jpg', 'raw/notes.txt']);
    expect(bucket.bodyOf('raw/cat.jpg').equals(photo)).toBe(true);
    expect(session.log.text()).toMatch(
      /2 restored, 0 unused backups removed, 2 copies deleted, 0 failed/,
    );
  });

  it('deletes the .webp files written next to the originals', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/cat.jpg', photo);
    await convertAll(bucket, {}, ['raw/cat.jpg']);

    expect(await rollback(sessionFor(bucket, {}))).toBe(0);
    expect(bucket.keys()).toEqual(['raw/cat.jpg']);
  });

  it('leaves a WebP the run did not make', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/logo.webp', 'made by the app', { ContentType: 'image/webp' });

    const session = sessionFor(bucket, {});

    expect(await rollback(session)).toBe(0);
    expect(bucket.keys()).toEqual(['raw/logo.webp']);
    expect(session.log.text()).toMatch(/Nothing to roll back/);
  });

  it('changes nothing on a dry run', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/cat.jpg', photo);
    await convertAll(bucket, REPLACE, ['raw/cat.jpg']);

    const before = bucket.keys();
    const session = { ...sessionFor(bucket, REPLACE), args: { 'dry-run': true } };

    await rollback(session);

    expect(bucket.keys()).toEqual(before);
  });
});
