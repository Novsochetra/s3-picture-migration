import { describe, expect, it } from 'vitest';
import {
  describeJobStatus,
  describeScan,
  runSummary,
} from '../../../../src/convert/run/status-line.js';

const counts = {
  total: 10,
  completed: 4,
  totalBytes: 4096,
  completedBytes: 1024,
  failed: 0,
  invalid: 0,
};

describe('describeJobStatus', () => {
  it('shows what is finished and what is left', () => {
    expect(describeJobStatus(counts, false)).toBe(
      'Status:   4 of 10 finished (40.0%) · 6 to go (3.00 KB)',
    );
  });

  it('adds failures and invalid files only when there are some', () => {
    expect(describeJobStatus({ ...counts, failed: 2, invalid: 1 }, false)).toBe(
      'Status:   4 of 10 finished (40.0%) · 6 to go (3.00 KB) · 2 failed earlier (will retry)' +
        ' · 1 invalid (skipped; --retry-failed to retry)',
    );
  });
});

describe('describeScan', () => {
  it('adds a line for the files it ignored', () => {
    const scan = { count: 3, bytes: 300, byExt: { jpg: 3 }, ignored: { txt: 2 } };

    expect(describeScan(scan)).toEqual([
      'Scan: 3 images, 300 B (jpg 3)',
      '        2 other files ignored (txt 2)',
    ]);
  });
});

describe('runSummary', () => {
  const stats = {
    ok: 2,
    sized: 0,
    skipped: 1,
    failed: 0,
    invalid: 0,
    bytesIn: 0,
    bytesOut: 0,
    sizeBytes: 0,
  };

  it('lists the outcomes of a run', () => {
    expect(runSummary(stats)).toBe('\nRun finished: 2 converted, 1 skipped, 0 failed, 0 invalid');
  });

  it('adds the saving, the images that got sizes only and the size copies', () => {
    const busy = { ...stats, sized: 1, bytesIn: 2048, bytesOut: 512, sizeBytes: 100 };

    expect(runSummary(busy)).toBe(
      '\nRun finished: 2 converted, 1 got new sizes only, 1 skipped, 0 failed, 0 invalid' +
        ' · 2.00 KB -> 512 B (-75%) · size copies 100 B',
    );
  });
});
