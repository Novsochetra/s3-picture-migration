import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { jobDirFor } from '../../src/convert/job/job-dir.js';
import { ProgressStore } from '../../src/convert/job/progress-store.js';

// Job folders already on disk must still be found, or their progress would be lost.
describe('job folder names', () => {
  it('stay the same as the first release made them', () => {
    const aws = {
      jobsDir: '/jobs',
      endpoint: undefined,
      bucketName: 'my-bucket',
      prefix: 'raw/2024/',
    };
    const spaces = {
      jobsDir: '/jobs',
      endpoint: 'https://nyc3.digitaloceanspaces.com',
      bucketName: 'b',
      prefix: '',
    };

    expect(jobDirFor(aws)).toBe('/jobs/my-bucket__raw_2024___b6b25dc0');
    expect(jobDirFor(spaces)).toBe('/jobs/b__ROOT__150b0af5');
  });
});

describe('progress.jsonl', () => {
  it('keeps the line format existing jobs were written in', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'progress-')), 'progress.jsonl');
    const store = new ProgressStore(file);
    const result = {
      st: 'done',
      to: 'raw/cat.jpg',
      backup: 'raw/cat-original.jpg',
      sizes: [320],
      vout: 900,
      in: 5000,
      out: 2000,
      attempts: 2,
    };

    store.open();
    store.record('raw/cat.jpg', result, 1234);
    store.close();

    const line = JSON.parse(fs.readFileSync(file, 'utf8'));

    expect(Object.keys(line)).toEqual([
      't',
      'k',
      'st',
      'bak',
      'sizes',
      'vout',
      'in',
      'out',
      'tries',
      'ms',
    ]);
    expect(line).toMatchObject({
      k: 'raw/cat.jpg',
      st: 'done',
      bak: 'raw/cat-original.jpg',
      tries: 2,
    });
  });

  it('resumes after a crash cut the last line short', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'progress-')), 'progress.jsonl');

    fs.writeFileSync(file, '{"k":"raw/a.jpg","st":"done"}\n{"k":"raw/b.jpg","st":"do');

    const store = new ProgressStore(file);

    await store.load();
    store.open();
    store.record('raw/b.jpg', { st: 'done' }, 1);
    store.close();

    const reloaded = new ProgressStore(file);

    await reloaded.load();

    expect(reloaded.status('raw/a.jpg')).toBe('done');
    expect(reloaded.status('raw/b.jpg')).toBe('done');
  });
});
