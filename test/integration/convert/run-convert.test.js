import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runConvert } from '../../../src/convert/main.js';
import { readJson } from '../../../src/utils/json-files.js';
import { captureLog } from '../../support/capture-log.js';
import { makeJpeg } from '../../support/images.js';
import { createMemoryBucket } from '../../support/memory-bucket.js';

let photo;
let jobsDir;

beforeAll(async () => {
  photo = await makeJpeg(200);
});

beforeEach(() => {
  jobsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'convert-jobs-'));
});

async function run(bucket, ...flags) {
  const log = captureLog();
  const connect = async () => ({ bucket, region: 'test-region-1' });
  const argv = [
    '--bucket',
    bucket.name,
    '--prefix',
    'raw',
    '--jobs-dir',
    jobsDir,
    '--yes',
    ...flags,
  ];
  const exitCode = await runConvert(argv, { connect, log });

  return { exitCode, log };
}

function jobFolder() {
  const [name] = fs.readdirSync(jobsDir);

  return path.join(jobsDir, name);
}

const progressLines = () =>
  fs
    .readFileSync(path.join(jobFolder(), 'progress.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));

describe('a full run', () => {
  it('converts the folder and saves the job, its scan and its progress', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/a.jpg', photo);
    bucket.seed('raw/b.jpg', photo);
    bucket.seed('raw/readme.txt', 'text', { ContentType: 'text/plain' });

    const { exitCode, log } = await run(bucket);
    const job = readJson(path.join(jobFolder(), 'job.json'));

    expect(exitCode).toBe(0);
    expect(log.text()).toMatch(/Job complete\./);
    expect(job).toMatchObject({ bucket: 'test-bucket', prefix: 'raw/', region: 'test-region-1' });
    expect(job.scan).toMatchObject({ count: 2, ignored: { txt: 1 } });
    expect(job.status).toMatchObject({ total: 2, completed: 2, remaining: 0, failed: 0 });
    expect(
      progressLines()
        .map((entry) => [entry.k, entry.st])
        .sort(),
    ).toEqual([
      ['raw/a.jpg', 'done'],
      ['raw/b.jpg', 'done'],
    ]);
    expect(bucket.keys()).toEqual([
      'raw/a.jpg',
      'raw/a.webp',
      'raw/b.jpg',
      'raw/b.webp',
      'raw/readme.txt',
    ]);
  });

  it('says a finished job is complete and how to run it again', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/a.jpg', photo);
    await run(bucket);

    const { exitCode, log } = await run(bucket);

    expect(exitCode).toBe(0);
    expect(log.text()).toMatch(/This job is complete/);
    expect(log.text()).toMatch(/--fresh/);
  });

  it('picks up only new images with --rescan', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/a.jpg', photo);
    await run(bucket);
    bucket.seed('raw/c.jpg', photo);

    await run(bucket, '--rescan');

    expect(progressLines().map((entry) => entry.k)).toEqual(['raw/a.jpg', 'raw/c.jpg']);
    expect(bucket.keys()).toContain('raw/c.webp');
  });

  it('lists the problem files and exits with 1 when an image is invalid', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/a.jpg', photo);
    bucket.seed('raw/broken.jpg', 'not an image');

    const { exitCode } = await run(bucket);
    const failed = fs.readFileSync(path.join(jobFolder(), 'failed.txt'), 'utf8');

    expect(exitCode).toBe(1);
    expect(failed).toMatch(/^invalid\traw\/broken\.jpg\t/);
  });

  it('changes nothing on a dry run', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/a.jpg', photo);

    const { exitCode, log } = await run(bucket, '--dry-run');

    expect(exitCode).toBe(0);
    expect(log.text()).toMatch(/Dry run: nothing was changed/);
    expect(bucket.keys()).toEqual(['raw/a.jpg']);
  });

  it('rolls a --replace run back and resets the job', async () => {
    const bucket = createMemoryBucket();

    bucket.seed('raw/a.jpg', photo);
    await run(bucket, '--replace');

    expect(bucket.keys()).toEqual(['raw/a-original.jpg', 'raw/a.jpg']);
    expect(await run(bucket, '--rollback').then((result) => result.exitCode)).toBe(0);
    expect(bucket.keys()).toEqual(['raw/a.jpg']);
    expect(bucket.bodyOf('raw/a.jpg').equals(photo)).toBe(true);
    expect(fs.existsSync(path.join(jobFolder(), 'progress.jsonl'))).toBe(false);
  });
});
