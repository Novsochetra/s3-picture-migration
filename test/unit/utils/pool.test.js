import { describe, expect, it } from 'vitest';
import { chunk, runPool } from '../../../src/utils/pool.js';

describe('runPool', () => {
  it('runs every item with no more than the limit in flight', async () => {
    let inFlight = 0;
    let most = 0;
    const done = [];

    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      done.push(item);
      inFlight--;
    });

    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(most).toBe(3);
  });

  it('does nothing for no items', async () => {
    await expect(runPool([], 4, () => Promise.reject(new Error('never')))).resolves.toBeUndefined();
  });
});

describe('chunk', () => {
  it('splits into pieces of the given size, the last one shorter', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
