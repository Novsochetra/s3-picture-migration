import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentTypeOf } from '../../../src/create-folder/content-types.js';
import { localFiles } from '../../../src/create-folder/local-files.js';
import { parseCreateFolderArgs, targetFolderOf } from '../../../src/create-folder/options.js';

describe('contentTypeOf', () => {
  it('knows image types and falls back to a binary type', () => {
    expect(contentTypeOf('a/B.JPG')).toBe('image/jpeg');
    expect(contentTypeOf('logo.svg')).toBe('image/svg+xml');
    expect(contentTypeOf('notes.txt')).toBe('application/octet-stream');
  });
});

describe('localFiles', () => {
  it('walks a folder with slash-separated paths, skipping hidden files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'originals-'));

    fs.mkdirSync(path.join(root, 'nested'));
    fs.writeFileSync(path.join(root, 'a.jpg'), 'a');
    fs.writeFileSync(path.join(root, '.DS_Store'), 'x');
    fs.writeFileSync(path.join(root, 'nested', 'b.png'), 'b');

    const files = localFiles(root)
      .map((file) => file.rel)
      .sort();

    expect(files).toEqual(['a.jpg', 'nested/b.png']);
  });

  it('takes a single file by its name and refuses a missing path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'single-'));
    const file = path.join(root, 'cover.jpg');

    fs.writeFileSync(file, 'c');

    expect(localFiles(file)).toEqual([{ abs: file, rel: 'cover.jpg' }]);
    expect(() => localFiles(path.join(root, 'nope'))).toThrow(/not found/);
  });
});

describe('targetFolderOf', () => {
  it('needs a bucket and a folder', () => {
    expect(() => targetFolderOf({ path: 'raw/' })).toThrow(/Missing bucket/);
    expect(() => targetFolderOf({ bucket: 'b', path: '/' })).toThrow(/cannot be empty/);
  });

  it('defaults to the migration test folder', () => {
    const args = parseCreateFolderArgs(['--bucket', 'b']);

    expect(targetFolderOf(args)).toBe('raw/partner/sochetra-image-migration/profile/');
  });
});
