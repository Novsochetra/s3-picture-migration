import { describe, expect, it } from 'vitest';
import { countResult, resultLine } from '../../../../src/convert/run/result-line.js';

const line = (result, deleteOriginal = false) =>
  resultLine('[ 50.0%]', { key: 'raw/cat.jpg', result, ms: 1500, deleteOriginal });

describe('resultLine', () => {
  it('shows a conversion with its saving', () => {
    const result = { st: 'done', to: 'raw/cat.webp', in: 2048, out: 1024 };

    expect(line(result)).toEqual([
      'info',
      '[ 50.0%] ok     raw/cat.jpg -> raw/cat.webp  2.00 KB -> 1.00 KB (-50%) 1.5s',
    ]);
  });

  it('names the backup of a replaced image and the sizes made', () => {
    const result = {
      st: 'done',
      backup: 'raw/cat-original.jpg',
      in: 100,
      out: 50,
      sizes: [320],
      vout: 10,
    };

    expect(line(result)[1]).toBe(
      '[ 50.0%] ok     raw/cat.jpg (now webp, backup cat-original.jpg)  100 B -> 50 B (-50%)' +
        ' + sizes 320w (10 B) 1.5s',
    );
  });

  it('logs failures and invalid files as errors', () => {
    expect(line({ st: 'failed', err: 'timeout', attempts: 4 })).toEqual([
      'error',
      '[ 50.0%] FAIL   raw/cat.jpg after 4 attempt(s): timeout',
    ]);
    expect(line({ st: 'invalid', err: 'corrupt' })[0]).toBe('error');
  });
});

describe('countResult', () => {
  it('adds each result to the run totals', () => {
    const stats = {
      ok: 0,
      sized: 0,
      skipped: 0,
      failed: 0,
      invalid: 0,
      bytesIn: 0,
      bytesOut: 0,
      sizeBytes: 0,
    };

    countResult(stats, { st: 'done', in: 10, out: 4, vout: 3 });
    countResult(stats, { st: 'done', onlySizes: true, vout: 2 });
    countResult(stats, { st: 'skipped' });

    expect(stats).toMatchObject({
      ok: 1,
      sized: 1,
      skipped: 1,
      bytesIn: 10,
      bytesOut: 4,
      sizeBytes: 5,
    });
  });
});
