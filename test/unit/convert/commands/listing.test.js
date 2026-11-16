import { describe, expect, it } from 'vitest';
import {
  addToTotals,
  emptyTotals,
  formatRow,
  listingRows,
  listingSummary,
} from '../../../../src/convert/commands/listing.js';

const page = {
  CommonPrefixes: [{ Prefix: 'raw/2024/' }],
  Contents: [
    { Key: 'raw/', Size: 0 },
    { Key: 'raw/cat.jpg', Size: 2048, LastModified: new Date('2026-01-02T03:04:00Z') },
  ],
};

describe('listingRows', () => {
  it('lists folders, then files, by their name inside the prefix, without the placeholder', () => {
    expect(listingRows(page, 'raw/')).toEqual([
      { name: '2024/', isFolder: true },
      { name: 'cat.jpg', size: 2048, modified: new Date('2026-01-02T03:04:00Z') },
    ]);
  });
});

describe('formatRow', () => {
  it('lines folders and files up in columns', () => {
    const [folder, file] = listingRows(page, 'raw/');

    expect(formatRow(folder)).toBe(`  ${' '.repeat(16)}        DIR  2024/`);
    expect(formatRow(file)).toBe('  2026-01-02 03:04    2.00 KB  cat.jpg');
  });
});

describe('listingSummary', () => {
  it('counts files, bytes and folders, and points to --recursive', () => {
    const totals = emptyTotals();

    addToTotals(totals, listingRows(page, 'raw/'));

    expect(listingSummary(totals, false)).toBe(
      '\n1 file(s), 2.00 KB · 1 folder(s) — add --recursive to include everything inside them',
    );
    expect(listingSummary(totals, true)).toBe('\n1 file(s), 2.00 KB');
  });
});
