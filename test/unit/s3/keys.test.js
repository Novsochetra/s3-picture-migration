import { describe, expect, it } from 'vitest';
import {
  extensionOf,
  fileNameOf,
  insertBeforeExtension,
  normalizePrefix,
  removeStemSuffix,
  stemOf,
  swapExtension,
  toFolder,
} from '../../../src/s3/keys.js';

describe('S3 key helpers', () => {
  it('reads the extension in lower case, ignoring dots in folders and dot-files', () => {
    expect(extensionOf('raw/2024/Cat.JPG')).toBe('jpg');
    expect(extensionOf('raw/v1.2/readme')).toBe('');
    expect(extensionOf('raw/.hidden')).toBe('');
  });

  it('reads the stem and the file name', () => {
    expect(stemOf('raw/a/wallpaper.png')).toBe('wallpaper');
    expect(fileNameOf('raw/a/wallpaper.png')).toBe('wallpaper.png');
  });

  it('inserts text before the extension, or at the end without one', () => {
    expect(insertBeforeExtension('raw/a/wallpaper.png', '-original')).toBe(
      'raw/a/wallpaper-original.png',
    );
    expect(insertBeforeExtension('raw/a/notes', '-320w')).toBe('raw/a/notes-320w');
  });

  it('swaps or adds the extension', () => {
    expect(swapExtension('raw/a/wallpaper.png', 'webp')).toBe('raw/a/wallpaper.webp');
    expect(swapExtension('raw/a/notes', 'webp')).toBe('raw/a/notes.webp');
  });

  it('removes a suffix from the stem, keeping the extension as written', () => {
    expect(removeStemSuffix('raw/a/Cat-original.JPG', '-original')).toBe('raw/a/Cat.JPG');
  });

  it('treats a prefix as a folder', () => {
    expect(normalizePrefix('/raw/2024')).toBe('raw/2024/');
    expect(normalizePrefix('raw/2024/')).toBe('raw/2024/');
    expect(normalizePrefix(undefined)).toBe('');
  });

  it('makes a folder path with exactly one trailing slash', () => {
    expect(toFolder('/raw/partner//')).toBe('raw/partner/');
    expect(toFolder('')).toBe('/');
  });
});
