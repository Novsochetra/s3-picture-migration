import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isUnfinished, listJobs } from '../../../../src/convert/job/job-dir.js';

function jobsDirWith(jobs) {
  const jobsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-'));

  for (const [name, job] of Object.entries(jobs)) {
    fs.mkdirSync(path.join(jobsDir, name));
    fs.writeFileSync(path.join(jobsDir, name, 'job.json'), JSON.stringify(job));
  }

  return jobsDir;
}

describe('listJobs', () => {
  it('lists the jobs of the same endpoint, skipping .bak- copies', () => {
    const jobsDir = jobsDirWith({
      aws: { bucket: 'a', endpoint: null },
      spaces: { bucket: 'b', endpoint: 'https://spaces.example' },
      'aws.bak-1': { bucket: 'c', endpoint: null },
    });

    expect(listJobs({ jobsDir, endpoint: undefined }).map((job) => job.bucket)).toEqual(['a']);
  });

  it('is empty when there is no jobs folder yet', () => {
    expect(listJobs({ jobsDir: '/no/such/folder', endpoint: null })).toEqual([]);
  });
});

describe('isUnfinished', () => {
  it('counts a job with images left or failures as unfinished', () => {
    expect(isUnfinished({})).toBe(true);
    expect(isUnfinished({ status: { remaining: 0, failed: 2 } })).toBe(true);
    expect(isUnfinished({ status: { remaining: 0, failed: 0 } })).toBe(false);
  });
});
