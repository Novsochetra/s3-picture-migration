import { describe, expect, it } from 'vitest';
import { isFinished, progressEntry } from '../../../../src/convert/job/progress-store.js';

describe('isFinished', () => {
  it('treats done and skipped as final, and invalid as final unless retried', () => {
    expect(isFinished('done', false)).toBe(true);
    expect(isFinished('skipped', true)).toBe(true);
    expect(isFinished('invalid', false)).toBe(true);
    expect(isFinished('invalid', true)).toBe(false);
    expect(isFinished('failed', false)).toBe(false);
    expect(isFinished(undefined, false)).toBe(false);
  });
});

describe('progressEntry', () => {
  it('leaves out empty fields and a target equal to the key', () => {
    const entry = progressEntry(
      'raw/a.jpg',
      { status: 'skipped', reason: 'already webp', to: 'raw/a.jpg', attempts: 1 },
      12,
    );

    expect(JSON.parse(JSON.stringify(entry))).toEqual({
      t: expect.any(String),
      k: 'raw/a.jpg',
      st: 'skipped',
      why: 'already webp',
      ms: 12,
    });
  });

  it('keeps a zero byte count and the number of tries', () => {
    const entry = progressEntry(
      'raw/a.jpg',
      { status: 'done', bytesIn: 0, bytesOut: 0, attempts: 3 },
      5,
    );

    expect(entry).toMatchObject({ in: 0, out: 0, tries: 3 });
  });
});
