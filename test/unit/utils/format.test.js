import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatCounts,
  formatDuration,
  percent,
  shellQuote,
  signedPercent,
} from '../../../src/utils/format.js';

describe('formatBytes', () => {
  it('keeps whole bytes and shows two decimals below 10 of a unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.50 KB');
    expect(formatBytes(15 * 1024 ** 2)).toBe('15.0 MB');
  });

  it('shows ? for a missing or broken number', () => {
    expect(formatBytes(undefined)).toBe('?');
    expect(formatBytes(null)).toBe('?');
    expect(formatBytes(Number.NaN)).toBe('?');
  });
});

describe('formatDuration', () => {
  it('uses the two largest units', () => {
    expect(formatDuration(42)).toBe('42s');
    expect(formatDuration(125)).toBe('2m 05s');
    expect(formatDuration(3 * 3600 + 7 * 60)).toBe('3h 07m');
  });

  it('shows ? for a negative or endless time', () => {
    expect(formatDuration(-1)).toBe('?');
    expect(formatDuration(Infinity)).toBe('?');
  });
});

describe('percent', () => {
  it('is 100 for an empty whole, so an empty job reads as finished', () => {
    expect(percent(0, 0)).toBe('100.0');
    expect(percent(1, 3)).toBe('33.3');
  });
});

describe('signedPercent', () => {
  it('shows a saving as minus and a growth as plus', () => {
    expect(signedPercent(40)).toBe('-40%');
    expect(signedPercent(-12)).toBe('+12%');
  });
});

describe('formatCounts', () => {
  it('lists the eight largest counts, largest first', () => {
    expect(formatCounts({ png: 2, jpg: 1500, gif: 7 })).toBe('jpg 1,500 · gif 7 · png 2');
  });
});

describe('shellQuote', () => {
  it('leaves safe words alone and quotes the rest', () => {
    expect(shellQuote('raw/2024/')).toBe('raw/2024/');
    expect(shellQuote('my folder/')).toBe(`'my folder/'`);
    expect(shellQuote(`it's`)).toBe(`'it'\\''s'`);
  });
});
