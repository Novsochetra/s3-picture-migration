import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCreateFolder } from '../../../src/create-folder/main.js';
import { createMemoryBucket } from '../../support/memory-bucket.js';

const FOLDER = 'raw/partner/sochetra-image-migration/profile/';

let output;

beforeEach(() => {
  output = [];
  vi.spyOn(console, 'log').mockImplementation((line) => output.push(line));
  vi.spyOn(console, 'error').mockImplementation((line) => output.push(line));
});

const run = (bucket, ...flags) =>
  runCreateFolder(['--bucket', bucket.name, ...flags], { connect: () => bucket });

describe('create-folder', () => {
  it('creates the folder and uploads local originals with their content type', async () => {
    const bucket = createMemoryBucket();
    const originals = fs.mkdtempSync(path.join(os.tmpdir(), 'originals-'));

    fs.writeFileSync(path.join(originals, 'avatar.png'), 'png bytes');
    fs.writeFileSync(path.join(originals, '.DS_Store'), 'junk');

    expect(await run(bucket, '--upload', originals)).toBe(0);
    expect(bucket.keys()).toEqual([FOLDER, `${FOLDER}avatar.png`]);
    expect((await bucket.head(`${FOLDER}avatar.png`)).ContentType).toBe('image/png');
    expect(output.join('\n')).toMatch(/npm run convert -- --bucket test-bucket .* --rescan/);
  });

  it('copies a folder of originals inside the bucket and skips files already there', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/partner/123/profile/a.jpg', 'a');
    bucket.seed('raw/partner/123/profile/b.jpg', 'b');

    await run(bucket, '--copy-from', 'raw/partner/123/profile');
    await run(bucket, '--copy-from', 'raw/partner/123/profile');

    expect(bucket.keys()).toContain(`${FOLDER}a.jpg`);
    expect(output.join('\n')).toMatch(/skip {6}a\.jpg \(already there\)/);
  });

  it('refuses to copy a folder that overlaps the target', async () => {
    const bucket = createMemoryBucket();

    expect(await run(bucket, '--copy-from', 'raw/partner')).toBe(1);
    expect(output.join('\n')).toMatch(/overlaps the target folder/);
  });

  it('empties the test folder, keeping the folder itself', async () => {
    const bucket = createMemoryBucket();

    bucket.seed(`${FOLDER}old.jpg`, 'old');
    bucket.seed('raw/partner/123/profile/keep.jpg', 'keep');

    expect(await run(bucket, '--empty', '--yes')).toBe(0);
    expect(bucket.keys()).toEqual(['raw/partner/123/profile/keep.jpg', FOLDER]);
    expect(output.join('\n')).toMatch(/Deleted 1 object\(s\)/);
  });

  it('never empties a folder outside the test folder', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/partner/123/profile/keep.jpg', 'keep');

    await expect(
      run(bucket, '--path', 'raw/partner/123/profile', '--empty', '--yes'),
    ).rejects.toThrow(/--empty only works inside/);
    expect(bucket.keys()).toEqual(['raw/partner/123/profile/keep.jpg']);
  });

  it('says it is production when started with .env.prod, and only then', async () => {
    const options = (execArgv) => ({ connect: () => createMemoryBucket(), execArgv });
    const argv = ['--bucket', 'test-bucket'];

    await runCreateFolder(argv, options(['--env-file=.env']));
    expect(output.join('\n')).not.toMatch(/PRODUCTION/);

    output.length = 0;
    await runCreateFolder(argv, options(['--env-file=.env.prod']));
    expect(output[0]).toMatch(/^INFO {2}PRODUCTION: keys from \.env\.prod/);
  });
});
