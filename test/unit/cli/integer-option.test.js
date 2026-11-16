import { describe, expect, it } from 'vitest';
import { parseIntegerOption } from '../../../src/cli/integer-option.js';

describe('parseIntegerOption', () => {
  const range = { name: 'quality', min: 1, max: 100 };

  it('accepts a whole number in range', () => {
    expect(parseIntegerOption('80', range)).toBe(80);
  });

  it('rejects fractions and numbers out of range, naming the flag', () => {
    expect(() => parseIntegerOption('0', range)).toThrow('--quality must be a whole number');
    expect(() => parseIntegerOption('7.5', range)).toThrow(/between 1 and 100/);
  });
});
