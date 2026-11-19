import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runConvert } from '../../../src/convert/main.js';
import { captureLog } from '../../support/capture-log.js';
import { createMemoryBucket } from '../../support/memory-bucket.js';

async function run(execArgv) {
  const log = captureLog();
  const bucket = createMemoryBucket();
  const connect = async () => ({ bucket, region: 'test-region-1' });
  const jobsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'convert-jobs-'));
  const argv = ['--bucket', bucket.name, '--prefix', 'raw', '--jobs-dir', jobsDir, '--yes'];

  await runConvert(argv, { connect, log, execArgv });

  return log;
}

describe('the production notice', () => {
  it('opens a run started with .env.prod', async () => {
    const log = await run(['--env-file=.env.prod']);

    expect(log.lines[0]).toMatch(/^INFO INFO {2}PRODUCTION: keys from \.env\.prod/);
  });

  it('stays away from a run started with .env', async () => {
    const log = await run(['--env-file=.env']);

    expect(log.text()).not.toMatch(/PRODUCTION/);
  });
});
