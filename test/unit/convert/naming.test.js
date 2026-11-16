import { describe, expect, it } from 'vitest';
import {
  backupKeyFor,
  isBackupKey,
  isVariantKey,
  mainKeyFor,
  mainKeyForBackup,
  variantKeyFor,
} from '../../../src/convert/naming.js';

describe('naming', () => {
  it('writes the WebP next to the original, or over it with --keep-ext', () => {
    expect(mainKeyFor('raw/cat.jpg', false)).toBe('raw/cat.webp');
    expect(mainKeyFor('raw/cat.jpg', true)).toBe('raw/cat.jpg');
  });

  it('names backups and size copies before the extension', () => {
    expect(backupKeyFor('raw/cat.jpg', '-original')).toBe('raw/cat-original.jpg');
    expect(variantKeyFor('raw/cat.jpg', 320)).toBe('raw/cat-320w.jpg');
    expect(variantKeyFor('raw/cat.webp', 1080)).toBe('raw/cat-1080w.webp');
  });

  it('recognizes backups and size copies by their stem', () => {
    expect(isBackupKey('raw/cat-original.jpg', '-original')).toBe(true);
    expect(isBackupKey('raw/original.jpg', '-original')).toBe(false);
    expect(isVariantKey('raw/cat-320w.webp')).toBe(true);
    expect(isVariantKey('raw/cat-320.webp')).toBe(false);
  });

  it('finds the image a backup belongs to', () => {
    expect(mainKeyForBackup('raw/cat-original.jpg', '-original')).toBe('raw/cat.jpg');
  });
});
